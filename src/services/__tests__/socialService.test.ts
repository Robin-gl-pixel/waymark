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
