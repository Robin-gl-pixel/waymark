import type { Lieu } from '../types/Lieu';

/**
 * Pure helpers for `LieuDetailScreen` — extracted so they can be unit-tested
 * without pulling React Native into the test env. Follows the same seam
 * pattern as `listScreenHelpers.ts` (issue #48).
 */

/**
 * Build the plain-text message handed to the iOS native Share sheet from the
 * lieu's public metadata. The format is intentionally minimal — the sheet's
 * own preview handles link expansion when a URL is present.
 *
 *   « Chez Alice — 1 rue du Test, Paris »
 *
 * Empty / missing address and city are dropped without a leading comma so the
 * message never renders as « Chez Alice — , Paris » or « Chez Alice — Paris, ».
 */
export function buildShareMessage(
  lieu: Pick<Lieu, 'name' | 'address' | 'city'>,
): string {
  const parts: string[] = [];
  const address = lieu.address?.trim();
  const city = lieu.city?.trim();
  if (address) parts.push(address);
  if (city && city !== address) parts.push(city);
  const tail = parts.join(', ');
  return tail ? `${lieu.name} — ${tail}` : lieu.name;
}
