# scripts/

Utility scripts for one-shot setup and maintenance tasks.

## Prerequisites

1. Install `firebase-admin` + `tsx` in repo root:
   ```bash
   npm install --save-dev firebase-admin tsx
   ```

2. Firebase Admin SDK service account key at `secrets/service-account.json` (gitignored).
   - Firebase Console → Project Settings → Service accounts → Generate new private key
   - Save the downloaded JSON as `secrets/service-account.json`

## Scripts

### `seed-curated-accounts.ts`

Creates the 4 official Waymark Curated auth users + Firestore user docs:

- `@waymark.paris.cool`
- `@waymark.paris.culturel`
- `@waymark.paris.chic`
- `@waymark.paris.food`

Idempotent — safe to re-run. Also reserves each username in `/usernames/{lowercase}` so no regular user can grab them.

```bash
npx tsx scripts/seed-curated-accounts.ts
```

Run this **once** before launch. After it completes, the accounts exist but have no pins — use the Waymark app to log in as each account and manually add 15-20 pins per compte per `docs/curation-playbook.md`.

### `seed-curated-pins.ts` (TODO)

Not yet written. Bulk-import the 60-80 curated pins from a JSON file. Robin creates the JSON per `docs/curation-playbook.md` guidelines; this script writes them to `users/{uid}/lieux`.

Rationale for a bulk script vs manual app entry: uploading via the app requires taking a real screenshot photo for each pin. The seed pins can skip the screenshot (nullable or placeholder) since they're editorial. Doing 60-80 through the app would take hours.
