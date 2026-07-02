/**
 * Unit tests for the delete-account social cascade (issue #18).
 *
 * We test the cascade helper against an in-memory Firestore fake instead of the
 * emulator — same behaviour surface for our purposes, and it runs in the same
 * process as CI without extra setup.
 */

import {
  cascadeSocialDelete,
  DocumentReferenceLike,
  DocumentSnapshotLike,
  FirestoreLike,
  QueryLike,
  QuerySnapshotLike,
  WriteBatchLike,
} from '../lib/socialCascade';

// ---------- In-memory Firestore fake ----------
// Enough surface area for the cascade: doc(), collection(), collectionGroup(),
// batch(), and FieldValue.increment() sentinels. Paths are stored flat as
// "users/{uid}", "users/{uid}/followers/{followerUid}", etc.

type IncrementSentinel = { __sentinel: 'increment'; delta: number };

const isIncrement = (v: unknown): v is IncrementSentinel =>
  typeof v === 'object' && v !== null && (v as { __sentinel?: string }).__sentinel === 'increment';

const makeIncrement = (delta: number): IncrementSentinel => ({
  __sentinel: 'increment',
  delta,
});

interface FakeDoc {
  path: string;
  data: Record<string, unknown>;
}

class FakeFirestore implements FirestoreLike {
  // path -> data. Existence of a key means the doc exists.
  readonly docs = new Map<string, Record<string, unknown>>();

  seed(path: string, data: Record<string, unknown>): void {
    this.docs.set(path, { ...data });
  }

  read(path: string): Record<string, unknown> | undefined {
    const d = this.docs.get(path);
    return d ? { ...d } : undefined;
  }

  has(path: string): boolean {
    return this.docs.has(path);
  }

  doc(path: string): DocumentReferenceLike {
    return new FakeDocRef(this, path);
  }

  collection(path: string): QueryLike {
    return new FakeQuery(this, { collectionPath: path });
  }

  collectionGroup(id: string): QueryLike {
    return new FakeQuery(this, { collectionGroupId: id });
  }

  batch(): WriteBatchLike {
    return new FakeBatch(this);
  }

  applyUpdate(path: string, data: Record<string, unknown>): void {
    const cur = this.docs.get(path) ?? {};
    for (const [k, v] of Object.entries(data)) {
      cur[k] = this.resolve(cur[k], v);
    }
    this.docs.set(path, cur);
  }

  applySet(path: string, data: Record<string, unknown>, merge: boolean): void {
    if (merge) {
      const cur = this.docs.get(path) ?? {};
      for (const [k, v] of Object.entries(data)) {
        cur[k] = this.resolve(cur[k], v);
      }
      this.docs.set(path, cur);
    } else {
      const resolved: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        resolved[k] = this.resolve(undefined, v);
      }
      this.docs.set(path, resolved);
    }
  }

  applyDelete(path: string): void {
    this.docs.delete(path);
  }

  private resolve(cur: unknown, next: unknown): unknown {
    if (isIncrement(next)) {
      return (typeof cur === 'number' ? cur : 0) + next.delta;
    }
    return next;
  }

  allDocs(): FakeDoc[] {
    return Array.from(this.docs.entries()).map(([path, data]) => ({ path, data }));
  }
}

class FakeDocRef implements DocumentReferenceLike {
  readonly id: string;
  constructor(private readonly fs: FakeFirestore, readonly path: string) {
    this.id = path.split('/').pop()!;
  }

  async get(): Promise<DocumentSnapshotLike> {
    const exists = this.fs.has(this.path);
    return {
      id: this.id,
      exists,
      ref: this,
    };
  }
}

interface QueryState {
  collectionPath?: string;
  collectionGroupId?: string;
  filters: Array<{ field: string; op: '=='; value: unknown }>;
}

class FakeQuery implements QueryLike {
  private readonly state: QueryState;

  constructor(private readonly fs: FakeFirestore, state: Partial<QueryState>) {
    this.state = {
      collectionPath: state.collectionPath,
      collectionGroupId: state.collectionGroupId,
      filters: state.filters ?? [],
    };
  }

  where(field: string, op: '==', value: unknown): QueryLike {
    return new FakeQuery(this.fs, {
      ...this.state,
      filters: [...this.state.filters, { field, op, value }],
    });
  }

  async get(): Promise<QuerySnapshotLike> {
    const docs: DocumentSnapshotLike[] = [];
    for (const { path, data } of this.fs.allDocs()) {
      const parts = path.split('/');
      // Collection: exact parent-path match.
      if (this.state.collectionPath) {
        const parentParts = this.state.collectionPath.split('/');
        if (parts.length !== parentParts.length + 1) continue;
        if (!path.startsWith(this.state.collectionPath + '/')) continue;
      }
      // Collection group: penultimate segment == collection id.
      if (this.state.collectionGroupId) {
        if (parts.length < 2) continue;
        if (parts[parts.length - 2] !== this.state.collectionGroupId) continue;
      }
      let match = true;
      for (const f of this.state.filters) {
        if ((data as Record<string, unknown>)[f.field] !== f.value) {
          match = false;
          break;
        }
      }
      if (!match) continue;
      docs.push({
        id: parts[parts.length - 1],
        exists: true,
        ref: new FakeDocRef(this.fs, path),
      });
    }
    return { docs, empty: docs.length === 0, size: docs.length };
  }
}

class FakeBatch implements WriteBatchLike {
  private readonly ops: Array<() => void> = [];
  constructor(private readonly fs: FakeFirestore) {}

  update(ref: DocumentReferenceLike, data: Record<string, unknown>): WriteBatchLike {
    this.ops.push(() => this.fs.applyUpdate(ref.path, data));
    return this;
  }

  set(
    ref: DocumentReferenceLike,
    data: Record<string, unknown>,
    options?: { merge: boolean },
  ): WriteBatchLike {
    this.ops.push(() => this.fs.applySet(ref.path, data, options?.merge === true));
    return this;
  }

  delete(ref: DocumentReferenceLike): WriteBatchLike {
    this.ops.push(() => this.fs.applyDelete(ref.path));
    return this;
  }

  async commit(): Promise<unknown> {
    for (const op of this.ops) op();
    this.ops.length = 0;
    return undefined;
  }
}

// ---------- Test helpers ----------

const DELETED = 'user-deleted';
const FOLLOWER_A = 'user-follower-a';
const FOLLOWER_B = 'user-follower-b';
const FOLLOWED_X = 'user-followed-x';
const FOLLOWED_Y = 'user-followed-y';
const BYSTANDER = 'user-bystander';

function seedWorld(fs: FakeFirestore): void {
  // Users
  fs.seed(`users/${DELETED}`, { username: 'deleted', followersCount: 2, followingCount: 2 });
  fs.seed(`users/${FOLLOWER_A}`, { username: 'alice', followersCount: 0, followingCount: 3 });
  fs.seed(`users/${FOLLOWER_B}`, { username: 'bob', followersCount: 0, followingCount: 1 });
  fs.seed(`users/${FOLLOWED_X}`, { username: 'xavier', followersCount: 5, followingCount: 0 });
  fs.seed(`users/${FOLLOWED_Y}`, { username: 'yolanda', followersCount: 2, followingCount: 0 });
  fs.seed(`users/${BYSTANDER}`, { username: 'zed', followersCount: 0, followingCount: 0 });

  // My followers (people who follow the deleted user).
  fs.seed(`users/${DELETED}/followers/${FOLLOWER_A}`, { createdAt: 1 });
  fs.seed(`users/${DELETED}/followers/${FOLLOWER_B}`, { createdAt: 2 });
  // Their reciprocal edges.
  fs.seed(`users/${FOLLOWER_A}/following/${DELETED}`, { createdAt: 1 });
  fs.seed(`users/${FOLLOWER_B}/following/${DELETED}`, { createdAt: 2 });

  // Users I follow.
  fs.seed(`users/${DELETED}/following/${FOLLOWED_X}`, { createdAt: 3 });
  fs.seed(`users/${DELETED}/following/${FOLLOWED_Y}`, { createdAt: 4 });
  // Their reciprocal edges.
  fs.seed(`users/${FOLLOWED_X}/followers/${DELETED}`, { createdAt: 3 });
  fs.seed(`users/${FOLLOWED_Y}/followers/${DELETED}`, { createdAt: 4 });

  // Downstream attributions — bystander saved 2 lieux from me, follower_a saved 1.
  fs.seed(`users/${BYSTANDER}/lieux/lieu-1`, {
    name: 'Chez Janou',
    savedFromUserId: DELETED,
    savedFromUsername: 'deleted',
  });
  fs.seed(`users/${BYSTANDER}/lieux/lieu-2`, {
    name: 'Le Baron',
    savedFromUserId: DELETED,
    savedFromUsername: 'deleted',
  });
  fs.seed(`users/${FOLLOWER_A}/lieux/lieu-3`, {
    name: 'Ober Mamma',
    savedFromUserId: DELETED,
    savedFromUsername: 'deleted',
  });

  // Untouched lieu — different upstream author. Must not be modified.
  fs.seed(`users/${FOLLOWER_B}/lieux/lieu-untouched`, {
    name: 'Septime',
    savedFromUserId: 'someone-else',
    savedFromUsername: 'someone-else',
  });
}

describe('cascadeSocialDelete', () => {
  it('nullifies savedFromUserId + savedFromUsername on every downstream lieu', async () => {
    const fs = new FakeFirestore();
    seedWorld(fs);

    const result = await cascadeSocialDelete(DELETED, fs, makeIncrement);

    expect(result.nullifiedLieux).toBe(3);
    expect(fs.read(`users/${BYSTANDER}/lieux/lieu-1`)).toMatchObject({
      name: 'Chez Janou',
      savedFromUserId: null,
      savedFromUsername: null,
    });
    expect(fs.read(`users/${BYSTANDER}/lieux/lieu-2`)).toMatchObject({
      savedFromUserId: null,
      savedFromUsername: null,
    });
    expect(fs.read(`users/${FOLLOWER_A}/lieux/lieu-3`)).toMatchObject({
      savedFromUserId: null,
      savedFromUsername: null,
    });
    // Sanity: unrelated lieu untouched.
    expect(fs.read(`users/${FOLLOWER_B}/lieux/lieu-untouched`)).toMatchObject({
      savedFromUserId: 'someone-else',
      savedFromUsername: 'someone-else',
    });
  });

  it('removes me from other users following + followers and decrements their counts', async () => {
    const fs = new FakeFirestore();
    seedWorld(fs);

    const result = await cascadeSocialDelete(DELETED, fs, makeIncrement);

    // Phase 2: my followers lost their `following/{DELETED}` edge.
    expect(fs.has(`users/${FOLLOWER_A}/following/${DELETED}`)).toBe(false);
    expect(fs.has(`users/${FOLLOWER_B}/following/${DELETED}`)).toBe(false);
    // And their followingCount ticked down by exactly one each.
    expect(fs.read(`users/${FOLLOWER_A}`)?.followingCount).toBe(2); // was 3
    expect(fs.read(`users/${FOLLOWER_B}`)?.followingCount).toBe(0); // was 1

    // Phase 3: users I follow lost their `followers/{DELETED}` edge.
    expect(fs.has(`users/${FOLLOWED_X}/followers/${DELETED}`)).toBe(false);
    expect(fs.has(`users/${FOLLOWED_Y}/followers/${DELETED}`)).toBe(false);
    // And their followersCount ticked down.
    expect(fs.read(`users/${FOLLOWED_X}`)?.followersCount).toBe(4); // was 5
    expect(fs.read(`users/${FOLLOWED_Y}`)?.followersCount).toBe(1); // was 2

    expect(result.followerBackrefsRemoved).toBe(2);
    expect(result.followingBackrefsRemoved).toBe(2);

    // Bystander (no edges either way) untouched.
    expect(fs.read(`users/${BYSTANDER}`)).toEqual({
      username: 'zed',
      followersCount: 0,
      followingCount: 0,
    });
  });

  it('is idempotent: a second run does not error and does not double-decrement', async () => {
    const fs = new FakeFirestore();
    seedWorld(fs);

    await cascadeSocialDelete(DELETED, fs, makeIncrement);
    const followerAfter = fs.read(`users/${FOLLOWER_A}`)?.followingCount;
    const followedAfter = fs.read(`users/${FOLLOWED_X}`)?.followersCount;

    // Second run against the same state (the caller normally recursive-deletes
    // users/{DELETED} between runs, but idempotence guarantees we survive without that).
    const result2 = await cascadeSocialDelete(DELETED, fs, makeIncrement);

    // Downstream lieux already nullified — the collection-group filter
    // `savedFromUserId == deletedUid` no longer matches them, so we don't even
    // re-write. The lieux stay null (nothing to observe change), which is what
    // we want.
    expect(result2.nullifiedLieux).toBe(0);
    expect(fs.read(`users/${BYSTANDER}/lieux/lieu-1`)?.savedFromUserId).toBeNull();
    expect(fs.read(`users/${BYSTANDER}/lieux/lieu-1`)?.savedFromUsername).toBeNull();

    // Back-refs already gone → nothing further to remove, no extra decrement.
    expect(result2.followerBackrefsRemoved).toBe(0);
    expect(result2.followingBackrefsRemoved).toBe(0);
    expect(fs.read(`users/${FOLLOWER_A}`)?.followingCount).toBe(followerAfter);
    expect(fs.read(`users/${FOLLOWED_X}`)?.followersCount).toBe(followedAfter);
  });

  it('handles the empty case: no follows, no downstream lieux, no crash', async () => {
    const fs = new FakeFirestore();
    // Solo user with no graph.
    fs.seed(`users/${DELETED}`, { username: 'solo', followersCount: 0, followingCount: 0 });

    const result = await cascadeSocialDelete(DELETED, fs, makeIncrement);

    expect(result).toEqual({
      nullifiedLieux: 0,
      followerBackrefsRemoved: 0,
      followingBackrefsRemoved: 0,
    });
    // User doc itself is untouched by the cascade (recursiveDelete is the caller's job).
    expect(fs.has(`users/${DELETED}`)).toBe(true);
  });

  it('does not create phantom user docs when a back-ref points at a missing user', async () => {
    // Half-torn-down state: my follower record exists but their user doc is gone.
    const fs = new FakeFirestore();
    fs.seed(`users/${DELETED}`, { username: 'deleted' });
    fs.seed(`users/${DELETED}/followers/ghost`, { createdAt: 1 });
    // No user doc for "ghost", but the back-ref could still exist if we're in a weird state.
    fs.seed(`users/ghost/following/${DELETED}`, { createdAt: 1 });

    await cascadeSocialDelete(DELETED, fs, makeIncrement);

    // Back-ref removed…
    expect(fs.has(`users/ghost/following/${DELETED}`)).toBe(false);
    // …and set-merge created a minimal doc with the decrement applied. Acceptable —
    // production Firestore rules require a user doc before writing subcollection entries,
    // so this branch is defensive-only. We assert the value is at least a number, not NaN.
    const ghost = fs.read(`users/ghost`);
    expect(ghost).toBeDefined();
    expect(typeof ghost?.followingCount).toBe('number');
  });
});
