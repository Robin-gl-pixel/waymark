/**
 * Claude world-knowledge lookup — "given a place name + city, do you know its address?"
 *
 * Slots between mapboxByAddress and Google Places in orchestrateGeocode. Fixes
 * the common case where the Insta screenshot only shows a name (e.g. "Le Gainsbarre,
 * Paris 7") that a human would resolve instantly via Google — Claude does the
 * same thing here via the Anthropic web_search server tool.
 *
 * Design:
 *   - Claude returns { known: true, address: "..." } OR { known: false, address: null }.
 *   - Web search enabled → Claude searches when it doesn't recall from training,
 *     which fixes the recent/obscure venues Haiku alone can't resolve (Le Gainsbarre,
 *     any bar/resto opened after training cutoff).
 *   - We DO NOT trust Claude for coords (hallucination risk on lat/lng specifics).
 *     Instead we pass Claude's address to mapboxByAddress for verified coords.
 */
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
});

const MODEL = 'claude-haiku-4-5-20251001';

// Anthropic's server-side web search. Claude decides whether/how many times to
// call it based on how confident it is from training alone.
// SDK 0.90 doesn't ship official types for this yet — hence `as any` at the call site.
const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 3,
};

export interface ClaudeKnownPlace {
  address: string;
  confidence: 'high' | 'medium';
}

const SYSTEM = `Tu es un expert des lieux du monde (restaurants, bars, cafés, musées, hôtels).
Tu as accès à un outil web_search — utilise-le si tu n'es pas certain à 100% depuis ta seule mémoire.
Réponds toujours en JSON strict à la fin, sans texte hors JSON, sans backticks.`;

function buildPrompt(name: string, city: string | null, country: string | null): string {
  const loc = [city, country].filter(Boolean).join(', ') || 'localisation inconnue';
  return `Trouve l'adresse exacte du lieu "${name}" (${loc}).

Si tu ne le connais pas avec certitude depuis ta mémoire, utilise web_search — cherche des sources fiables (pagesjaunes, site officiel, TheFork, TripAdvisor, presse locale).

Réponds en JSON avec exactement ce format :

{
  "known": true | false,
  "address": "adresse rue + code postal + ville (ex: '14 Rue de Verneuil, 75007 Paris') | null si known=false",
  "confidence": "high | medium — high uniquement si sources concordantes, medium si un seul indice"
}

Règles strictes :
- Vérifie la cohérence ville : si l'adresse trouvée n'est pas dans "${loc}", retourne known=false.
- Une adresse fausse est PIRE qu'aucune. En cas de doute → known=false.
- Ta réponse finale doit être UNIQUEMENT le JSON, jamais de commentaire ou balise autour.`;
}

/**
 * Extract the last complete `{...}` JSON object from a string. Ignores braces
 * inside string literals. Returns null if no balanced object exists.
 */
function extractLastJsonObject(text: string): string | null {
  const lastOpen = text.lastIndexOf('{');
  if (lastOpen === -1) return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = lastOpen; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inStr) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(lastOpen, i + 1);
    }
  }
  return null;
}

export async function resolveKnownPlace(
  name: string,
  city: string | null,
  country: string | null,
): Promise<ClaudeKnownPlace | null> {
  if (!name) return null;

  const t0 = Date.now();
  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [WEB_SEARCH_TOOL as any],
      messages: [{ role: 'user', content: buildPrompt(name, city, country) }],
    });
  } catch (err) {
    console.warn('[claudeKnowledge] API call failed', (err as Error).message?.slice(0, 200));
    return null;
  }
  const t1 = Date.now();
  const webSearchCount =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (response.usage as any)?.server_tool_use?.web_search_requests ?? 0;
  console.log(
    `[claudeKnowledge] ${t1 - t0}ms in=${response.usage?.input_tokens} out=${response.usage?.output_tokens} web_searches=${webSearchCount}`,
  );

  // With tool use, Claude often precedes the JSON with reasoning ("Les sources
  // sont concordantes…"). Concatenate ALL text blocks and pull the JSON out of
  // the combined body via a balanced-brace scan starting from the last '{'.
  const allText = response.content
    .filter((c) => c.type === 'text')
    .map((c) => (c as { text: string }).text)
    .join('\n');

  const jsonSlice = extractLastJsonObject(allText);
  if (!jsonSlice) {
    console.warn('[claudeKnowledge] no JSON object in response:', allText.slice(0, 200));
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch (err) {
    console.warn('[claudeKnowledge] JSON parse failed:', jsonSlice.slice(0, 200));
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

  console.log('[claudeKnowledge] resolved', { name, address, confidence, webSearchCount });
  return { address, confidence };
}
