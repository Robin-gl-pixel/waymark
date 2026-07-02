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

### `seed-curated-pins.ts`

Bulk-import the 60-80 curated pins from JSON files (`data/curated-{cool,culturel,chic,food}.json`). Robin creates the JSON per `docs/curation-playbook.md` guidelines; this script writes them to `users/{uid}/lieux`.

Idempotent via a `curatedId` field per pin — re-running updates existing pins in place (upsert), doesn't duplicate.

```bash
# Preview without writing
npx tsx scripts/seed-curated-pins.ts --dry-run

# Actually write to Firestore
npx tsx scripts/seed-curated-pins.ts
```

**JSON format per pin** (an array of these per file):

```json
{
  "curatedId": "cool-01-le-baratin",
  "name": "Le Baratin",
  "city": "Paris",
  "country": "France",
  "address": "3 Rue Jouye-Rouve, 75020 Paris",
  "lat": 48.8729,
  "lng": 2.3831,
  "category": "bar",
  "description": "Bar à vins historique de Belleville tenu par Raquel Carena. Carte de vins natures pointue, cuisine simple à midi.",
  "sourceAuthor": null
}
```

- `curatedId` must be stable and unique per account (used for upsert dedup).
- `description` must be ≤ 300 chars (target 180-250 per playbook rules §4.1).
- `category` must be one of: `resto | bar | café | activité | musée | hôtel | autre`.

**Rationale for bulk vs manual app entry**: uploading via the app requires taking a real screenshot photo for each pin. Curated pins skip screenshots (editorial content, no source screenshot). Doing 60-80 through the app UI would take hours.
