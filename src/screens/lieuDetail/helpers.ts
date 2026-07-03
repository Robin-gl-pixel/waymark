import type { Lieu } from '../../types/Lieu';
import type { BadgeStatus } from '../../components/BadgeText';

/**
 * Address block layout for the detail body: street on line 1, city on line 2,
 * with a mid-dot join fallback when we can't split cleanly. Kept pure so the
 * screen can render it directly and the seam tests can lock the output.
 */
export function formatAddress(lieu: Pick<Lieu, 'address' | 'city'>): string {
  const trimmedAddr = (lieu.address ?? '').trim();
  const trimmedCity = (lieu.city ?? '').trim();
  if (!trimmedCity) return trimmedAddr;
  if (trimmedAddr.toLowerCase().includes(trimmedCity.toLowerCase())) {
    return trimmedAddr;
  }
  return `${trimmedAddr}\n${trimmedCity}`;
}

/**
 * Wraps a raw string in French guillemets `« … »` — the tastemaker voice of
 * the atlas. Returns `null` for empty input so callers can early-return
 * cleanly.
 */
export function quoteWrap(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  return `« ${trimmed} »`;
}

/**
 * The text that renders as the italic-serif quote block.
 * Owner mode → your own `userNotes`, falling back to the venue's
 * description. Friend mode → the venue's description (the friend's own
 * `userNotes` render in a separate attributed block).
 */
export function detailQuoteText(lieu: Lieu, isMine: boolean): string | null {
  const raw = isMine
    ? lieu.userNotes || lieu.description
    : lieu.description;
  return quoteWrap(raw);
}

/**
 * Friend-mode badge phrase — « · Y est allé » / « · En envie » in the
 * category color, mono uppercase. Returns null when the pin's owner hasn't
 * classified it (renders no badge — absence of decision).
 */
export function friendBadgeLabel(status: BadgeStatus): string | null {
  if (status === 'visited') return '· Y est allé';
  if (status === 'wishlist') return '· En envie';
  return null;
}
