# Preflight checks

Reproducible checks run before merging risky changes. Each section is a
self-contained script — copy/paste, expect the noted status codes.

---

## Firestore rules — `users/{userId}/lieux/{lieuId}` follower gate (#40)

Verifies that pin reads are follower-gated: the owner and their followers can
read, anyone else — including authenticated strangers on a `isPublic=true`
profile — gets 403.

There are two runbooks: **emulator** (fast, no prod risk) and **prod** (final
gate after `firebase deploy --only firestore:rules`). The emulator runbook is
the canonical CI-shaped check; the prod runbook is the manual sanity check
after deploy.

### A. Emulator runbook (recommended)

Runs `firestore-tests/lieux.rules.test.ts` against a local emulator. This is
the same suite CI would run and covers all six acceptance-criteria cases in
one go.

```bash
# 1. In shell A: start the Firestore emulator.
firebase emulators:start --only firestore

# 2. In shell B (first time only): install rules-test workspace deps.
npm --prefix firestore-tests install

# 3. Still in shell B: run the suite.
npm run test:rules
```

Expected: 7 passing tests. Any failure means the rule change regressed or the
rules file was not saved.

### B. Prod runbook (post-deploy)

Uses the Firebase REST API to exercise the rule against real data. Requires
two throwaway test accounts (owner + non-follower) and their Firebase ID
tokens.

Setup (once):

```bash
export PROJECT_ID=mappies-7748d
export OWNER_UID=<owner-uid>
export OWNER_LIEU_ID=<a-real-pin-id-owned-by-owner>
export FOLLOWER_UID=<follower-uid>           # user who follows OWNER
export STRANGER_UID=<stranger-uid>           # user who does NOT follow OWNER
export FOLLOWER_ID_TOKEN=<firebase-id-token-for-follower>
export STRANGER_ID_TOKEN=<firebase-id-token-for-stranger>
```

Generate ID tokens with any signed-in test rig (the app itself works —
`getAuth().currentUser.getIdToken()` in a REPL / dev build). They live for one
hour.

Follower read — expect **HTTP 200**:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $FOLLOWER_ID_TOKEN" \
  "https://firestore.googleapis.com/v1/projects/$PROJECT_ID/databases/(default)/documents/users/$OWNER_UID/lieux/$OWNER_LIEU_ID"
# -> 200
```

Non-follower read on the same pin — expect **HTTP 403**:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $STRANGER_ID_TOKEN" \
  "https://firestore.googleapis.com/v1/projects/$PROJECT_ID/databases/(default)/documents/users/$OWNER_UID/lieux/$OWNER_LIEU_ID"
# -> 403
```

Owner list query (sanity — should stay allowed even after the rule change):

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $OWNER_ID_TOKEN" \
  "https://firestore.googleapis.com/v1/projects/$PROJECT_ID/databases/(default)/documents/users/$OWNER_UID/lieux"
# -> 200
```

If any of these codes disagree, do not merge / roll back the rule deploy.
