# Waymark

Screenshot Instagram → pin sur ta carte perso. Zéro saisie.

## Getting started

Voir `docs/setup-guide.md` pour le setup Firebase + Apple + EAS.

```bash
npm install
cp .env.example .env  # remplir avec les valeurs Firebase
npm run start
```

Pour tester le Sign in with Apple, `expo-apple-authentication` **ne marche pas dans Expo Go**. Il faut un dev-client :

```bash
npm run build:ios:dev
```

## Structure

```
.
├── App.tsx                   # root: auth guard + navigation
├── src/
│   ├── auth/                 # AuthContext + firebase config
│   ├── screens/              # AuthScreen, HomeScreen (+ futurs)
│   ├── services/             # lieuxService (seam data), claude (extraction)
│   ├── theme/                # palette, spacing, typography
│   └── types/                # domain types (Lieu, LieuExtracted, …)
├── functions/                # Firebase Cloud Functions (extract, delete account)
├── assets/                   # icon, splash, images
├── docs/                     # PRD, competitive, setup, ADRs
├── .claude/                  # skills locales (frontend-design, competitive-analyst)
└── .mcp.json                 # MCP servers (github, firebase, context7)
```

## Documents

- **[docs/PRD.md](docs/PRD.md)** — spec produit V1
- **[docs/setup-guide.md](docs/setup-guide.md)** — étapes manuelles (Firebase, Apple, EAS, MCP)
- **[docs/competitive-analysis.md](docs/competitive-analysis.md)** — benchmark features
- **[docs/competitive-velocity.md](docs/competitive-velocity.md)** — vélocité concurrents (urgence !)
- **[docs/app-store-metadata.md](docs/app-store-metadata.md)** — brouillons App Store (titre, keywords, screenshots)

## Issues

Ready-for-agent : https://github.com/Robin-gl-pixel/waymark/issues?q=label%3Aready-for-agent

## Stack

- Expo SDK 54 · React Native 0.81 · TypeScript strict
- Firebase (Auth Apple + Firestore + Storage + Functions)
- Claude Sonnet 4.5 (vision extraction)
- Mapbox Geocoding (enrichissement adresses/lat-lng)
- MapKit iOS natif via `react-native-maps`
