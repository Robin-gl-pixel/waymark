/**
 * Backfill existing Lieu docs to the new `photos[]` schema (see #34 / #37).
 *
 * For every /users/{uid}/lieux/{lieuId} doc across all users:
 *   1. Skip if `photos[]` is already present (idempotent).
 *   2. Download `sourceInstagram.screenshotStoragePath` from Storage.
 *   3. Call the `extract` Cloud Function with `bboxOnly: true` — server
 *      returns just `photoBoundingBox` (or null when the bbox fails the
 *      sanity check from #36). Keeps Claude cost minimal (~$0.0001 per pin).
 *   4. If bbox valid → crop with sharp and upload to
 *      users/{uid}/photos/{lieuId}/{photoId}.jpg. If invalid → upload the
 *      raw screenshot bytes to the same new path.
 *   5. Firestore transaction: write
 *      `photos: [{ storagePath: <newPath>, source: 'insta', addedAt: <original createdAt> }]`.
 *
 * The old `sourceInstagram.screenshotStoragePath` object is INTENTIONALLY not
 * deleted from Storage — a later cleanup pass handles that once we're sure
 * every doc migrated cleanly. Prevents data loss if the migration mis-fires.
 *
 * The pure per-doc processor lives in `scripts/lib/backfillLieuPhotos.ts` so
 * the unit tests can import it without dragging in firebase-admin / sharp.
 *
 * Prerequisites:
 *   1. Firebase Admin SDK service account key at /secrets/service-account.json
 *   2. FIREBASE_WEB_API_KEY env var — used to exchange the admin-minted custom
 *      token for an ID token accepted by the callable `extract` endpoint.
 *   3. `firebase-admin` + `tsx` + `sharp` reachable at runtime (sharp is a
 *      Cloud Function dep — resolve it from `functions/node_modules` via
 *      NODE_PATH or add it locally to root).
 *
 * Usage:
 *   npx tsx scripts/backfill-lieu-photos.ts --dry-run   # preview, no writes
 *   npx tsx scripts/backfill-lieu-photos.ts             # actually migrate
 */
import * as fs from 'fs';
import * as path from 'path';
import { processDoc, ProcessDeps, Bbox } from './lib/backfillLieuPhotos';

// Deployed extract callable endpoint (europe-west1). Kept in sync with
// FirebaseLieuxService.EXTRACT_URL — the callable is invoked over its Cloud
// Run URL because RN's fetch can't reuse the JS SDK's httpsCallable wrapper.
const EXTRACT_URL = 'https://extract-7ypjacicka-ew.a.run.app';

const DRY = process.argv.includes('--dry-run');
const KEY_PATH = path.resolve(__dirname, '..', 'secrets', 'service-account.json');

async function mintExtractIdToken(admin: any): Promise<string> {
  // The `extract` callable checks request.auth.uid — admin creds alone don't
  // satisfy that. Mint a custom token for a synthetic uid, exchange it via
  // identityToolkit for an ID token, then use the ID token as a Bearer.
  const customToken = await admin.auth().createCustomToken('backfill-lieu-photos');
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) {
    throw new Error(
      'FIREBASE_WEB_API_KEY env var not set. Grab it from Firebase Console → Project settings → General → Web API Key.',
    );
  }
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `identityToolkit signInWithCustomToken failed: ${res.status} ${text.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as { idToken?: string };
  if (!json.idToken) throw new Error('No idToken in identityToolkit response');
  return json.idToken;
}

async function main() {
  console.log(`=== Backfill Lieu photos[] ${DRY ? '(DRY RUN)' : ''} ===`);

  if (!fs.existsSync(KEY_PATH)) {
    console.error(`\nMissing service account key at ${KEY_PATH}`);
    console.error('See scripts/README.md for how to generate it.\n');
    process.exit(1);
  }

  // Lazy CJS-require so the pure processor stays importable from tests
  // without firebase-admin / sharp being installed / type-resolvable.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const admin = require('firebase-admin');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require('sharp');

  admin.initializeApp({
    credential: admin.credential.cert(KEY_PATH),
    projectId: 'mappies-7748d',
    storageBucket: 'mappies-7748d.appspot.com',
  });

  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  const idToken = await mintExtractIdToken(admin);

  const deps: ProcessDeps = {
    downloadImage: async (storagePath) => {
      const file = bucket.file(storagePath);
      const [buffer] = await file.download();
      const [meta] = await file.getMetadata();
      return { buffer, contentType: (meta.contentType as string) || 'image/jpeg' };
    },
    extractBboxOnly: async (base64, mediaType) => {
      const res = await fetch(EXTRACT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: { imageBase64: base64, mediaType, bboxOnly: true },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`extract HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as {
        result?: { photoBoundingBox?: Bbox | null };
      };
      return { photoBoundingBox: json.result?.photoBoundingBox ?? null };
    },
    cropImage: async (buffer, bbox) => {
      const meta = await sharp(buffer).metadata();
      const W = meta.width ?? 0;
      const H = meta.height ?? 0;
      if (!W || !H) throw new Error('Image has no width/height');
      const left = Math.max(0, Math.min(W - 1, Math.round(bbox.x * W)));
      const top = Math.max(0, Math.min(H - 1, Math.round(bbox.y * H)));
      const width = Math.max(1, Math.min(W - left, Math.round(bbox.w * W)));
      const height = Math.max(1, Math.min(H - top, Math.round(bbox.h * H)));
      return sharp(buffer).extract({ left, top, width, height }).jpeg({ quality: 88 }).toBuffer();
    },
    uploadImage: async (storagePath, buffer, contentType) => {
      await bucket.file(storagePath).save(buffer, { contentType });
    },
    writePhotos: async (uid, lieuId, photos) => {
      const ref = db.doc(`users/${uid}/lieux/${lieuId}`);
      await db.runTransaction(async (tx: any) => {
        tx.update(ref, { photos });
      });
    },
    generatePhotoId: () => Math.random().toString(36).slice(2, 12),
    logger: (msg) => console.log(msg),
  };

  const snap = await db.collectionGroup('lieux').get();
  console.log(`Found ${snap.size} lieux total.`);

  const counts = { migrated: 0, skipped: 0, failed: 0, cropped: 0, raw: 0 };

  for (const doc of snap.docs) {
    const data = doc.data();
    const uid = doc.ref.parent.parent?.id;
    if (!uid) {
      console.warn(`  skip ${doc.ref.path} — could not resolve uid`);
      counts.skipped += 1;
      continue;
    }
    try {
      const result = await processDoc(
        {
          uid,
          lieuId: doc.id,
          photos: data.photos,
          sourceInstagram: data.sourceInstagram,
          createdAt: data.createdAt,
        },
        deps,
        { dryRun: DRY },
      );
      if (result.action === 'skip') counts.skipped += 1;
      else {
        counts.migrated += 1;
        if (result.cropped) counts.cropped += 1;
        else counts.raw += 1;
      }
    } catch (err) {
      console.error(`  ! ${doc.ref.path} — ${(err as Error).message}`);
      counts.failed += 1;
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Migrated: ${counts.migrated} (cropped: ${counts.cropped}, raw: ${counts.raw})`);
  console.log(`Skipped:  ${counts.skipped}`);
  console.log(`Failed:   ${counts.failed}`);
  if (DRY) console.log('(dry run — no Firestore writes, no Storage uploads)');
}

// Only run when invoked directly (npx tsx scripts/backfill-lieu-photos.ts).
// Importing the file from a test must not kick off the CLI or hit Firebase.
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
