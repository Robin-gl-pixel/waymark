import { InMemoryLieuxService } from '../inMemoryLieuxService';
import { LieuxService } from '../lieuxService';
import { LieuInput } from '../../types/Lieu';

const USER = 'user-1';

function makeInput(overrides: Partial<LieuInput> = {}): LieuInput {
  return {
    name: 'Chez Alice',
    city: 'Paris',
    country: 'France',
    address: '1 rue du Test',
    lat: 48.85,
    lng: 2.35,
    category: 'resto',
    description: null,
    sourceAuthor: '@alice',
    userNotes: null,
    screenshotUri: 'file:///tmp/mock.png',
    screenshotMediaType: 'image/png',
    ...overrides,
  };
}

describe('LieuxService seam contract (InMemoryLieuxService)', () => {
  let svc: LieuxService & { reset: () => void };

  beforeEach(() => {
    svc = new InMemoryLieuxService();
  });

  describe('createLieu', () => {
    it('returns a Lieu with a populated id and timestamps', async () => {
      const lieu = await svc.createLieu(USER, makeInput());

      expect(lieu.id).toEqual(expect.any(String));
      expect(lieu.id.length).toBeGreaterThan(0);
      expect(lieu.userId).toBe(USER);
      expect(lieu.createdAt).toBeDefined();
      expect(typeof lieu.createdAt.seconds).toBe('number');
      expect(typeof lieu.createdAt.toMillis()).toBe('number');
      expect(lieu.createdAt.toMillis()).toBe(lieu.updatedAt.toMillis());
    });

    it('assembles storagePath as users/{uid}/screenshots/{id}.{ext} per media type', async () => {
      const png = await svc.createLieu(USER, makeInput({ screenshotMediaType: 'image/png' }));
      const jpeg = await svc.createLieu(USER, makeInput({ screenshotMediaType: 'image/jpeg' }));
      const webp = await svc.createLieu(USER, makeInput({ screenshotMediaType: 'image/webp' }));

      expect(png.sourceInstagram.screenshotStoragePath).toBe(`users/${USER}/screenshots/${png.id}.png`);
      expect(jpeg.sourceInstagram.screenshotStoragePath).toBe(`users/${USER}/screenshots/${jpeg.id}.jpg`);
      expect(webp.sourceInstagram.screenshotStoragePath).toBe(`users/${USER}/screenshots/${webp.id}.webp`);
    });

    it('produces a Lieu matching the LieuInput (author, address, category, coords)', async () => {
      const input = makeInput({
        name: 'Bar du Coin',
        city: 'Lyon',
        country: 'France',
        address: '10 place Bellecour',
        lat: 45.76,
        lng: 4.83,
        category: 'bar',
        description: 'chill spot',
        sourceAuthor: '@bob',
        userNotes: 'go on tuesdays',
        screenshotMediaType: 'image/jpeg',
      });
      const lieu = await svc.createLieu(USER, input);

      expect(lieu).toMatchObject({
        userId: USER,
        name: 'Bar du Coin',
        city: 'Lyon',
        country: 'France',
        address: '10 place Bellecour',
        lat: 45.76,
        lng: 4.83,
        category: 'bar',
        description: 'chill spot',
        userNotes: 'go on tuesdays',
        sourceInstagram: {
          author: '@bob',
          screenshotStoragePath: `users/${USER}/screenshots/${lieu.id}.jpg`,
        },
      });
    });
  });

  describe('getAllLieux', () => {
    it('returns items sorted by createdAt desc', async () => {
      const a = await svc.createLieu(USER, makeInput({ name: 'A' }));
      const b = await svc.createLieu(USER, makeInput({ name: 'B' }));
      const c = await svc.createLieu(USER, makeInput({ name: 'C' }));

      const all = await svc.getAllLieux(USER);

      expect(all.map((l) => l.id)).toEqual([c.id, b.id, a.id]);
    });

    it('returns an empty array when the user has no lieux', async () => {
      const all = await svc.getAllLieux('empty-user');
      expect(all).toEqual([]);
    });

    it('scopes results per user', async () => {
      await svc.createLieu('user-A', makeInput({ name: 'A1' }));
      await svc.createLieu('user-B', makeInput({ name: 'B1' }));

      const forA = await svc.getAllLieux('user-A');
      const forB = await svc.getAllLieux('user-B');

      expect(forA).toHaveLength(1);
      expect(forB).toHaveLength(1);
      expect(forA[0].userId).toBe('user-A');
      expect(forB[0].userId).toBe('user-B');
    });
  });

  describe('getLieuById', () => {
    it('returns the lieu when it exists', async () => {
      const created = await svc.createLieu(USER, makeInput());
      const fetched = await svc.getLieuById(USER, created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.name).toBe(created.name);
    });

    it('returns null for a missing id', async () => {
      const fetched = await svc.getLieuById(USER, 'does-not-exist');
      expect(fetched).toBeNull();
    });
  });

  describe('updateLieu', () => {
    it('patches only allowed fields (name, city, address, category, userNotes)', async () => {
      const created = await svc.createLieu(USER, makeInput({ name: 'Original', category: 'resto' }));

      await svc.updateLieu(USER, created.id, {
        name: 'Renamed',
        city: 'Marseille',
        address: '2 quai du Port',
        category: 'bar',
        userNotes: 'edited',
      });

      const after = await svc.getLieuById(USER, created.id);
      expect(after).not.toBeNull();
      expect(after!.name).toBe('Renamed');
      expect(after!.city).toBe('Marseille');
      expect(after!.address).toBe('2 quai du Port');
      expect(after!.category).toBe('bar');
      expect(after!.userNotes).toBe('edited');

      // Non-patchable fields must be untouched.
      expect(after!.country).toBe(created.country);
      expect(after!.lat).toBe(created.lat);
      expect(after!.lng).toBe(created.lng);
      expect(after!.sourceInstagram).toEqual(created.sourceInstagram);
    });

    it('touches updatedAt but leaves createdAt intact', async () => {
      const created = await svc.createLieu(USER, makeInput());
      await svc.updateLieu(USER, created.id, { userNotes: 'note' });

      const after = await svc.getLieuById(USER, created.id);
      expect(after!.createdAt.toMillis()).toBe(created.createdAt.toMillis());
      expect(after!.updatedAt.toMillis()).toBeGreaterThan(created.updatedAt.toMillis());
    });
  });

  describe('deleteLieu', () => {
    it('removes the lieu; subsequent getLieuById returns null', async () => {
      const created = await svc.createLieu(USER, makeInput());
      await svc.deleteLieu(USER, created.id);

      const after = await svc.getLieuById(USER, created.id);
      expect(after).toBeNull();

      const all = await svc.getAllLieux(USER);
      expect(all).toEqual([]);
    });

    it('is a no-op for a missing id', async () => {
      await expect(svc.deleteLieu(USER, 'missing')).resolves.toBeUndefined();
    });
  });

  describe('getScreenshotUrl', () => {
    it('returns a mem:// URL for the storage path', async () => {
      const url = await svc.getScreenshotUrl(`users/${USER}/screenshots/abc.png`);
      expect(url).toBe(`mem://users/${USER}/screenshots/abc.png`);
    });
  });

  describe('extractFromScreenshot', () => {
    it('returns a stub extraction', async () => {
      const out = await svc.extractFromScreenshot('AAAA', 'image/png');
      expect(out).toEqual(
        expect.objectContaining({
          name: expect.any(String),
          city: expect.any(String),
        }),
      );
    });
  });
});
