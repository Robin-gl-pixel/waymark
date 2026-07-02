/**
 * AUTH SEAM.
 *
 * All auth/session/account-management calls MUST go through this interface.
 * No file outside `firebaseAuthService.ts` and `firebase.ts` should import `firebase/auth`
 * or `firebase/functions` — that's the rule from issue #3.
 *
 * See `firebaseAuthService.ts` for the concrete implementation.
 */

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface AuthService {
  /** Subscribe to session changes. Returns an unsubscribe. */
  onAuthStateChanged(cb: (u: AuthUser | null) => void): () => void;

  /** The currently signed-in user (null if signed out). Synchronous — read from cache. */
  getCurrentUser(): AuthUser | null;

  /** Complete an Apple sign-in flow using tokens obtained from AppleAuthentication. */
  signInWithApple(idToken: string, rawNonce: string): Promise<AuthUser>;

  /** Dev-only bypass: anonymous Firebase sign-in so devs can hit the rest of the app when Apple is broken on sim. */
  signInAnonymouslyDev(): Promise<AuthUser>;

  /** Update the display name on the current user (first-sign-in only for Apple). */
  updateDisplayName(displayName: string): Promise<void>;

  /** End the session. */
  signOut(): Promise<void>;

  /**
   * Exchange the Apple `authorizationCode` from sign-in for a refresh token, server-side.
   * Fire-and-persist: the server stores the token so `deleteAccount` can later revoke it
   * (App Store guideline 5.1.1(v)). Must run right after sign-in — the code is one-shot
   * and expires in ~5 minutes.
   */
  exchangeAppleAuthorizationCode(authorizationCode: string): Promise<void>;

  /** Delete the account server-side (Firestore + Storage + Auth + Apple credential). Session is invalidated by the server. */
  deleteAccount(): Promise<void>;
}

let _instance: AuthService | null = null;

export function getAuthService(): AuthService {
  if (!_instance) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FirebaseAuthService } = require('./firebaseAuthService');
    _instance = new FirebaseAuthService();
  }
  return _instance!;
}
