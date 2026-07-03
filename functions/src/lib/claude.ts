import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';

// Anthropic Vision recommends max ~1568px on longest side; anything larger
// gets tokenized wastefully and slows the call to 15-20s. Downsample + JPEG
// re-encode brings a 6MB PNG down to ~200KB and total latency to 3-5s.
const MAX_DIM = 1568;
const JPEG_QUALITY = 82;

/**
 * Normalized (0..1) bounding box of the actual venue/food/scene photo region
 * inside an Instagram screenshot, excluding IG UI chrome (header, action bar,
 * caption, watermark). Used by the client to crop the screenshot before upload
 * so the hero image on the resulting pin is just the food/venue photo.
 *
 * Coordinates are normalized against the input image dimensions (0 = left/top,
 * 1 = right/bottom). `x, y` is the top-left corner; `w, h` are width/height.
 */
export interface PhotoBoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ExtractedFromVision {
  name: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  category: 'resto' | 'bar' | 'café' | 'activité' | 'musée' | 'hôtel' | 'autre' | null;
  description: string | null;
  sourceAuthor: string | null;
  /**
   * Normalized (0..1) bbox of the actual photo region in the screenshot, or
   * `null` if the model couldn't identify a clean region or the region failed
   * server-side sanity checks (aspect ratio ∉ [0.4, 2.5] or area ∉ [25%, 90%]).
   * When null, the client uploads the screenshot uncropped.
   */
  photoBoundingBox: PhotoBoundingBox | null;
}

// Sanity thresholds — reject bboxes that are absurdly narrow/wide or occupy
// a suspicious fraction of the input. Values below let 1:1 feed posts (area
// ~60-70%) and 9:16 reel screenshots (area ~40-50%) through comfortably while
// rejecting hallucinated slivers and near-fullscreen bboxes that would defeat
// the point of cropping IG chrome away.
const BBOX_MIN_ASPECT = 0.4;
const BBOX_MAX_ASPECT = 2.5;
const BBOX_MIN_AREA = 0.25;
const BBOX_MAX_AREA = 0.9;

/**
 * Server-side sanity check for the photo bbox returned by Claude.
 *
 * Returns the bbox unchanged when it's valid, `null` otherwise. Invalid means:
 * - shape is malformed (missing/non-numeric fields, coords outside [0, 1])
 * - box extends past the image edge (x+w > 1 or y+h > 1)
 * - aspect ratio (w/h) outside [BBOX_MIN_ASPECT, BBOX_MAX_ASPECT]
 * - area (w*h) outside [BBOX_MIN_AREA, BBOX_MAX_AREA]
 *
 * Exported for unit tests.
 */
export function sanitizePhotoBoundingBox(raw: unknown): PhotoBoundingBox | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const x = r.x;
  const y = r.y;
  const w = r.w;
  const h = r.h;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof w !== 'number' ||
    typeof h !== 'number'
  ) {
    return null;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
    return null;
  }
  if (x < 0 || y < 0 || w <= 0 || h <= 0) return null;
  if (x + w > 1 + 1e-6 || y + h > 1 + 1e-6) return null;

  const aspect = w / h;
  if (aspect < BBOX_MIN_ASPECT || aspect > BBOX_MAX_ASPECT) return null;

  const area = w * h;
  if (area < BBOX_MIN_AREA || area > BBOX_MAX_AREA) return null;

  return { x, y, w, h };
}

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
});

const MODEL = 'claude-haiku-4-5-20251001';

export async function extractPlaceFromScreenshot(
  imageBase64: string,
  _mediaType: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
  captionText?: string | null,
): Promise<ExtractedFromVision> {
  const inputBuf = Buffer.from(imageBase64, 'base64');
  const t0 = Date.now();
  const resizedBuf = await sharp(inputBuf)
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  const resizedB64 = resizedBuf.toString('base64');
  const t1 = Date.now();
  console.log(`[claude] resize: ${inputBuf.length}B → ${resizedBuf.length}B in ${t1 - t0}ms`);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: resizedB64 },
          },
          { type: 'text', text: buildUserPrompt(captionText) },
        ],
      },
    ],
  });

  const t2 = Date.now();
  console.log(`[claude] model=${MODEL} api call: ${t2 - t1}ms, in_tokens=${response.usage?.input_tokens}, out_tokens=${response.usage?.output_tokens}`);

  const textBlock = response.content.find((c) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text block');
  }

  const raw = textBlock.text.trim();
  return parseVisionJson(raw);
}

function parseVisionJson(raw: string): ExtractedFromVision {
  // Claude parfois renvoie ```json ... ``` malgré les instructions — strip défensivement.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return normalizeExtracted(parsed);
  } catch (err) {
    throw new Error(`Vision response not valid JSON: ${cleaned.slice(0, 200)}`);
  }
}

function normalizeExtracted(raw: unknown): ExtractedFromVision {
  const r = raw as Record<string, unknown>;
  const asString = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v.trim() : null;

  const category = asString(r.category);
  const validCats = ['resto', 'bar', 'café', 'activité', 'musée', 'hôtel', 'autre'] as const;
  const normalizedCategory = validCats.includes(category as typeof validCats[number])
    ? (category as ExtractedFromVision['category'])
    : null;

  return {
    name: asString(r.name),
    city: asString(r.city),
    country: asString(r.country),
    address: asString(r.address),
    category: normalizedCategory,
    description: asString(r.description),
    sourceAuthor: asString(r.sourceAuthor)?.replace(/^@/, '') ?? null,
    // Model sometimes emits `photoBoundingBox: null`, sometimes omits the field
    // (older prompt versions or non-place screenshots). Both are treated as
    // "no crop" and let the client upload the raw screenshot.
    photoBoundingBox: sanitizePhotoBoundingBox(r.photoBoundingBox),
  };
}
