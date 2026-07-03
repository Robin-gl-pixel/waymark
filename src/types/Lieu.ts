export type LieuCategory = 'resto' | 'bar' | 'café' | 'activité' | 'musée' | 'hôtel' | 'autre';

// Structural match for firebase/firestore Timestamp so screens don't need to import from firebase/*.
export interface Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
  toDate(): Date;
  toMillis(): number;
}

/**
 * Where a `LieuPhoto` came from.
 *
 * - `insta`: derived from the Instagram screenshot / OG image / video keyframe
 *   the user shared into the app (the pin's origin photo).
 * - `user`: a photo the user attached themselves post-hoc from camera roll /
 *   camera via the gallery edit UI (parent PRD #34). Not written by this
 *   slice, but the discriminator is defined here so downstream slices can
 *   append without touching the type.
 */
export type LieuPhotoSource = 'insta' | 'user';

/**
 * One image attached to a `Lieu`. Stored as an entry in `Lieu.photos[]`.
 *
 * `storagePath` points at Firebase Storage: `users/{uid}/photos/{lieuId}/{photoId}.jpg`
 * for pins created after the photos[] migration; for re-saved pins it may
 * point at another user's path (reference copy — see `resaveFromNetwork`).
 */
export interface LieuPhoto {
  storagePath: string;
  source: LieuPhotoSource;
  addedAt: Timestamp;
}

/**
 * A persisted place in Waymark. Lives at `/users/{uid}/lieux/{lieuId}`.
 */
export interface Lieu {
  id: string;
  userId: string;
  name: string;
  /**
   * Lowercased, NFD-stripped, whitespace-collapsed form of `name`. Written
   * automatically on create/update. Used by the extract Cloud Function to look
   * up an already-known lieu across all users (collectionGroup query) before
   * hitting Claude/Google/Mapbox — dedup + zero API cost when someone already
   * added this venue.
   */
  nameNormalized: string;
  city: string;
  country: string;
  address: string;
  lat: number;
  lng: number;
  category: LieuCategory;
  description: string | null;
  sourceInstagram: {
    author: string | null;
    /**
     * @deprecated Pre-migration single-screenshot pointer. New pins written
     * after the `photos[]` migration (parent #34 / slice #35) do NOT set this
     * field — the seam's read layer synthesises a single-element `photos[]`
     * from it when reading legacy docs. Kept in the type only to preserve
     * the read-compat path; never write on new pins.
     */
    screenshotStoragePath?: string;
  };
  /**
   * Ordered list of images attached to the pin. `photos[0]` is the canonical
   * hero (used by `LieuDetailScreen`, `ListScreen`, map callouts). Capped at
   * 10 entries at the service layer (parent PRD #34).
   *
   * Pre-migration docs may not have this field on disk — the seam's read
   * layer synthesises a single-element array from
   * `sourceInstagram.screenshotStoragePath` on read, so consumers always see
   * a populated `photos` on a hydrated `Lieu`.
   */
  photos: LieuPhoto[];
  userNotes: string | null;
  /**
   * Attribution — set when the pin was re-saved from another user's collection
   * via `LieuxService.resaveFromNetwork` (#13). Points at the *immediate* saver,
   * not the original creator of the chain. Nullified by the account-delete
   * cascade if that user disappears (see functions/src/lib/socialCascade.ts).
   * Undefined on pre-#13 pins and on pins the user uploaded themselves.
   */
  savedFromUserId?: string | null;
  savedFromUsername?: string | null;
  /**
   * The pin owner's relation to this place (#41).
   *
   * - `'wishlist'` — I want to try this place.
   * - `'visited'` — I've already been.
   * - `null` — unclassified. Pre-#41 pins surface as `null` at the seam
   *   because the field simply doesn't exist on their Firestore doc.
   *
   * Caller-writable via `LieuxService.updateLieu({ status })`.
   */
  status: 'wishlist' | 'visited' | null;
  /**
   * Timestamp of the moment `status` transitioned to `'visited'` (#41).
   *
   * NOT caller-writable — the service enforces the invariant: setting
   * `status = 'visited'` sets `visitedAt` to now; setting `status` to
   * anything else clears `visitedAt`. Undefined on pins that were never
   * marked visited.
   */
  visitedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Normalized (0..1) bounding box of the actual venue/food/scene photo region
 * inside an Instagram screenshot, excluding IG UI chrome. Used by the client
 * to crop the screenshot before uploading so the hero on the resulting pin is
 * just the food/venue photo, not the whole IG UI. See #36.
 */
export interface PhotoBoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Shape returned by the `extract` Cloud Function. Nullable everywhere because
 * a screenshot may fail to yield a specific field — the UI surfaces this to the
 * user for correction before saving.
 */
export interface LieuExtracted {
  name: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  category: LieuCategory | null;
  description: string | null;
  sourceAuthor: string | null;
  lat: number | null;
  lng: number | null;
  mapboxId: string | null;
  addressCanonical: string | null;
  /**
   * Normalized (0..1) bbox of the actual photo region in the screenshot, or
   * `null` if Claude couldn't identify a clean region or the region failed
   * server-side sanity checks (aspect ratio ∉ [0.4, 2.5] or area ∉ [25%, 90%]).
   * When null, the client uploads the screenshot uncropped.
   */
  photoBoundingBox: PhotoBoundingBox | null;
}

/**
 * User-facing input when confirming an extraction. Everything is guaranteed non-null
 * at this layer — the confirm screen defaults + requires the missing fields.
 */
export interface LieuInput {
  name: string;
  city: string;
  country: string;
  address: string;
  lat: number;
  lng: number;
  category: LieuCategory;
  description: string | null;
  sourceAuthor: string | null;
  userNotes: string | null;
  screenshotUri: string;
  screenshotMediaType: 'image/png' | 'image/jpeg' | 'image/webp';
  /**
   * Optional attribution — populated only when the input represents a re-save
   * from another user's pin (`LieuxService.resaveFromNetwork`, #13). The
   * standard upload path leaves both null.
   */
  savedFromUserId?: string | null;
  savedFromUsername?: string | null;
}
