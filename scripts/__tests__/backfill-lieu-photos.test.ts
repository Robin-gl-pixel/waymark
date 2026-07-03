import {
  processDoc,
  ProcessDeps,
  DocData,
  Bbox,
  PhotoEntry,
} from '../lib/backfillLieuPhotos';

/**
 * Deterministic Timestamp-shaped stub for `createdAt`. The backfill forwards
 * this verbatim into `photos[0].addedAt`; the assertions only need identity,
 * not real Firestore semantics.
 */
const CREATED_AT = { seconds: 1_700_000_000, nanoseconds: 0 };

function makeDeps(overrides: Partial<ProcessDeps> = {}): {
  deps: ProcessDeps;
  calls: {
    downloadImage: string[];
    extractBboxOnly: number;
    cropImage: Array<{ bbox: Bbox }>;
    uploadImage: Array<{ path: string; bytes: number; contentType: string }>;
    writePhotos: Array<{ uid: string; lieuId: string; photos: PhotoEntry[] }>;
    logs: string[];
  };
} {
  const calls = {
    downloadImage: [] as string[],
    extractBboxOnly: 0,
    cropImage: [] as Array<{ bbox: Bbox }>,
    uploadImage: [] as Array<{ path: string; bytes: number; contentType: string }>,
    writePhotos: [] as Array<{ uid: string; lieuId: string; photos: PhotoEntry[] }>,
    logs: [] as string[],
  };
  const deps: ProcessDeps = {
    downloadImage: async (storagePath) => {
      calls.downloadImage.push(storagePath);
      return { buffer: Buffer.from('rawscreenshotbytes'), contentType: 'image/png' };
    },
    extractBboxOnly: async () => {
      calls.extractBboxOnly += 1;
      return { photoBoundingBox: { x: 0.1, y: 0.15, w: 0.8, h: 0.7 } };
    },
    cropImage: async (_buf, bbox) => {
      calls.cropImage.push({ bbox });
      return Buffer.from('croppedbytes');
    },
    uploadImage: async (path, buf, contentType) => {
      calls.uploadImage.push({ path, bytes: buf.length, contentType });
    },
    writePhotos: async (uid, lieuId, photos) => {
      calls.writePhotos.push({ uid, lieuId, photos });
    },
    generatePhotoId: () => 'photo-abc123',
    logger: (msg) => {
      calls.logs.push(msg);
    },
    ...overrides,
  };
  return { deps, calls };
}

function makeDoc(overrides: Partial<DocData> = {}): DocData {
  return {
    uid: 'user-1',
    lieuId: 'lieu-1',
    photos: undefined,
    sourceInstagram: { screenshotStoragePath: 'users/user-1/screenshots/lieu-1.png' },
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe('backfill-lieu-photos · processDoc', () => {
  describe('valid bbox case', () => {
    it('crops the screenshot and writes photos[] with the new storage path', async () => {
      const { deps, calls } = makeDeps();
      const doc = makeDoc();

      const result = await processDoc(doc, deps, { dryRun: false });

      expect(result).toEqual({
        action: 'migrate',
        photos: [
          {
            storagePath: 'users/user-1/photos/lieu-1/photo-abc123.jpg',
            source: 'insta',
            addedAt: CREATED_AT,
          },
        ],
        cropped: true,
        dryRun: false,
      });

      // Extract + crop + upload + firestore write, each exactly once.
      expect(calls.extractBboxOnly).toBe(1);
      expect(calls.cropImage).toHaveLength(1);
      expect(calls.cropImage[0].bbox).toEqual({ x: 0.1, y: 0.15, w: 0.8, h: 0.7 });
      expect(calls.uploadImage).toEqual([
        {
          path: 'users/user-1/photos/lieu-1/photo-abc123.jpg',
          bytes: Buffer.from('croppedbytes').length,
          contentType: 'image/jpeg',
        },
      ]);
      expect(calls.writePhotos).toEqual([
        {
          uid: 'user-1',
          lieuId: 'lieu-1',
          photos: [
            {
              storagePath: 'users/user-1/photos/lieu-1/photo-abc123.jpg',
              source: 'insta',
              addedAt: CREATED_AT,
            },
          ],
        },
      ]);
    });
  });

  describe('invalid bbox case (server sanity check returned null)', () => {
    it('uploads the raw screenshot to the new path and marks cropped=false', async () => {
      const { deps, calls } = makeDeps({
        extractBboxOnly: async () => ({ photoBoundingBox: null }),
      });
      const doc = makeDoc();

      const result = await processDoc(doc, deps, { dryRun: false });

      expect(result.action).toBe('migrate');
      if (result.action !== 'migrate') throw new Error('unreachable');
      expect(result.cropped).toBe(false);
      expect(result.photos).toEqual([
        {
          storagePath: 'users/user-1/photos/lieu-1/photo-abc123.jpg',
          source: 'insta',
          addedAt: CREATED_AT,
        },
      ]);

      // No crop attempt when bbox is null.
      expect(calls.cropImage).toHaveLength(0);
      // The raw screenshot bytes must be the ones uploaded to the new path.
      expect(calls.uploadImage).toEqual([
        {
          path: 'users/user-1/photos/lieu-1/photo-abc123.jpg',
          bytes: Buffer.from('rawscreenshotbytes').length,
          contentType: 'image/jpeg',
        },
      ]);
      // photos[] still written — invalid bbox docs still get migrated.
      expect(calls.writePhotos).toHaveLength(1);
    });
  });

  describe('extract returned photoBoundingBox === null (bboxOnly-null case)', () => {
    it('behaves the same as invalid bbox — raw upload, still migrated', async () => {
      const { deps, calls } = makeDeps({
        extractBboxOnly: async () => ({ photoBoundingBox: null }),
      });
      const doc = makeDoc();

      const result = await processDoc(doc, deps, { dryRun: false });

      if (result.action !== 'migrate') throw new Error('expected migrate');
      expect(result.cropped).toBe(false);
      expect(calls.cropImage).toHaveLength(0);
      expect(calls.writePhotos[0].photos[0].storagePath).toMatch(
        /^users\/user-1\/photos\/lieu-1\/photo-abc123\.jpg$/,
      );
    });
  });

  describe('idempotence', () => {
    it('skips docs that already carry photos[] — no download, no extract, no upload, no write', async () => {
      const { deps, calls } = makeDeps();
      const doc = makeDoc({
        photos: [
          {
            storagePath: 'users/user-1/photos/lieu-1/existing.jpg',
            source: 'insta',
            addedAt: CREATED_AT,
          },
        ],
      });

      const result = await processDoc(doc, deps, { dryRun: false });

      expect(result).toEqual({ action: 'skip', reason: 'has-photos' });
      expect(calls.downloadImage).toEqual([]);
      expect(calls.extractBboxOnly).toBe(0);
      expect(calls.cropImage).toEqual([]);
      expect(calls.uploadImage).toEqual([]);
      expect(calls.writePhotos).toEqual([]);
    });
  });

  describe('missing sourceInstagram.screenshotStoragePath', () => {
    it('skips the doc — no API calls, no writes', async () => {
      const { deps, calls } = makeDeps();
      const doc = makeDoc({ sourceInstagram: { screenshotStoragePath: '' } });

      const result = await processDoc(doc, deps, { dryRun: false });

      expect(result).toEqual({ action: 'skip', reason: 'no-screenshot' });
      expect(calls.downloadImage).toEqual([]);
      expect(calls.extractBboxOnly).toBe(0);
      expect(calls.uploadImage).toEqual([]);
      expect(calls.writePhotos).toEqual([]);
    });

    it('skips when sourceInstagram is entirely absent', async () => {
      const { deps, calls } = makeDeps();
      const doc = makeDoc({ sourceInstagram: null });

      const result = await processDoc(doc, deps, { dryRun: false });

      expect(result).toEqual({ action: 'skip', reason: 'no-screenshot' });
      expect(calls.downloadImage).toEqual([]);
    });
  });

  describe('dry-run mode', () => {
    it('prints the exact photos[] payload but emits NO uploads and NO Firestore writes', async () => {
      const { deps, calls } = makeDeps();
      const doc = makeDoc();

      const result = await processDoc(doc, deps, { dryRun: true });

      expect(result).toEqual({
        action: 'migrate',
        photos: [
          {
            storagePath: 'users/user-1/photos/lieu-1/photo-abc123.jpg',
            source: 'insta',
            addedAt: CREATED_AT,
          },
        ],
        cropped: true,
        dryRun: true,
      });

      // Read-side deps (download + extract + crop) still run — we need them
      // to compute the payload — but no side-effectful writes.
      expect(calls.downloadImage).toHaveLength(1);
      expect(calls.extractBboxOnly).toBe(1);
      expect(calls.uploadImage).toEqual([]);
      expect(calls.writePhotos).toEqual([]);

      // The dry-run log must include the payload for operator eyeballing.
      const combined = calls.logs.join('\n');
      expect(combined).toContain('photos');
      expect(combined).toContain('users/user-1/photos/lieu-1/photo-abc123.jpg');
    });

    it('dry-run with invalid bbox still surfaces the (raw) payload without writing', async () => {
      const { deps, calls } = makeDeps({
        extractBboxOnly: async () => ({ photoBoundingBox: null }),
      });
      const doc = makeDoc();

      const result = await processDoc(doc, deps, { dryRun: true });

      if (result.action !== 'migrate') throw new Error('expected migrate');
      expect(result.cropped).toBe(false);
      expect(calls.uploadImage).toEqual([]);
      expect(calls.writePhotos).toEqual([]);
    });
  });

  describe('extract failure resilience', () => {
    it('falls back to raw upload when extractBboxOnly throws', async () => {
      const { deps, calls } = makeDeps({
        extractBboxOnly: async () => {
          throw new Error('extract 500');
        },
      });
      const doc = makeDoc();

      const result = await processDoc(doc, deps, { dryRun: false });

      if (result.action !== 'migrate') throw new Error('expected migrate');
      expect(result.cropped).toBe(false);
      expect(calls.cropImage).toEqual([]);
      expect(calls.uploadImage[0].bytes).toBe(Buffer.from('rawscreenshotbytes').length);
      expect(calls.writePhotos).toHaveLength(1);
    });

    it('falls back to raw upload when cropImage throws', async () => {
      const { deps, calls } = makeDeps({
        cropImage: async () => {
          throw new Error('sharp crash');
        },
      });
      const doc = makeDoc();

      const result = await processDoc(doc, deps, { dryRun: false });

      if (result.action !== 'migrate') throw new Error('expected migrate');
      expect(result.cropped).toBe(false);
      expect(calls.uploadImage[0].bytes).toBe(Buffer.from('rawscreenshotbytes').length);
      expect(calls.writePhotos).toHaveLength(1);
    });
  });

  describe('non-deletion invariant', () => {
    it('exposes no delete-object capability — the deps shape guarantees the original screenshotStoragePath survives', () => {
      // This is a compile-time-adjacent structural check: we never plumb a
      // delete method into the processor. If someone later adds one, they
      // must revisit the migration safety story (issue #37 acceptance says
      // NEVER delete under any circumstance).
      const { deps } = makeDeps();
      expect('deleteObject' in deps).toBe(false);
      expect(Object.keys(deps).sort()).toEqual(
        [
          'cropImage',
          'downloadImage',
          'extractBboxOnly',
          'generatePhotoId',
          'logger',
          'uploadImage',
          'writePhotos',
        ].sort(),
      );
    });
  });
});
