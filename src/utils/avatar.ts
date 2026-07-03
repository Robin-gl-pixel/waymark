import { avatarPalette } from '../theme';

/**
 * Deterministic avatar helpers.
 *
 * A user's avatar is a coloured circle + a white initial. The colour is a
 * hash-into-palette (so the same username always paints the same tile), and
 * the initial is just the first character. Keeps the app visually alive
 * without touching Storage for real image assets (V2).
 *
 * Hash: FNV-1a over the lowercased username → integer → mod palette length.
 * FNV-1a is fine for this — we don't need cryptographic strength, only good
 * distribution across 8 buckets so rows in a feed don't clump into one colour.
 */

/**
 * Pick a stable colour for `username` from the theme's avatar palette.
 * Empty / whitespace-only names fall through to the first palette entry so
 * we never crash on a missing profile.
 */
export function avatarColor(username: string | null | undefined): string {
  const clean = (username ?? '').trim().toLowerCase();
  if (clean.length === 0) return avatarPalette[0];
  // FNV-1a 32-bit — small, stable, no deps.
  let hash = 0x811c9dc5;
  for (let i = 0; i < clean.length; i++) {
    hash ^= clean.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return avatarPalette[hash % avatarPalette.length];
}

/**
 * First character of `username`, uppercased. Falls back to '?' so the tile
 * always has SOMETHING to render — better than a blank circle when a lookup
 * failed and we're mid-hydrate.
 */
export function avatarInitial(username: string | null | undefined): string {
  const clean = (username ?? '').trim();
  if (clean.length === 0) return '?';
  // charAt handles multi-byte correctly enough for our username ruleset
  // (/^[a-z0-9._]{3,20}$/ — ASCII-only).
  return clean.charAt(0).toUpperCase();
}
