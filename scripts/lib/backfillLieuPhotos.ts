/**
 * Pure per-doc migration logic for `scripts/backfill-lieu-photos.ts` (#37).
 *
 * Extracted into its own module so the unit tests can import it without
 * dragging in `firebase-admin` / `sharp` at type-check time — both are only
 * referenced from the CLI wiring in the sibling script.
 *
 * Behaviour contract:
 *   - photos[] already present → skip, no side effects (idempotent).
 *   - sourceInstagram.screenshotStoragePath missing → skip.
 *   - createdAt missing → skip (we need it for the addedAt field).
 *   - extractBboxOnly throws → fall back to raw upload (log + continue).
 *   - cropImage throws → fall back to raw upload (log + continue).
 *   - Dry-run → compute the exact `photos[]` payload and log it, but emit
 *     no Storage upload and no Firestore write.
 *   - NEVER deletes the original screenshotStoragePath object (the deps
 *     shape intentionally exposes no delete method — #37 acceptance).
 */

export interface Bbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PhotoEntry {
  storagePath: string;
  source: 'insta';
  // Firestore Timestamp — the caller forwards the pin's original `createdAt`
  // verbatim so the migrated photo carries the pin's original creation time.
  addedAt: unknown;
}

export interface DocData {
  uid: string;
  lieuId: string;
  photos?: unknown;
  sourceInstagram?: { screenshotStoragePath?: string | null } | null;
  createdAt?: unknown;
}

export interface ProcessDeps {
  downloadImage: (storagePath: string) => Promise<{ buffer: Buffer; contentType: string }>;
  extractBboxOnly: (
    base64: string,
    mediaType: string,
  ) => Promise<{ photoBoundingBox: Bbox | null }>;
  cropImage: (buffer: Buffer, bbox: Bbox) => Promise<Buffer>;
  uploadImage: (storagePath: string, buffer: Buffer, contentType: string) => Promise<void>;
  writePhotos: (uid: string, lieuId: string, photos: PhotoEntry[]) => Promise<void>;
  generatePhotoId: () => string;
  logger?: (msg: string) => void;
}

export type ProcessResult =
  | { action: 'skip'; reason: 'has-photos' | 'no-screenshot' | 'no-created-at' }
  | {
      action: 'migrate';
      photos: PhotoEntry[];
      cropped: boolean;
      dryRun: boolean;
    };

export async function processDoc(
  data: DocData,
  deps: ProcessDeps,
  opts: { dryRun: boolean },
): Promise<ProcessResult> {
  const log = deps.logger ?? (() => undefined);

  if (Array.isArray(data.photos) && data.photos.length > 0) {
    log(`  skip ${data.uid}/${data.lieuId} — photos[] already present`);
    return { action: 'skip', reason: 'has-photos' };
  }

  const screenshotPath = data.sourceInstagram?.screenshotStoragePath;
  if (!screenshotPath || typeof screenshotPath !== 'string') {
    log(`  skip ${data.uid}/${data.lieuId} — no screenshotStoragePath`);
    return { action: 'skip', reason: 'no-screenshot' };
  }

  if (!data.createdAt) {
    log(`  skip ${data.uid}/${data.lieuId} — no createdAt`);
    return { action: 'skip', reason: 'no-created-at' };
  }

  const { buffer, contentType } = await deps.downloadImage(screenshotPath);
  const mediaType = contentType || 'image/jpeg';
  const base64 = buffer.toString('base64');

  let bbox: Bbox | null = null;
  try {
    const res = await deps.extractBboxOnly(base64, mediaType);
    bbox = res.photoBoundingBox ?? null;
  } catch (err) {
    log(`  ! ${data.uid}/${data.lieuId} — extract failed: ${(err as Error).message}`);
    // Fall through with bbox=null → upload raw as-is. A failed extract is
    // not a reason to skip: the migration's whole point is to move every doc
    // onto the photos[] schema, even ones we can't clean.
  }

  let uploadBuffer: Buffer;
  let cropped = false;
  if (bbox) {
    try {
      uploadBuffer = await deps.cropImage(buffer, bbox);
      cropped = true;
    } catch (err) {
      log(
        `  ! ${data.uid}/${data.lieuId} — crop failed, falling back to raw: ${(err as Error).message}`,
      );
      uploadBuffer = buffer;
    }
  } else {
    uploadBuffer = buffer;
  }

  const photoId = deps.generatePhotoId();
  const newPath = `users/${data.uid}/photos/${data.lieuId}/${photoId}.jpg`;
  const photos: PhotoEntry[] = [
    { storagePath: newPath, source: 'insta', addedAt: data.createdAt },
  ];

  log(
    `  ${data.uid}/${data.lieuId} → ${newPath} (${cropped ? 'cropped' : 'raw'})${
      opts.dryRun ? ' [dry-run]' : ''
    }`,
  );
  if (opts.dryRun) {
    // Print the payload we would have written so the operator can eyeball it
    // before the real run. addedAt is opaque (Timestamp) — sub it in for clarity.
    log(
      `     photos = ${JSON.stringify(
        photos.map((p) => ({ ...p, addedAt: '<original createdAt>' })),
      )}`,
    );
  }

  if (!opts.dryRun) {
    await deps.uploadImage(newPath, uploadBuffer, 'image/jpeg');
    await deps.writePhotos(data.uid, data.lieuId, photos);
  }

  return { action: 'migrate', photos, cropped, dryRun: opts.dryRun };
}
