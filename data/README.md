# data/

JSON files consumed by `scripts/seed-curated-pins.ts` to bulk-import the Amble Curated accounts' pins into Firestore.

## Files (one per Amble Curated account)

- `curated-cool.json` — bars quartier, bistrots, cafés indé (~15-20 pins)
- `curated-culturel.json` — musées niche, librairies, cinémas art & essai, galeries (~15-20 pins)
- `curated-chic.json` — gastro haut de gamme, palaces, restaurants étoilés (~15-20 pins)
- `curated-food.json` — plats signature transversaux (~15-20 pins)

## Format per entry

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

**Field rules** :

| Field | Rules |
|---|---|
| `curatedId` | Stable + unique per account. Used for upsert dedup — re-running the script updates existing pins in place, doesn't duplicate. Format libre (ex: `cool-01-le-baratin`). |
| `name` | Nom du lieu, tel qu'affiché dans l'app. |
| `city` / `country` | `Paris` / `France` en V1 (ext. plus tard). |
| `address` | Adresse complète, Google Maps-compatible. Le géocoding se fait à l'exécution du script. |
| `lat` / `lng` | Coords précises. Copier depuis Google Maps ou laisser le script les remplir. |
| `category` | Un de : `resto`, `bar`, `café`, `activité`, `musée`, `hôtel`, `autre`. |
| `description` | **180-250 chars, 2-3 phrases** selon `docs/curation-playbook.md` §4. Pas de mots interdits (§4.3). |
| `sourceAuthor` | Toujours `null` pour les Amble Curated (contenu éditorial, pas de source Insta). |

## Règles éditoriales

Consulter `docs/curation-playbook.md` pour :
- Positionnement de chaque compte (§2)
- Critères de sélection (§3)
- Règles rédactionnelles (§4)
- Garde-fous éthiques (§5) — **notamment §5.2 : PAS de curation via LLM**
- Templates concrets (§6) — 3 exemples par compte
- Plan opérationnel 8h (§7)

## Workflow

1. Robin curates les entrées selon le playbook, écrit dans les 4 JSON
2. Preview :
   ```bash
   npx tsx scripts/seed-curated-pins.ts --dry-run
   ```
3. Import live :
   ```bash
   npx tsx scripts/seed-curated-pins.ts
   ```

Le script vérifie chaque entrée (regex catégories, longueur description ≤ 300 chars, champs required) avant d'écrire — fail-fast si une entrée est mal formée.
