/**
 * # Runs against the LOCAL Firestore emulator only. NEVER runs against prod (guarded by check).
 *
 * Populates the running Firebase Emulator Suite with fake users, follow
 * relationships, and lieux (pins) for local development. Zero prod impact:
 * the script hard-refuses to run unless the emulator env vars are set, and
 * uses a fake project id + no service account credential.
 *
 * Prerequisites:
 *   1. `firebase emulators:start --only auth,firestore,functions,storage`
 *      (or `npm run emulator:start`) running in another terminal.
 *   2. `npm install --save-dev firebase-admin tsx` (see scripts/README.md).
 *
 * Usage:
 *   npm run emulator:seed
 *
 * The npm script sets FIRESTORE_EMULATOR_HOST=localhost:8080 and
 * FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 — but this file also sets them
 * programmatically as a defence-in-depth in case someone runs it directly.
 *
 * Idempotent: re-running upserts docs by uid / deterministic ids. Safe to
 * run again after `firebase emulators:start --import` restores state.
 *
 * What gets written:
 *   - 10 fake auth users (@alice ... @jack) with emails at @waymark.test
 *   - 10 /users/{uid} docs (2 with isCurated: true, 1 with isPublic: false)
 *   - 10 /usernames/{lowercase} reservation docs
 *   - ~30 fake lieux distributed across users (Test — prefix, invented coords
 *     around Paris — NOT real places, satisfies curation playbook)
 *   - Follow edges: alice → bob, alice → charlie, charlie → alice
 */

// Force the Admin SDK to hit the local emulator, not prod. Also required
// before `require('firebase-admin')` — the SDK reads these at module init.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? 'localhost:9099';

// Belt-and-braces guard: refuse to run if for any reason the env is not
// pointing at localhost. Prevents someone from accidentally seeding prod
// by unsetting the env vars after the assignment above.
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '';
if (!firestoreHost.startsWith('localhost') && !firestoreHost.startsWith('127.0.0.1')) {
  console.error(`\nRefusing to run: FIRESTORE_EMULATOR_HOST is "${firestoreHost}", not localhost.\n`);
  process.exit(1);
}
if (!authHost.startsWith('localhost') && !authHost.startsWith('127.0.0.1')) {
  console.error(`\nRefusing to run: FIREBASE_AUTH_EMULATOR_HOST is "${authHost}", not localhost.\n`);
  process.exit(1);
}

import * as admin from 'firebase-admin';

// projectId matches the singleProjectMode + .firebaserc value so Firestore
// scopes to the same emulator dataset the app reads. No credential — with
// FIRESTORE_EMULATOR_HOST set, the SDK uses an insecure emulator token.
admin.initializeApp({
  projectId: 'mappies-7748d',
});

const db = admin.firestore();
const auth = admin.auth();

interface FakeUser {
  username: string;
  displayName: string;
  isPublic: boolean;
  isCurated: boolean;
}

const FAKE_USERS: FakeUser[] = [
  { username: 'alice', displayName: 'Test — Alice', isPublic: true, isCurated: false },
  { username: 'bob', displayName: 'Test — Bob', isPublic: true, isCurated: false },
  { username: 'charlie', displayName: 'Test — Charlie', isPublic: true, isCurated: false },
  { username: 'dana', displayName: 'Test — Dana', isPublic: true, isCurated: false },
  { username: 'eve', displayName: 'Test — Eve', isPublic: false, isCurated: false }, // private profile
  { username: 'frank', displayName: 'Test — Frank', isPublic: true, isCurated: false },
  { username: 'grace', displayName: 'Test — Grace', isPublic: true, isCurated: false },
  { username: 'henri', displayName: 'Test — Henri', isPublic: true, isCurated: false },
  { username: 'iris', displayName: 'Test — Iris', isPublic: true, isCurated: true }, // fake curated
  { username: 'jack', displayName: 'Test — Jack', isPublic: true, isCurated: true }, // fake curated
];

type Category = 'resto' | 'bar' | 'café' | 'activité' | 'musée' | 'hôtel' | 'autre';

interface FakePin {
  slug: string;              // deterministic id → idempotent upsert
  name: string;              // "Test — <invented>" so it can't be confused with a real place
  category: Category;
  latOffset: number;         // added to a Paris centre
  lngOffset: number;
  ownerUsername: string;
}

// Paris centre — jitter with offsets so pins land in the region but are
// obviously synthetic (no lookups against a real geocoder).
const PARIS_LAT = 48.8566;
const PARIS_LNG = 2.3522;

const FAKE_PINS: FakePin[] = [
  // alice — 4 pins
  { slug: 'alice-01', name: 'Test — Café de la Fabrique Imaginaire', category: 'café', latOffset: 0.010, lngOffset: -0.012, ownerUsername: 'alice' },
  { slug: 'alice-02', name: 'Test — Bar du Voyageur Fictif', category: 'bar', latOffset: -0.008, lngOffset: 0.015, ownerUsername: 'alice' },
  { slug: 'alice-03', name: 'Test — Bistrot de Nulle Part', category: 'resto', latOffset: 0.020, lngOffset: 0.008, ownerUsername: 'alice' },
  { slug: 'alice-04', name: 'Test — Musée du Rien', category: 'musée', latOffset: -0.015, lngOffset: -0.020, ownerUsername: 'alice' },
  // bob — 3 pins
  { slug: 'bob-01', name: 'Test — Bar des Placeholders', category: 'bar', latOffset: 0.005, lngOffset: 0.030, ownerUsername: 'bob' },
  { slug: 'bob-02', name: 'Test — Le Faux Comptoir', category: 'resto', latOffset: -0.025, lngOffset: 0.005, ownerUsername: 'bob' },
  { slug: 'bob-03', name: 'Test — Hôtel des Tests', category: 'hôtel', latOffset: 0.012, lngOffset: -0.008, ownerUsername: 'bob' },
  // charlie — 4 pins
  { slug: 'charlie-01', name: 'Test — Café Sans Adresse', category: 'café', latOffset: 0.018, lngOffset: 0.022, ownerUsername: 'charlie' },
  { slug: 'charlie-02', name: 'Test — Le Bar Théorique', category: 'bar', latOffset: -0.010, lngOffset: -0.005, ownerUsername: 'charlie' },
  { slug: 'charlie-03', name: 'Test — Restaurant des Mocks', category: 'resto', latOffset: 0.007, lngOffset: 0.017, ownerUsername: 'charlie' },
  { slug: 'charlie-04', name: 'Test — Activité Zéro', category: 'activité', latOffset: -0.020, lngOffset: 0.010, ownerUsername: 'charlie' },
  // dana — 3 pins
  { slug: 'dana-01', name: 'Test — Café des Fixtures', category: 'café', latOffset: 0.023, lngOffset: -0.017, ownerUsername: 'dana' },
  { slug: 'dana-02', name: 'Test — Bar des Snapshots', category: 'bar', latOffset: -0.013, lngOffset: 0.025, ownerUsername: 'dana' },
  { slug: 'dana-03', name: 'Test — Le Bouillon Simulé', category: 'resto', latOffset: 0.001, lngOffset: -0.028, ownerUsername: 'dana' },
  // eve (private) — 2 pins
  { slug: 'eve-01', name: 'Test — Café Privé', category: 'café', latOffset: 0.006, lngOffset: 0.003, ownerUsername: 'eve' },
  { slug: 'eve-02', name: 'Test — Bar Confidentiel', category: 'bar', latOffset: -0.017, lngOffset: -0.011, ownerUsername: 'eve' },
  // frank — 3 pins
  { slug: 'frank-01', name: 'Test — Le Générique', category: 'resto', latOffset: 0.026, lngOffset: 0.014, ownerUsername: 'frank' },
  { slug: 'frank-02', name: 'Test — Café des Stubs', category: 'café', latOffset: -0.004, lngOffset: 0.027, ownerUsername: 'frank' },
  { slug: 'frank-03', name: 'Test — Bar Latence Zéro', category: 'bar', latOffset: 0.014, lngOffset: -0.024, ownerUsername: 'frank' },
  // grace — 2 pins
  { slug: 'grace-01', name: 'Test — Musée des Assertions', category: 'musée', latOffset: -0.022, lngOffset: 0.019, ownerUsername: 'grace' },
  { slug: 'grace-02', name: 'Test — Hôtel du Rebasage', category: 'hôtel', latOffset: 0.009, lngOffset: 0.032, ownerUsername: 'grace' },
  // henri — 3 pins
  { slug: 'henri-01', name: 'Test — Bistrot des Retries', category: 'resto', latOffset: 0.017, lngOffset: -0.030, ownerUsername: 'henri' },
  { slug: 'henri-02', name: 'Test — Café Idempotent', category: 'café', latOffset: -0.019, lngOffset: 0.007, ownerUsername: 'henri' },
  { slug: 'henri-03', name: 'Test — Activité Différée', category: 'activité', latOffset: 0.003, lngOffset: 0.033, ownerUsername: 'henri' },
  // iris — 3 pins (curated)
  { slug: 'iris-01', name: 'Test — Curated Café Alpha', category: 'café', latOffset: 0.011, lngOffset: 0.011, ownerUsername: 'iris' },
  { slug: 'iris-02', name: 'Test — Curated Resto Beta', category: 'resto', latOffset: -0.011, lngOffset: -0.011, ownerUsername: 'iris' },
  { slug: 'iris-03', name: 'Test — Curated Bar Gamma', category: 'bar', latOffset: 0.024, lngOffset: 0.024, ownerUsername: 'iris' },
  // jack — 3 pins (curated)
  { slug: 'jack-01', name: 'Test — Curated Musée Delta', category: 'musée', latOffset: -0.024, lngOffset: 0.020, ownerUsername: 'jack' },
  { slug: 'jack-02', name: 'Test — Curated Activité Epsilon', category: 'activité', latOffset: 0.028, lngOffset: -0.006, ownerUsername: 'jack' },
  { slug: 'jack-03', name: 'Test — Curated Autre Zeta', category: 'autre', latOffset: -0.006, lngOffset: 0.028, ownerUsername: 'jack' },
];

interface FollowEdge {
  followerUsername: string;
  followingUsername: string;
}

const FOLLOW_EDGES: FollowEdge[] = [
  { followerUsername: 'alice', followingUsername: 'bob' },
  { followerUsername: 'alice', followingUsername: 'charlie' },
  { followerUsername: 'charlie', followingUsername: 'alice' },
];

async function ensureAuthUser(username: string, displayName: string): Promise<string> {
  // Deterministic email so re-running finds the same user.
  const email = `${username}@waymark.test`;
  try {
    const user = await auth.getUserByEmail(email);
    return user.uid;
  } catch (err: any) {
    if (err.code !== 'auth/user-not-found') throw err;
    const user = await auth.createUser({
      email,
      emailVerified: true,
      displayName,
      disabled: false,
    });
    return user.uid;
  }
}

async function seedUsers(): Promise<Map<string, string>> {
  console.log(`\nSeeding ${FAKE_USERS.length} fake users...`);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const usernameToUid = new Map<string, string>();

  for (const u of FAKE_USERS) {
    const uid = await ensureAuthUser(u.username, u.displayName);
    usernameToUid.set(u.username, uid);

    await db.doc(`users/${uid}`).set({
      uid,
      username: u.username,
      displayName: u.displayName,
      email: `${u.username}@waymark.test`,
      isPublic: u.isPublic,
      isCurated: u.isCurated,
      followersCount: 0,      // recomputed below after follow edges land
      followingCount: 0,
      avatarUrl: null,
      bio: null,
      usernameChangedAt: null,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    await db.doc(`usernames/${u.username.toLowerCase()}`).set({
      uid,
      reservedAt: now,
    }, { merge: true });

    console.log(`  ✓ @${u.username} (${uid.slice(0, 8)}…)  public=${u.isPublic}  curated=${u.isCurated}`);
  }
  return usernameToUid;
}

async function seedPins(usernameToUid: Map<string, string>) {
  console.log(`\nSeeding ${FAKE_PINS.length} fake pins...`);
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const pin of FAKE_PINS) {
    const uid = usernameToUid.get(pin.ownerUsername);
    if (!uid) throw new Error(`Unknown owner @${pin.ownerUsername}`);

    // Deterministic doc id per pin → re-running upserts in place.
    await db.doc(`users/${uid}/lieux/${pin.slug}`).set({
      id: pin.slug,
      userId: uid,
      name: pin.name,
      city: 'Paris',
      country: 'France',
      address: `${pin.slug} — Test address (emulator seed)`,
      lat: PARIS_LAT + pin.latOffset,
      lng: PARIS_LNG + pin.lngOffset,
      category: pin.category,
      description: `Fake pin for local emulator testing. Owner: @${pin.ownerUsername}.`,
      sourceInstagram: {
        author: null,
        screenshotStoragePath: '',
      },
      userNotes: null,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
  }
  console.log(`  ✓ ${FAKE_PINS.length} pins written`);
}

async function seedFollows(usernameToUid: Map<string, string>) {
  console.log(`\nSeeding ${FOLLOW_EDGES.length} follow edges...`);
  const now = admin.firestore.FieldValue.serverTimestamp();

  // Track per-user counts so we can update the denormalized fields in one
  // pass at the end (matches how the Cloud Function keeps them in sync).
  const followingCount = new Map<string, number>();
  const followersCount = new Map<string, number>();

  for (const edge of FOLLOW_EDGES) {
    const followerUid = usernameToUid.get(edge.followerUsername);
    const followingUid = usernameToUid.get(edge.followingUsername);
    if (!followerUid || !followingUid) {
      throw new Error(`Missing uid for edge ${edge.followerUsername} → ${edge.followingUsername}`);
    }

    // Mirror the two-sided write used by the client so both sides can query.
    // Exact sub-collection layout mirrors what socialService expects at
    // /users/{uid}/following/{targetUid} and /users/{targetUid}/followers/{followerUid}.
    await db.doc(`users/${followerUid}/following/${followingUid}`).set({
      uid: followingUid,
      username: edge.followingUsername,
      createdAt: now,
    }, { merge: true });

    await db.doc(`users/${followingUid}/followers/${followerUid}`).set({
      uid: followerUid,
      username: edge.followerUsername,
      createdAt: now,
    }, { merge: true });

    followingCount.set(followerUid, (followingCount.get(followerUid) ?? 0) + 1);
    followersCount.set(followingUid, (followersCount.get(followingUid) ?? 0) + 1);

    console.log(`  ✓ @${edge.followerUsername} → @${edge.followingUsername}`);
  }

  // Denormalize counts back onto the user docs. Any user with no edge stays
  // at 0 (set during seedUsers).
  const allUids = new Set<string>([...followingCount.keys(), ...followersCount.keys()]);
  for (const uid of allUids) {
    await db.doc(`users/${uid}`).set({
      followingCount: followingCount.get(uid) ?? 0,
      followersCount: followersCount.get(uid) ?? 0,
      updatedAt: now,
    }, { merge: true });
  }
}

async function main() {
  console.log('=== Waymark emulator seed ===');
  console.log(`Firestore: ${firestoreHost}`);
  console.log(`Auth:      ${authHost}`);

  const usernameToUid = await seedUsers();
  await seedPins(usernameToUid);
  await seedFollows(usernameToUid);

  console.log('\n=== Done ===');
  console.log('Emulator UI: http://localhost:4000');
  console.log('Log in via the app with any of: alice, bob, charlie, dana, eve, frank, grace, henri, iris, jack');
  console.log('(emails: {username}@waymark.test — set a password in the emulator UI if needed)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
