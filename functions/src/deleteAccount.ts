import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

/**
 * Delete the caller's account entirely.
 *
 * Order matters: Firestore + Storage first (so if Auth deletion fails midway,
 * the user can retry without leftover secret paths). Only after both cleanups
 * succeed do we revoke tokens and delete the Auth user.
 *
 * Apple review requires this feature since June 2022 (Guideline 5.1.1(v)).
 */
export const deleteAccount = onCall(
  {
    region: 'europe-west1',
    memory: '256MiB',
    timeoutSeconds: 60,
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

    // 3. Revoke refresh tokens (existing sessions across other devices die immediately).
    await auth.revokeRefreshTokens(uid);

    // 4. Delete the Auth user. Apple Sign-in credential is auto-revoked by Firebase.
    await auth.deleteUser(uid);

    return { ok: true };
  },
);
