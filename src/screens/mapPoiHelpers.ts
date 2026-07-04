import type { LieuCategory, LieuInput } from '../types/Lieu';
import type { BadgeStatus } from '../components/BadgeText';

/**
 * All seven categories in the canonical order the picker renders them.
 * `resto` first because that's the default selection for a map-POI tap
 * (the overwhelming majority of user-interesting POIs on Apple/OSM maps
 * are restaurants — see slice spec).
 */
export const MAP_POI_CATEGORY_ORDER: readonly LieuCategory[] = [
  'resto',
  'bar',
  'café',
  'activité',
  'musée',
  'hôtel',
  'autre',
] as const;

/**
 * Human-readable French label for each category chip in the POI save
 * sheet — matches `listScreenHelpers.categoryLabel` for the non-`autre`
 * slots, but `autre` reads as "Autre" (a chip label, not a list row title).
 */
export const MAP_POI_CATEGORY_LABEL: Record<LieuCategory, string> = {
  resto: 'Resto',
  bar: 'Bar',
  café: 'Café',
  activité: 'Activité',
  musée: 'Musée',
  hôtel: 'Hôtel',
  autre: 'Autre',
};

/**
 * How the user opened the save sheet.
 *
 * - `poi`      — tapped a labelled POI (Google Maps only; the react-native-maps
 *                bridge does NOT emit onPoiClick on Apple Maps, which is why
 *                the founder's tap-a-resto flow silently broke in v7).
 * - `longpress` — long-pressed a bare coordinate on Apple Maps. No name is
 *                available; the user types it in the sheet's TextInput.
 */
export type MapPoiSource = 'poi' | 'longpress';

/**
 * Payload passed from MapScreen to the save sheet. `name` may be empty when
 * the source is `longpress` — the sheet's TextInput fills it in before we
 * build a `LieuInput`.
 */
export interface MapPoiTap {
  name: string;
  coordinate: { latitude: number; longitude: number };
  source: MapPoiSource;
}

/**
 * Build a `LieuInput` from a map POI tap + the user's choice in the save
 * sheet. Pure — no service calls, no navigation, no side effects.
 *
 * Notes:
 * - `name` in the arg overrides `poi.name`. This lets the sheet's TextInput
 *   drive the final venue name — either correcting Apple's POI label or
 *   supplying a name when the user long-pressed a bare coordinate. Both are
 *   trimmed to avoid a stray leading/trailing space getting into Firestore.
 * - `screenshotUri` is empty because a POI tap has no photo. The seam
 *   already handles this branch: both `FirebaseLieuxService.createLieu`
 *   and `InMemoryLieuxService.createLieu` skip the Storage upload and
 *   write `photos: []` when the URI is empty (see the "URL-only shares
 *   from Insta" branch — same code path).
 * - `screenshotMediaType` is set to `image/jpeg` as a harmless default:
 *   the seam only reads it to derive the file extension when uploading,
 *   which we don't do here.
 * - `status` is on the return type as metadata only. `LieuInput` itself
 *   has no `status` field (the seam contract forces every new pin to
 *   `wishlist`). Callers who want `visited` must invoke `updateLieu`
 *   right after `createLieu` — the returned `status` here tells them
 *   whether to.
 * - `city`, `country`, `address` are left empty. The user can edit them
 *   later from the pin's detail screen; we don't have a reverse-geocoding
 *   pipeline wired to the seam at the point of tap.
 */
export function mapPoiToLieuInput(args: {
  poi: MapPoiTap;
  category: LieuCategory;
  /** Optional; defaults to `'wishlist'`. Consumers pass `null` to leave unclassified. */
  status?: BadgeStatus;
  /**
   * Optional override for the venue name — supplied by the sheet's TextInput.
   * When omitted, `poi.name` is used verbatim (still trimmed).
   */
  name?: string;
}): { input: LieuInput; status: BadgeStatus } {
  const status: BadgeStatus = args.status === undefined ? 'wishlist' : args.status;
  const rawName = args.name ?? args.poi.name;
  const input: LieuInput = {
    name: rawName.trim(),
    city: '',
    country: '',
    address: '',
    lat: args.poi.coordinate.latitude,
    lng: args.poi.coordinate.longitude,
    category: args.category,
    description: null,
    sourceAuthor: null,
    userNotes: null,
    // Empty URI = no photo path — the seam skips Storage upload and writes
    // photos: []. See createLieu impls for the exact branch.
    screenshotUri: '',
    // Irrelevant when screenshotUri is empty; jpeg is the least-surprising default.
    screenshotMediaType: 'image/jpeg',
  };
  return { input, status };
}
