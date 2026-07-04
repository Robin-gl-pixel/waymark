/**
 * Seed the 4 Amble Curated accounts (@amble.paris.cool / .culturel / .chic / .food).
 *
 * Prerequisites:
 *   1. Firebase Admin SDK service account key at /secrets/service-account.json
 *   2. `npm install firebase-admin --save-dev` in the repo root
 *
 * Usage:
 *   npx tsx scripts/seed-curated-accounts.ts
 *
 * This is a one-shot idempotent script:
 *   - Creates 4 auth users (or reuses if they exist) with fake emails
 *     `curated+cool@amble.internal`, etc. (never used for login).
 *   - Writes their /users/{uid} docs with isCurated: true, isPublic: true.
 *   - Reserves the 4 usernames in a /usernames/{lowercase} index doc so no
 *     regular user can steal them.
 *
 * Once accounts exist, use `scripts/seed-curated-pins.ts` (TODO — pending
 *   the curation playbook execution by Robin) to bulk-import the 60-80 pins.
 */
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const KEY_PATH = path.resolve(__dirname, '..', 'secrets', 'service-account.json');
if (!fs.existsSync(KEY_PATH)) {
  console.error(`\nMissing service account key at ${KEY_PATH}`);
  console.error('Download it from Firebase Console → Project Settings → Service accounts → Generate new private key.');
  console.error('Save it to /secrets/service-account.json (gitignored).\n');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(KEY_PATH),
  projectId: 'mappies-7748d',
});

const db = admin.firestore();
const auth = admin.auth();

interface CuratedAccount {
  username: string;
  displayName: string;
  bio: string;
}

const CURATED_ACCOUNTS: CuratedAccount[] = [
  {
    username: 'amble.paris.cool',
    displayName: 'Amble Cool',
    bio: 'Les spots parisiens qu\'on trouve après un an sur place — pas avant. Curation officielle Amble.',
  },
  {
    username: 'amble.paris.culturel',
    displayName: 'Amble Culturel',
    bio: 'Ce que Paris a de mieux à te faire lire, entendre, regarder. Curation officielle Amble.',
  },
  {
    username: 'amble.paris.chic',
    displayName: 'Amble Chic',
    bio: 'Quand tu veux marquer le coup, sans regretter la note. Curation officielle Amble.',
  },
  {
    username: 'amble.paris.food',
    displayName: 'Amble Food',
    bio: 'Un lieu, un plat, une raison d\'y retourner. Curation officielle Amble.',
  },
];

async function ensureAuthUser(username: string, displayName: string): Promise<string> {
  const email = `curated+${username.split('.').pop()}@amble.internal`;
  try {
    const user = await auth.getUserByEmail(email);
    console.log(`  → auth user exists: ${user.uid} (${email})`);
    return user.uid;
  } catch (err: any) {
    if (err.code !== 'auth/user-not-found') throw err;
    const user = await auth.createUser({
      email,
      emailVerified: true,
      displayName,
      disabled: false,
    });
    console.log(`  → created auth user: ${user.uid} (${email})`);
    return user.uid;
  }
}

async function seedAccount(account: CuratedAccount) {
  console.log(`\nSeeding @${account.username}...`);
  const uid = await ensureAuthUser(account.username, account.displayName);
  const now = admin.firestore.FieldValue.serverTimestamp();

  await db.doc(`users/${uid}`).set({
    uid,
    username: account.username,
    displayName: account.displayName,
    email: null,
    isPublic: true,
    isCurated: true,
    followersCount: 0,
    followingCount: 0,
    avatarUrl: null,
    bio: account.bio,
    usernameChangedAt: null,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  await db.doc(`usernames/${account.username.toLowerCase()}`).set({
    uid,
    reservedAt: now,
  }, { merge: true });

  console.log(`  ✓ users/${uid} written with isCurated: true`);
  console.log(`  ✓ usernames/${account.username.toLowerCase()} reserved`);
}

async function main() {
  console.log('=== Amble Curated accounts seed ===');
  console.log(`Project: mappies-7748d`);
  console.log(`Accounts: ${CURATED_ACCOUNTS.length}\n`);

  for (const account of CURATED_ACCOUNTS) {
    await seedAccount(account);
  }

  console.log('\n=== Done ===');
  console.log('Next step: run scripts/seed-curated-pins.ts (once written) to populate 60-80 pins.');
  console.log('Or use the Amble app itself: log in as any of the accounts and add pins manually.');
  console.log('The auth password can be set via `firebase auth:import` or by triggering a password reset.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
