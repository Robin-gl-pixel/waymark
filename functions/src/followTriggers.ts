import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/**
 * Follow / unfollow triggers (#12).
 *
 * The client writes only the raw edge docs — one on each side of the follow
 * (`users/{me}/following/{uid}` + `users/{uid}/followers/{me}`). Denormalised
 * counters (`followersCount` / `followingCount`) + activity feed entries are
 * derived from those writes here so we don't need the client to hold a
 * multi-doc atomic transaction (Firestore batches don't span rule contexts
 * safely enough for that).
 *
 * We fan out on the `followers/*` side only — the `following/*` side is
 * redundant for the trigger's purposes since both sides are always written
 * together in the same client batch.
 *
 * Idempotency: an accidental double-create wouldn't fire twice (the doc
 * exists once), and the counters use `FieldValue.increment()` which is
 * conflict-safe. If Firestore ever retries the trigger, the activity write
 * would produce a duplicate row — an accepted V1 cost since the Activity
 * feed is not counted for badges by unique-actor (V1.1 can dedupe).
 */

const REGION = 'europe-west1';

/**
 * onCreate — new follower edge written.
 *
 * Increments both counters + writes an Activity row on the followed user's
 * side. We fetch the follower's user doc for the denormalised `actorUsername`
 * so the Activity list can render without a join.
 */
export const onFollowerCreated = onDocumentCreated(
  {
    document: 'users/{uid}/followers/{followerUid}',
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (event) => {
    const { uid, followerUid } = event.params;
    if (!uid || !followerUid) return;
    if (uid === followerUid) {
      // Defensive: rules should have blocked this, but if a self-follow ever
      // lands we don't want to run any of the below.
      console.warn('[onFollowerCreated] ignoring self-follow', { uid });
      return;
    }

    const firestore = getFirestore();

    // 1. Increment counts on both users.
    const followedRef = firestore.doc(`users/${uid}`);
    const followerRef = firestore.doc(`users/${followerUid}`);
    const countsBatch = firestore.batch();
    countsBatch.set(
      followedRef,
      { followersCount: FieldValue.increment(1) },
      { merge: true },
    );
    countsBatch.set(
      followerRef,
      { followingCount: FieldValue.increment(1) },
      { merge: true },
    );

    // 2. Fetch the follower's username for the Activity payload. Denormalising
    //    lets the Activity row render without a second read at display time.
    let actorUsername: string | null = null;
    try {
      const followerSnap = await followerRef.get();
      if (followerSnap.exists) {
        actorUsername = (followerSnap.data()?.username as string | undefined) ?? null;
      }
    } catch (err) {
      console.warn('[onFollowerCreated] follower profile read failed', { followerUid, err });
    }

    // 3. Activity row on the followed user's feed. Written via the same
    //    fan-out batch to keep the trigger a single commit point.
    const activityRef = firestore.collection(`users/${uid}/activity`).doc();
    countsBatch.set(activityRef, {
      type: 'follow',
      actorUid: followerUid,
      actorUsername,
      createdAt: FieldValue.serverTimestamp(),
      read: false,
    });

    await countsBatch.commit();
  },
);

/**
 * onDelete — follower edge removed (either the follower unfollowed, or the
 * owner removed the follower, or the block cascade nuked it).
 *
 * Only decrement — no activity row on unfollow (matches the acceptance
 * criteria on #12: "pas d'activity sur unfollow"). We floor implicitly by
 * relying on FieldValue.increment(-1) — Firestore doesn't auto-clamp, so a
 * legitimate over-decrement (e.g. cascade races the recount) would surface
 * as a negative counter. V1 acceptable since the count is a UX niceness, not
 * an integrity invariant.
 */
export const onFollowerDeleted = onDocumentDeleted(
  {
    document: 'users/{uid}/followers/{followerUid}',
    region: REGION,
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (event) => {
    const { uid, followerUid } = event.params;
    if (!uid || !followerUid) return;

    const firestore = getFirestore();
    const batch = firestore.batch();
    batch.set(
      firestore.doc(`users/${uid}`),
      { followersCount: FieldValue.increment(-1) },
      { merge: true },
    );
    batch.set(
      firestore.doc(`users/${followerUid}`),
      { followingCount: FieldValue.increment(-1) },
      { merge: true },
    );
    await batch.commit();
  },
);
