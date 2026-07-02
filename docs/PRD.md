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
3. Depuis Insta ou Photos, "Partager" → **Waymark (via l'iOS Share Sheet)**
4. L'app extrait automatiquement le nom, la ville, l'adresse. Enrichit avec lat/lng via Mapbox.
5. Le lieu apparaît sur ma carte + dans ma liste, avec le screenshot d'origine attaché.
6. Quand je suis à Paris → ouvre Waymark → carte → je vois tous les lieux à visiter autour de moi.

## User Stories

### Extraction & ajout

1. En tant qu'utilisateur, je veux uploader un screenshot Instagram depuis ma pellicule iPhone, afin que l'app extraie automatiquement les infos du lieu.
2. En tant qu'utilisateur, je veux partager un screenshot depuis Photos vers Waymark via le Share Sheet iOS, afin d'éviter d'ouvrir manuellement l'app.
3. En tant qu'utilisateur, je veux pouvoir partager un screenshot vers Waymark depuis n'importe quelle app iOS (Photos, Instagram, Safari…) via une iOS Share Extension native — l'extraction se fait automatiquement, sans configuration.
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
22. En tant que nouvel utilisateur, je veux que le partage vers Waymark fonctionne dès l'installation, sans étape de configuration.

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

### iOS Share Extension (V1)

- Native Share Extension bundled with the app via `expo-share-intent` — activation rule `NSExtensionActivationSupportsImageWithMaxCount = 1`
- Zero user configuration: as soon as the app is installed, "Waymark" appears in the iOS share sheet for images
- Flow: user taps Share on a screenshot → picks Waymark → the main app opens with `hasShareIntent === true`, routes to `SharedImageScreen`, runs the same `extract` Cloud Function pipeline as the in-app upload, then hands off to `ExtractConfirmScreen`
- No separate auth token — the user is already signed in via Firebase Auth inside the app

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

## V1 Social Layer (added 2026-07-02 après /grill-me)

Décidé pendant une session /grill-me : la partie social n'est **pas un pivot mais une feature clé** ajoutée en V1, sur le modèle Mapstr (carte perso + follow asymétrique). Le wedge screenshot reste le core.

### Job to be done

**"Qui a du bon goût dans mon réseau ?"** — Je ne fais pas confiance à TripAdvisor. J'ai confiance en 3-5 amis dont le goût matche le mien. Waymark me montre CE QU'ILS ajoutent, pas ce que le monde ajoute. Insight distinctif vs Insta (feed trop bruyant, non focus lieu) et TripAdvisor (avis d'étrangers).

### Décisions verrouillées

| # | Décision | Choix V1 |
|---|---|---|
| 1 | Modèle social | Follow asymétrique + feed (comme Insta) |
| 2 | Acquisition | Invite direct SMS/lien + recherche par username Insta-style |
| 3 | Privacy par défaut | **Public** (comme Mapstr) — profil visible à tout auth user |
| 4 | Retention loop | "Sauver dans ma carte" avec attribution "via @alice" + activity feed pour Alice |
| 5 | Notifications V1 | In-app badges seulement (push = V1.1) |
| 6 | Cold start feed | Seed avec 3-4 comptes officiels **@waymark.paris.{cool,culturel,chic,food}** (Paris only en V1) |
| 7 | Curation | Comptes clairement badgés "Waymark Curated" (`isCurated: true`). Robin cure manuellement 15-20 lieux/compte avant launch |
| 8 | Chaîne attribution | **Immediate saver only** (`savedFromUserId` = celui juste avant, pas l'original). Simple data model, matche Twitter RT |
| 9 | Delete cascade | Cloud Function `onDelete(users/{uid})` → collection-group query sur `savedFromUserId == uid` → batch nullify (RGPD-compliant, zero orphan) |
| 10 | Block + Report (Apple guideline 1.2) | Bouton Bloquer sur UserProfileScreen (hide + unfollow forcé) + bouton Signaler (form 3 raisons → Cloud Function email/Slack Robin) |
| 11 | Web view public | **Non en V1**, mobile-only. Lien partagé → App Store. Web view MVP = V1.1 |
| 12 | Onboarding | Splash → Auth → **3 slides pitch** → PickUsername → **Écran "Follow Waymark Curated"** (toggles ON par défaut, opt-out possible) → App |

### User Stories additionnelles

23. En tant que nouvel utilisateur, je veux voir 3 slides d'accueil qui m'expliquent le pitch (screenshot → carte → follow), afin de comprendre pourquoi ça mérite un handle avant que je choisisse mon @username.
24. En tant que nouvel utilisateur, je veux choisir un username unique post-signup, afin que mes amis puissent me trouver.
25. En tant que nouvel utilisateur, je veux voir un écran "Suis les comptes Waymark Curated" (toggles ON par défaut) juste après avoir choisi mon username, afin d'entrer dans l'app avec un feed déjà peuplé et pas vide.
26. En tant qu'utilisateur, je veux rechercher un ami par @username via une barre de recherche.
27. En tant qu'utilisateur, je veux inviter un ami via SMS/lien iCloud, afin d'accélérer le remplissage de mon réseau.
28. En tant qu'utilisateur, je veux suivre / me désabonner d'un autre user en 1 tap depuis son profil.
29. En tant qu'utilisateur, je veux voir un tab "Réseau" avec les lieux récemment ajoutés par les users que je suis (chronologique, most recent first).
30. En tant qu'utilisateur, je veux sauver un lieu du feed dans ma propre carte en 1 tap, le saver précédent est crédité en "via @bob".
31. En tant qu'auteur d'un lieu, je veux voir dans mon activité "@robin a sauvé Chez Janou" — badge sur l'onglet Profil.
32. En tant qu'utilisateur, je veux pouvoir passer mon profil en privé depuis Settings, afin que mes lieux ne soient plus visibles.
33. En tant qu'utilisateur, je veux pouvoir bloquer un autre user depuis son profil, afin de ne plus voir son contenu et qu'il ne me suive plus (Apple guideline 1.2).
34. En tant qu'utilisateur, je veux pouvoir signaler un contenu offensant via un formulaire à 3 raisons, afin que Robin puisse review manuellement.
35. En tant que utilisateur dont un des recommandeurs a supprimé son compte, je veux que mes pins existants perdent l'attribution silencieusement sans que je perde le pin lui-même.

### Data model (deltas)

```typescript
// users/{uid}
type User = {
  // existing
  email: string
  displayName: string
  createdAt: Timestamp
  // NEW for social
  username: string           // unique, lowercase, /^[a-z0-9._]{3,20}$/
  isPublic: boolean          // default true; false = solo mode, invisible au feed
  isCurated?: boolean        // true pour les comptes officiels @waymark.paris.* — active le badge "Waymark Curated"
  followersCount: number     // denormalized
  followingCount: number     // denormalized
  avatarUrl?: string         // V2
  bio?: string               // V2
}

// users/{uid}/followers/{followerUid}  → { createdAt }
// users/{uid}/following/{followedUid}  → { createdAt }
// users/{uid}/blocks/{blockedUid}      → { createdAt } — quand j'ai bloqué blockedUid

// users/{uid}/lieux/{lieuId} — Lieu type gagne
type Lieu = {
  // existing fields
  savedFromUserId?: string    // saver immédiat (pas l'original) — nullified via Cloud Function si le user delete
  savedFromUsername?: string  // dénormalisé pour affichage (aussi nullified)
}

// users/{uid}/activity/{activityId} — le "vous avez de nouvelles activités"
type Activity = {
  type: 'follow' | 'save'
  actorUid: string
  actorUsername: string
  targetLieuId?: string       // pour type 'save'
  createdAt: Timestamp
  read: boolean
}

// reports/{reportId} — top-level, admin-only read
type Report = {
  reporterUid: string
  targetUid: string           // user reporté (ou owner du lieu reporté)
  targetLieuId?: string       // si report d'un lieu spécifique
  reason: 'spam' | 'offensif' | 'faux' // 3 raisons max en V1
  freeText?: string           // 200 chars
  createdAt: Timestamp
  status: 'open' | 'reviewed' | 'actioned'
}
```

### Firestore rules (deltas)

- `/users/{uid}` : read allowed pour tout auth user si `resource.data.isPublic == true`
- `/users/{uid}/lieux/{lieuId}` : read allowed pour tout auth user si owner.isPublic == true
- `/users/{uid}/followers/{followerUid}` : create allowed pour follower auth uid, delete allowed pour follower ou owner
- `/users/{uid}/activity/{activityId}` : read allowed uniquement pour owner ; create via Cloud Function trigger (voir ci-dessous)
- `/users/{uid}/blocks/{blockedUid}` : read/write uniquement pour owner (uid == auth.uid)
- `/reports/{reportId}` : create allowed pour tout auth user, read/list bloqué (Cloud Function seule y accède via admin SDK)

### Cloud Function triggers

- `onCreate(/users/{uid}/followers/{followerUid})` → écrit une Activity dans `/users/{uid}/activity` + increment `followersCount`
- `onCreate(/users/{uid}/lieux/{lieuId})` — si `savedFromUserId` set → écrit une Activity dans `/users/{savedFromUserId}/activity`
- `onDelete(users/{uid})` (déjà existant, à étendre) → collection-group query `savedFromUserId == uid` → batch update `{savedFromUserId: null, savedFromUsername: null}` sur tous les lieux downstream. Compliance RGPD + Apple 5.1.1(v).
- `onCreate(/reports/{reportId})` → email/Slack à Robin (via un webhook Slack simple)

### Screens nouveaux

- `OnboardingSlidesScreen` — 3 slides pitch avant le PickUsername
  - Slide 1 : "Tes screenshots Insta s'entassent." (problem)
  - Slide 2 : "Waymark les transforme en carte, en 4 secondes." (solution + wedge)
  - Slide 3 : "Suis les amis dont tu aimes le goût." (social hook)
- `PickUsernameScreen` — post-onboarding, choix du handle avec check unicité côté client (query Firestore `where('username', '==', ...)`) + serveur (Cloud Function safe check à l'écriture)
- `SeededFollowScreen` — juste après username, "Suis les comptes Waymark Curated" avec 3-4 toggles ON par défaut (@waymark.paris.cool/culturel/chic/food)
- `NetworkScreen` (tab) — feed vertical des pins du réseau, chronologique, most-recent-first
- `SearchUsersScreen` — barre de recherche @username + tap → UserProfileScreen
- `UserProfileScreen` — carte + liste des pins d'un user + bouton Follow/Unfollow + menu "Bloquer" + menu "Signaler"
- `BlockedUsersScreen` (dans Settings) — liste des users que j'ai bloqués + bouton "Débloquer"
- `ReportScreen` — form à 3 raisons + zone freeText (max 200 chars) + submit

### Screens modifiés

- `AuthScreen` : après Apple sign-in → navigate vers `PickUsernameScreen` si `username` manquant
- `SettingsScreen` : ajouter toggle "Profil public" + edit username + "Inviter un ami"
- `LieuDetailScreen` : si `savedFromUsername` set → afficher "via @savedFromUsername" ; ajouter bouton "Sauver dans ma carte" quand on regarde le lieu d'un autre user
- `MainTabs` : ajouter tab "Réseau" (icône `people`) entre Map et _Add ; ajouter tab "Profil" (icône `person-circle`) qui remplace ou complète Settings

### Positioning statement (révisé)

Ancien : *"Vos recos Instagram, transformées en carte perso. Screenshot → pin, zéro saisie."*
Nouveau : *"Vos recos Insta et celles de vos potes, sur une même carte. Screenshot → pin, zéro saisie."*

Copy App Store (`docs/app-store-metadata.md`) : la ligne "Private by design. No feed, no follows, no social pressure." doit être remplacée par un pitch social. Draft à écrire.

### Timeline V1

- Ancien plan : J+3 ship
- V1 social scope initial : J+10
- **V1 social scope étendu (block/report + onboarding slides + seeded follow) : J+12 ship**

### Curation manuelle des comptes Waymark (parallèle au dev)

**Livrable pré-launch** : 3-4 comptes @waymark.paris.* peuplés avec 15-20 lieux chacun. ~1 jour de curation Robin, à faire pendant le dev.

- **@waymark.paris.cool** — bars cocktails, bistros de quartier, cafés indé, spots low-key
- **@waymark.paris.culturel** — musées, galeries, librairies, cinémas indé, expositions temporaires
- **@waymark.paris.chic** — restos étoilés, palaces, gastronomie haut de gamme
- **@waymark.paris.food** — restos généraliste, si redondance avec cool/chic on peut skip

**Playbook curation** (à drafter dans `docs/curation-playbook.md`) :
- Tone : neutre, factuel, "voici pourquoi ça mérite le détour", pas d'exagération
- Sources : ta propre expérience + presse (Le Fooding, Time Out) — jamais copier-coller d'un influenceur
- Pas de faux avis, pas de fake screenshots (l'extraction en aurait de toute façon)
- 15-20 lieux par compte = 60-80 lieux au launch

### Ordre de build recommandé (~9 jours après core V1)

1. J+4 : `PickUsernameScreen` + User schema deltas + username unique check + `isCurated` flag
2. J+5 : `SearchUsersScreen` + `UserProfileScreen` (read-only, sans follow encore)
3. J+6 : Follow/unfollow + collections `followers`/`following` + counts + block sub-collection
4. J+7 : `NetworkScreen` (feed) + Firestore rules pour lecture public + client-side block filter
5. J+8 : Bouton "Sauver dans ma carte" + attribution + Cloud Function trigger
6. J+9 : Activity feed + badges in-app + toggle privacy Settings
7. J+10 : `OnboardingSlidesScreen` + `SeededFollowScreen`
8. J+11 : `ReportScreen` + `BlockedUsersScreen` + Cloud Function `onDelete` cascade + `onCreate(report)` Slack webhook
9. J+12 : Polish + réécriture copy App Store (déjà fait) + soumission

## Out of Scope (V1) — mis à jour

- Sync entre iPad et iPhone (V1 iPhone-only, Firebase gère la sync gratos donc c'est presque là mais on ne teste pas iPad)
- Filtres avancés (par catégorie, ville, distance) — V1.1
- Recherche full-text — V1.1
- Notifications push — V1.1 (V1 = badges in-app seulement)
- Commentaires sur un pin — V1.1
- Likes / reactions sur un pin — V1.1
- Close friends / listes séparées (Insta close friends style) — V2
- Profils influenceurs / verified badges — V2
- Bio / avatar utilisateur — V2 (V1 = username + displayName Apple only)
- Feed algorithmique (au lieu de chronologique) — V2+
- Discovery hors follow (trending, near you) — V2
- Modération, blocking, report — V2 (V1 : profil privé suffit)
- Extraction depuis URL Instagram (au lieu de screenshot) — V2
- Extraction audio depuis reels — V2
- Mode offline complet (V1 requiert connexion pour l'extraction)
- Android (V2 lointaine)
- App web / dashboard — V2 lointaine
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
- **J3** : Carte MapKit avec pins + fiche détail + iOS Share Extension + polish + submit App Store. **Livrable J3** : app soumise à Apple.

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
