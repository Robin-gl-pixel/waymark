# Waymark — PRD V1

**Status**: draft
**Target ship date**: J+3 (submit-ready App Store)
**Author**: Robin Hesse
**Last updated**: 2026-07-01

---

## Problem Statement

Je vois régulièrement des influenceurs Instagram recommander des lieux (restaurants, bars, activités, musées) dans leurs posts, reels et stories. Je fais des screenshots pour ne pas les perdre. Mais ces screenshots s'entassent dans ma pellicule iPhone :

- Impossible à retrouver quand je suis sur place à Paris/Lisbonne/Rome
- Aucune organisation par ville, catégorie, ou influenceur
- Aucune visualisation sur carte
- Ressaisir manuellement chaque nom dans Google Maps est chiant et fait qu'on ne le fait pas

**Le résultat concret** : je collectionne des recos sans jamais y aller.

## Solution

Une app iOS "Waymark" qui transforme le screenshot Instagram en pin sur ma carte perso, sans saisie manuelle.

Flow utilisateur idéal :
1. Je vois un post Insta d'un influenceur recommandant "Chez Janou, Paris 4ème"
2. Screenshot iPhone (Volume+ / Side button)
3. Depuis Insta ou Photos, "Partager" → **Waymark Shortcut**
4. L'app extrait automatiquement le nom, la ville, l'adresse. Enrichit avec lat/lng via Mapbox.
5. Le lieu apparaît sur ma carte + dans ma liste, avec le screenshot d'origine attaché.
6. Quand je suis à Paris → ouvre Waymark → carte → je vois tous les lieux à visiter autour de moi.

## User Stories

### Extraction & ajout

1. En tant qu'utilisateur, je veux uploader un screenshot Instagram depuis ma pellicule iPhone, afin que l'app extraie automatiquement les infos du lieu.
2. En tant qu'utilisateur, je veux partager un screenshot depuis Photos vers Waymark via le Share Sheet iOS, afin d'éviter d'ouvrir manuellement l'app.
3. En tant qu'utilisateur, je veux un iOS Shortcut "Ajouter à Waymark" que je peux déclencher depuis Photos ou Instagram, afin d'accélérer encore l'ajout.
4. En tant qu'utilisateur, je veux voir un feedback visuel pendant l'extraction (~3-5s), afin de savoir que ça travaille.
5. En tant qu'utilisateur, je veux pouvoir corriger le nom/ville extrait si l'IA s'est trompée, avant de sauvegarder.
6. En tant qu'utilisateur, je veux que le screenshot d'origine soit attaché au lieu, afin de retrouver le contexte visuel (photo de l'influenceur, ambiance) plus tard.
7. En tant qu'utilisateur, je veux voir l'auteur Instagram (`@juan.inparis`) associé au lieu, afin de savoir de qui vient la reco.

### Visualisation

8. En tant qu'utilisateur, je veux voir tous mes lieux sur une carte iOS (MapKit), afin de visualiser leur répartition géographique.
9. En tant qu'utilisateur, je veux zoomer/dézoomer sur la carte, afin d'explorer par ville puis par quartier.
10. En tant qu'utilisateur, je veux tapper un pin sur la carte, afin d'ouvrir la fiche détaillée du lieu.
11. En tant qu'utilisateur, je veux voir mes lieux en liste scrollable (alternative à la carte), triés par date d'ajout la plus récente en premier.
12. En tant qu'utilisateur, je veux chaque item de la liste affiché avec : nom, ville, catégorie (émoji), miniature du screenshot, auteur Insta.
13. En tant qu'utilisateur, je veux basculer facilement entre vue Carte et vue Liste (tabs en bas).

### Détail d'un lieu

14. En tant qu'utilisateur, je veux voir sur la fiche d'un lieu : nom, adresse complète, catégorie, description extraite, screenshot d'origine, auteur Insta, notes perso.
15. En tant qu'utilisateur, je veux un bouton "Ouvrir dans Plans" (Apple Maps) qui pointe vers le lieu, afin d'obtenir l'itinéraire.
16. En tant qu'utilisateur, je veux ajouter/modifier mes notes personnelles sur un lieu ("mieux le soir, réserver 3 semaines à l'avance").
17. En tant qu'utilisateur, je veux supprimer un lieu de ma collection.

### Authentification & compte

18. En tant que nouvel utilisateur, je veux me connecter avec Sign in with Apple en 1 tap, afin d'éviter de créer un compte email/password.
19. En tant qu'utilisateur, je veux que mes lieux soient sauvegardés dans le cloud, afin de les retrouver si je change d'iPhone.
20. En tant qu'utilisateur, je veux pouvoir supprimer complètement mon compte et toutes mes données depuis l'app (exigence Apple 2022).

### Onboarding

21. En tant que nouvel utilisateur, je veux voir 2-3 écrans d'onboarding expliquant le concept avant la connexion.
22. En tant que nouvel utilisateur, je veux être guidé pour installer le Shortcut iOS après connexion (lien iCloud), afin de bénéficier tout de suite du flux rapide.

## Implementation Decisions

### Stack

- **Client** : React Native + Expo (managed workflow) + TypeScript. Réutilisation de `1. Theater/event_log/` (package.json compatible).
- **Backend** : Firebase (Auth Apple + Firestore + Cloud Functions + Storage). Décision documentée dans `docs/ADR-001-firebase-vs-supabase.md` (à créer). Migration Supabase prévue V2 si triggers atteints.
- **Vision LLM** : Claude Sonnet 4.5 via `@anthropic-ai/sdk` (déjà dans Theater, réutilisation `services/claude.ts`).
- **Enrichissement géo** : Mapbox Geocoding (`/mapbox/geocoding-v5/mapbox.places`), token stocké côté Cloud Function.
- **Carte** : `react-native-maps` avec `provider="apple"` (MapKit natif, gratuit, illimité).
- **Auth** : `expo-apple-authentication` (déjà dans Theater).
- **Navigation** : `@react-navigation/native-stack` + `@react-navigation/bottom-tabs`.
- **Design system** : dark-first, accent chaud (voir ADR design). Piloté par skill `frontend-design` sur références Mapstr.

### Architecture — le seam unique

Une seule couche de séparation entre UI et data : `src/services/lieuxService.ts` qui expose l'interface CRUD.

```typescript
// src/services/lieuxService.ts (le seul seam de test + le seul point de migration futur)
export interface LieuxService {
  getAllLieux(userId: string): Promise<Lieu[]>
  getLieuById(id: string): Promise<Lieu | null>
  createLieu(input: LieuInput): Promise<Lieu>
  updateLieu(id: string, patch: Partial<Lieu>): Promise<void>
  deleteLieu(id: string): Promise<void>
  extractFromScreenshot(imageBase64: string): Promise<LieuExtracted>
}
```

L'implémentation Firebase (`firebaseLieuxService.ts`) reste isolée. Les screens/composants n'importent JAMAIS `firebase/*` directement. **Ce seam est le seul contrat testé** et le seul à remplacer pour la migration V2 Supabase.

### Data model

```typescript
type Lieu = {
  id: string
  userId: string
  name: string                     // "Chez Janou"
  city: string                     // "Paris"
  country: string                  // "France"
  address: string                  // "2 Rue Roger Verlomme, 75003 Paris"
  lat: number
  lng: number
  category: 'resto' | 'bar' | 'café' | 'activité' | 'musée' | 'hôtel' | 'autre'
  description?: string             // extrait du post
  sourceInstagram: {
    author: string                 // "juan.inparis"
    screenshotStoragePath: string  // "/users/{uid}/screenshots/{lieuId}.jpg"
  }
  userNotes?: string
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### Firestore structure

```
/users/{uid}
  - email
  - displayName
  - createdAt
  /lieux/{lieuId}
    (all fields above)
```

### Cloud Functions

Une seule fonction : `POST /extract`
- Input : `{ imageBase64: string }` + auth (Firebase ID token)
- Process :
  1. Sauve l'image dans Storage → `/users/{uid}/screenshots/{tempId}.jpg`
  2. Appelle Claude Sonnet 4.5 avec prompt spécialisé (pattern 📍 emoji, extraction nom/ville/adresse/catégorie/auteur)
  3. Si adresse manquante ou lat/lng absent → Mapbox Geocoding avec `name + city`
  4. Retourne `LieuExtracted { name, city, address, lat, lng, category, description, sourceAuthor, screenshotStoragePath }`
- L'app reçoit → montre l'écran de confirmation/édition → `createLieu()` finalise dans Firestore

### Auth : Sign in with Apple

- Flow standard `expo-apple-authentication` → nonce → Firebase Auth signInWithCredential
- Réutilisation directe de `1. Theater/event_log/src/auth/AuthContext.tsx`
- **Delete Account** : bouton dans Settings, batch delete `/users/{uid}` + subcollection `/lieux` + Storage `/users/{uid}/`, puis revoke Apple credential + Firebase user delete.

### iOS Shortcut (V1)

- Screen "Configurer le Shortcut" dans Settings
- L'app génère un token utilisateur unique (stocké chiffré côté user + Firestore)
- Lien iCloud Shortcut préconfiguré : "Reçoit une image → HTTPS POST à `https://waymark-api/extract-from-shortcut` avec `Authorization: Bearer <token>` + `image=<base64>`"
- User tap le lien → iOS ouvre Shortcuts app → installe → prompt le token → paste depuis Waymark
- Une fois installé : depuis Photos → bouton Share → "Ajouter à Waymark" → callback ouvre Waymark avec le lieu extrait pré-rempli

## Testing Decisions

**Philosophy** : test au niveau du seam `lieuxService`, pas au niveau des composants React ni de Firebase. Test comportement, pas implémentation.

- **Unit tests** (vitest, déjà dans Theater) :
  - `lieuxService` méthodes contre un mock Firebase (in-memory)
  - `extractionPrompt` : le prompt Claude ne régresse pas (snapshot du prompt)
- **Golden tests** (adapter le pattern `eval-golden-prompts.ts` de Theater) :
  - Faire tourner l'extraction sur 5-10 screenshots réels (scr1.png, scr2.png + à venir) → vérifier que `name`, `city` matchent des valeurs attendues (>90% précision).
- **Snapshot tests** (post V1) : screens principaux
- **E2E** (post V1) : Detox si vraiment nécessaire.

**Prior art** : `1. Theater/event_log/scripts/eval-golden-prompts.ts` — même pattern.

## Out of Scope (V1)

- Sync entre iPad et iPhone (V1 iPhone-only, Firebase gère la sync gratos donc c'est presque là mais on ne teste pas iPad)
- Partage de listes entre utilisateurs (V2 majeure)
- Feed social, découverte des lieux des autres (V2)
- Filtres avancés (par catégorie, ville, distance) — V1.1
- Recherche full-text — V1.1
- Extraction depuis URL Instagram (au lieu de screenshot) — V2
- Extraction audio depuis reels — V2
- Mode offline complet (V1 requiert connexion pour l'extraction)
- Android (V2 lointaine)
- App web / dashboard — V2 lointaine
- Notifications push — V1.1
- Traduction automatique des descriptions — non prévu
- Onboarding polie avec animations — V1 = 2-3 écrans statiques
- Monétisation, IAP, abonnement — post product-market fit

## Further Notes

### Risques principaux (par ordre de gravité)

1. **Extraction non fiable sur certains screenshots** : reels sans caption texte, seulement voix off. Mitigation V1 : l'utilisateur peut corriger le nom avant sauvegarde. Tracking : logger le taux de correction dans PostHog.
2. **Rejet Apple review** : privacy policy manquante, description Delete Account incomplète, screenshots App Store trop bruts. Mitigation : suivre la checklist `AASA-HITL-CHECKLIST.md` du projet Theater.
3. **Mapbox rate limits** : free tier généreux (100k/mois), zero risque V1.
4. **Coûts Claude Sonnet** : ~$0.003/screenshot. 500 lieux/mois = $1.50/mois. Non-issue.
5. **Perte de données si utilisateur supprime l'app** : mitigé par Firestore (persistance cloud dès la connexion Apple).

### Plan J1 → J3 (indicatif, à préciser dans les issues)

- **J1** : Setup Expo + Firebase project Waymark + copie des seams Theater (Auth, firebase.ts, claude.ts). Auth Sign in with Apple end-to-end. **Livrable J1** : je peux me logger, l'app s'ouvre sur un écran vide.
- **J2** : Cloud Function `/extract` + upload screenshot depuis app + création `Lieu` en Firestore + affichage liste. **Livrable J2** : j'upload scr1.png, je vois "La Gare / Le Gore" dans ma liste.
- **J3** : Carte MapKit avec pins + fiche détail + iOS Shortcut + polish + submit App Store. **Livrable J3** : app soumise à Apple.

### Réutilisation Theater — inventaire précis

- `src/auth/AuthContext.tsx` → copie directe, adapter le projet Firebase
- `src/auth/firebase.ts` → copie, nouvelle config Firebase pour Waymark
- `src/services/claude.ts` → copie, adapter le prompt système
- `services/systemPrompt.ts` → template, remplacer contenu
- `api/proxy.js` → pattern à copier pour la Cloud Function `/extract`
- `eas.json` + `app.json` → templates config Expo/EAS
- `AASA-HITL-CHECKLIST.md` + `DEPLOY.md` → checklists submit
- `scripts/eval-golden-prompts.ts` → pattern tests extraction

### Concurrents et positionnement

Voir `docs/competitive-analysis.md` et `docs/competitive-velocity.md`.

**Stance produit — screenshot comme WEDGE, pas dogme :**

- V1 (ship dans 3j) : **screenshot pur** — c'est le signature move et ce que zero concurrent fait aujourd'hui.
- V2 : ajout URL paste + Share Sheet Insta (URL directe d'un post) + éventuellement TikTok/YouTube.
- V3+ : ranking-by-comparison à la Beli si validé.

**Justification :** l'espace "extraction depuis social" chauffe (Plotline, Stashed, JoySpot, SpotFetch, Via chassent tous le share-sheet URL). Notre avantage screenshot-vision a une shelf life estimée 6-12 mois — on ship vite pour capturer le mindshare "screenshot → carte", puis on élargit le tunnel d'entrée avant que les concurrents nous rattrapent.

**Positioning statement V1 :** *"Vos recos Instagram, transformées en carte perso. Screenshot → pin, zéro saisie."*

### ADRs à créer

- `docs/ADR-001-firebase-vs-supabase.md` — décision documentée avec triggers de migration V2
- `docs/ADR-002-mapbox-vs-google-places.md` — décision + triggers pour switch Google Places
- `docs/ADR-003-shortcut-auth-token.md` — sécurité du token Shortcut (rotation, révocation)
