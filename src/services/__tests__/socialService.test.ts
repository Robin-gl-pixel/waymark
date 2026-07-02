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
