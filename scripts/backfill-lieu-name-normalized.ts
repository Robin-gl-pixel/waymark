/**
 * Backfill `nameNormalized` on every existing /users/{uid}/lieux/{id} doc.
 *
 * The extract Cloud Function (functions/src/lib/existingLieu.ts) queries on
 * `nameNormalized` — docs written before that field existed won't show up as
 * dedup hits. This script fixes them.
 *
 * Idempotent: only writes when the field is missing or stale.
 *
 * Prerequisites:
 *   1. Firebase Admin SDK service account key at /secrets/service-account.json
 *   2. `firebase-admin` + `tsx` installed (already devDeps in package.json)
 *
 * Usage:
 *   npx tsx scripts/backfill-lieu-name-normalized.ts [--dry-run]
 */
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { normalizeName } from '../functions/src/lib/normalize';

const DRY = process.argv.includes('--dry-run');
const KEY_PATH = path.resolve(__dirname, '..', 'secrets', 'service-account.json');

if (!fs.existsSync(KEY_PATH)) {
  console.error(`\nMissing service account key at ${KEY_PATH}`);
  console.error('See NEXT-STEPS.md action #1 for how to generate it.\n');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(KEY_PATH),
  projectId: 'mappies-7748d',
});

const db = admin.firestore();

async function main() {
  console.log(`=== Backfill nameNormalized ${DRY ? '(DRY RUN)' : ''} ===`);

  const snap = await db.collectionGroup('lieux').get();
  console.log(`Found ${snap.size} lieux total.`);

  let updated = 0;
  let skipped = 0;
  let batch = db.batch();
  let batchOps = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const name = typeof data.name === 'string' ? data.name : '';
    if (!name) {
      console.warn(`  skip ${doc.ref.path} — no name`);
      skipped += 1;
      continue;
    }
    const expected = normalizeName(name);
    const current = typeof data.nameNormalized === 'string' ? data.nameNormalized : null;
    if (current === expected) {
      skipped += 1;
      continue;
    }
    console.log(`  ${doc.ref.path}  "${name}" → "${expected}"`);
    if (!DRY) {
      batch.update(doc.ref, { nameNormalized: expected });
      batchOps += 1;
      // Firestore batches cap at 500 ops. Flush at 400 to stay safe.
      if (batchOps >= 400) {
        await batch.commit();
        console.log(`  committed batch of ${batchOps}`);
        batch = db.batch();
        batchOps = 0;
      }
    }
    updated += 1;
  }

  if (!DRY && batchOps > 0) {
    await batch.commit();
    console.log(`  committed final batch of ${batchOps}`);
  }

  console.log(`\n=== Done ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (already correct or no name): ${skipped}`);
  if (DRY) console.log('(dry run — nothing was written)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
