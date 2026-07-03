/**
 * Claude world-knowledge lookup — "given a place name + city, do you know its address?"
 *
 * Slots between mapboxByAddress and Google Places in orchestrateGeocode. Fixes
 * the common case where the Insta screenshot only shows a name (e.g. "Le Gainsbarre,
 * Paris 7") that a human would resolve instantly via Google — Claude has the same
 * knowledge and can shortcut the whole geocoding chain.
 *
 * Design:
 *   - Claude returns { known: true, address: "..." } OR { known: false, address: null }.
 *   - We DO NOT trust Claude for coords (hallucination risk on lat/lng specifics).
 *     Instead we pass Claude's address to mapboxByAddress for verified coords.
 *   - If Claude says "unknown" → return null so the caller falls through to Google.
 */
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
});

const MODEL = 'claude-haiku-4-5-20251001';

export interface ClaudeKnownPlace {
  address: string;
  confidence: 'high' | 'medium';
}

const SYSTEM = `Tu es un expert des lieux du monde (restaurants, bars, cafés, musées, hôtels).
Réponds en JSON strict uniquement, aucun texte avant/après, aucune backtick.`;

function buildPrompt(name: string, city: string | null, country: string | null): string {
  const loc = [city, country].filter(Boolean).join(', ') || 'localisation inconnue';
  return `Connais-tu le lieu "${name}" (${loc}) ? Si oui, donne son adresse exacte.

Réponds en JSON avec exactement ce format :

{
  "known": true | false,
  "address": "adresse rue + code postal + ville (ex: '5 Rue de Verneuil, 75007 Paris') | null si known=false",
  "confidence": "high | medium — high uniquement si tu es certain, medium si tu penses savoir mais avec doute"
}

Règles strictes :
- Si tu n'es pas sûr à 90%+, retourne known=false. Une adresse fausse est PIRE qu'aucune adresse.
- Ne devine JAMAIS. Un lieu obscur / récent / ambigu → known=false.
- Vérifie la cohérence ville : si "${name}" à ${loc} évoque plusieurs lieux dans le monde, retourne known=false.`;
}

export async function resolveKnownPlace(
  name: string,
  city: string | null,
  country: string | null,
): Promise<ClaudeKnownPlace | null> {
  if (!name) return null;

  const t0 = Date.now();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    system: SYSTEM,
    messages: [{ role: 'user', content: buildPrompt(name, city, country) }],
  });
  const t1 = Date.now();
  console.log(
    `[claudeKnowledge] ${t1 - t0}ms in=${response.usage?.input_tokens} out=${response.usage?.output_tokens}`,
  );

  const textBlock = response.content.find((c) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    console.warn('[claudeKnowledge] no text block in response');
    return null;
  }

  const raw = textBlock.text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn('[claudeKnowledge] non-JSON response:', raw.slice(0, 200));
    return null;
  }

  const r = parsed as Record<string, unknown>;
  const known = r.known === true;
  const address = typeof r.address === 'string' ? r.address.trim() : '';
  const confidence = r.confidence === 'high' || r.confidence === 'medium' ? r.confidence : null;

  if (!known || !address || !confidence) {
    console.log('[claudeKnowledge] unknown or incomplete', { known, hasAddress: !!address, confidence });
    return null;
  }

  console.log('[claudeKnowledge] resolved', { name, address, confidence });
  return { address, confidence };
}
