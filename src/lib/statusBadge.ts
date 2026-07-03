import type { Lieu } from '../types/Lieu';

/**
 * Icon used to signal a pin owner's relation to a place on friend-facing
 * surfaces (`UserProfileScreen` list, `LieuDetailScreen` friend-view).
 *
 * - `'♡'` — wishlist ("envie")
 * - `'✓'` — visited ("déjà allé")
 * - `null` — unclassified; no badge is rendered
 *
 * Kept intentionally string-typed (rather than a component) so the pure
 * mapping can be seam-tested without pulling React Native into the runner.
 */
export type StatusBadgeIcon = '♡' | '✓' | null;

/**
 * Maps a pin's `status` field to the icon rendered on friend-facing surfaces.
 * `null`, `undefined`, or any unknown value returns `null` (no badge) so
 * pre-#41 pins with no status field render cleanly.
 */
export function statusBadgeIcon(status: Lieu['status'] | undefined): StatusBadgeIcon {
  if (status === 'wishlist') return '♡';
  if (status === 'visited') return '✓';
  return null;
}

/**
 * Accessibility label describing what the icon means. Kept close to the icon
 * mapping so future translations touch a single spot.
 */
export function statusBadgeLabel(status: Lieu['status'] | undefined): string | null {
  if (status === 'wishlist') return 'Envie';
  if (status === 'visited') return 'Déjà allé';
  return null;
}
