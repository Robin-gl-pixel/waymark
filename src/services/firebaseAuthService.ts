import {
  OAuthProvider,
  User,
  onAuthStateChanged,
  signInAnonymously,
  signInWithCredential,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from '../auth/firebase';
import type { AuthService, AuthUser } from './authService';

const FUNCTIONS_REGION = 'europe-west1';

function toAuthUser(u: User | null): AuthUser | null {
  if (!u) return null;
  return { uid: u.uid, email: u.email, displayName: u.displayName, isAnonymous: u.isAnonymous };
}

export class FirebaseAuthService implements AuthService {
  onAuthStateChanged(cb: (u: AuthUser | null) => void): () => void {
    return onAuthStateChanged(auth, (u) => cb(toAuthUser(u)));
  }

  getCurrentUser(): AuthUser | null {
    return toAuthUser(auth.currentUser);
  }

  async signInWithApple(idToken: string, rawNonce: string): Promise<AuthUser> {
    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({ idToken, rawNonce });
    const result = await signInWithCredential(auth, credential);
    const user = toAuthUser(result.user);
    if (!user) throw new Error('Apple sign-in returned no user');
    return user;
  }

  async signInAnonymouslyDev(): Promise<AuthUser> {
    const result = await signInAnonymously(auth);
    const user = toAuthUser(result.user);
    if (!user) throw new Error('Anonymous sign-in returned no user');
    return user;
  }

  async updateDisplayName(displayName: string): Promise<void> {
    if (!auth.currentUser) throw new Error('No current user');
    await updateProfile(auth.currentUser, { displayName });
  }

  async signOut(): Promise<void> {
    await signOut(auth);
  }

  async exchangeAppleAuthorizationCode(authorizationCode: string): Promise<void> {
    const functions = getFunctions(undefined, FUNCTIONS_REGION);
    const callable = httpsCallable<{ authorizationCode: string }, { ok: true }>(
      functions,
      'exchangeAppleCode',
    );
    await callable({ authorizationCode });
  }

  async deleteAccount(): Promise<void> {
    const functions = getFunctions(undefined, FUNCTIONS_REGION);
    const callable = httpsCallable(functions, 'deleteAccount');
    await callable({});
  }
}
