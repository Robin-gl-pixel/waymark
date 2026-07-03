import type { BadgeStatus } from '../components/BadgeText';
import type { Lieu, LieuCategory } from '../types/Lieu';

/**
 * Pure helpers for `ListScreen` — extracted so they can be tested at the
 * module seam without pulling React Native into the test env.
 *
 * The screen is a numbered atlas (issue #48). Every helper below feeds a
 * specific slot in the row template:
 *
 *   Nº 048   LE GAINSBARRE                              ●
 *            BAR · PARIS 7 · 03·07 · ALLÉ
 *
 * The three-digit entry number is derived from list position + total (pins
 * are stored desc-sorted by createdAt); the city is compacted to
 * `Paris <arr>` when the address carries a `75xxx` postal code; the date
 * renders as `DD·MM` with a mid-dot; the status is resolved off the pin as
 * an optional field and rendered by `<BadgeText />`.
 */

/** French display label for each category — capitalized, singular. */
const CATEGORY_LABEL: Record<LieuCategory, string> = {
  resto: 'Resto',
  bar: 'Bar',
  café: 'Café',
  activité: 'Activité',
  musée: 'Musée',
  hôtel: 'Hôtel',
  autre: 'Lieu',
};

export function categoryLabel(category: LieuCategory): string {
  return CATEGORY_LABEL[category];
}

/**
 * Turn a (rowIndex, totalPins) pair into the "Nº 048" mono uppercase label.
 * Assumes rows are ordered newest-first (matches `LieuxService.getAllLieux`
 * which sorts desc by createdAt), so row 0 is the biggest number and the
 * bottom of the list is `Nº 001`.
 *
 * Padded to at least 3 digits — larger collections keep growing (`Nº 1024`
 * stays valid).
 */
export function formatEntryNumber(rowIndex: number, total: number): string {
  const n = Math.max(1, total - rowIndex);
  return `Nº ${String(n).padStart(3, '0')}`;
}

/**
 * Extract the Paris arrondissement number from an address string.
 * Looks for the French postal `75xxx` — `75007` → 7, `75116` → 16 (Passy
 * variant of the 16th). Returns `null` for anything else.
 */
export function extractParisArrondissement(address: string): number | null {
  const m = address.match(/\b75(\d{3})\b/);
  if (!m) return null;
  const raw = parseInt(m[1], 10);
  // 75116 is a variant postal code for the 16th arrondissement
  if (raw === 116) return 16;
  if (raw < 1 || raw > 20) return null;
  return raw;
}

/**
 * "Paris 7" when the pin lives in Paris and we can find an arrondissement,
 * else just the raw city string. Callers uppercase the whole meta line —
 * this helper stays case-preserving so it composes naturally.
 */
export function formatCityShort(city: string, address: string): string {
  if (city.trim().toLowerCase() === 'paris') {
    const arr = extractParisArrondissement(address);
    if (arr !== null) return `Paris ${arr}`;
  }
  return city;
}

/**
 * Compact French date: `03·07` (day·month, mid-dot U+00B7). Year is dropped
 * on list rows to keep the meta line short — full date with year lives on
 * the detail screen.
 */
export function formatDateCompact(createdAt: { toMillis(): number }): string {
  const d = new Date(createdAt.toMillis());
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}·${mm}`;
}

/**
 * Read `status` off a Lieu as an optional field. The data model doesn't
 * declare it yet (that lands with the status-persistence slice), but the
 * list row is designed around it — reading defensively means the UI is
 * ready the moment the field appears in Firestore.
 */
export function resolvePinStatus(lieu: Lieu): BadgeStatus {
  const raw = (lieu as unknown as { status?: unknown }).status;
  return raw === 'wishlist' || raw === 'visited' ? raw : null;
}

/**
 * Full meta line up to (but not including) the trailing badge — the badge
 * is rendered inline as its own `<Text>` so the color can differ.
 *
 * Shape: `<Category> · <City> · <Date> · ` — trailing separator + space
 * kept when there IS a status, dropped when there isn't (so the line
 * doesn't end on a dangling "·").
 */
export function buildMetaPrefix(lieu: Lieu, hasStatus: boolean): string {
  const parts = [
    categoryLabel(lieu.category),
    formatCityShort(lieu.city, lieu.address),
    formatDateCompact(lieu.createdAt),
  ];
  const base = parts.join(' · ');
  return hasStatus ? `${base} · ` : base;
}
