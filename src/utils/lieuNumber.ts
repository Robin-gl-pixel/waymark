import type { Lieu, Timestamp } from '../types/Lieu';

/**
 * Renders the "Nº 048"-style entry number for a lieu.
 *
 * The atlas-numbering data model (PRD #44 user story 5-7) hasn't landed yet,
 * so we derive a **stable placeholder** number from the lieu's id — same id
 * always resolves to the same three-digit slug. When the real per-user
 * monotonic counter ships (future slice), consumers keep calling this helper
 * and the implementation swaps to read the persisted field.
 *
 * Returned string is always exactly `Nº ` + three digits, padded with leading
 * zeros (`Nº 001`..`Nº 999`). Zero is skipped so no pin renders as `Nº 000`.
 */
export function formatEntryNumber(lieu: Pick<Lieu, 'id'>): string {
  // djb2 — small, dependency-free, and stable across runs so a given pin
  // always shows the same badge across screens.
  let hash = 5381;
  for (let i = 0; i < lieu.id.length; i += 1) {
    hash = ((hash << 5) + hash + lieu.id.charCodeAt(i)) | 0;
  }
  const n = (Math.abs(hash) % 999) + 1; // 1..999, never 000
  return `Nº ${n.toString().padStart(3, '0')}`;
}

/**
 * Compact French date `DD·MM` used across the mono/meta lines of the atlas.
 * The mid-dot (U+00B7) is the mockup's signature separator — do not swap for
 * a hyphen or slash, that breaks the archival-log feel.
 */
export function formatCompactDate(ts: Timestamp): string {
  const d = ts.toDate();
  const dd = d.getDate().toString().padStart(2, '0');
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${dd}·${mm}`;
}
