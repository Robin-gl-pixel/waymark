import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/**
 * Save-attribution trigger (#13).
 *
 * When a new lieu is created under `users/{ownerUid}/lieux/{lieuId}` and it
 * has a `savedFromUserId` set (i.e. the pin was created via
 * `LieuxService.resaveFromNetwork`), we write an Activity row on the ORIGINAL
 * saver's feed so they see "@ownerUid saved your pin".
 *
 * The client never writes to `users/{savedFromUserId}/activity` directly —
 * Firestore rules block cross-user writes, and doing it server-side is what
 * keeps the activity feed tamper-resistant.
 *
 * Idempotency: if Firestore retries the trigger, we'd write a duplicate
 * activity row. Same accepted-V1 cost as `followTriggers` — the Activity feed
 * is not counted for badges by unique-actor. V1.1 could dedupe on
 * `(actorUid, targetLieuId, type)`.
 *
 * Style reference: `followTriggers.ts` (same shape: onDocumentCreated,
 * fetch actor's username for denormalised display, single batch commit).
 */

const REGION = 'europe-west1';

export const onLieuSaved = onDocumentCreated(
  {
    document: 'users/{ownerUid}/lieux/{lieuId}',
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() as {
      savedFromUserId?: string | null;
    };

    const savedFromUserId = data.savedFromUserId ?? null;
    if (!savedFromUserId) {
      // Regular upload — nothing to attribute.
      return;
    }

    const { ownerUid, lieuId } = event.params;
    if (!ownerUid || !lieuId) return;

    if (ownerUid === savedFromUserId) {
      // Defensive: a user shouldn't be able to save from themselves. If they
      // manage to, we'd be writing an activity to their own feed which is
      // noise, not signal. Bail.
      console.warn('[onLieuSaved] ignoring self-attribution', { ownerUid, lieuId });
      return;
    }

    const firestore = getFirestore();

    // Fetch the actor's (the saver's = ownerUid) username so the Activity row
    // renders without a second read at display time — mirrors the follow trigger.
    let actorUsername: string | null = null;
    try {
      const actorSnap = await firestore.doc(`users/${ownerUid}`).get();
      if (actorSnap.exists) {
        actorUsername = (actorSnap.data()?.username as string | undefined) ?? null;
      }
    } catch (err) {
      console.warn('[onLieuSaved] actor profile read failed', { ownerUid, err });
    }

    const activityRef = firestore.collection(`users/${savedFromUserId}/activity`).doc();
    await activityRef.set({
      type: 'save',
      actorUid: ownerUid,
      actorUsername,
      targetLieuId: lieuId,
      createdAt: FieldValue.serverTimestamp(),
      read: false,
    });
  },
);
