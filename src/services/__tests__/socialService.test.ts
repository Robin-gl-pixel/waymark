import { InMemorySocialService } from '../inMemorySocialService';
import { RESERVED_USERNAMES } from '../firebaseSocialService';

const ME = 'uid-me';
const OTHER = 'uid-other';

function makeSvc(): InMemorySocialService {
  const svc = new InMemorySocialService();
  svc.setCurrentUid(ME);
  return svc;
}

describe('SocialService seam contract (profile foundation, InMemorySocialService)', () => {
  describe('upsertProfile', () => {
    it('throws when the caller is not signed in', async () => {
      const svc = new InMemorySocialService();
      svc.setCurrentUid(null);
      await expect(svc.upsertProfile({ username: 'alice' })).rejects.toThrow(/signed in/i);
    });

    it('rejects usernames that do not match the regex', async () => {
      const svc = makeSvc();
      await expect(svc.upsertProfile({ username: 'no' })).rejects.toThrow(/invalid/i);
      await expect(svc.upsertProfile({ username: 'has space' })).rejects.toThrow(/invalid/i);
      await expect(svc.upsertProfile({ username: 'a'.repeat(21) })).rejects.toThrow(/invalid/i);
      await expect(svc.upsertProfile({ username: 'bad-char' })).rejects.toThrow(/invalid/i);
      await expect(svc.upsertProfile({ username: 'crème' })).rejects.toThrow(/invalid/i);
    });

    it('accepts usernames of legal shape', async () => {
      const svc = makeSvc();
      await expect(svc.upsertProfile({ username: 'abc' })).resolves.toBeTruthy();
      const svc2 = makeSvc();
      await expect(svc2.upsertProfile({ username: 'alice.99_ok' })).resolves.toBeTruthy();
    });

    it('rejects a reserved username', async () => {
      const svc = makeSvc();
      const reserved = Array.from(RESERVED_USERNAMES)[0];
      await expect(svc.upsertProfile({ username: reserved })).rejects.toThrow(/reserved/i);
      await expect(svc.upsertProfile({ username: 'waymark' })).rejects.toThrow(/reserved/i);
      await expect(svc.upsertProfile({ username: 'admin' })).rejects.toThrow(/reserved/i);
    });

    it('rejects a username already owned by someone else', async () => {
      const svc = makeSvc();
      svc.setCurrentUid(OTHER);
      await svc.upsertProfile({ username: 'taken' });

      svc.setCurrentUid(ME);
      await expect(svc.upsertProfile({ username: 'taken' })).rejects.toThrow(/taken/i);
    });

    it('creates a new profile with the social defaults', async () => {
      const svc = makeSvc();
      const created = await svc.upsertProfile({ username: 'newuser' });

      expect(created.uid).toBe(ME);
      expect(created.username).toBe('newuser');
      expect(created.isPublic).toBe(true);
      expect(created.isCurated).toBe(false);
      expect(created.followersCount).toBe(0);
      expect(created.followingCount).toBe(0);
      expect(created.createdAt).toBeDefined();
      expect(created.updatedAt).toBeDefined();
    });

    it('lower-cases the stored username', async () => {
      const svc = makeSvc();
      const created = await svc.upsertProfile({ username: 'MixedCase' });
      expect(created.username).toBe('mixedcase');
    });
  });

  /**
   * Slice #16 contract tests — privacy toggle. The InMemory impl pins the
   * shape: a user's `isPublic` flips in place, `updatedAt` refreshes, and the
   * caller must be signed in. The Firebase impl mirrors this via
   * `updateDoc(users/{uid}, { isPublic, updatedAt })`; if either side of the
   * contract drifts, these tests catch it.
   */
  describe('setProfileVisibility', () => {
    it('sets isPublic to false and re-enables it to true', async () => {
      const svc = makeSvc();
      await svc.upsertProfile({ username: 'alice' });
      // Default from upsertProfile is public.
      expect((await svc.getMyProfile())?.isPublic).toBe(true);

      await svc.setProfileVisibility(false);
      expect((await svc.getMyProfile())?.isPublic).toBe(false);

      await svc.setProfileVisibility(true);
      expect((await svc.getMyProfile())?.isPublic).toBe(true);
    });

    it('makes a private user invisible in searchUsers', async () => {
      const svc = makeSvc();
      // Alice is a separate user, initially discoverable.
      svc.setCurrentUid('uid-alice-priv');
      await svc.upsertProfile({ username: 'alicepriv' });

      // From ME's perspective, we should find her.
      svc.setCurrentUid(ME);
      expect((await svc.searchUsers('alicepriv')).map((u) => u.uid)).toEqual(['uid-alice-priv']);

      // Alice goes private.
      svc.setCurrentUid('uid-alice-priv');
      await svc.setProfileVisibility(false);

      // She's no longer surfaced in search.
      svc.setCurrentUid(ME);
      expect(await svc.searchUsers('alicepriv')).toEqual([]);
    });

    it('throws when not signed in', async () => {
      const svc = new InMemorySocialService();
      svc.setCurrentUid(null);
      await expect(svc.setProfileVisibility(false)).rejects.toThrow(/signed in/i);
    });
  });

  describe('getUserByUsername', () => {
    it('returns null for an unknown username', async () => {
      const svc = makeSvc();
      const found = await svc.getUserByUsername('nobody');
      expect(found).toBeNull();
    });

    it('returns the profile for a known username', async () => {
      const svc = makeSvc();
      await svc.upsertProfile({ username: 'alice' });

      const found = await svc.getUserByUsername('alice');
      expect(found).not.toBeNull();
      expect(found!.uid).toBe(ME);
      expect(found!.username).toBe('alice');
    });

    it('is case-insensitive on lookup', async () => {
      const svc = makeSvc();
      await svc.upsertProfile({ username: 'bob' });

      const found = await svc.getUserByUsername('BOB');
      expect(found?.username).toBe('bob');
    });

    // Slice #11 — the acceptance criteria pin "returns null for unknown" as an
    // explicit contract test even though the branch above already covers it.
    // Kept as a top-level spec so failures point clearly at #11's promise.
    it('returns null for an unknown username (slice #11)', async () => {
      const svc = makeSvc();
      await svc.upsertProfile({ username: 'somebody' });
      expect(await svc.getUserByUsername('nobody')).toBeNull();
    });
  });

  describe('getMyProfile', () => {
    it('returns null when not signed in', async () => {
      const svc = new InMemorySocialService();
      svc.setCurrentUid(null);
      const me = await svc.getMyProfile();
      expect(me).toBeNull();
    });

    it('returns null when signed in but no profile exists yet', async () => {
      const svc = makeSvc();
      const me = await svc.getMyProfile();
      expect(me).toBeNull();
    });

    it('returns the profile once upsertProfile has run', async () => {
      const svc = makeSvc();
      await svc.upsertProfile({ username: 'me.here' });
      const me = await svc.getMyProfile();
      expect(me?.uid).toBe(ME);
      expect(me?.username).toBe('me.here');
    });
  });

  describe('getUserByUid', () => {
    it('returns null for an unknown uid', async () => {
      const svc = makeSvc();
      const found = await svc.getUserByUid('does-not-exist');
      expect(found).toBeNull();
    });

    it('returns the profile for a known uid', async () => {
      const svc = makeSvc();
      await svc.upsertProfile({ username: 'me.here' });
      const found = await svc.getUserByUid(ME);
      expect(found?.username).toBe('me.here');
    });
  });
});

// --- #15 block + report tests below ---
// `firebaseSocialService` now imports `firebase/auth` (via ../auth/firebase) at
// module load, and the app's firebase.ts references a symbol
// (`getReactNativePersistence`) that ts-jest can't resolve in Node. Mock the
// module so this seam test doesn't need a live Firebase env.
jest.mock('../../auth/firebase', () => ({ auth: {}, db: {}, storage: {} }));

import {
  REPORT_FREETEXT_MAX_LENGTH,
  validateReportInput,
} from '../firebaseSocialService';
import type { UserProfile } from '../../types/User';

/**
 * Slice #15 contract tests — block/unblock/getBlocked/report against the
 * in-memory implementation. Validation logic (`validateReportInput`) is a pure
 * function so we assert it directly rather than double-testing through the
 * Firebase impl.
 */

const ME_BR = 'uid-me-br';
const ALICE = 'uid-alice';
const BOB = 'uid-bob';

function seed(svc: InMemorySocialService, uid: string, username: string): UserProfile {
  return svc.seedUser({
    uid,
    username,
    displayName: null,
    email: null,
    isPublic: true,
    isCurated: false,
    followersCount: 0,
    followingCount: 0,
    avatarUrl: null,
    bio: null,
    usernameChangedAt: null,
  });
}

describe('SocialService seam contract — Block (slice #15)', () => {
  let svc: InMemorySocialService;

  beforeEach(() => {
    svc = new InMemorySocialService();
    seed(svc, ME, 'me');
    seed(svc, ALICE, 'alice');
    seed(svc, BOB, 'bob');
    svc.setCurrentUid(ME);
  });

  it('block(uid) creates the block entry (getBlocked lists them)', async () => {
    await svc.block(ALICE);

    const blocked = await svc.getBlocked();
    expect(blocked.map((u) => u.uid)).toEqual([ALICE]);
    expect(await svc.isBlocked(ALICE)).toBe(true);
    expect(await svc.isBlocked(BOB)).toBe(false);
  });

  it('block(uid) removes an existing follow relationship in both directions', async () => {
    // I follow Alice.
    await svc.follow(ALICE);
    // Alice follows me back.
    svc.setCurrentUid(ALICE);
    await svc.follow(ME);
    svc.setCurrentUid(ME);

    expect((await svc.getFollowing(ME)).map((u) => u.uid)).toContain(ALICE);
    expect((await svc.getFollowers(ME)).map((u) => u.uid)).toContain(ALICE);

    await svc.block(ALICE);

    // My follow of Alice is gone.
    expect((await svc.getFollowing(ME)).map((u) => u.uid)).not.toContain(ALICE);
    // Alice's follow of me is gone too (bidirectional forced unfollow).
    expect((await svc.getFollowers(ME)).map((u) => u.uid)).not.toContain(ALICE);
    expect((await svc.getFollowing(ALICE)).map((u) => u.uid)).not.toContain(ME);
  });

  it('block(uid) leaves unrelated follows alone', async () => {
    await svc.follow(ALICE);
    await svc.follow(BOB);

    await svc.block(ALICE);

    expect((await svc.getFollowing(ME)).map((u) => u.uid)).toEqual([BOB]);
  });

  it('unblock(uid) removes the entry but does NOT re-establish follow', async () => {
    await svc.follow(ALICE);
    await svc.block(ALICE);
    expect(await svc.isBlocked(ALICE)).toBe(true);

    await svc.unblock(ALICE);

    expect(await svc.isBlocked(ALICE)).toBe(false);
    expect(await svc.getBlocked()).toEqual([]);
    // Follow relationship was destroyed by block and must not come back.
    expect((await svc.getFollowing(ME)).map((u) => u.uid)).not.toContain(ALICE);
  });

  it('block throws when not signed in', async () => {
    svc.setCurrentUid(null);
    await expect(svc.block(ALICE)).rejects.toThrow(/signed in/i);
  });

  it('unblock throws when not signed in', async () => {
    svc.setCurrentUid(null);
    await expect(svc.unblock(ALICE)).rejects.toThrow(/signed in/i);
  });

  it('block throws when targeting yourself', async () => {
    await expect(svc.block(ME)).rejects.toThrow(/yourself/i);
  });

  it('getBlocked returns [] when not signed in', async () => {
    svc.setCurrentUid(null);
    expect(await svc.getBlocked()).toEqual([]);
  });
});

describe('SocialService seam contract — Report (slice #15)', () => {
  let svc: InMemorySocialService;

  beforeEach(() => {
    svc = new InMemorySocialService();
    seed(svc, ME, 'me');
    seed(svc, ALICE, 'alice');
    svc.setCurrentUid(ME);
  });

  it('report(input) persists the report entry with reporter uid', async () => {
    await svc.report({ targetUid: ALICE, reason: 'spam' });

    const reports = svc.getReportsForTests();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      reporterUid: ME,
      targetUid: ALICE,
      reason: 'spam',
    });
    expect(reports[0].createdAt.toMillis()).toEqual(expect.any(Number));
  });

  it('report(input) preserves optional targetLieuId + freeText', async () => {
    await svc.report({
      targetUid: ALICE,
      targetLieuId: 'lieu-xyz',
      reason: 'faux',
      freeText: 'Lieu inexistant',
    });

    const [r] = svc.getReportsForTests();
    expect(r.targetLieuId).toBe('lieu-xyz');
    expect(r.freeText).toBe('Lieu inexistant');
  });

  it('report throws when not signed in', async () => {
    svc.setCurrentUid(null);
    await expect(svc.report({ targetUid: ALICE, reason: 'spam' })).rejects.toThrow(/signed in/i);
  });
});

describe('validateReportInput — pure validation (slice #15)', () => {
  it('accepts each of the three canonical reasons', () => {
    expect(() => validateReportInput({ targetUid: ALICE, reason: 'spam' })).not.toThrow();
    expect(() => validateReportInput({ targetUid: ALICE, reason: 'offensif' })).not.toThrow();
    expect(() => validateReportInput({ targetUid: ALICE, reason: 'faux' })).not.toThrow();
  });

  it('rejects any other reason string', () => {
    // Bypass the type guard on purpose — the runtime check is what protects the write.
    expect(() =>
      validateReportInput({ targetUid: ALICE, reason: 'other' as never }),
    ).toThrow(/reason/i);
  });

  it('rejects freeText longer than the max length', () => {
    const tooLong = 'a'.repeat(REPORT_FREETEXT_MAX_LENGTH + 1);
    expect(() =>
      validateReportInput({ targetUid: ALICE, reason: 'spam', freeText: tooLong }),
    ).toThrow(/freeText/i);
  });

  it('accepts freeText exactly at the max length', () => {
    const atMax = 'a'.repeat(REPORT_FREETEXT_MAX_LENGTH);
    expect(() =>
      validateReportInput({ targetUid: ALICE, reason: 'spam', freeText: atMax }),
    ).not.toThrow();
  });

  it('accepts omitted freeText', () => {
    expect(() => validateReportInput({ targetUid: ALICE, reason: 'spam' })).not.toThrow();
  });

  it('rejects missing targetUid', () => {
    expect(() =>
      validateReportInput({ targetUid: '', reason: 'spam' }),
    ).toThrow(/targetUid/i);
  });
});

/**
 * Slice #11 contract tests — read profiles + search.
 *
 * The Firebase impl exact-matches on `username` via a Firestore query with
 * `where('username' == q)` + `where('isPublic' == true)`; the InMemory impl
 * mirrors that with its `usernameIndex` + `isPublic` filter. These specs pin
 * the shared contract:
 *   1. exact-match hits by lowercase handle
 *   2. unknown → []
 *   3. self is filtered out
 *   4. private users are filtered out
 *   5. leading `@` is stripped
 *   6. exact-match ≠ prefix — searching "robin" doesn't return "robin.hesse"
 */
describe('SocialService seam contract — Search (slice #11)', () => {
  let svc: InMemorySocialService;

  beforeEach(() => {
    svc = new InMemorySocialService();
    seed(svc, ME, 'me');
    seed(svc, ALICE, 'alice');
    seed(svc, BOB, 'bob');
    svc.setCurrentUid(ME);
  });

  it('searchUsers returns the exact match by username', async () => {
    // Seed the canonical curated handle referenced in the golden path.
    seed(svc, 'uid-wpc', 'waymark.paris.cool');

    const results = await svc.searchUsers('waymark.paris.cool');
    expect(results.map((u) => u.username)).toEqual(['waymark.paris.cool']);
  });

  it('searchUsers returns [] for an unknown username', async () => {
    const results = await svc.searchUsers('unknown');
    expect(results).toEqual([]);
  });

  it('searchUsers excludes my own uid from results', async () => {
    // 'me' is the signed-in uid — a search for my own handle must return [].
    const results = await svc.searchUsers('me');
    expect(results).toEqual([]);
  });

  it('searchUsers excludes private users', async () => {
    // Overwrite Alice with an isPublic:false variant.
    svc.seedUser({
      uid: ALICE,
      username: 'alice',
      displayName: null,
      email: null,
      isPublic: false,
      isCurated: false,
      followersCount: 0,
      followingCount: 0,
      avatarUrl: null,
      bio: null,
      usernameChangedAt: null,
    });

    const results = await svc.searchUsers('alice');
    expect(results).toEqual([]);
  });

  it('searchUsers strips a leading @ from the input', async () => {
    const results = await svc.searchUsers('@alice');
    expect(results.map((u) => u.uid)).toEqual([ALICE]);
  });

  it('searchUsers is case-insensitive on input', async () => {
    const results = await svc.searchUsers('ALICE');
    expect(results.map((u) => u.uid)).toEqual([ALICE]);
  });

  it('searchUsers exact-matches only — a prefix does NOT match', async () => {
    // Golden negative case from the PRD acceptance criteria — searching
    // "robin" must NOT match a user whose handle is "robin.hesse".
    seed(svc, 'uid-robin.hesse', 'robin.hesse');

    const results = await svc.searchUsers('robin');
    expect(results).toEqual([]);
  });
});

/**
 * Slice #12 contract tests — follow + network feed.
 *
 * These pin the exact behaviour the Firebase impl must mirror once the Cloud
 * Function trigger has run (counts denormalisation) or when the trigger is
 * skipped in the in-memory harness. The InMemorySocialService replays both
 * writes + count deltas synchronously inside `follow()` / `unfollow()` — that
 * matches what the Firebase impl's client sees after the trigger settles.
 */

// Common lieu builder for the feed tests. Timestamps are monotonic so we can
// assert the merged feed sorts strictly descending.
import type { Lieu } from '../../types/Lieu';
import type { Timestamp } from '../../types/Lieu';

function ts(ms: number): Timestamp {
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1_000_000,
    toDate: () => new Date(ms),
    toMillis: () => ms,
  };
}

function makeLieu(ownerUid: string, id: string, createdAtMs: number, overrides: Partial<Lieu> = {}): Lieu {
  return {
    id,
    userId: ownerUid,
    name: `Lieu ${id}`,
    nameNormalized: `lieu ${id}`,
    city: 'Paris',
    country: 'France',
    address: '1 rue test',
    lat: 48.85,
    lng: 2.35,
    category: 'resto',
    description: null,
    // New photos[] schema (parent PRD #34 / slice #35). `screenshotStoragePath`
    // is omitted here — this fixture represents a post-migration doc.
    sourceInstagram: { author: null },
    photos: [
      {
        storagePath: `users/${ownerUid}/photos/${id}/hero.jpg`,
        source: 'insta',
        addedAt: ts(createdAtMs),
      },
    ],
    userNotes: null,
    // #41 — Lieu requires an explicit status field. Default the fixture to
    // `null` (unclassified) so pre-#41 test cases don't accidentally exercise
    // wishlist-specific behaviour; individual tests can override via `overrides`.
    status: null,
    createdAt: ts(createdAtMs),
    updatedAt: ts(createdAtMs),
    ...overrides,
  };
}

const CHARLIE = 'uid-charlie';
const DIANA = 'uid-diana';

describe('SocialService seam contract — Follow (slice #12)', () => {
  let svc: InMemorySocialService;

  beforeEach(() => {
    svc = new InMemorySocialService();
    seed(svc, ME, 'me');
    seed(svc, ALICE, 'alice');
    seed(svc, BOB, 'bob');
    svc.setCurrentUid(ME);
  });

  it('follow(uid) creates an entry on both sides of the graph', async () => {
    await svc.follow(ALICE);

    expect((await svc.getFollowing(ME)).map((u) => u.uid)).toEqual([ALICE]);
    expect((await svc.getFollowers(ALICE)).map((u) => u.uid)).toEqual([ME]);
  });

  it('follow(uid) increments followingCount on me + followersCount on the target', async () => {
    await svc.follow(ALICE);

    const me = await svc.getUserByUid(ME);
    const alice = await svc.getUserByUid(ALICE);
    expect(me?.followingCount).toBe(1);
    expect(alice?.followersCount).toBe(1);
  });

  it('unfollow(uid) removes both entries + decrements the counts', async () => {
    await svc.follow(ALICE);
    await svc.unfollow(ALICE);

    expect((await svc.getFollowing(ME)).map((u) => u.uid)).toEqual([]);
    expect((await svc.getFollowers(ALICE)).map((u) => u.uid)).toEqual([]);

    const me = await svc.getUserByUid(ME);
    const alice = await svc.getUserByUid(ALICE);
    expect(me?.followingCount).toBe(0);
    expect(alice?.followersCount).toBe(0);
  });

  it('unfollow(uid) of a user I do not follow is a no-op (no negative counts)', async () => {
    await svc.unfollow(ALICE);

    const me = await svc.getUserByUid(ME);
    const alice = await svc.getUserByUid(ALICE);
    expect(me?.followingCount).toBe(0);
    expect(alice?.followersCount).toBe(0);
    expect((await svc.getFollowing(ME))).toEqual([]);
  });

  it('follow(self) throws', async () => {
    await expect(svc.follow(ME)).rejects.toThrow(/yourself/i);
  });

  it('follow throws when not signed in', async () => {
    svc.setCurrentUid(null);
    await expect(svc.follow(ALICE)).rejects.toThrow(/signed in/i);
  });

  it('isFollowing reflects the live state', async () => {
    expect(await svc.isFollowing(ALICE)).toBe(false);

    await svc.follow(ALICE);
    expect(await svc.isFollowing(ALICE)).toBe(true);

    await svc.unfollow(ALICE);
    expect(await svc.isFollowing(ALICE)).toBe(false);
  });

  it('isFollowing returns false when not signed in', async () => {
    svc.setCurrentUid(null);
    expect(await svc.isFollowing(ALICE)).toBe(false);
  });
});

/**
 * Slice #14 contract tests — activity feed + badges.
 *
 * The Cloud Function triggers write activity rows on follow (see
 * `functions/src/followTriggers.ts`) and on re-save (see
 * `functions/src/saveAttribution.ts`). The InMemory harness replays only the
 * follow-side write inline (mirrors #12); for the save-side + count/read
 * mechanics we drive the API directly here.
 */
describe('SocialService seam contract — Activity (slice #14)', () => {
  let svc: InMemorySocialService;

  beforeEach(() => {
    svc = new InMemorySocialService();
    seed(svc, ME, 'me');
    seed(svc, ALICE, 'alice');
    seed(svc, BOB, 'bob');
    svc.setCurrentUid(ME);
  });

  it('getActivity returns items sorted desc by createdAt', async () => {
    // Alice follows me (writes an activity row on my feed).
    svc.setCurrentUid(ALICE);
    await svc.follow(ME);
    // Then Bob follows me — should sit ABOVE Alice's row (more recent).
    svc.setCurrentUid(BOB);
    await svc.follow(ME);

    svc.setCurrentUid(ME);
    const page = await svc.getActivity();

    expect(page.items.map((a) => a.actorUsername)).toEqual(['bob', 'alice']);
    // desc by createdAt millis — strictly monotonic.
    expect(page.items[0].createdAt.toMillis()).toBeGreaterThan(
      page.items[1].createdAt.toMillis(),
    );
  });

  it('getActivity returns an empty page when no activity + when not signed in', async () => {
    // No activity yet.
    const emptyPage = await svc.getActivity();
    expect(emptyPage.items).toEqual([]);
    expect(emptyPage.cursor).toBeNull();

    // Signed out.
    svc.setCurrentUid(null);
    const signedOut = await svc.getActivity();
    expect(signedOut.items).toEqual([]);
    expect(signedOut.cursor).toBeNull();
  });

  it('newly-written activity rows start unread', async () => {
    svc.setCurrentUid(ALICE);
    await svc.follow(ME);

    svc.setCurrentUid(ME);
    const page = await svc.getActivity();
    expect(page.items).toHaveLength(1);
    expect(page.items[0].read).toBe(false);
    expect(page.items[0].type).toBe('follow');
    expect(page.items[0].actorUid).toBe(ALICE);
  });

  it('markActivityRead sets read = true on the target only', async () => {
    svc.setCurrentUid(ALICE);
    await svc.follow(ME);
    svc.setCurrentUid(BOB);
    await svc.follow(ME);

    svc.setCurrentUid(ME);
    const before = await svc.getActivity();
    expect(before.items.every((a) => !a.read)).toBe(true);

    // Only mark the first (most recent — Bob's follow) as read.
    await svc.markActivityRead(before.items[0].id);

    const after = await svc.getActivity();
    const bobRow = after.items.find((a) => a.actorUid === BOB);
    const aliceRow = after.items.find((a) => a.actorUid === ALICE);
    expect(bobRow?.read).toBe(true);
    expect(aliceRow?.read).toBe(false);
  });

  it('getUnreadActivityCount returns the correct count after marking', async () => {
    // Three unread events on my feed.
    svc.setCurrentUid(ALICE);
    await svc.follow(ME);
    svc.setCurrentUid(BOB);
    await svc.follow(ME);
    seed(svc, 'uid-carol', 'carol');
    svc.setCurrentUid('uid-carol');
    await svc.follow(ME);

    svc.setCurrentUid(ME);
    expect(await svc.getUnreadActivityCount()).toBe(3);

    // Mark two as read → count drops to 1.
    const page = await svc.getActivity();
    await svc.markActivityRead(page.items[0].id);
    await svc.markActivityRead(page.items[1].id);
    expect(await svc.getUnreadActivityCount()).toBe(1);

    // Mark the last → 0.
    await svc.markActivityRead(page.items[2].id);
    expect(await svc.getUnreadActivityCount()).toBe(0);
  });

  it('getUnreadActivityCount returns 0 when not signed in', async () => {
    svc.setCurrentUid(null);
    expect(await svc.getUnreadActivityCount()).toBe(0);
  });

  it('markActivityRead on an unknown id is a silent no-op', async () => {
    // Contract: the InMemory impl swallows a missing id (matches the "clear
    // stale badge" fire-and-forget usage from MyProfileScreen). The Firebase
    // impl surfaces the error to the caller — the UI catches it.
    await expect(svc.markActivityRead('does-not-exist')).resolves.toBeUndefined();
  });
});

describe('SocialService seam contract — Feed (slice #12)', () => {
  let svc: InMemorySocialService;

  beforeEach(() => {
    svc = new InMemorySocialService();
    seed(svc, ME, 'me');
    seed(svc, ALICE, 'alice');
    seed(svc, BOB, 'bob');
    seed(svc, CHARLIE, 'charlie');
    seed(svc, DIANA, 'diana');
    svc.setCurrentUid(ME);
  });

  it('getFeed returns pins from all followed users, sorted desc by createdAt', async () => {
    // Interleave the pins so a naïve implementation (concat without re-sorting)
    // would produce an out-of-order result.
    svc.seedLieu(ALICE, makeLieu(ALICE, 'a1', 3000));
    svc.seedLieu(BOB, makeLieu(BOB, 'b1', 2000));
    svc.seedLieu(CHARLIE, makeLieu(CHARLIE, 'c1', 4000));
    svc.seedLieu(ALICE, makeLieu(ALICE, 'a2', 1000));

    await svc.follow(ALICE);
    await svc.follow(BOB);
    await svc.follow(CHARLIE);

    const page = await svc.getFeed();
    expect(page.items.map((l) => l.id)).toEqual(['c1', 'a1', 'b1', 'a2']);
    expect(page.cursor).toBeNull();
  });

  it('getFeed with 3 followed users returns their pins desc AND excludes a 4th unfollowed user', async () => {
    svc.seedLieu(ALICE, makeLieu(ALICE, 'a1', 5000));
    svc.seedLieu(BOB, makeLieu(BOB, 'b1', 4000));
    svc.seedLieu(CHARLIE, makeLieu(CHARLIE, 'c1', 3000));
    // Diana is NOT followed — her pins must not appear.
    svc.seedLieu(DIANA, makeLieu(DIANA, 'd1', 9000));

    await svc.follow(ALICE);
    await svc.follow(BOB);
    await svc.follow(CHARLIE);

    const page = await svc.getFeed();
    expect(page.items.map((l) => l.userId)).toEqual([ALICE, BOB, CHARLIE]);
    // Diana's pin is the most recent globally but must be absent.
    expect(page.items.map((l) => l.id)).not.toContain('d1');
  });

  it('getFeed excludes pins from users with isPublic == false', async () => {
    // Alice is public; Bob is private (defensive filter — rules would also deny).
    svc.seedUser({
      uid: BOB,
      username: 'bob',
      displayName: null,
      email: null,
      isPublic: false,
      isCurated: false,
      followersCount: 0,
      followingCount: 0,
      avatarUrl: null,
      bio: null,
      usernameChangedAt: null,
    });
    svc.seedLieu(ALICE, makeLieu(ALICE, 'a1', 2000));
    svc.seedLieu(BOB, makeLieu(BOB, 'b-private', 3000));

    await svc.follow(ALICE);
    await svc.follow(BOB);

    const page = await svc.getFeed();
    expect(page.items.map((l) => l.id)).toEqual(['a1']);
  });

  it('getFeed excludes pins from blocked users', async () => {
    svc.seedLieu(ALICE, makeLieu(ALICE, 'a1', 2000));
    svc.seedLieu(BOB, makeLieu(BOB, 'b1', 3000));

    await svc.follow(ALICE);
    await svc.follow(BOB);
    // Block Bob AFTER the follow — the block cascade removes the follow edge
    // as well, so Bob's pins must fall off the feed regardless.
    await svc.block(BOB);

    const page = await svc.getFeed();
    expect(page.items.map((l) => l.id)).toEqual(['a1']);
  });

  it('getFeed caps the page at 20 items', async () => {
    // 25 pins from Alice — 20 stay on the first page, 5 spill.
    for (let i = 0; i < 25; i++) {
      svc.seedLieu(ALICE, makeLieu(ALICE, `a${i}`, 1000 + i));
    }
    await svc.follow(ALICE);

    const page = await svc.getFeed();
    expect(page.items).toHaveLength(20);
    expect(page.items[0].id).toBe('a24'); // most recent
    expect(page.cursor).not.toBeNull();
  });

  it('getFeed returns an empty page when I follow nobody', async () => {
    // Diana pinned things but I do not follow her.
    svc.seedLieu(DIANA, makeLieu(DIANA, 'd1', 9000));

    const page = await svc.getFeed();
    expect(page.items).toEqual([]);
    expect(page.cursor).toBeNull();
  });

  it('getFeed returns an empty page when not signed in', async () => {
    svc.setCurrentUid(null);
    const page = await svc.getFeed();
    expect(page.items).toEqual([]);
    expect(page.cursor).toBeNull();
  });
});
