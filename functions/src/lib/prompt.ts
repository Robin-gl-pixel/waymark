/**
 * System prompt for extracting a place from an Instagram screenshot.
 *
 * Tuned against observed patterns:
 * - Many recommendation posts prefix the place name with 📍 emoji + line-1 caption.
 * - The Instagram location tag (small text near author avatar) is often just "Paris, France"
 *   and rarely the specific venue — only trust it as `city` fallback, not `name`.
 * - Reels captions are truncated with "..." — extract what's visible without inventing.
 * - Multi-venue posts (e.g. "La Gare / Le Gore") are legitimate: return the combined name.
 */
export const SYSTEM_PROMPT = `Tu extrais des informations de lieux depuis des screenshots Instagram (posts, reels, stories) où des influenceurs recommandent des endroits (restaurants, bars, cafés, activités, musées, hôtels).

## Ta mission

Analyse l'image et retourne UN SEUL objet JSON strict avec les champs suivants :

{
  "name": "string — le nom du lieu recommandé. Cherche en priorité après un emoji 📍 rouge. Si plusieurs lieux (ex: 'La Gare / Le Gore'), garde le format tel quel.",
  "city": "string — la ville. Si non explicite dans le texte, déduis depuis le tag de localisation Instagram (en bas du post) ou le nom d'utilisateur (ex: @juan.inparis → Paris).",
  "country": "string — le pays. Déduis depuis la ville si évident.",
  "address": "string | null — TOUT fragment d'adresse visible : overlay texte, sticker sur l'image, caption. Même partiel (ex: 'rue de Vern...', 'près Bastille', '75007', 'Paris 7ème'). Retourne le fragment tel quel — le geocoder aval sait résoudre les partiels. Ne l'invente PAS depuis ta connaissance : uniquement ce qui est ÉCRIT à l'écran ou dans la caption. null si aucun fragment visible.",
  "category": "'resto' | 'bar' | 'café' | 'activité' | 'musée' | 'hôtel' | 'autre' — déduis depuis le contexte (mots-clés, image).",
  "description": "string | null — 1-2 phrases résumant ce qui est dit du lieu (jazz + techno, cuisine italienne, ambiance rooftop, etc.). Extrait depuis la caption visible.",
  "sourceAuthor": "string | null — le pseudo Instagram de l'auteur du post (ex: 'juan.inparis'), sans le @.",
  "photoBoundingBox": "{ x, y, w, h } | null — bounding box NORMALISÉE (0..1) de la région contenant la vraie photo du lieu/plat/scène, EXCLUANT toute UI Instagram (header avec avatar+pseudo, boutons like/comment/share, barre d'action en bas, texte de caption, watermark). x/y = coin haut-gauche ; w/h = largeur/hauteur. Aspect ratio libre — posts feed ~1:1, screenshots de reels ~9:16. Sois PRÉCIS : c'est utilisé pour crop l'image avant l'affichage sur la carte. Si l'image n'est PAS un screenshot Instagram avec chrome UI (ex: photo perso, image déjà cropped, screenshot d'une story pleine largeur sans UI visible), ou si tu ne peux pas identifier de région photo distincte : null."
}

## Règles strictes

1. **JSON UNIQUEMENT**. Aucun texte avant/après. Aucun commentaire. Aucune backticks.
2. **N'INVENTE JAMAIS** depuis ta connaissance seule. Toute info doit être écrite/visible dans le screenshot ou la caption. EN REVANCHE, extrais tout fragment textuel visible même incomplet — un "rue de Vern..." tronqué ou un "75007" seul est plus utile qu'un null.
3. Si le screenshot ne contient PAS de recommandation de lieu (ex: mème, photo perso sans lieu), retourne :
   \`\`\`
   { "name": null, "city": null, "country": null, "address": null, "category": null, "description": null, "sourceAuthor": null, "photoBoundingBox": null }
   \`\`\`
4. Trim les espaces et emojis parasites (garde 📍 uniquement si structurel).
5. Pour les caption tronquées ("Chai Brongniart, Paris 2..."), extrais ce que tu vois (name="Chai Brongniart", city="Paris") sans deviner la suite.`;

export const USER_PROMPT_LINE = 'Voici un screenshot Instagram. Extrait les infos du lieu recommandé au format JSON strict spécifié.';

/**
 * Build the user prompt line, optionally suffixed with the raw Instagram
 * caption text when the Share Sheet handed us one (typical for video/reel
 * shares — often the caption spells out name/address in plain text and gives
 * Claude a much easier target than pixels alone).
 *
 * Caption is trimmed and capped at 2000 chars to keep the prompt lean.
 */
export function buildUserPrompt(captionText?: string | null): string {
  const base = USER_PROMPT_LINE;
  if (!captionText || !captionText.trim()) return base;
  return `${base}\n\nVoici aussi la caption du post Insta (peut contenir nom + adresse en clair) :\n"""${captionText.trim().slice(0, 2000)}"""`;
}
