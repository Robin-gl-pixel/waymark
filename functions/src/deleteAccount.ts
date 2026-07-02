import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { revokeRefreshToken, AppleAuthConfig } from './lib/apple';
import { cascadeSocialDelete, FirestoreLike } from './lib/socialCascade';

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
 * The Apple Sign In credential revocation (step 5) is what satisfies the
 * "must invalidate the third-party credential" clause of that guideline.
 *
 * Social cascade (issue #18): before nuking my own subtree we walk the graph
 * and clean up the state I leave behind on OTHER users — nullify
 * `savedFromUserId` on downstream lieux, remove me from their
 * following/followers, decrement counts. See `lib/socialCascade.ts` for the
 * full protocol + idempotency contract + known V1 limitations.
 *
 * Timeout is bumped to the 540s Cloud Function max: a tail user with a large
 * downstream save fan-out plus recursive-delete of their own subtree can take
 * a while, and dying halfway leaves the delete visibly incomplete to the user.
 */
export const deleteAccount = onCall(
  {
    region: 'europe-west1',
    memory: '256MiB',
    timeoutSeconds: 540,
    secrets: [APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY],
  },
  async (request): Promise<{ ok: true }> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');

    const firestore = getFirestore();
    const auth = getAuth();
    const bucket = getStorage().bucket();

    // 1. Social cascade — MUST run before we nuke our own subcollections,
    //    because phases 2/3 iterate our followers + following to reach the
    //    other users' back-refs.
    try {
      const cascadeSummary = await cascadeSocialDelete(
        uid,
        firestore as unknown as FirestoreLike,
        (n) => FieldValue.increment(n),
      );
      console.info('[deleteAccount] social cascade complete', { uid, ...cascadeSummary });
    } catch (err) {
      // Log but do NOT abort — a partially-cascaded delete is still preferable to a user
      // who can't delete their account at all (Apple review will reject that). The trigger
      // is idempotent, so an admin retry will finish the job.
      console.error('[deleteAccount] social cascade failed (continuing)', { uid, err });
    }

    // 2. Recursive-delete my own subtree — followers, following, blocks, activity,
    //    lieux, and the parent user doc itself. Admin SDK's recursiveDelete uses a
    //    BulkWriter under the hood, so no batch-size ceremony needed here.
    await firestore.recursiveDelete(firestore.doc(`users/${uid}`));

    // 3. Purge Storage /users/{uid}/ prefix (screenshots + any other user-scoped blobs).
    await bucket.deleteFiles({ prefix: `users/${uid}/` });

    // 4. Revoke the Apple Sign In credential (guideline 5.1.1(v)).
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

    // 5. Revoke Firebase refresh tokens (existing sessions across other devices die immediately).
    await auth.revokeRefreshTokens(uid);

    // 6. Delete the Auth user.
    await auth.deleteUser(uid);

    return { ok: true };
  },
);
