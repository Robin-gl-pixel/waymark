import { Lieu, LieuInput, LieuExtracted, LieuPhoto } from '../types/Lieu';

/**
 * Hard cap on the number of photos per pin. Enforced at the service layer
 * (throwing {@link PhotoCapReachedError}) — Firestore rules don't check array
 * length. Mirrored in the UI: `LieuDetailScreen` hides the "+ Ajouter" tile
 * once a pin has reached this many photos.
 */
export const MAX_PHOTOS_PER_LIEU = 10;

/**
 * Thrown by `addPhoto` when a pin already has {@link MAX_PHOTOS_PER_LIEU}
 * photos. The UI catches this specifically to surface a friendly "10 photos
 * max" alert rather than a generic error. Firestore state and Storage are
 * unchanged on this rejection.
 */
export class PhotoCapReachedError extends Error {
  readonly lieuId: string;
  readonly cap: number;
  constructor(lieuId: string) {
    super(`Pin ${lieuId} already has ${MAX_PHOTOS_PER_LIEU} photos (cap).`);
    this.name = 'PhotoCapReachedError';
    this.lieuId = lieuId;
    this.cap = MAX_PHOTOS_PER_LIEU;
  }
}

/**
 * Distance below which two pins are considered the same venue (haversine, meters).
 * Mirrors `UploadScreen`'s upload-time dedup constant — kept identical so the
 * "already in your collection" behaviour is consistent across upload and re-save.
 */
export const DUPLICATE_DISTANCE_M = 100;

/**
 * Thrown by `resaveFromNetwork` when a pin within {@link DUPLICATE_DISTANCE_M}
 * already exists in the caller's collection. The UI catches this specifically
 * to surface a "déjà dans ta collection" alert rather than a generic error.
 */
export class LieuDuplicateError extends Error {
  readonly duplicate: Lieu;
  constructor(duplicate: Lieu) {
    super(`A lieu within ${DUPLICATE_DISTANCE_M}m already exists (${duplicate.id}).`);
    this.name = 'LieuDuplicateError';
    this.duplicate = duplicate;
  }
}

/**
 * THE ONLY DATA SEAM.
 *
 * All screens/components MUST go through this interface — never import `firebase/*` directly.
 * This isolation is what makes the future Supabase migration cheap (~1-3 days per PRD).
 *
 * See `firebaseLieuxService.ts` for the concrete implementation.
 */
export interface LieuxService {
  /** All lieux of the current user, sorted by createdAt desc. */
  getAllLieux(userId: string): Promise<Lieu[]>;

  /** Single lieu by ID (must belong to the calling user — enforced by Firestore rules). */
  getLieuById(userId: string, lieuId: string): Promise<Lieu | null>;

  /** Persist a new lieu. Uploads the screenshot to Storage, writes the Firestore doc, returns the created Lieu. */
  createLieu(userId: string, input: LieuInput): Promise<Lieu>;

  /**
   * Patch fields on an existing lieu. Only `userNotes`, `name`, `city`,
   * `address`, `category`, and `status` are user-editable.
   *
   * `visitedAt` is intentionally NOT part of the patch type — the service
   * manages the invariant (auto-set to now on transition to `'visited'`,
   * cleared on any other transition). Callers only ever set `status`.
   */
  updateLieu(
    userId: string,
    lieuId: string,
    patch: Partial<Pick<Lieu, 'name' | 'city' | 'address' | 'category' | 'userNotes' | 'status'>>,
  ): Promise<void>;

  /** Delete a lieu and its associated screenshot from Storage. */
  deleteLieu(userId: string, lieuId: string): Promise<void>;

  /**
   * Call the `extract` Cloud Function and return the structured extraction.
   *
   * `captionText` is an optional bonus context passed through to Claude — used
   * when the iOS Share Sheet provides the Instagram caption alongside the media
   * (typically for video/reel shares). Ignored server-side when absent/empty.
   */
  extractFromScreenshot(
    imageBase64: string,
    mediaType: 'image/png' | 'image/jpeg' | 'image/webp',
    captionText?: string,
  ): Promise<LieuExtracted>;

  /**
   * Extract from a shared Instagram post/reel URL.
   *
   * The server fetches the public OpenGraph metadata (og:image + og:description),
   * downloads the thumbnail, and runs the normal vision pipeline. Used when iOS
   * Share Sheet hands us a URL instead of a video file (typical for reel shares).
   *
   * Throws when the URL isn't an Instagram host or the post is private/removed.
   */
  extractFromInstagramUrl(instagramUrl: string): Promise<LieuExtracted>;

  /** Resolve a Storage path (e.g. `sourceInstagram.screenshotStoragePath`) to a signed URL loadable by <Image>. */
  getScreenshotUrl(storagePath: string): Promise<string>;

  /**
   * Clone `sourceLieu` into the caller's own `/users/{myUid}/lieux` with
   * attribution `savedFromUserId` / `savedFromUsername` set from `credit`
   * (the *immediate* saver, not the original creator of the chain).
   *
   * The screenshot is REFERENCED — the new pin's `screenshotStoragePath`
   * equals the source's, no Storage copy is performed.
   *
   * Throws {@link LieuDuplicateError} if a pin within
   * {@link DUPLICATE_DISTANCE_M} of `sourceLieu` already exists in the
   * caller's collection (haversine).
   */
  resaveFromNetwork(sourceLieu: Lieu, credit: { uid: string; username: string }): Promise<Lieu>;

  /**
   * Append a new photo to the pin's gallery.
   *
   * Uploads the local image at `imageUri` to
   * `users/{userId}/photos/{lieuId}/{photoId}.jpg` and appends a matching
   * entry to `photos[]`. Enforces the {@link MAX_PHOTOS_PER_LIEU} cap by
   * throwing {@link PhotoCapReachedError} when the gallery is full — no
   * Storage upload and no Firestore write happen in that case.
   *
   * User-added photos (`source: 'user'`) are uploaded as-is (resize + JPEG
   * re-encode for size, no crop) — see #34 US11: "photos I add myself aren't
   * mangled by an algorithm designed for Instagram screenshots".
   */
  addPhoto(
    userId: string,
    lieuId: string,
    imageUri: string,
    source: 'user',
  ): Promise<LieuPhoto>;

  /**
   * Remove a photo from the pin's gallery.
   *
   * Deletes both the Storage object at `storagePath` (best-effort — missing
   * blob is not an error) and the matching entry in `photos[]`. If the
   * removed photo was `photos[0]`, `photos[1]` implicitly becomes the new
   * hero. Deleting the last remaining photo leaves `photos: []` — callers
   * (list + detail) already fall back to the category-emoji placeholder in
   * that case.
   *
   * `sourceInstagram.author` is intentionally preserved even when the last
   * `source: 'insta'` photo is removed — attribution stays as metadata.
   */
  removePhoto(userId: string, lieuId: string, storagePath: string): Promise<void>;

  /**
   * Persist a new photo order.
   *
   * `orderedStoragePaths` must contain exactly the same set of storage paths
   * as the pin's current `photos[]` — no additions, no removals. Providing a
   * mismatched list throws without any Firestore write (partial writes would
   * break the invariant that `photos[]` reflects what's actually in Storage).
   */
  reorderPhotos(
    userId: string,
    lieuId: string,
    orderedStoragePaths: string[],
  ): Promise<void>;
}

let _instance: LieuxService | null = null;

/**
 * Lazy-load the Firebase implementation. Screens/hooks import THIS, not the impl.
 * Swapping to Supabase = change this one function.
 */
export function getLieuxService(): LieuxService {
  if (!_instance) {
    // Dynamic import keeps firebase off the initial JS bundle for the AuthScreen path.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FirebaseLieuxService } = require('./firebaseLieuxService');
    _instance = new FirebaseLieuxService();
  }
  return _instance!;
}
