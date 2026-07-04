/**
 * Firestore rules unit tests for `users/{userId}/lieux/{lieuId}` (issue #40).
 *
 * These tests exercise the follower-gate on pin reads as a black-box: given an
 * auth context X and a target path Y, does the rule engine allow the read?
 *
 * They run against the Firestore emulator via `@firebase/rules-unit-testing`,
 * which loads `firestore.rules` from the repo root and evaluates each op with
 * a fresh auth context. Emulator must be reachable on `localhost:8080`
 * (start it with `npm run emulator:start` at the repo root).
 *
 * First rules test file in the repo — patterns here (init/teardown, seeding
 * via `withSecurityRulesDisabled`, `assertSucceeds`/`assertFails`) are meant
 * as a template for future rules test files.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'amble-rules-test';
const OWNER_UID = 'owner-alice';
const FOLLOWER_UID = 'follower-bob';
const STRANGER_UID = 'stranger-carol';
const LIEU_ID = 'lieu-1';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  // Seed the world with the security-rules bypass. Two scenarios: a private
  // owner and a public owner — the same follower gate should apply to both.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // Owner profile — public flag toggled in each `describe` block below
    // via a per-block override. Default here = public.
    await setDoc(doc(db, `users/${OWNER_UID}`), {
      uid: OWNER_UID,
      username: 'alice',
      isPublic: true,
      isCurated: false,
      followersCount: 1,
      followingCount: 0,
    });

    // Follower relationship: follower-bob follows owner-alice.
    await setDoc(doc(db, `users/${OWNER_UID}/followers/${FOLLOWER_UID}`), {
      createdAt: new Date(),
    });

    // Owner has one pin.
    await setDoc(doc(db, `users/${OWNER_UID}/lieux/${LIEU_ID}`), {
      userId: OWNER_UID,
      name: 'Chez Alice',
      city: 'Paris',
      lat: 48.85,
      lng: 2.35,
    });
  });
});

describe('users/{userId}/lieux/{lieuId} — follower-gate (#40)', () => {
  it('owner can read their own pin', async () => {
    const ownerCtx = testEnv.authenticatedContext(OWNER_UID);
    await assertSucceeds(
      getDoc(doc(ownerCtx.firestore(), `users/${OWNER_UID}/lieux/${LIEU_ID}`)),
    );
  });

  it('follower can read the owner’s pin', async () => {
    const followerCtx = testEnv.authenticatedContext(FOLLOWER_UID);
    await assertSucceeds(
      getDoc(doc(followerCtx.firestore(), `users/${OWNER_UID}/lieux/${LIEU_ID}`)),
    );
  });

  it('non-follower is denied even when owner isPublic=true', async () => {
    // Default seed leaves the owner public — reasserted here for clarity.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${OWNER_UID}`), { isPublic: true }, { merge: true });
    });
    const strangerCtx = testEnv.authenticatedContext(STRANGER_UID);
    await assertFails(
      getDoc(doc(strangerCtx.firestore(), `users/${OWNER_UID}/lieux/${LIEU_ID}`)),
    );
  });

  it('non-follower is denied when owner isPublic=false', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${OWNER_UID}`), { isPublic: false }, { merge: true });
    });
    const strangerCtx = testEnv.authenticatedContext(STRANGER_UID);
    await assertFails(
      getDoc(doc(strangerCtx.firestore(), `users/${OWNER_UID}/lieux/${LIEU_ID}`)),
    );
  });

  it('unauthenticated caller is denied', async () => {
    const anonCtx = testEnv.unauthenticatedContext();
    await assertFails(
      getDoc(doc(anonCtx.firestore(), `users/${OWNER_UID}/lieux/${LIEU_ID}`)),
    );
  });

  it('list query on owner’s lieux collection is denied for a non-follower', async () => {
    const strangerCtx = testEnv.authenticatedContext(STRANGER_UID);
    await assertFails(getDocs(collection(strangerCtx.firestore(), `users/${OWNER_UID}/lieux`)));
  });

  it('list query on owner’s lieux collection is allowed for a follower', async () => {
    const followerCtx = testEnv.authenticatedContext(FOLLOWER_UID);
    await assertSucceeds(getDocs(collection(followerCtx.firestore(), `users/${OWNER_UID}/lieux`)));
  });
});
