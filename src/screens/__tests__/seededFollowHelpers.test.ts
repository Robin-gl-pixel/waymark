import type { UserProfile } from '../../types/User';
import type { Timestamp } from '../../types/Lieu';
import { InMemorySocialService } from '../../services/inMemorySocialService';
import { pickBatchFollowTargets, runBatchFollow } from '../seededFollowHelpers';

/**
 * SeededFollow batch-follow contract (GitHub #17):
 *   1. The "Continuer" button follows every curated account whose Switch is
 *      still ON, and no one else.
 *   2. A single follow() failure never blocks the flow — the user must still
 *      reach Main even if one write hit a permission-denied.
 *   3. Skipping (top-right "Passer") means no follows at all — the same
 *      helper is a no-op on an empty target list.
 */

const ME = 'uid-me';

function ts(ms: number): Timestamp {
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: (ms % 1000) * 1_000_000,
    toDate: () => new Date(ms),
    toMillis: () => ms,
  };
}

function makeCurated(uid: string, username: string): UserProfile {
  return {
    uid,
    username,
    displayName: null,
    email: null,
    isPublic: true,
    isCurated: true,
    followersCount: 0,
    followingCount: 0,
    avatarUrl: null,
    bio: null,
    usernameChangedAt: null,
    createdAt: ts(1_700_000_000_000),
    updatedAt: ts(1_700_000_000_000),
  };
}

describe('pickBatchFollowTargets', () => {
  const users = [
    makeCurated('uid-paris.cool', 'waymark.paris.cool'),
    makeCurated('uid-paris.culturel', 'waymark.paris.culturel'),
    makeCurated('uid-paris.chic', 'waymark.paris.chic'),
    makeCurated('uid-paris.food', 'waymark.paris.food'),
  ];

  it('returns only the users whose Switch is still ON', () => {
    const selected = {
      'uid-paris.cool': true,
      'uid-paris.culturel': false,
      'uid-paris.chic': true,
      'uid-paris.food': true,
    };
    const targets = pickBatchFollowTargets(users, selected);
    expect(targets.map((u) => u.uid)).toEqual([
      'uid-paris.cool',
      'uid-paris.chic',
      'uid-paris.food',
    ]);
  });

  it('treats a missing entry as OFF (defensive)', () => {
    // Should never happen in practice — the screen seeds every uid with ON at
    // load time — but the helper must not accidentally follow a user whose
    // toggle was never rendered.
    const targets = pickBatchFollowTargets(users, {});
    expect(targets).toEqual([]);
  });

  it('returns everyone when all Switches are ON — the default post-load state', () => {
    const selected: Record<string, boolean> = {};
    users.forEach((u) => { selected[u.uid] = true; });
    const targets = pickBatchFollowTargets(users, selected);
    expect(targets).toHaveLength(users.length);
  });

  it('returns an empty list when every Switch is OFF', () => {
    const selected: Record<string, boolean> = {};
    users.forEach((u) => { selected[u.uid] = false; });
    expect(pickBatchFollowTargets(users, selected)).toEqual([]);
  });
});

describe('runBatchFollow', () => {
  function makeSvc() {
    const svc = new InMemorySocialService();
    // Seed the current user so upsertProfile / follow can run.
    svc.setCurrentUid(ME);
    svc.seedUser({
      uid: ME,
      username: 'me',
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
    return svc;
  }

  function seedCurated(svc: InMemorySocialService, uid: string, username: string) {
    svc.seedUser({
      uid,
      username,
      displayName: null,
      email: null,
      isPublic: true,
      isCurated: true,
      followersCount: 0,
      followingCount: 0,
      avatarUrl: null,
      bio: null,
      usernameChangedAt: null,
    });
    return makeCurated(uid, username);
  }

  it('follows every target through the SocialService seam', async () => {
    const svc = makeSvc();
    const cool = seedCurated(svc, 'uid-cool', 'waymark.paris.cool');
    const food = seedCurated(svc, 'uid-food', 'waymark.paris.food');

    await runBatchFollow(svc, [cool, food]);

    await expect(svc.isFollowing('uid-cool')).resolves.toBe(true);
    await expect(svc.isFollowing('uid-food')).resolves.toBe(true);
  });

  it('is a no-op when the target list is empty (Passer button path)', async () => {
    const svc = makeSvc();
    seedCurated(svc, 'uid-cool', 'waymark.paris.cool');

    await runBatchFollow(svc, []);

    await expect(svc.isFollowing('uid-cool')).resolves.toBe(false);
  });

  it('never throws when one follow() rejects — the flow degrades gracefully', async () => {
    // The seam guarantees follow() to Cloud Firestore can throw (permission-
    // denied, network). The screen must NOT surface that error — the user
    // still needs to land on Main. We fake a failing service to prove the
    // helper swallows the error and still awaits the good ones.
    const good = makeCurated('uid-good', 'good');
    const bad = makeCurated('uid-bad', 'bad');
    const followed: string[] = [];
    const fakeSvc = {
      async follow(uid: string) {
        if (uid === 'uid-bad') throw new Error('permission-denied');
        followed.push(uid);
      },
    };

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(runBatchFollow(fakeSvc, [good, bad])).resolves.toBeUndefined();
    } finally {
      warn.mockRestore();
    }

    expect(followed).toEqual(['uid-good']);
  });
});
