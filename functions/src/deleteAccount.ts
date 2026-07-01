import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { revokeRefreshToken, AppleAuthConfig } from './lib/apple';

const APPLE_TEAM_ID = defineSecret('APPLE_TEAM_ID');
const APPLE_KEY_ID = defineSecret('APPLE_KEY_ID');
const APPLE_CLIENT_ID = defineSecret('APPLE_CLIENT_ID');
const APPLE_PRIVATE_KEY = defineSecret('APPLE_PRIVATE_KEY');

/**
 * Delete the caller's account entirely.
 *
 * Order matters: Firestore + Storage first (so if Auth deletion fails midway,
 * the user can retry without leftover secret paths). Only after both cleanups
 * succeed do we revoke tokens and delete the Auth user.
 *
 * Apple review requires this feature since June 2022 (Guideline 5.1.1(v)).
 * The Apple Sign In credential revocation (step 4) is what satisfies the
 * "must invalidate the third-party credential" clause of that guideline.
 */
export const deleteAccount = onCall(
  {
    region: 'europe-west1',
    memory: '256MiB',
    timeoutSeconds: 60,
    secrets: [APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY],
  },
  async (request): Promise<{ ok: true }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');

    const firestore = getFirestore();
    const auth = getAuth();
    const bucket = getStorage().bucket();

    // 1. Delete the user's Firestore subtree (lieux subcollection + the parent user doc).
    const lieuxSnap = await firestore.collection(`users/${uid}/lieux`).get();
    const batchSize = 400; // Firestore batch limit is 500; leave headroom for the parent doc write.
    let batch = firestore.batch();
    let ops = 0;
    for (const d of lieuxSnap.docs) {
      batch.delete(d.ref);
      ops++;
      if (ops >= batchSize) {
        await batch.commit();
        batch = firestore.batch();
        ops = 0;
      }
    }
    batch.delete(firestore.doc(`users/${uid}`));
    await batch.commit();

    // 2. Purge Storage /users/{uid}/ prefix.
    await bucket.deleteFiles({ prefix: `users/${uid}/` });

    // 3. Revoke the Apple Sign In credential (guideline 5.1.1(v)).
    // Best-effort — if the token is missing or Apple returns 4xx we log and continue,
    // otherwise the user can never delete their account because of a stale/expired token.
    const appleAuthRef = firestore.doc(`appleAuth/${uid}`);
    const appleAuthSnap = await appleAuthRef.get();
    const refreshToken = appleAuthSnap.exists ? (appleAuthSnap.data()?.refreshToken as string | undefined) : undefined;
    if (refreshToken) {
      const cfg: AppleAuthConfig = {
        teamId: APPLE_TEAM_ID.value(),
        keyId: APPLE_KEY_ID.value(),
        clientId: APPLE_CLIENT_ID.value(),
        privateKey: APPLE_PRIVATE_KEY.value(),
      };
      try {
        const result = await revokeRefreshToken(cfg, refreshToken);
        if (!result.ok) {
          console.warn('[deleteAccount] Apple revoke non-2xx', { status: result.status, error: result.error });
        }
      } catch (err) {
        console.warn('[deleteAccount] Apple revoke threw', err);
      }
    } else {
      // Legacy accounts predating exchangeAppleCode won't have a token stored.
      console.info('[deleteAccount] no Apple refresh token on file for uid', uid);
    }
    // Delete the appleAuth doc regardless — we're deleting the user.
    await appleAuthRef.delete().catch(() => undefined);

    // 4. Revoke Firebase refresh tokens (existing sessions across other devices die immediately).
    await auth.revokeRefreshTokens(uid);

    // 5. Delete the Auth user.
    await auth.deleteUser(uid);

    return { ok: true };
  },
);
