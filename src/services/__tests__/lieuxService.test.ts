import { InMemoryLieuxService } from '../inMemoryLieuxService';
import {
  LieuxService,
  LieuDuplicateError,
  PhotoCapReachedError,
  MAX_PHOTOS_PER_LIEU,
} from '../lieuxService';
import { LieuInput, Timestamp } from '../../types/Lieu';

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
  let svc: LieuxService & { reset: () => void; setCurrentUid: (uid: string | null) => void };

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

    it('writes photos[] with a single insta-sourced entry using the users/{uid}/photos/{lieuId}/{photoId}.{ext} layout', async () => {
      const png = await svc.createLieu(USER, makeInput({ screenshotMediaType: 'image/png' }));
      const jpeg = await svc.createLieu(USER, makeInput({ screenshotMediaType: 'image/jpeg' }));
      const webp = await svc.createLieu(USER, makeInput({ screenshotMediaType: 'image/webp' }));

      // Each new pin owns exactly one photo (source: 'insta') at photos[0].
      // The path lives under the new `photos/{lieuId}/` folder — the legacy
      // `screenshots/{lieuId}.{ext}` layout is not written by post-migration
      // pins (only read for back-compat).
      for (const [lieu, ext] of [[png, 'png'], [jpeg, 'jpg'], [webp, 'webp']] as const) {
        expect(lieu.photos).toHaveLength(1);
        expect(lieu.photos[0].source).toBe('insta');
        expect(lieu.photos[0].storagePath).toMatch(
          new RegExp(`^users/${USER}/photos/${lieu.id}/[a-z0-9]+\\.${ext}$`),
        );
        // addedAt lines up with the pin's createdAt on the create path (the
        // in-memory impl ticks a shared clock — the Firebase impl uses
        // serverTimestamp for both, so they resolve identically once the
        // write is acknowledged).
        expect(lieu.photos[0].addedAt.toMillis()).toBe(lieu.createdAt.toMillis());
      }
    });

    it('does NOT write sourceInstagram.screenshotStoragePath on new pins (post-migration schema)', async () => {
      const lieu = await svc.createLieu(USER, makeInput());
      // The deprecated field is entirely absent — the read layer treats its
      // presence as a signal to synthesise photos[] from it, so we must not
      // write it on new pins or we'd double-count the hero.
      expect(lieu.sourceInstagram.screenshotStoragePath).toBeUndefined();
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
        },
      });
      // Hero lives under photos[0] — see the dedicated schema tests above.
      expect(lieu.photos[0]?.source).toBe('insta');
      expect(lieu.photos[0]?.storagePath).toMatch(
        new RegExp(`^users/${USER}/photos/${lieu.id}/[a-z0-9]+\\.jpg$`),
      );
    });

    it('writes an empty photos[] when screenshotUri is absent (URL-only Insta share)', async () => {
      // URL-only shares from Insta (extractFromInstagramUrl path) don't carry
      // a local file — LieuInput.screenshotUri is empty. The seam writes an
      // empty photos array so the UI falls back to the category-emoji tile.
      const lieu = await svc.createLieu(USER, makeInput({ screenshotUri: '' }));
      expect(lieu.photos).toEqual([]);
      expect(lieu.sourceInstagram.screenshotStoragePath).toBeUndefined();
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

  // #41 — status field (wishlist/visited/null) and the visitedAt invariant.
  describe('status + visitedAt (#41)', () => {
    it('createLieu initializes status = "wishlist" and no visitedAt', async () => {
      const created = await svc.createLieu(USER, makeInput());
      expect(created.status).toBe('wishlist');
      expect(created.visitedAt).toBeUndefined();
    });

    it('updateLieu({ status: "visited" }) stamps visitedAt with a Timestamp', async () => {
      const created = await svc.createLieu(USER, makeInput());
      await svc.updateLieu(USER, created.id, { status: 'visited' });

      const after = await svc.getLieuById(USER, created.id);
      expect(after!.status).toBe('visited');
      expect(after!.visitedAt).toBeDefined();
      // Shape-check: must be a Timestamp (has toMillis) rather than raw Date.
      expect(typeof after!.visitedAt!.toMillis()).toBe('number');
      // And must be a recent-ish time — sanity check that we didn't accidentally
      // freeze it at 0 or some stub value.
      expect(after!.visitedAt!.toMillis()).toBeGreaterThan(0);
    });

    it('updateLieu({ status: "wishlist" }) clears visitedAt when previously visited', async () => {
      const created = await svc.createLieu(USER, makeInput());
      await svc.updateLieu(USER, created.id, { status: 'visited' });
      const afterVisit = await svc.getLieuById(USER, created.id);
      expect(afterVisit!.visitedAt).toBeDefined();

      await svc.updateLieu(USER, created.id, { status: 'wishlist' });
      const afterUndo = await svc.getLieuById(USER, created.id);
      expect(afterUndo!.status).toBe('wishlist');
      expect(afterUndo!.visitedAt).toBeUndefined();
    });

    it('updateLieu({ status: null }) clears both status and visitedAt', async () => {
      const created = await svc.createLieu(USER, makeInput());
      await svc.updateLieu(USER, created.id, { status: 'visited' });

      await svc.updateLieu(USER, created.id, { status: null });
      const after = await svc.getLieuById(USER, created.id);
      expect(after!.status).toBeNull();
      expect(after!.visitedAt).toBeUndefined();
    });

    it('unrelated patches (e.g. userNotes) leave status and visitedAt untouched', async () => {
      const created = await svc.createLieu(USER, makeInput());
      await svc.updateLieu(USER, created.id, { status: 'visited' });
      const afterVisit = await svc.getLieuById(USER, created.id);
      const stampedAt = afterVisit!.visitedAt!.toMillis();

      await svc.updateLieu(USER, created.id, { userNotes: 'a note' });
      const afterNote = await svc.getLieuById(USER, created.id);
      expect(afterNote!.status).toBe('visited');
      expect(afterNote!.visitedAt).toBeDefined();
      expect(afterNote!.visitedAt!.toMillis()).toBe(stampedAt);
      expect(afterNote!.userNotes).toBe('a note');
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

    it('accepts (and ignores) an optional captionText argument', async () => {
      // The in-memory impl doesn't actually pass captionText through to
      // anything — it just needs to accept the extra arg without throwing so
      // the SharedImageScreen video-share path can call it with the caption.
      const withCaption = await svc.extractFromScreenshot(
        'AAAA',
        'image/png',
        'Chai Brongniart, Paris 2ème — jazz + techno rooftop',
      );
      const withoutCaption = await svc.extractFromScreenshot('AAAA', 'image/png');
      expect(withCaption).toEqual(withoutCaption);
    });

    it('accepts an empty captionText without throwing', async () => {
      await expect(svc.extractFromScreenshot('AAAA', 'image/png', '')).resolves.toBeDefined();
    });
  });

  describe('resaveFromNetwork (#13)', () => {
    const OTHER = 'user-other';
    const CREDIT = { uid: OTHER, username: 'waymark.paris.cool' };

    beforeEach(() => {
      // Impersonate the signed-in user for methods that read `auth`.
      svc.setCurrentUid(USER);
    });

    async function seedSource(overrides: Partial<LieuInput> = {}) {
      // Create the source pin under OTHER, then read it back so we get the
      // real hydrated Lieu (including its generated storage path).
      svc.setCurrentUid(OTHER);
      const created = await svc.createLieu(
        OTHER,
        makeInput({
          name: 'Le Comptoir',
          lat: 48.85,
          lng: 2.35,
          sourceAuthor: '@waymark.paris.cool',
          ...overrides,
        }),
      );
      svc.setCurrentUid(USER);
      return created;
    }

    it('creates a pin with savedFromUserId + savedFromUsername attribution', async () => {
      const source = await seedSource();

      const resaved = await svc.resaveFromNetwork(source, CREDIT);

      expect(resaved.userId).toBe(USER);
      expect(resaved.savedFromUserId).toBe(CREDIT.uid);
      expect(resaved.savedFromUsername).toBe(CREDIT.username);
      // Content fields are cloned verbatim.
      expect(resaved.name).toBe(source.name);
      expect(resaved.address).toBe(source.address);
      expect(resaved.lat).toBe(source.lat);
      expect(resaved.lng).toBe(source.lng);
      expect(resaved.category).toBe(source.category);
    });

    it('references the source photos[] — no Storage copy', async () => {
      const source = await seedSource();

      const resaved = await svc.resaveFromNetwork(source, CREDIT);

      // Photos are copied by REFERENCE — same storagePath values, no new
      // upload, no path rewrite under my uid.
      expect(resaved.photos).toHaveLength(source.photos.length);
      expect(resaved.photos.map((p) => p.storagePath)).toEqual(
        source.photos.map((p) => p.storagePath),
      );
      // Path still lives under the SOURCE owner's uid, not mine — that's the
      // whole point of "reference, not copy".
      for (const p of resaved.photos) {
        expect(p.storagePath).toContain(`users/${OTHER}/`);
        expect(p.storagePath).not.toContain(`users/${USER}/`);
      }
    });

    it('leaves userNotes null on the re-saved pin (fresh copy)', async () => {
      const source = await seedSource();
      // Even if the source had notes, mine start empty.
      await svc.updateLieu(OTHER, source.id, { userNotes: 'source-owner notes' });
      const refreshedSource = await svc.getLieuById(OTHER, source.id);

      const resaved = await svc.resaveFromNetwork(refreshedSource!, CREDIT);

      expect(resaved.userNotes).toBeNull();
    });

    // #41 — status expresses MY relation to the place, not the source's.
    it('initializes status = "wishlist" on the re-saved pin regardless of source status', async () => {
      const source = await seedSource();
      // Flip the source pin to 'visited' — the resave must still land as wishlist.
      await svc.updateLieu(OTHER, source.id, { status: 'visited' });
      const refreshedSource = await svc.getLieuById(OTHER, source.id);
      expect(refreshedSource!.status).toBe('visited');
      expect(refreshedSource!.visitedAt).toBeDefined();

      const resaved = await svc.resaveFromNetwork(refreshedSource!, CREDIT);

      expect(resaved.status).toBe('wishlist');
      expect(resaved.visitedAt).toBeUndefined();
    });

    it('is discoverable in the caller\'s own getAllLieux + getLieuById', async () => {
      const source = await seedSource();

      const resaved = await svc.resaveFromNetwork(source, CREDIT);

      const mine = await svc.getAllLieux(USER);
      expect(mine.map((l) => l.id)).toContain(resaved.id);
      const fetched = await svc.getLieuById(USER, resaved.id);
      expect(fetched?.savedFromUsername).toBe(CREDIT.username);
    });

    it('throws LieuDuplicateError when a nearby pin (<100m) already exists', async () => {
      // I already have a pin at ~5m from where the source sits — resaving should be blocked.
      await svc.createLieu(
        USER,
        makeInput({ name: 'Mine already', lat: 48.85, lng: 2.35 }),
      );
      const source = await seedSource({ lat: 48.85005, lng: 2.35005 });

      await expect(svc.resaveFromNetwork(source, CREDIT)).rejects.toBeInstanceOf(
        LieuDuplicateError,
      );
    });

    it('does NOT throw when the source is >100m away from every existing pin', async () => {
      // Pin in Paris; source in Lyon — comfortably outside the dedup radius.
      await svc.createLieu(
        USER,
        makeInput({ name: 'Paris pin', lat: 48.85, lng: 2.35 }),
      );
      const source = await seedSource({ lat: 45.76, lng: 4.83 });

      await expect(svc.resaveFromNetwork(source, CREDIT)).resolves.toMatchObject({
        savedFromUserId: CREDIT.uid,
      });
    });

    it('throws if the impersonated current user is not set (not signed in)', async () => {
      const source = await seedSource();
      svc.setCurrentUid(null);

      await expect(svc.resaveFromNetwork(source, CREDIT)).rejects.toThrow(/Not signed in/);
    });
  });

  describe('photo gallery mutations (#38)', () => {
    // Every mutation test seeds a single pin so we start with a 1-element
    // gallery (`photos[0]` is the auto-created `source: 'insta'` entry from
    // createLieu, per #35).
    let lieuId: string;
    let heroPath: string;

    beforeEach(async () => {
      const lieu = await svc.createLieu(USER, makeInput());
      lieuId = lieu.id;
      expect(lieu.photos).toHaveLength(1);
      expect(lieu.photos[0].source).toBe('insta');
      heroPath = lieu.photos[0].storagePath;
    });

    describe('addPhoto', () => {
      it('appends a user-source photo and returns it', async () => {
        const added = await svc.addPhoto(USER, lieuId, 'file:///tmp/new.jpg', 'user');

        expect(added.source).toBe('user');
        expect(added.storagePath).toMatch(
          new RegExp(`^users/${USER}/photos/${lieuId}/`),
        );
        expect(added.storagePath).toMatch(/\.jpg$/);

        const after = await svc.getLieuById(USER, lieuId);
        expect(after!.photos).toHaveLength(2);
        // The Instagram-sourced hero stays first — new photos go to the tail.
        expect(after!.photos[0].storagePath).toBe(heroPath);
        expect(after!.photos[1].storagePath).toBe(added.storagePath);
      });

      it('succeeds when photos[] is currently empty (URL-only Insta pin)', async () => {
        // v8 polish A regression pin: the founder reported "+ Ajouter" failed on
        // pins created via extractFromInstagramUrl (empty photos[]). At the
        // seam, addPhoto must land the first photo cleanly and the new entry
        // must sit at photos[0] — no phantom hero left behind.
        const empty = await svc.createLieu(
          USER,
          makeInput({ name: 'URL-only', screenshotUri: '' }),
        );
        expect(empty.photos).toEqual([]);

        const added = await svc.addPhoto(USER, empty.id, 'file:///tmp/first.jpg', 'user');
        expect(added.source).toBe('user');

        const after = await svc.getLieuById(USER, empty.id);
        expect(after!.photos).toHaveLength(1);
        expect(after!.photos[0].storagePath).toBe(added.storagePath);
      });

      it(`throws PhotoCapReachedError once the pin has ${MAX_PHOTOS_PER_LIEU} photos`, async () => {
        // Fill the gallery up to the cap (1 seeded + 9 added = 10).
        for (let i = 0; i < MAX_PHOTOS_PER_LIEU - 1; i++) {
          await svc.addPhoto(USER, lieuId, `file:///tmp/p${i}.jpg`, 'user');
        }
        const atCap = await svc.getLieuById(USER, lieuId);
        expect(atCap!.photos).toHaveLength(MAX_PHOTOS_PER_LIEU);

        // 11th throws.
        await expect(
          svc.addPhoto(USER, lieuId, 'file:///tmp/overflow.jpg', 'user'),
        ).rejects.toBeInstanceOf(PhotoCapReachedError);

        // Firestore state is unchanged on rejection — still exactly 10.
        const afterReject = await svc.getLieuById(USER, lieuId);
        expect(afterReject!.photos).toHaveLength(MAX_PHOTOS_PER_LIEU);
      });

      it('carries the lieuId on the thrown error for the caller to surface', async () => {
        for (let i = 0; i < MAX_PHOTOS_PER_LIEU - 1; i++) {
          await svc.addPhoto(USER, lieuId, `file:///tmp/p${i}.jpg`, 'user');
        }
        try {
          await svc.addPhoto(USER, lieuId, 'file:///tmp/overflow.jpg', 'user');
          throw new Error('expected addPhoto to throw');
        } catch (err) {
          expect(err).toBeInstanceOf(PhotoCapReachedError);
          expect((err as PhotoCapReachedError).lieuId).toBe(lieuId);
          expect((err as PhotoCapReachedError).cap).toBe(MAX_PHOTOS_PER_LIEU);
        }
      });
    });

    describe('removePhoto', () => {
      it('removes the given entry from photos[]', async () => {
        const p2 = await svc.addPhoto(USER, lieuId, 'file:///tmp/2.jpg', 'user');
        const p3 = await svc.addPhoto(USER, lieuId, 'file:///tmp/3.jpg', 'user');

        await svc.removePhoto(USER, lieuId, p2.storagePath);

        const after = await svc.getLieuById(USER, lieuId);
        expect(after!.photos.map((p) => p.storagePath)).toEqual([
          heroPath,
          p3.storagePath,
        ]);
      });

      it('promotes photos[1] to the hero when photos[0] is removed', async () => {
        const p2 = await svc.addPhoto(USER, lieuId, 'file:///tmp/2.jpg', 'user');
        await svc.addPhoto(USER, lieuId, 'file:///tmp/3.jpg', 'user');

        // Nuke the Instagram-sourced hero — the added photo at index 1 must
        // now sit at index 0.
        await svc.removePhoto(USER, lieuId, heroPath);

        const after = await svc.getLieuById(USER, lieuId);
        expect(after!.photos[0].storagePath).toBe(p2.storagePath);
        expect(after!.photos).toHaveLength(2);
      });

      it('leaves photos: [] when the last remaining photo is removed', async () => {
        await svc.removePhoto(USER, lieuId, heroPath);

        const after = await svc.getLieuById(USER, lieuId);
        expect(after!.photos).toEqual([]);
      });

      it('preserves sourceInstagram.author even when the last insta photo is deleted', async () => {
        const before = await svc.getLieuById(USER, lieuId);
        const author = before!.sourceInstagram.author;
        expect(author).not.toBeNull();

        await svc.removePhoto(USER, lieuId, heroPath);

        const after = await svc.getLieuById(USER, lieuId);
        expect(after!.photos).toEqual([]);
        // Attribution text survives — #34 US13.
        expect(after!.sourceInstagram.author).toBe(author);
      });

      it('is a no-op when the path is not in the gallery', async () => {
        await expect(
          svc.removePhoto(USER, lieuId, 'users/other/photos/xxx/yyy.jpg'),
        ).resolves.toBeUndefined();

        const after = await svc.getLieuById(USER, lieuId);
        expect(after!.photos.map((p) => p.storagePath)).toEqual([heroPath]);
      });
    });

    describe('reorderPhotos', () => {
      it('writes the exact order given', async () => {
        const p2 = await svc.addPhoto(USER, lieuId, 'file:///tmp/2.jpg', 'user');
        const p3 = await svc.addPhoto(USER, lieuId, 'file:///tmp/3.jpg', 'user');

        // Promote p3 to hero, keep p2 in the middle, demote the insta hero.
        await svc.reorderPhotos(USER, lieuId, [
          p3.storagePath,
          p2.storagePath,
          heroPath,
        ]);

        const after = await svc.getLieuById(USER, lieuId);
        expect(after!.photos.map((p) => p.storagePath)).toEqual([
          p3.storagePath,
          p2.storagePath,
          heroPath,
        ]);
      });

      it('throws when the input has a different length than the current gallery', async () => {
        await svc.addPhoto(USER, lieuId, 'file:///tmp/2.jpg', 'user');

        // Missing entry — only pass one of the two current photos.
        await expect(
          svc.reorderPhotos(USER, lieuId, [heroPath]),
        ).rejects.toThrow(/expected 2/);

        // Extra entry — pass three when there are two.
        await expect(
          svc.reorderPhotos(USER, lieuId, [
            heroPath,
            'users/x/photos/y/z.jpg',
            'users/x/photos/y/w.jpg',
          ]),
        ).rejects.toThrow(/expected 2/);

        // Firestore state untouched — still the original order.
        const after = await svc.getLieuById(USER, lieuId);
        expect(after!.photos.map((p) => p.storagePath)[0]).toBe(heroPath);
      });

      it('throws when the input contains a path that is not in the current gallery', async () => {
        const p2 = await svc.addPhoto(USER, lieuId, 'file:///tmp/2.jpg', 'user');

        await expect(
          svc.reorderPhotos(USER, lieuId, [
            'users/x/photos/y/rogue.jpg',
            p2.storagePath,
          ]),
        ).rejects.toThrow();

        const after = await svc.getLieuById(USER, lieuId);
        expect(after!.photos.map((p) => p.storagePath)).toEqual([
          heroPath,
          p2.storagePath,
        ]);
      });

      it('throws when the input contains duplicates', async () => {
        await svc.addPhoto(USER, lieuId, 'file:///tmp/2.jpg', 'user');

        await expect(
          svc.reorderPhotos(USER, lieuId, [heroPath, heroPath]),
        ).rejects.toThrow(/duplicate/i);
      });
    });

    describe('cross-user access rejection', () => {
      // These tests use `setCurrentUid` to impersonate a signed-in user and
      // verify the mutation methods reject when the passed `userId` doesn't
      // match. This mirrors what the Firestore rules do in production —
      // `request.auth.uid == userId` on `/users/{userId}/lieux/{lieuId}`.
      const OTHER = 'user-other';

      beforeEach(() => {
        svc.setCurrentUid(OTHER);
      });

      afterEach(() => {
        svc.setCurrentUid(null);
      });

      it('rejects addPhoto with a userId that is not the signed-in uid', async () => {
        await expect(
          svc.addPhoto(USER, lieuId, 'file:///tmp/a.jpg', 'user'),
        ).rejects.toThrow(/Cross-user/);
      });

      it('rejects removePhoto with a userId that is not the signed-in uid', async () => {
        await expect(
          svc.removePhoto(USER, lieuId, heroPath),
        ).rejects.toThrow(/Cross-user/);
      });

      it('rejects reorderPhotos with a userId that is not the signed-in uid', async () => {
        await expect(
          svc.reorderPhotos(USER, lieuId, [heroPath]),
        ).rejects.toThrow(/Cross-user/);
      });
    });
  });

  /**
   * Slice #35 — read-compat for pre-migration Lieu docs (parent PRD #34).
   *
   * The Firebase impl reads existing docs that only carry the deprecated
   * `sourceInstagram.screenshotStoragePath` field (no `photos[]`). The read
   * layer must synthesise a single-element `photos[]` in memory so the rest
   * of the app can treat `photos[0]` as the canonical hero, without touching
   * Firestore (backfill is a separate slice).
   *
   * These tests inject raw pre-migration docs via the InMemory
   * `seedRawDoc` helper and assert the seam's read methods return them
   * normalised.
   */
  describe('photos[] read-compat for pre-migration docs (slice #35)', () => {
    function preMigrationDoc(
      id: string,
      screenshotStoragePath: string,
      createdAtMs: number,
      ownerUid: string = USER,
    ) {
      const t: Timestamp = {
        seconds: Math.floor(createdAtMs / 1000),
        nanoseconds: (createdAtMs % 1000) * 1_000_000,
        toDate: () => new Date(createdAtMs),
        toMillis: () => createdAtMs,
      };
      // Shape mirrors what Firestore has on disk for pre-migration pins:
      // no `photos` field, `sourceInstagram.screenshotStoragePath` populated.
      return {
        userId: ownerUid,
        name: `Legacy ${id}`,
        nameNormalized: `legacy ${id}`,
        city: 'Paris',
        country: 'France',
        address: '10 rue Legacy',
        lat: 48.86,
        lng: 2.34,
        category: 'resto' as const,
        description: null,
        sourceInstagram: {
          author: '@legacy',
          screenshotStoragePath,
        },
        userNotes: null,
        createdAt: t,
        updatedAt: t,
      };
    }

    it('getLieuById synthesises a single-element photos[] from screenshotStoragePath', async () => {
      const legacyPath = `users/${USER}/screenshots/legacy-1.png`;
      const inMem = svc as unknown as InMemoryLieuxService;
      inMem.seedRawDoc(USER, 'legacy-1', preMigrationDoc('legacy-1', legacyPath, 1_700_000_000_000));

      const fetched = await svc.getLieuById(USER, 'legacy-1');

      expect(fetched).not.toBeNull();
      expect(fetched!.photos).toHaveLength(1);
      expect(fetched!.photos[0]).toMatchObject({
        storagePath: legacyPath,
        source: 'insta',
      });
      // Legacy field is preserved on the hydrated Lieu so backfill tooling
      // can still see it — but no Firestore write is emitted from the read.
      expect(fetched!.sourceInstagram.screenshotStoragePath).toBe(legacyPath);
    });

    it('getAllLieux applies the same synthesis across the whole collection', async () => {
      const inMem = svc as unknown as InMemoryLieuxService;
      inMem.seedRawDoc(
        USER,
        'legacy-a',
        preMigrationDoc('legacy-a', `users/${USER}/screenshots/legacy-a.png`, 1_700_000_000_000),
      );
      inMem.seedRawDoc(
        USER,
        'legacy-b',
        preMigrationDoc('legacy-b', `users/${USER}/screenshots/legacy-b.jpg`, 1_700_000_001_000),
      );

      const all = await svc.getAllLieux(USER);

      expect(all).toHaveLength(2);
      for (const l of all) {
        expect(l.photos).toHaveLength(1);
        expect(l.photos[0].source).toBe('insta');
        expect(l.photos[0].storagePath).toBe(l.sourceInstagram.screenshotStoragePath);
      }
    });

    it('leaves photos[] empty when neither photos nor screenshotStoragePath are present', async () => {
      const inMem = svc as unknown as InMemoryLieuxService;
      // Curated / URL-only shares with no image on disk end up here — the UI
      // is already prepared to fall back to the category emoji placeholder.
      inMem.seedRawDoc(USER, 'no-image', preMigrationDoc('no-image', '', 1_700_000_002_000));

      const fetched = await svc.getLieuById(USER, 'no-image');
      expect(fetched!.photos).toEqual([]);
    });

    it('resaveFromNetwork on a pre-migration source clones the synthesised photos[]', async () => {
      // Sanity check: the read-compat synthesis flows through into the
      // resave path, so a re-save during the migration window still lands a
      // usable hero on the new pin.
      const inMem = svc as unknown as InMemoryLieuxService;
      const legacyPath = `users/uid-legacy-owner/screenshots/oldpin.png`;
      inMem.seedRawDoc(
        'uid-legacy-owner',
        'oldpin',
        preMigrationDoc('oldpin', legacyPath, 1_700_000_003_000, 'uid-legacy-owner'),
      );
      inMem.setCurrentUid(USER);
      const source = await svc.getLieuById('uid-legacy-owner', 'oldpin');

      const resaved = await svc.resaveFromNetwork(source!, {
        uid: 'uid-legacy-owner',
        username: 'legacy_owner',
      });

      expect(resaved.photos).toHaveLength(1);
      expect(resaved.photos[0].storagePath).toBe(legacyPath);
    });
  });
});
