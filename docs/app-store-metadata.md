# Amble — App Store Metadata (v1.0.0)

**Status**: draft for J3 submission
**Author**: Robin Hesse
**Last updated**: 2026-07-01
**Related**: `docs/PRD.md`, `docs/competitive-velocity.md`, issue #8 (submit), issue #6 (Delete Account)

---

## Strategic positioning (why these words)

Three positioning bets, drawn from `docs/competitive-velocity.md` and the /grill-me session (2026-07-02):

1. **Own the word "screenshot"** in the title. Zero direct competitor (Rhyme, Plotline, Stasht, DocentPro, JoySpot, Mapstr, Postcard, Stashed) uses "screenshot" in their App Store title or subtitle today. Stasht *does* extract screenshots but positions as a "saves inbox." Claiming the word first is a defensible search + memory hook — Apple Search Ads on "screenshot map" is currently empty inventory.
2. **Lead with Instagram Stories and DMs**, not Instagram in general. Every URL-based competitor (Plotline, Rhyme, JoySpot, Postcard, Stashed) *can't* extract Stories or DMs because there's no shareable URL. That gap is Amble's only durable moat while the screenshot-vision shelf life holds (est. 6–12 months).
3. **Social layer as retention, not acquisition.** Follow your friends whose taste you trust and see the places they save — but stay silent about the social layer in the title/subtitle. The download decision is driven by the wedge (screenshot → carte), the app-open habit is driven by "what did Alice add this weekend?" This split keeps the marketing sharp while adding the Mapstr-style network effect that Rhyme/JoySpot lack.

Every field below is aligned to those three bets. Title/subtitle stay wedge-focused; description reveals the social layer as a benefit.

---

## English (App Store US — primary locale)

### Title — 30 char max
**`Amble: Screenshot to Map`** — 26 chars

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
instagram,reels,stories,restaurant,bookmark,travel,foodie,pin,ocr,ai,voyage,friends,social,paris
```
99 chars. No repetition of title/subtitle words (Apple already indexes those).

Notes:
- `instagram` and `reels` are allowed brand references in the keyword field.
- Added `friends` + `social` to capture "restaurant app friends" style discovery queries (competitive with Beli/Mapstr on those terms).
- Dropped `save` and `visite` (lower search volume) to make room.
- `voyage`, `paris` bleed French-search coverage into the US store (Robin's Paris-based network).
- `ocr` and `ai` capture the "how does it work" curiosity searches.
- Kept `restaurant` singular to avoid Apple's dedupe against `restaurants`.

### Description — ~1500 char target
```
Your Instagram screenshots. On a map. In seconds.

Amble turns every Instagram screenshot — including Stories and DMs — into a pin on your personal map. No more forgetting the restaurant your favorite creator raved about. No more retyping addresses into Google Maps. No more Photos-app graveyard.

HOW IT WORKS
1. Screenshot any place recommendation on Instagram: post, reel, or story.
2. Share to Amble via the iOS Share Sheet.
3. Our AI extracts the name, city, address, and category — in about 4 seconds.
4. The place lands on your map, with the original screenshot attached and the creator's handle saved.

WHY WAYMARK, NOT THE OTHERS
- Works on Stories and DMs. Every other app requires a shareable URL — which Stories and DMs don't have.
- Built native for iPhone: Sign in with Apple, Apple MapKit, iOS Share Extension for one-tap saves.
- Creator handle saved with every pin, so you remember whose taste led you there.

FOLLOW FRIENDS WHOSE TASTE YOU TRUST
Amble isn't a feed of strangers. Follow the 3 or 5 people whose recos you actually rely on. See what they save, save theirs to your own map with one tap — original saver credited. Your profile can be public or private, your call.

PERFECT FOR
- Foodies collecting restos, bars, and cafés in Paris, Lisbon, Rome, NYC, Tokyo.
- Travelers building city guides from the creators they actually trust.
- Anyone whose camera roll is 60% place screenshots they never revisit.

Free to try. Sign in with Apple. Delete every trace of your data from Settings any time — no email required.

Made in Paris.
```
~1780 chars. Structure: hook -> how-it-works -> screenshot wedge -> social benefit -> ICP -> trust closer. NB: over the 1500 target but under the 4000 App Store max — the social section is worth the space, it justifies the download for the "why not Mapstr" objection.

### What's New (v1.0.0) — ~500 char target
```
Welcome to Amble 1.0.

The fastest way to turn Instagram screenshots into a personal map — and see what your friends save.

This first release includes:
- Screenshot upload + iOS Share Sheet extension
- AI extraction: name, city, address, category, creator handle
- Personal map powered by Apple MapKit
- Follow friends by @username, see their recos in a Network tab
- Save friends' pins to your map in one tap
- Public or private profile, your call
- Sign in with Apple + full account/data deletion

Made in Paris. Feedback welcome at hello@amble.app.
```
~540 chars.

### Promotional text — 170 char max (editable without review)
```
Screenshot Instagram Stories, DMs, reels → pin on your map. Follow friends. See what they save. Save theirs, in one tap. Free.
```
127 chars. Change post-launch to feature new capabilities or press mentions without resubmitting.

---

## French (App Store FR — secondary locale)

### Title — 30 char max
**`Amble : Screenshot en carte`** — 29 chars

- Garde "Screenshot" en anglais : le mot est utilisé tel quel en français courant, et il conserve la valeur SEO cross-store.
- "En carte" = plus court que "vers carte" et plus idiomatique.

### Subtitle — 30 char max
**`Tes Stories Insta sur la carte`** — 30 chars

- Tutoiement direct, ton IG-native.
- "Stories Insta" plutôt que "Instagram Stories" — plus court, plus parlé.

### Keywords — 100 char max
```
instagram,reels,stories,resto,voyage,carte,pin,ocr,ia,amis,social,bookmark,paris,guide,foodie
```
94 chars. Ajouté `amis` + `social`. `resto` (argot FR) + `ia` (IA en français) = angles de recherche locaux. Dropped `favoris` et `visite` (volume plus faible que `amis`/`social`).

### Description — ~1500 char
```
Vos screenshots Instagram. Sur une carte. En quelques secondes.

Amble transforme chaque screenshot Instagram — Stories et DMs compris — en épingle sur votre carte perso. Fini le resto oublié au fond de la pellicule. Fini la ressaisie manuelle des adresses dans Google Maps. Fini l'album Photos qui déborde de captures inutilisables.

COMMENT ÇA MARCHE
1. Screenshotez une reco de lieu sur Instagram : post, reel ou story.
2. Partagez vers Amble depuis le Share Sheet iOS.
3. Notre IA extrait le nom, la ville, l'adresse et la catégorie — en 4 secondes.
4. Le lieu apparaît sur votre carte, avec le screenshot d'origine et le pseudo du créateur.

POURQUOI WAYMARK, ET PAS LES AUTRES
- Fonctionne sur Stories et DMs. Les autres apps exigent une URL partageable — et Stories/DMs n'en ont pas.
- Pensé iPhone : Sign in with Apple, MapKit natif, Share Sheet iOS pour ajouter en un tap.
- Le pseudo du créateur est sauvegardé pour se rappeler qui a recommandé quoi.

SUIVEZ LES AMIS DONT VOUS AIMEZ LES RECOS
Amble n'est pas un feed d'inconnus. Suivez les 3 ou 5 personnes dont vous suivez vraiment les recos. Voyez ce qu'elles sauvegardent, sauvegardez leurs lieux dans votre carte en un tap — le créateur d'origine est crédité. Profil public ou privé, à votre convenance.

FAIT POUR
- Les foodies qui collectionnent restos, bars et cafés à Paris, Lisbonne, Rome, Tokyo.
- Les voyageurs qui construisent leurs guides depuis les créateurs qu'ils suivent vraiment.
- Toute personne dont la pellicule est à 60% des screenshots jamais rouverts.

Gratuit à essayer. Sign in with Apple. Suppression totale du compte et des données depuis les Réglages, à tout moment.

Fait à Paris.
```
~1830 chars. Structure identique à la VF anglaise : hook -> how-it-works -> wedge screenshot -> bénéfice social -> ICP -> trust closer.

### What's New (v1.0.0) — ~500 char
```
Bienvenue sur Amble 1.0.

La façon la plus rapide de transformer vos screenshots Instagram en carte perso — et de voir ce que vos amis sauvegardent.

Cette première version inclut :
- Import screenshot + extension Share Sheet iOS
- Extraction IA : nom, ville, adresse, catégorie, créateur
- Carte perso propulsée par Apple MapKit
- Suivez vos amis par @username, voyez leurs recos dans l'onglet Réseau
- Sauvegardez leurs lieux dans votre carte en un tap
- Profil public ou privé, à votre convenance
- Sign in with Apple + suppression totale du compte

Fait à Paris. Retours : hello@amble.app.
```
~570 chars.

### Promotional text — 170 char max
```
Stories Instagram, DMs, reels — Amble extrait les lieux là où aucune autre app ne sait lire. Screenshot in, épingle sur la carte out. Gratuit à essayer.
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
- **EN subline** (10 max): `Every other app needs a URL. Amble reads the screenshot.`
- **FR headline**: `Marche sur Stories et DMs`
- **FR subline**: `Les autres exigent une URL. Amble lit le screenshot.`

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

**Tracking**: No. Amble does not use IDFA and does not share any data with third parties for advertising.

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
Publish at `https://robin-gl-pixel.github.io/amble/privacy-policy.html` before submission. Same URL goes in App Store Connect + in-app Settings.

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

The only outlier is Stasht ("Save social inspo") which sits in **Lifestyle** to reflect its universal-saves-inbox positioning. Amble is not that — it is maps-first.

**Secondary category**: **Food & Drink**. Restaurants and bars are the dominant use case per the PRD problem statement. Food & Drink has less crowded charts than Travel and gives a second discovery surface.

Do NOT choose Utilities — it kills App Store editorial consideration for travel roundups, which are the primary earned-media channel in this niche (see Plotline, Rhyme roundup coverage in `docs/competitive-velocity.md`).

### Age rating: **4+**
No mature content, no unrestricted web access (only Instagram-share ingest), no user-to-user communication in v1. All Apple questionnaire answers = None.

### Competitor comparison table

| App | Primary category | Age | Model |
|---|---|---|---|
| Amble (proposed) | Travel | 4+ | Free (v1) |
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
- [ ] Privacy Policy URL live at `https://robin-gl-pixel.github.io/amble/privacy-policy.html`
- [ ] Support URL live at `https://github.com/Robin-gl-pixel/amble/issues` (or Notion page)
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
