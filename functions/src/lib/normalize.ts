/**
 * Server-side twin of `src/lib/normalize.ts`. Same rules — lowercased, NFD-stripped,
 * whitespace collapsed. Kept in sync manually; if you change one, change the other.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Same rule applied to city. Extracted so a caller can normalize once.
 */
export function normalizeCity(city: string | null | undefined): string {
  return normalizeName(city ?? '');
}
