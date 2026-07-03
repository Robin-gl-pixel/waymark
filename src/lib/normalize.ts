/**
 * Normalize a place name for equality lookups (dedup, DB check).
 * Lowercased, accents stripped (NFD), whitespace collapsed. Kept intentionally
 * dumb — anything smarter (fuzzy matching, punctuation stripping) risks false
 * positives that collide different venues.
 *
 * A twin lives in `functions/src/lib/normalize.ts` — mirror any change there.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
