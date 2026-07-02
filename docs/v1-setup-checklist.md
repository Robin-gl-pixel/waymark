# Waymark V1 — setup checklist (things only you can do)

Everything in this doc is manual configuration that cannot be automated from code. Work top-down; each section calls out **why** the step exists so you can skip anything that's already in place.

> **How to use this in a new chat:** paste `docs/v1-setup-checklist.md` (or share this file) as the first message. Any Claude Code session can pick up here.

---

## 1. Firebase project — `mappies-7748d`

Console: https://console.firebase.google.com

- [ ] Create project `mappies-7748d`
- [ ] **Authentication → Sign-in method → Apple** → enable
  - Service ID: bundle identifier (`com.robinhesse.waymark` or whatever's in `app.json`)
  - Apple Team ID + Key ID + private key (same values as §3 below)
- [ ] **Firestore → Create database** (region: `europe-west1` to match the Cloud Functions)
- [ ] **Storage → Get started** (region: `europe-west1`)
- [ ] **Web app** → register → copy config into `.env`:
  ```
  EXPO_PUBLIC_FIREBASE_API_KEY=…
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=mappies-7748d.firebaseapp.com
  EXPO_PUBLIC_FIREBASE_PROJECT_ID=mappies-7748d
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=mappies-7748d.firebasestorage.app
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=…
  EXPO_PUBLIC_FIREBASE_APP_ID=…
  ```
- [ ] Deploy Firestore rules: `firebase deploy --only firestore:rules`
- [ ] Deploy Storage rules: `firebase deploy --only storage`

## 2. Cloud Functions secrets (Anthropic + Mapbox)

Set once per environment. These are secrets (not env vars) so they never end up in git.

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set MAPBOX_SECRET_TOKEN
```

**Where to get them:**
- `ANTHROPIC_API_KEY` — https://console.anthropic.com → Settings → API keys
- `MAPBOX_SECRET_TOKEN` — https://account.mapbox.com/access-tokens → Create a token (scopes: `geocoding:read`). Restrict to server URLs if you want belt-and-suspenders.

## 3. Apple Developer — Sign In With Apple key (for `deleteAccount` revoke)

Console: https://developer.apple.com/account/resources/authkeys/list

- [ ] **Keys → +** → name "Waymark Sign In With Apple" → check **Sign In with Apple** → configure → primary App ID = your bundle ID → Continue → Register
- [ ] Download the `.p8` file **once** (you can't re-download it — treat like a password)
- [ ] Note the **Key ID** (10 chars, shown next to the key)
- [ ] Note your **Team ID** (top-right in developer.apple.com)

Then set the four Firebase Functions secrets:

```bash
firebase functions:secrets:set APPLE_TEAM_ID          # 10-char team ID
firebase functions:secrets:set APPLE_KEY_ID           # 10-char key ID from previous step
firebase functions:secrets:set APPLE_CLIENT_ID        # bundle identifier, e.g. com.robinhesse.waymark
firebase functions:secrets:set APPLE_PRIVATE_KEY      # paste .p8 contents INCLUDING -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----
```

Then deploy: `firebase deploy --only functions`.

**Why this exists:** App Store review guideline 5.1.1(v) requires apps that support Sign In With Apple to invalidate the Apple credential on account deletion. Without these secrets, `deleteAccount` still deletes the Firebase user + data, but skips the Apple revoke step (logged as a warning) — which is likely to bounce off Apple review.

## 4. Share Extension — no manual publish

The iOS Share Extension (`expo-share-intent` plugin) ships with the app bundle
— nothing to publish separately. After `expo prebuild`, verify in Xcode that
the extension target `Waymark Share` is present and signed with the same team
as the main app.

## 5. Privacy policy hosting

Apple requires a public HTTPS URL, not a raw markdown file.

Cheapest option — GitHub Pages:

- [ ] Repo → Settings → Pages → Source = `Deploy from a branch` → branch `main` /`docs`
- [ ] Wait ~1 min → note the URL (e.g. `https://robin-gl-pixel.github.io/waymark/privacy-policy`)
- [ ] Paste that URL into `docs/app-store-metadata.md` under "Privacy policy URL"
- [ ] Reference it in the App Store Connect submission

Alternative — Vercel: `vercel deploy` from the repo root; the URL comes back on stdout.

## 6. App Store Connect + EAS

- [ ] App Store Connect → **My Apps → + → New App**
  - Bundle ID = your bundle ID (must match `app.json`'s `ios.bundleIdentifier`)
  - Note the **App ID** (numeric, 10 digits)
- [ ] Edit `eas.json`: replace `"ascAppId": "TO-BE-FILLED-AFTER-APP-STORE-CONNECT-INIT"` with the numeric App ID
- [ ] `eas login` (if not already)
- [ ] `npx eas credentials` → set up the iOS signing bundle
- [ ] `npm run build:ios:prod` → wait ~15 min
- [ ] `npm run submit:ios` → upload to TestFlight
- [ ] Add yourself as internal tester → install on device → **actually complete the golden path**: sign in, screenshot Insta → Partager → Waymark, see the pin, tap into detail, delete account

## 7. Assets to produce manually

- [ ] **5 App Store screenshots** (1290×2796 for 6.9" display). Suggested content per `app-store-metadata.md`:
  1. Onboarding "problem" slide
  2. Upload flow with an extracted card
  3. List view with several pins
  4. Map view with clusters
  5. Detail view with notes
- [ ] **3 onboarding illustrations** if you want richer visuals than the current text-first `OnboardingScreen` (once we build it — currently on the punch list)
- [ ] **App icon** — already at `assets/icon.png` (1024×1024). Verify it matches the current brand.

## 8. Submit for review

- [ ] App Store metadata (title, subtitle, keywords, description FR + EN) filled — see `docs/app-store-metadata.md`
- [ ] Privacy policy URL entered
- [ ] Delete-account walkthrough in description (Apple 5.1.1(v))
- [ ] TestFlight build passed on real device
- [ ] Hit **Submit for Review**

---

## What's already wired (no action needed)

Just for your reference — these have code but need §1–§6 config to actually run:

- Sign in with Apple + AuthService seam (`src/services/authService.ts`)
- Extraction pipeline (Cloud Function `extract` + `UploadScreen`)
- LieuxService seam + Firestore + Storage + `getScreenshotUrl` (`src/services/lieuxService.ts`)
- Map with clustering (`react-native-map-clustering`)
- Lieu detail with debounced userNotes autosave
- Delete account (Firestore + Storage + Auth + Apple revoke) — needs §3 secrets to fully work
- iOS Share Extension (`expo-share-intent`) — extracts inside the app after the user taps Waymark in the share sheet
- Manrope font family loaded via `@expo-google-fonts/manrope`
- Privacy policy draft in `docs/privacy-policy.md` — needs §5 hosting
- Onboarding, unit tests for the seam, golden extraction eval — track under remaining follow-ups
