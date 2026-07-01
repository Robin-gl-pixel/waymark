import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, USER_PROMPT_LINE } from './prompt';

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

const MODEL = 'claude-sonnet-4-5';

export async function extractPlaceFromScreenshot(
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png',
): Promise<ExtractedFromVision> {
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
            source: { type: 'base64', media_type: mediaType, data: imageBase64 },
          },
          { type: 'text', text: USER_PROMPT_LINE },
        ],
      },
    ],
  });

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
