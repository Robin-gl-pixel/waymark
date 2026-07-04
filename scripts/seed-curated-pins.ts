/**
 * Bulk-import curated pins for the 4 Pinti Curated accounts.
 *
 * Prerequisites:
 *   1. `scripts/seed-curated-accounts.ts` has been run at least once
 *      (the 4 accounts must exist).
 *   2. Curated JSON data in `data/curated-{account}.json` — see format below.
 *
 * Usage:
 *   npx tsx scripts/seed-curated-pins.ts [--dry-run]
 *
 * The script:
 *   - Reads data/curated-{cool,culturel,chic,food}.json
 *   - For each pin, looks up the account UID by username
 *   - Writes to /users/{uid}/lieux/{lieuId} — auto-id per pin
 *   - Idempotent via a `curatedId` field: if a pin with same `curatedId`
 *     already exists on this account, it's updated in place (upsert).
 *
 * JSON format per pin:
 *   {
 *     "curatedId": "cool-01-le-baratin",  // stable, unique per account
 *     "name": "Le Baratin",
 *     "city": "Paris",
 *     "country": "France",
 *     "address": "3 Rue Jouye-Rouve, 75020 Paris",
 *     "lat": 48.8729,
 *     "lng": 2.3831,
 *     "category": "bar",  // resto | bar | café | activité | musée | hôtel | autre
 *     "description": "Bar à vins historique de Belleville tenu par Raquel Carena. Carte de vins natures pointue, cuisine simple à midi.",
 *     "sourceAuthor": null  // curated content, no @author
 *   }
 */
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const KEY_PATH = path.resolve(__dirname, '..', 'secrets', 'service-account.json');
const DATA_DIR = path.resolve(__dirname, '..', 'data');

if (!fs.existsSync(KEY_PATH)) {
  console.error(`\nMissing service account key at ${KEY_PATH}`);
  process.exit(1);
}
if (!fs.existsSync(DATA_DIR)) {
  console.error(`\nMissing data dir at ${DATA_DIR}. Create it and add curated-{account}.json files.`);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(KEY_PATH),
  projectId: 'mappies-7748d',
});

const db = admin.firestore();

interface CuratedPin {
  curatedId: string;
  name: string;
  city: string;
  country: string;
  address: string;
  lat: number;
  lng: number;
  category: 'resto' | 'bar' | 'café' | 'activité' | 'musée' | 'hôtel' | 'autre';
  description: string;
  sourceAuthor: string | null;
}

const ACCOUNTS = ['cool', 'culturel', 'chic', 'food'] as const;

async function usernameToUid(username: string): Promise<string> {
  const snap = await db.collection('users').where('username', '==', username).limit(1).get();
  if (snap.empty) throw new Error(`No user with username ${username} — run seed-curated-accounts.ts first`);
  return snap.docs[0].id;
}

function validatePin(pin: any, source: string, index: number): CuratedPin {
  const requiredKeys = ['curatedId', 'name', 'city', 'country', 'address', 'lat', 'lng', 'category', 'description'];
  for (const k of requiredKeys) {
    if (!(k in pin)) throw new Error(`${source}[${index}] missing key: ${k}`);
  }
  if (typeof pin.lat !== 'number' || typeof pin.lng !== 'number') {
    throw new Error(`${source}[${index}] lat/lng must be numbers`);
  }
  const validCats = ['resto', 'bar', 'café', 'activité', 'musée', 'hôtel', 'autre'];
  if (!validCats.includes(pin.category)) {
    throw new Error(`${source}[${index}] invalid category: ${pin.category}`);
  }
  if (pin.description.length > 300) {
    throw new Error(`${source}[${index}] description exceeds 300 chars (${pin.description.length}). Trim per curation playbook (target 180-250).`);
  }
  return pin as CuratedPin;
}

async function seedAccount(account: typeof ACCOUNTS[number]) {
  const username = `pinti.paris.${account}`;
  const dataPath = path.join(DATA_DIR, `curated-${account}.json`);

  if (!fs.existsSync(dataPath)) {
    console.log(`  (skip) no data file at ${dataPath}`);
    return { added: 0, updated: 0 };
  }

  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`${dataPath}: root must be an array`);

  console.log(`\n@${username} — ${raw.length} pins in JSON`);

  const uid = await usernameToUid(username);
  const lieuxCol = db.collection('users').doc(uid).collection('lieux');
  const existing = await lieuxCol.get();
  const byCuratedId = new Map<string, string>();
  existing.docs.forEach((d) => {
    const cid = d.data().curatedId;
    if (cid) byCuratedId.set(cid, d.id);
  });

  let added = 0;
  let updated = 0;

  for (let i = 0; i < raw.length; i++) {
    const pin = validatePin(raw[i], `curated-${account}.json`, i);
    const existingDocId = byCuratedId.get(pin.curatedId);
    const targetDocId = existingDocId ?? lieuxCol.doc().id;

    const data = {
      userId: uid,
      name: pin.name,
      city: pin.city,
      country: pin.country,
      address: pin.address,
      lat: pin.lat,
      lng: pin.lng,
      category: pin.category,
      description: pin.description,
      sourceInstagram: {
        author: pin.sourceAuthor,
        screenshotStoragePath: '', // curated pins have no screenshot; UI must handle empty
      },
      userNotes: null,
      curatedId: pin.curatedId,
      createdAt: existingDocId ? undefined : admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (DRY_RUN) {
      console.log(`  [dry-run] ${existingDocId ? 'UPDATE' : 'CREATE'} ${pin.name} (curatedId=${pin.curatedId})`);
    } else {
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      await lieuxCol.doc(targetDocId).set(clean, { merge: true });
    }

    if (existingDocId) updated++;
    else added++;
  }

  return { added, updated };
}

async function main() {
  console.log('=== Pinti Curated pins seed ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'LIVE'}\n`);

  const totals = { added: 0, updated: 0 };
  for (const account of ACCOUNTS) {
    const result = await seedAccount(account);
    totals.added += result.added;
    totals.updated += result.updated;
  }

  console.log(`\n=== Done: ${totals.added} added, ${totals.updated} updated ===`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
