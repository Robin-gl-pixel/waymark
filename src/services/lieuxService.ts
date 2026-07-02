import { Lieu, LieuInput, LieuExtracted } from '../types/Lieu';

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

  /** Patch fields on an existing lieu. Only `userNotes`, `name`, `city`, `address`, `category` are user-editable. */
  updateLieu(userId: string, lieuId: string, patch: Partial<Pick<Lieu, 'name' | 'city' | 'address' | 'category' | 'userNotes'>>): Promise<void>;

  /** Delete a lieu and its associated screenshot from Storage. */
  deleteLieu(userId: string, lieuId: string): Promise<void>;

  /** Call the `extract` Cloud Function and return the structured extraction. */
  extractFromScreenshot(imageBase64: string, mediaType: 'image/png' | 'image/jpeg' | 'image/webp'): Promise<LieuExtracted>;

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
