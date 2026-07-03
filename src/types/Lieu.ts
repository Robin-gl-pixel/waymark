export type LieuCategory = 'resto' | 'bar' | 'café' | 'activité' | 'musée' | 'hôtel' | 'autre';

// Structural match for firebase/firestore Timestamp so screens don't need to import from firebase/*.
export interface Timestamp {
  readonly seconds: number;
  readonly nanoseconds: number;
  toDate(): Date;
  toMillis(): number;
}

/**
 * One photo attached to a `Lieu`. The gallery is an ordered list of these,
 * capped at 10 items — `photos[0]` is the hero shown on `LieuDetailScreen`
 * and everywhere else the pin's photo appears.
 *
 * Introduced by wave 1 (#35) as part of the photo cleanup + galerie multi-photo
 * PRD (#34). This slice (#38) adds the edit UI (add / delete / reorder /
 * lightbox) and the `LieuxService` mutation methods.
 */
export type LieuPhoto = {
  /** Full Storage path (e.g. `users/{uid}/photos/{lieuId}/{photoId}.jpg`). */
  storagePath: string;
  /** Where the photo came from — `'insta'` for the original screenshot, `'user'` for camera-roll/camera adds. */
  source: 'insta' | 'user';
  /** When this specific photo entered the gallery. */
  addedAt: Timestamp;
};

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
  /**
   * Ordered gallery for this pin, hard-capped at 10 items. `photos[0]` is the
   * hero displayed on `LieuDetailScreen`, `ListScreen`, and every other
   * surface where the pin's photo appears. Introduced by #35; mutations live
   * on `LieuxService` (`addPhoto` / `removePhoto` / `reorderPhotos`, #38).
   *
   * For pre-migration docs read via `getLieuById` / `getAllLieux`, a
   * single-element array is synthesized in memory from
   * `sourceInstagram.screenshotStoragePath` — see #35.
   */
  photos: LieuPhoto[];
  sourceInstagram: {
    author: string | null;
    /**
     * @deprecated Only read for pre-migration docs — never written on new
     * pins. New pins persist their hero via `photos[0].storagePath`. Kept as
     * a required field on this type for read-compat until the backfill
     * (#34) migrates every doc; then removable.
     */
    screenshotStoragePath: string;
  };
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
