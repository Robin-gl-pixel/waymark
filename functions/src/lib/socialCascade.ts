/**
 * Delete-account social cascade (issue #18).
 *
 * When a user is deleted, we must clean up the graph state they leave behind:
 *  1. Nullify `savedFromUserId` / `savedFromUsername` on every downstream lieu (any user)
 *     that was saved-from us. The pin stays; the "via @deleted" attribution disappears.
 *  2. Remove me from every follower's `following/{myUid}` and decrement their followingCount.
 *  3. Remove me from every followed user's `followers/{myUid}` and decrement their followersCount.
 *
 * The caller is responsible for the recursive delete of my OWN sub-collections after this
 * function returns — phases 2 and 3 need to walk `users/{me}/followers` and
 * `users/{me}/following` first.
 *
 * Compliance drivers: RGPD (right to be forgotten) + Apple App Review Guideline 5.1.1(v)
 * (account-deletion must sever downstream references, not just the auth record).
 *
 * Idempotency:
 *  - Phase 1 re-writes null over null — Firestore treats this as a no-op.
 *  - Phases 2/3 probe `.exists` on the back-ref before deleting + decrementing, so a partial
 *    re-run does not double-decrement counters.
 *
 * Known V1 limitation (documented for future work):
 *  - Stale entries in OTHER users' `blocks/{deletedUid}` are NOT cleaned up. Firestore
 *    collection-group queries key by document ID (they cannot filter *by* doc ID across a
 *    group), and there is no reverse index of who has blocked me. A full users-collection
 *    scan is O(N) and unacceptable at scale. Rules-side we treat a block of a non-existent
 *    account as harmless. V2 could add a `blockedBy/{uid}` reverse index if this becomes
 *    a real problem.
 */

// Minimal structural types over the firebase-admin/firestore surface we actually use.
// Keeps this module unit-testable without pulling firebase-admin into jest's module graph.

export type FieldValueSentinel = unknown;

export interface DocumentReferenceLike {
  readonly id: string;
  readonly path: string;
  get(): Promise<DocumentSnapshotLike>;
}

export interface DocumentSnapshotLike {
  readonly id: string;
  readonly exists: boolean;
  readonly ref: DocumentReferenceLike;
}

export interface QueryLike {
  where(field: string, op: '==', value: unknown): QueryLike;
  get(): Promise<QuerySnapshotLike>;
}

export interface QuerySnapshotLike {
  readonly docs: readonly DocumentSnapshotLike[];
  readonly empty: boolean;
  readonly size: number;
}

export interface WriteBatchLike {
  update(ref: DocumentReferenceLike, data: Record<string, unknown>): WriteBatchLike;
  set(
    ref: DocumentReferenceLike,
    data: Record<string, unknown>,
    options?: { merge: boolean },
  ): WriteBatchLike;
  delete(ref: DocumentReferenceLike): WriteBatchLike;
  commit(): Promise<unknown>;
}

export interface FirestoreLike {
  batch(): WriteBatchLike;
  doc(path: string): DocumentReferenceLike;
  collection(path: string): QueryLike;
  collectionGroup(id: string): QueryLike;
}

export interface CascadeResult {
  nullifiedLieux: number;
  followerBackrefsRemoved: number;
  followingBackrefsRemoved: number;
}

/** Firestore batches cap at 500 writes; leave headroom for parallel `set`s in the same commit. */
const BATCH_MAX = 400;

export async function cascadeSocialDelete(
  uid: string,
  firestore: FirestoreLike,
  increment: (n: number) => FieldValueSentinel,
): Promise<CascadeResult> {
  const result: CascadeResult = {
    nullifiedLieux: 0,
    followerBackrefsRemoved: 0,
    followingBackrefsRemoved: 0,
  };

  // ---------- Phase 1: nullify downstream attributions ----------
  // Collection-group query hits every `lieux` subcollection under every user.
  const attributedLieux = await firestore
    .collectionGroup('lieux')
    .where('savedFromUserId', '==', uid)
    .get();

  {
    let batch = firestore.batch();
    let ops = 0;
    for (const doc of attributedLieux.docs) {
      batch.update(doc.ref, {
        savedFromUserId: null,
        savedFromUsername: null,
      });
      ops++;
      result.nullifiedLieux++;
      if (ops >= BATCH_MAX) {
        await batch.commit();
        batch = firestore.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  }

  // ---------- Phase 2: remove me from each of my followers' `following` ----------
  const followersSnap = await firestore.collection(`users/${uid}/followers`).get();
  {
    let batch = firestore.batch();
    let ops = 0;
    for (const doc of followersSnap.docs) {
      const followerUid = doc.id;
      const followingRef = firestore.doc(`users/${followerUid}/following/${uid}`);
      // Idempotence guard: on a re-run the back-ref is already gone.
      const followingSnap = await followingRef.get();
      if (!followingSnap.exists) continue;

      batch.delete(followingRef);
      // set-merge so we don't fail if the follower doc has been half-torn-down; increment
      // is atomic at commit time.
      batch.set(
        firestore.doc(`users/${followerUid}`),
        { followingCount: increment(-1) },
        { merge: true },
      );
      ops += 2;
      result.followerBackrefsRemoved++;

      if (ops >= BATCH_MAX) {
        await batch.commit();
        batch = firestore.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  }

  // ---------- Phase 3: remove me from each user I follow's `followers` ----------
  const followingSnap = await firestore.collection(`users/${uid}/following`).get();
  {
    let batch = firestore.batch();
    let ops = 0;
    for (const doc of followingSnap.docs) {
      const followedUid = doc.id;
      const followerRef = firestore.doc(`users/${followedUid}/followers/${uid}`);
      const followerSnap = await followerRef.get();
      if (!followerSnap.exists) continue;

      batch.delete(followerRef);
      batch.set(
        firestore.doc(`users/${followedUid}`),
        { followersCount: increment(-1) },
        { merge: true },
      );
      ops += 2;
      result.followingBackrefsRemoved++;

      if (ops >= BATCH_MAX) {
        await batch.commit();
        batch = firestore.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  }

  return result;
}
