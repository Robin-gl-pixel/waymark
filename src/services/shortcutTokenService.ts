import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import * as Crypto from 'expo-crypto';
import { db } from '../auth/firebase';

/**
 * The shortcut token lives on `/users/{uid}` as a top-level field so the
 * server-side HTTP endpoint (extractFromShortcut) can look up the user by
 * token equality in one Firestore query.
 *
 * Ensure the user doc exists before writing the token — the app currently
 * doesn't materialize /users/{uid} until the first lieu is saved, so this
 * service handles bootstrap.
 */

async function generateHexToken(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function getOrCreateShortcutToken(userId: string): Promise<string> {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  const existing = snap.exists() ? (snap.data().shortcutToken as string | undefined) : undefined;
  if (existing) return existing;

  const token = await generateHexToken();
  if (snap.exists()) {
    await updateDoc(userRef, { shortcutToken: token, tokenUpdatedAt: serverTimestamp() });
  } else {
    await setDoc(userRef, { shortcutToken: token, tokenUpdatedAt: serverTimestamp(), createdAt: serverTimestamp() });
  }
  return token;
}

export async function regenerateShortcutToken(userId: string): Promise<string> {
  const token = await generateHexToken();
  await updateDoc(doc(db, 'users', userId), {
    shortcutToken: token,
    tokenUpdatedAt: serverTimestamp(),
  });
  return token;
}
