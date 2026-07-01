# Mappies — App Store Metadata (v1.0.0)

**Status**: draft for J3 submission
**Author**: Robin Hesse
**Last updated**: 2026-07-01
**Related**: `docs/PRD.md`, `docs/competitive-velocity.md`, issue #8 (submit), issue #6 (Delete Account)

---

## Strategic positioning (why these words)

Two positioning bets, both drawn from `docs/competitive-velocity.md`:

1. **Own the word "screenshot"** in the title. Zero direct competitor (Rhyme, Plotline, Stasht, DocentPro, JoySpot, Mapstr, Postcard, Stashed) uses "screenshot" in their App Store title or subtitle today. Stasht *does* extract screenshots but positions as a "saves inbox." Claiming the word first is a defensible search + memory hook — Apple Search Ads on "screenshot map" is currently empty inventory.
2. **Lead with Instagram Stories and DMs**, not Instagram in general. Every URL-based competitor (Plotline, Rhyme, JoySpot, Postcard, Stashed) *can't* extract Stories or DMs because there's no shareable URL. That gap is Mappies' only durable moat while the screenshot-vision shelf life holds (est. 6–12 months).

Every field below is aligned to those two bets.

---

## English (App Store US — primary locale)

### Title — 30 char max
**`Mappies: Screenshot to Map`** — 26 chars

- Contains the wedge keyword ("screenshot") no competitor owns.
- Implicit verb-phrase: screenshot -> map.
- Reads clean on the search results row (icon + title + subtitle).

### Subtitle — 30 char max
**`Turn Stories into map pins`** — 26 chars

- Leads with "Stories" — the URL-competitors' blind spot.
- "Pins" evokes the map surface without saying "map" again (already in title).
- Verb-first ("Turn") = action-oriented conversion copy.

### Keywords — 100 char max, comma-separated, no spaces
```
instagram,reels,stories,restaurant,bookmark,save,travel,foodie,pin,ocr,ai,voyage,carte,paris,visite
```
99 chars. No repetition of title/subtitle words (Apple already indexes those).

Notes:
- `instagram` and `reels` are allowed brand references in the keyword field.
- `voyage`, `carte`, `paris`, `visite` bleed French-search coverage into the US store (Robin's Paris-based network).
- `ocr` and `ai` capture the "how does it work" curiosity searches.
- Kept `restaurant` singular to avoid Apple's dedupe against `restaurants`.

### Description — ~1500 char target
```
Your Instagram screenshots. On a map. In seconds.

Mappies turns every Instagram screenshot — including Stories and DMs — into a pin on your personal map. No more forgetting the restaurant your favorite creator raved about. No more retyping addresses into Google Maps. No more Photos-app graveyard.

HOW IT WORKS
1. Screenshot any place recommendation on Instagram: post, reel, or story.
2. Share to Mappies via the iOS Share Sheet or our Shortcut.
3. Our AI extracts the name, city, address, and category — in about 4 seconds.
4. The place appears on your private map, with the original screenshot attached and the creator's handle saved.

WHY MAPPIES, NOT THE OTHERS
- Works on Stories and DMs. Every other app requires a shareable URL — which Stories and DMs don't have.
- Built native for iPhone: Sign in with Apple, Apple MapKit, iOS Shortcut for one-tap saves.
- Private by design. Your map, your places, your data. No feed, no follows, no social pressure.
- Creator handle saved with every pin, so you remember whose taste led you there.

PERFECT FOR
- Foodies collecting restos, bars, and cafés in Paris, Lisbon, Rome, NYC, Tokyo.
- Travelers building city guides from the creators they actually trust.
- Anyone whose camera roll is 60% place screenshots they never revisit.

Free to try. Sign in with Apple. Delete every trace of your data from Settings any time — no email required.

Made in Paris.
```
~1490 chars. Structure: hook (1 line) -> pain-relief bullets -> how-it-works numbered -> competitive differentiator -> ICP proof -> trust closer.

### What's New (v1.0.0) — ~500 char target
```
Welcome to Mappies 1.0.

The fastest way to turn Instagram screenshots into a personal map.

This first release includes:
- Screenshot upload from your Photos library
- AI extraction: place name, city, address, category, creator handle
- Personal map powered by Apple MapKit
- iOS Share Sheet + Shortcut integration
- Sign in with Apple + iCloud sync across your iPhones
- Full account and data deletion from Settings

Made in Paris. Feedback welcome at hello@mappies.app.
```
~485 chars.

### Promotional text — 170 char max (editable without review)
```
Instagram Stories, DMs, reels — Mappies extracts places from screenshots no other app can read. Screenshot in, pin on your map out. Free to try.
```
143 chars. Change post-launch to feature new capabilities or press mentions without resubmitting.

---

## French (App Store FR — secondary locale)

### Title — 30 char max
**`Mappies : Screenshot en carte`** — 29 chars

- Garde "Screenshot" en anglais : le mot est utilisé tel quel en français courant, et il conserve la valeur SEO cross-store.
- "En carte" = plus court que "vers carte" et plus idiomatique.

### Subtitle — 30 char max
**`Tes Stories Insta sur la carte`** — 30 chars

- Tutoiement direct, ton IG-native.
- "Stories Insta" plutôt que "Instagram Stories" — plus court, plus parlé.

### Keywords — 100 char max
```
instagram,reels,stories,resto,voyage,carte,pin,ocr,ia,favoris,bookmark,visite,paris,guide,foodie
```
95 chars. `resto` (argot FR) + `ia` (IA en français) + `favoris` = angles de recherche locaux.

### Description — ~1500 char
```
Vos screenshots Instagram. Sur une carte. En quelques secondes.

Mappies transforme chaque screenshot Instagram — Stories et DMs compris — en épingle sur votre carte perso. Fini le resto oublié au fond de la pellicule. Fini la ressaisie manuelle des adresses dans Google Maps. Fini l'album Photos qui déborde de captures inutilisables.

COMMENT ÇA MARCHE
1. Screenshotez une reco de lieu sur Instagram : post, reel ou story.
2. Partagez vers Mappies depuis le Share Sheet iOS ou notre Raccourci.
3. Notre IA extrait le nom, la ville, l'adresse et la catégorie — en 4 secondes.
4. Le lieu apparaît sur votre carte privée, avec le screenshot d'origine et le pseudo du créateur.

POURQUOI MAPPIES, ET PAS LES AUTRES
- Fonctionne sur Stories et DMs. Les autres apps exigent une URL partageable — et Stories/DMs n'en ont pas.
- Pensé iPhone : Sign in with Apple, MapKit natif, Raccourci iOS pour ajouter en un tap.
- Privé par défaut. Votre carte, vos lieux, vos données. Pas de feed, pas d'abonnés.
- Le pseudo du créateur est sauvegardé pour se rappeler qui a recommandé quoi.

FAIT POUR
- Les foodies qui collectionnent restos, bars et cafés à Paris, Lisbonne, Rome, Tokyo.
- Les voyageurs qui construisent leurs guides depuis les créateurs qu'ils suivent vraiment.
- Toute personne dont la pellicule est à 60% des screenshots jamais rouverts.

Gratuit à essayer. Sign in with Apple. Suppression totale du compte et des données depuis les Réglages, à tout moment.

Fait à Paris.
```
~1495 chars.

### What's New (v1.0.0) — ~500 char
```
Bienvenue sur Mappies 1.0.

La façon la plus rapide de transformer vos screenshots Instagram en carte personnelle.

Cette première version inclut :
- Import de screenshots depuis la pellicule
- Extraction IA : nom, ville, adresse, catégorie, pseudo créateur
- Carte perso propulsée par Apple MapKit
- Intégration Share Sheet iOS + Raccourci
- Sign in with Apple + sync iCloud
- Suppression complète du compte depuis les Réglages

Fait à Paris. Retours : hello@mappies.app.
```
~490 chars.

### Promotional text — 170 char max
```
Stories Instagram, DMs, reels — Mappies extrait les lieux là où aucune autre app ne sait lire. Screenshot in, épingle sur la carte out. Gratuit à essayer.
```
152 chars.

---

## Screenshot copy (5 App Store screens)

Order matters — App Store shows the first 3 screenshots on the search result card. Screens 1–3 must convey the value prop without a tap. Screens 4–5 close the sale.

### Screen 1 — Onboarding hero
- **Screen shown**: Onboarding welcome (dark background, brand mark, tagline)
- **EN headline** (5 max): `From screenshot to map`
- **EN subline** (10 max): `Instagram places, extracted by AI — zero typing required.`
- **FR headline**: `Du screenshot à la carte`
- **FR subline**: `Vos lieux Instagram, extraits par l'IA — zéro saisie.`

### Screen 2 — Upload / Share Sheet demo
- **Screen shown**: Upload screen mid-extraction, ideally with iOS Share Sheet overlay from Instagram (Stories UI visible in the source)
- **EN headline** (5 max): `Works on Stories and DMs`
- **EN subline** (10 max): `Every other app needs a URL. Mappies reads the screenshot.`
- **FR headline**: `Marche sur Stories et DMs`
- **FR subline**: `Les autres exigent une URL. Mappies lit le screenshot.`

### Screen 3 — List view
- **Screen shown**: List of saved places with category emoji, city, thumbnail, creator handle
- **EN headline** (5 max): `Every reco, one place`
- **EN subline** (10 max): `Sorted by date, creator handle and screenshot always attached.`
- **FR headline**: `Toutes tes recos, un endroit`
- **FR subline**: `Triées par date, avec l'auteur Insta et le screenshot d'origine.`

### Screen 4 — Map view
- **Screen shown**: MapKit view of Paris (or Lisbon) with 20+ pins clustered by arrondissement
- **EN headline** (5 max): `Your city, your map`
- **EN subline** (10 max): `Paris, Lisbon, Tokyo — every saved place, around you.`
- **FR headline**: `Ta ville, ta carte`
- **FR subline**: `Paris, Lisbonne, Tokyo — tous tes lieux, autour de toi.`

### Screen 5 — Detail view
- **Screen shown**: Place detail — full address, screenshot, creator, notes field, "Open in Maps" CTA
- **EN headline** (5 max): `Open in Maps, one tap`
- **EN subline** (10 max): `Address, notes, and directions — straight to the door.`
- **FR headline**: `Ouvre dans Plans, un tap`
- **FR subline**: `Adresse, notes perso, itinéraire — jusqu'à la porte.`

### Production notes for the screenshots
- Format: 6.9" iPhone 16 Pro Max (1290 x 2796), 5 required. Same set is auto-rescaled by Apple for 6.5"/5.5" if you submit a single 6.9" set.
- Background: dark accent (aligns with PRD dark-first design).
- Overlay type: white or accent-warm, 72–80pt headline, 32pt subline. Keep bottom 30% of image free for the device chrome / real UI.
- Frame the actual UI at 60% of the screen — do NOT use raw screenshots. App Store rejections spike when there's no visual context around the UI.

---

## Privacy & compliance

### Data collection statement (for App Privacy questionnaire)

Fill Apple's questionnaire as follows:

| Category | Collected? | Linked to user? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Contact Info — Email | Yes | Yes | No | Account (via Sign in with Apple; may be Apple-relay) |
| Contact Info — Name | Yes | Yes | No | Account personalization |
| User Content — Photos | Yes | Yes | No | Screenshot uploaded for place extraction (stored in Firebase Storage under user's UID) |
| User Content — Other user content | Yes | Yes | No | User notes on each place |
| Identifiers — User ID | Yes | Yes | No | Firebase Auth UID |
| Location — Precise | No | — | — | Places are geocoded server-side; device GPS is never read in v1 |
| Diagnostics — Crash Data | Yes | No | No | App stability (if Firebase Crashlytics is enabled — confirm before submit) |
| Diagnostics — Product Interaction | No | — | — | No PostHog in v1 (moved to v1.1) |

**Tracking**: No. Mappies does not use IDFA and does not share any data with third parties for advertising.

### Delete Account (Apple mandate since June 30, 2022 — issue #6)

Since June 2022, any app that lets a user create an account MUST offer in-app account deletion (App Store Review Guideline 5.1.1(v)). Non-compliance is the single most common J3 rejection reason for auth-gated apps.

Requirements enforced in Settings > Account > Delete Account:
- Single tap flow, no email round-trip.
- Deletes Firestore `/users/{uid}` doc.
- Batch-deletes all `/users/{uid}/lieux/*` subcollection docs.
- Purges Firebase Storage `/users/{uid}/screenshots/*`.
- Revokes Apple Sign-in credential (`AppleAuthentication.revokeAsync`) — MANDATORY for Sign in with Apple accounts per Apple docs.
- Calls `firebase.auth().currentUser.delete()`.
- Confirmation modal warns: "This cannot be undone."

Cross-reference PRD "Auth: Sign in with Apple > Delete Account" and confirm implementation before submit.

### Third-party services declared

Declare in the App Privacy questionnaire AND in the in-app Privacy Policy:

| Service | Vendor | Data shared | Purpose | Region |
|---|---|---|---|---|
| Firebase Auth, Firestore, Storage, Cloud Functions | Google LLC | Auth UID, email, place data, screenshots | Backend + storage | US (default) |
| Claude Sonnet 4.5 API | Anthropic PBC | Screenshot image bytes (base64), stripped of metadata | AI extraction of place info | US |
| Mapbox Geocoding API | Mapbox Inc. | Extracted place name + city string | Convert name/city to lat/lng | US |

Anthropic API: v1 sends full screenshot bytes. Confirm Anthropic zero-retention terms are enabled on the org (dashboard > API keys > data retention). Otherwise disclose "AI training" in the privacy policy — deal-breaker for many users.

Mapbox: only text is sent (name + city), never the image or user identifier.

### Privacy Policy URL (required)
Publish at `https://mappies.app/privacy` before submission. Same URL goes in App Store Connect + in-app Settings.

---

## Category & rating

### Primary category recommendation: **Travel**

Every direct competitor lives in Travel:
- Plotline — Travel
- Rhyme — Travel
- DocentPro / SpotFetch — Travel
- Mapstr — Travel
- JoySpot — Travel
- Postcard — Travel

The only outlier is Stasht ("Save social inspo") which sits in **Lifestyle** to reflect its universal-saves-inbox positioning. Mappies is not that — it is maps-first.

**Secondary category**: **Food & Drink**. Restaurants and bars are the dominant use case per the PRD problem statement. Food & Drink has less crowded charts than Travel and gives a second discovery surface.

Do NOT choose Utilities — it kills App Store editorial consideration for travel roundups, which are the primary earned-media channel in this niche (see Plotline, Rhyme roundup coverage in `docs/competitive-velocity.md`).

### Age rating: **4+**
No mature content, no unrestricted web access (only Instagram-share ingest), no user-to-user communication in v1. All Apple questionnaire answers = None.

### Competitor comparison table

| App | Primary category | Age | Model |
|---|---|---|---|
| Mappies (proposed) | Travel | 4+ | Free (v1) |
| Rhyme | Travel | 4+ | Freemium $9.99/mo |
| Plotline | Travel | 4+ | Freemium |
| Stasht | Lifestyle | 4+ | Free |
| DocentPro | Travel | 4+ | Freemium |
| Mapstr | Travel | 4+ | Freemium $80/yr |
| Postcard | Travel | 4+ | Free |
| JoySpot | Travel | 4+ | Freemium $1.99/mo |

---

## Pre-submission checklist (paste into issue #8)

- [ ] Title, subtitle, keywords locked in App Store Connect (EN + FR)
- [ ] 5 screenshots exported at 1290x2796 for both locales
- [ ] Privacy Policy URL live at `https://mappies.app/privacy`
- [ ] Support URL live at `https://mappies.app/support` (or Notion page)
- [ ] Marketing URL points to landing page (or App Store direct)
- [ ] App Privacy questionnaire completed per matrix above
- [ ] Delete Account flow verified end-to-end (issue #6 closed)
- [ ] Sign in with Apple revocation confirmed working
- [ ] Anthropic API zero-retention verified on org dashboard
- [ ] Review notes to Apple: "Test account: use Sign in with Apple. Screenshot upload requires a photo — attached scr1.png/scr2.png as review artefacts, or the reviewer can use any Instagram screenshot from their own photo library."
- [ ] Age rating questionnaire filled = 4+
- [ ] Category = Travel / Food & Drink
- [ ] Build uploaded via EAS, TestFlight-tested by Robin + 1 external tester

---

## Change log
- **2026-07-01** — Initial draft aligned to PRD v1 and competitive-velocity map. Positioning bets: (1) own "screenshot" in title, (2) lead with Stories/DMs in subtitle + promo text.
