# Testing the Social Layer

Guide for exercising Waymark's social features (follow / feed / block / report / delete cascade) end-to-end, at each level of the testing pyramid.

**Status**: living doc, updated as slices land.
**Related**: `docs/PRD.md` V1 Social Layer, `docs/curation-playbook.md`.

---

## Layers

### 1. Contract tests (fastest, most trusted)

The `socialService` seam is the single testable contract. All social slices are validated via `src/services/__tests__/socialService.test.ts` running against `InMemorySocialService`.

```bash
npx jest src/services/__tests__/socialService.test.ts
```

Pattern is identical to the existing `lieuxService.test.ts` — one describe block per method group (Profile / Follow / Block / Report / Feed / Activity).

**What to test at this level**: any behavior the interface promises to consumers. E.g. `getFeed` sorted desc, `block` cascades to unfollow, `upsertProfile` throws on invalid regex.

**What NOT to test at this level**: Firestore internals, Cloud Function triggers, UI rendering.

### 2. Cloud Function integration tests

Cloud Function triggers (follow → activity, save → activity, delete → cascade) need real Firestore semantics. Use the Firebase emulator.

```bash
# One-time setup (if not already installed)
firebase init emulators  # select firestore + functions
firebase emulators:start --only firestore,functions

# In another terminal, run the integration tests
cd functions && npm test
```

Emulator config (add to `firebase.json` if not present):

```json
"emulators": {
  "firestore": { "port": 8080 },
  "functions": { "port": 5001 },
  "auth": { "port": 9099 },
  "ui": { "enabled": true, "port": 4000 }
}
```

**What to test at this level**: trigger side effects (activity written, counts incremented, cascade nullifies). Skip UI, skip rules (those are Layer 3).

### 3. Firestore rules tests

The `@firebase/rules-unit-testing` library exposes rules assertions without a live emulator.

```typescript
// functions/src/__tests__/firestore.rules.test.ts
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
// ...
await assertSucceeds(publicUserDoc.get());
await assertFails(privateUserDoc.get());
```

**What to test**: the invariants the rules enforce. E.g. "an auth user cannot read another user's `blocks` sub-collection", "an anonymous user cannot list `reports`".

### 4. Manual golden path (post-slice)

After a slice PR lands, run through the golden path on the sim before considering the slice done.

See `docs/PRD.md` V1 Social Layer → Testing Decisions → "Golden path E2E" for the 9-step checklist.

Two test accounts are helpful — either:
- Sign in with 2 Apple IDs on 2 sims, OR
- Use the `__DEV__` anonymous sign-in bypass (`AuthScreen`) to spawn multiple ephemeral users.

---

## Local dev setup for testing

### Env: use the emulator by default in dev

Once the emulator config is in `firebase.json`, point the app at it in dev:

```typescript
// src/auth/firebase.ts (add near the top of file, after firebase init)
if (__DEV__ && process.env.EXPO_PUBLIC_USE_EMULATOR === '1') {
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFunctionsEmulator(functions, 'localhost', 5001);
}
```

Then run with:

```bash
EXPO_PUBLIC_USE_EMULATOR=1 npm start
```

### Seed test data quickly

The `scripts/seed-curated-accounts.ts` script also works against the emulator when `FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx scripts/seed-curated-accounts.ts` is used.

---

## Per-slice manual verification

### #10 Username picker
- Fresh signup → asked to pick a `@handle` → validation shows on regex fail, taken, reserved
- `MyProfileScreen` shows the chosen `@handle`

### #11 Read profiles + search
- SearchUsersScreen: exact `@waymark.paris.cool` returns the profile ; partial match returns empty ; private user returns empty
- UserProfileScreen: shows pins + counts + no interactive actions yet

### #12 Follow + feed
- Follow `@waymark.paris.cool` → `followingCount` = 1 on my profile, `followersCount` = 1 on cool's
- Réseau tab: shows cool's pins tri desc
- Unfollow: counts decrement, feed empties

### #13 Save from network
- Tap a pin from the feed → detail → "Sauver dans ma carte"
- Pin appears in my carte with "via @waymark.paris.cool"
- Screenshot preserved (referenced, not duplicated)
- Original owner receives activity item

### #14 Activity + badges
- After someone follows me / saves my pin: badge appears on Profil tab
- Opening MyProfileScreen marks all as read → badge disappears
- Activity list tap → target screen (LieuDetail or UserProfile)

### #15 Block + Report
- Block `@X` → they disappear from my feed, forced unfollow both directions
- Report `@X` for "spam" → Slack channel receives the notification

### #16 Settings
- Toggle privacy → my pins disappear from a follower's feed
- Edit username → check 30-day cooldown after change
- Invite friend → iOS share sheet with template

### #17 Onboarding + SeededFollow
- Fresh signup: 3 slides → PickUsername → SeededFollow (toggles ON) → Map
- All 4 Curated accounts followed by default

### #18 Delete cascade
- Alice deletes account → Bob's pin loses "via @alice" attribution silently, pin stays
- Idempotent: delete + re-delete doesn't error

---

## CI (V1.1 — not blocking V1 ship)

For V1 we manually run the tests locally before each PR merge. Post-V1, add:
- GitHub Actions workflow: `.github/workflows/ci.yml`
- Run `npm test` (root + functions) on every PR
- Firestore rules tests + emulator integration tests
- Block merge on red

Details in a follow-up doc when we set that up.
