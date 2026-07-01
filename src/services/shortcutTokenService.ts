/**
 * SHORTCUT TOKEN SEAM.
 *
 * The token lives on `/users/{uid}.shortcutToken` and is used by the
 * `extractFromShortcut` Cloud Function to identify the caller. All
 * firebase/firestore access happens in `firebaseShortcutTokenService.ts`.
 */

export interface ShortcutTokenService {
  /** Return the existing token, or create + persist one on first call. Idempotent. */
  getOrCreate(userId: string): Promise<string>;

  /** Rotate: create a new token, invalidating the previous one. */
  regenerate(userId: string): Promise<string>;
}

let _instance: ShortcutTokenService | null = null;

export function getShortcutTokenService(): ShortcutTokenService {
  if (!_instance) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FirebaseShortcutTokenService } = require('./firebaseShortcutTokenService');
    _instance = new FirebaseShortcutTokenService();
  }
  return _instance!;
}

// Backwards-compat named exports so existing screens keep working.
export const getOrCreateShortcutToken = (userId: string): Promise<string> =>
  getShortcutTokenService().getOrCreate(userId);
export const regenerateShortcutToken = (userId: string): Promise<string> =>
  getShortcutTokenService().regenerate(userId);
