# Firestore rules unit tests

Black-box tests for `firestore.rules`, driven by
[`@firebase/rules-unit-testing`](https://firebase.google.com/docs/rules/unit-tests).
Isolated from the RN test suite because they require the Firestore emulator
and their own npm dep graph.

## Run locally

```bash
# 1. From the repo root, start the emulator (only Firestore is needed):
firebase emulators:start --only firestore

# 2. In another shell, install this workspace's deps once:
npm --prefix firestore-tests install

# 3. Run the tests:
npm --prefix firestore-tests test
```

The tests spin up a fresh test env per file, load the actual `firestore.rules`
from the repo root, and evaluate reads/writes with authenticated contexts.
Existing prior art: `lieux.rules.test.ts` — first suite in the repo, added as
part of issue #40. Copy its setup/teardown pattern for new suites.
