import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';

// Anthropic Vision recommends max ~1568px on longest side; anything larger
// gets tokenized wastefully and slows the call to 15-20s. Downsample + JPEG
// re-encode brings a 6MB PNG down to ~200KB and total latency to 3-5s.
const MAX_DIM = 1568;
const JPEG_QUALITY = 82;

export interface ExtractedFromVision {
  name: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  category: 'resto' | 'bar' | 'café' | 'activité' | 'musée' | 'hôtel' | 'autre' | null;
  description: string | null;
  sourceAuthor: string | null;
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
  };
}
