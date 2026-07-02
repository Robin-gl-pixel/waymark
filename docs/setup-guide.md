# Waymark — Manual Setup Guide

Everything Robin needs to click through in browsers, Apple Developer portal, and Xcode so that when the Waymark code lands, it will compile and Sign in with Apple will work end-to-end.

Estimated time: **30–45 minutes**. Do the sections in order — later steps depend on earlier ones (Apple Team ID → App ID → Services ID → Key → Firebase).

---

## Prerequisites checklist

Before you start, confirm:

- [ ] macOS with Xcode installed (`xcode-select -p` returns a path)
- [ ] Active Apple Developer account paid seat — Team ID `QFZK63FH8F` (same as Theater's, reuse it)
- [ ] Apple ID for portal login: `hesserobin57@yahoo.fr`
- [ ] Google account signed in to browser (for Firebase Console)
- [ ] Expo account: **`robiintesteur`** (verified from Theater's `app.json` — reuse this account)

If you want a fresh Expo account for Waymark (recommended for cleaner billing/limits), sign in at https://expo.dev and create one; otherwise keep `robiintesteur`.

---

## 1. Firebase project creation

### 1a. Create the project

1. Open https://console.firebase.google.com/
2. Click **Add project** (or "Create a project" if this is your first).
3. Project name: **`waymark-app`**
   - Firebase will auto-generate a project ID like `waymark-app` or `waymark-app-XXXXX`. Accept whatever it suggests — you don't need it to be pretty.
4. Google Analytics: **enable** (choose or create an account — "Default Account for Firebase" is fine).
5. Wait ~30 seconds for provisioning, then click **Continue**.

### 1b. Add the iOS app

1. On the Firebase project overview, click the **iOS+** icon ("Add app → iOS").
2. **Apple bundle ID:** `com.robinhesse.waymark`
   - Format check: reverse-DNS, all lowercase, no underscores, no spaces. `com.robinhesse.waymark` is valid.
   - Write it down — you'll use the **exact same string** in the Apple Developer portal (Section 2) and in `app.json` later. A single character mismatch breaks everything.
3. App nickname: `Waymark iOS` (cosmetic only)
4. App Store ID: **leave blank** (not on App Store yet)
5. Click **Register app**.
6. Click **Download GoogleService-Info.plist** — this is a one-click download.
7. **Where to put it:** save it to `/Users/robinhesse/Documents/1. GitHub/3. Waymark/GoogleService-Info.plist` (project root).
   - When the Expo project scaffolds, `app.json` will reference it via `ios.googleServicesFile: "./GoogleService-Info.plist"`. Do **not** commit this file to git — I'll add it to `.gitignore` when the code lands.
8. Skip the "Add Firebase SDK" and "Add initialization code" steps — the Expo template handles those. Click **Next → Next → Continue to console**.

### 1c. Enable Authentication (Apple provider)

1. Left sidebar → **Build → Authentication**.
2. Click **Get started**.
3. **Sign-in method** tab → find **Apple** → click it → toggle **Enable**.
4. **Leave the Services ID / Team ID / Key ID / Private key fields blank for now** — you'll fill them in at the end of Section 2. Click **Save** (Firebase allows saving with these blank on Apple; if it refuses, come back after Section 2).

### 1d. Enable Firestore

1. Left sidebar → **Build → Firestore Database**.
2. Click **Create database**.
3. Location: **`eur3 (europe-west)`** — closest to Paris users; matches Theater if you want data residency parity. This is **permanent**, so choose deliberately.
4. Start in **production mode** (locked-down rules — code will ship proper rules).
5. Click **Enable**.

### 1e. Enable Storage

1. Left sidebar → **Build → Storage**.
2. Click **Get started**.
3. Start in **production mode**.
4. Location: same as Firestore (`eur3` should auto-select).
5. Click **Done**.

### 1f. Enable Functions

1. Left sidebar → **Build → Functions**.
2. Click **Get started** → **Continue** through the "install CLI" screens (you'll do this later from the terminal, not now).
3. **Cloud Functions requires the Blaze (pay-as-you-go) plan.** If you're still on Spark, Firebase will prompt you to upgrade:
   - Click **Upgrade project** → link a billing account (reuse whatever Theater is on if convenient).
   - Set a **budget alert** at €5/month so you get an email if something runs away.
4. No functions to deploy yet — just verify the tab loads without errors.

---

## 2. Sign in with Apple — Apple Developer portal

Portal: https://developer.apple.com/account (log in with `hesserobin57@yahoo.fr`).

You need **four things** from this section, all pasted into Firebase at step 2e:

| Value | Where you get it |
| --- | --- |
| Team ID | Top-right of developer portal (`QFZK63FH8F`) |
| Services ID (Bundle ID) | Created in step 2b |
| Key ID | Shown when you create the key in step 2c |
| `.p8` private key file | Downloaded once in step 2c |

### 2a. Create the App ID

1. https://developer.apple.com/account/resources/identifiers/list
2. Click the **+** next to "Identifiers".
3. Select **App IDs** → **Continue** → Type **App** → **Continue**.
4. Description: `Waymark iOS App`
5. **Bundle ID:** Explicit → `com.robinhesse.waymark` (must match Firebase exactly).
6. Scroll the capabilities list and check **Sign In with Apple** (leave "Enable as a primary App ID" selected — this is the default and correct choice).
7. Click **Continue → Register**.

### 2b. Create the Services ID (for the Firebase-side handshake)

Firebase's Apple provider needs a **Services ID** as its OAuth client ID — this is separate from the App ID even though they look similar.

1. Back at https://developer.apple.com/account/resources/identifiers/list → **+**.
2. Select **Services IDs** → **Continue**.
3. Description: `Waymark Sign In Service`
4. **Identifier:** `com.robinhesse.waymark.signin`
   - Convention: App ID + `.signin` suffix. Must be **different** from the App ID.
5. Continue → Register.
6. Now click the Services ID you just created to edit it.
7. Check **Sign In with Apple** → click **Configure**.
8. Primary App ID: select `com.robinhesse.waymark` (the App ID from 2a).
9. **Domains and Return URLs** — get these from Firebase:
   - In Firebase Console → Authentication → Sign-in method → Apple → expand the config. Firebase shows a callback URL like `https://waymark-app-XXXXX.firebaseapp.com/__/auth/handler`. Copy it.
   - Back in Apple: **Domains:** `waymark-app-XXXXX.firebaseapp.com` (host only, no `https://`).
   - **Return URLs:** paste the full `https://.../__/auth/handler` URL.
10. Click **Next → Done → Continue → Save**.

Note: for the **native iOS flow** (`expo-apple-authentication` on-device), you don't strictly need the Services ID — the App ID + native SDK is enough. But Firebase still wants the Services ID string as the "OAuth client ID" field, and you need the return-URL config the moment you ever want a web fallback. Do it now, save the future headache.

### 2c. Generate the Sign in with Apple private key (.p8)

1. https://developer.apple.com/account/resources/authkeys/list → **+**.
2. Key Name: `Waymark Sign In With Apple Key`
3. Check **Sign in with Apple** → click **Configure** next to it.
4. Primary App ID: `com.robinhesse.waymark` → **Save**.
5. Click **Continue → Register**.
6. **Download the `.p8` file — you get exactly ONE chance.** Save it to `~/Documents/apple-keys/AuthKey_MAPPIES.p8` (or somewhere you'll remember and back up). **Do not** put this in the git repo.
7. **Copy the Key ID** shown on this page (10-character string like `ABC1234DEF`) — write it down, you'll need it in 2e.

### 2d. Grab your Team ID

Top-right corner of the developer portal, under your name — a 10-character string. Should be `QFZK63FH8F` (Theater's team, reuse it). Confirm and note it.

### 2e. Paste into Firebase Console

1. Firebase Console → **Authentication → Sign-in method → Apple** → edit the Apple provider.
2. Fill in:
   - **Services ID:** `com.robinhesse.waymark.signin` (from 2b)
   - **Apple Team ID:** `QFZK63FH8F` (from 2d)
   - **Key ID:** the 10-char ID from 2c
   - **Private key:** open the `.p8` file in a text editor, copy the **entire contents** including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines, paste into the field.
3. Click **Save**.

Sign in with Apple is now wired end-to-end from Firebase's perspective. The native iOS side still needs `usesAppleSignIn: true` in `app.json` — that comes with the code.

---

## 3. EAS / Expo credentials

### 3a. Verify your Expo account

Terminal:

```
npx eas-cli whoami
```

- If it prints `robiintesteur`, you're logged in on the same account as Theater. Good.
- If it says "Not logged in," run `npx eas-cli login` and use the Expo credentials you use for Theater.
- If you want a separate Expo account for Waymark, run `npx eas-cli logout` then `npx eas-cli register` (or log in as the new user). Decide now — the `owner` field goes in `app.json`.

### 3b. Understand the Theater EAS pattern (reference)

Theater's `eas.json` (at `/Users/robinhesse/Documents/1. GitHub/1. Theater/event_log/eas.json`) uses three build profiles:

- `development` — dev client, internal distribution (for on-device debugging)
- `preview` — internal distribution, iOS simulator build (for TestFlight-style sharing / simulator dogfooding)
- `production` — auto-incremented build number, `m-medium` resource class (for App Store submit)

Its `submit.production.ios` block hardcodes `appleId`, `ascAppId`, `appleTeamId` — you won't have `ascAppId` for Waymark until App Store Connect has a listing, so leave that blank or omit `submit` for now.

### 3c. Template `eas.json` for Waymark (drop-in when code arrives)

You don't need to create this file yourself — the code delivery will drop it in. But so you know what to expect at `/Users/robinhesse/Documents/1. GitHub/3. Waymark/eas.json`:

```json
{
  "cli": {
    "version": ">= 5.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "environment": "production",
      "ios": { "simulator": true }
    },
    "production": {
      "autoIncrement": true,
      "ios": { "resourceClass": "m-medium" }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "hesserobin57@yahoo.fr",
        "appleTeamId": "QFZK63FH8F"
      }
    }
  }
}
```

Difference from Theater: the `development` profile has `ios.simulator: true` so you can run dev-client builds in the iOS simulator (Theater builds dev on-device). We want simulator-friendly for Waymark while it's early.

### 3d. Pre-authorize EAS to touch Apple credentials

When the first `eas build` runs, EAS will ask for your Apple ID password and 2FA code so it can create provisioning profiles and distribution certificates automatically. Do this preflight so it's not a surprise mid-build:

1. Confirm 2FA is on for `hesserobin57@yahoo.fr` at https://appleid.apple.com/account/manage.
2. Have your trusted device (phone) nearby when you first run `eas build`.
3. EAS stores the resulting certificates in its own vault — nothing goes on your keychain. You do **not** need to pre-generate certificates in the developer portal; EAS does it.

---

## 4. Xcode simulator prep

### 4a. Verify simulator install

Your machine already has:

- iOS 26.4 runtime
- iOS 26.5 runtime

(Confirmed via `xcrun simctl list runtimes`.) That's fine for Waymark — Sign in with Apple works from iOS 13+ and both these runtimes are far past that.

### 4b. Deployment target

- **Recommended minimum: iOS 17.0.** Rationale:
  - Sign in with Apple has been rock-solid since iOS 13 but iOS 17 has the cleanest APIs and matches Expo SDK 54's default minimums.
  - iOS 17 covers ~95%+ of installed iPhones (July 2026).
  - Anything below iOS 17 forces you to keep polyfills for `expo-crypto`, older Firebase quirks, and `expo-apple-authentication` fallback paths. Not worth it.
- You do **not** need to install an iOS 17 simulator — runtimes are backward-compatible. iOS 26.5 will happily run an app targeting 17.0.

Nothing to click here — this is just to note: when the code arrives, `app.json` will set `ios.deploymentTarget: "17.0"` and you should leave it.

### 4c. **Testing implication — read carefully**

`expo-apple-authentication` **does not work in Expo Go.** Native Apple Sign-in requires the `AuthenticationServices` framework linked at build time, which Expo Go doesn't include.

Practical consequence for today:

- You **cannot** test Sign in with Apple by scanning a QR code and opening Expo Go.
- You **must** use a development build (a.k.a. dev-client).
- Two ways to make a dev-client build:
  1. **`eas build --profile development --platform ios`** — cloud build, ~15 min, gives you a `.ipa` you install on-device or a simulator build you drag into Simulator.app.
  2. **`npx expo run:ios`** — local Xcode build, faster iteration once your machine has all the deps.
- Once the dev-client is installed (either method), you scan the QR from `npx expo start` with **that** app instead of Expo Go, and hot-reload works normally.

Known SDK 54 gotcha: [expo/expo#36798](https://github.com/expo/expo/issues/36798) — Sign in with Apple returns `ERR_REQUEST_UNKNOWN` on `expo run:ios --device` (local dev builds on a physical device) but works in Expo Go and EAS-built dev clients. **Mitigation for Waymark:** first Sign in with Apple test should be with an EAS-built dev client (`eas build --profile development`) or in the simulator, not a device-attached `expo run:ios`.

### 4d. Boot a simulator now (smoke test)

Optional but a good confidence-builder:

```
open -a Simulator
xcrun simctl boot "iPhone 16 Pro" 2>/dev/null || xcrun simctl list devices available | head -20
```

You should see a simulator window boot within ~20s. If not, open Xcode once (`open -a Xcode`), accept any first-run prompts, and try again.

---

## 4bis. MCP servers setup (Claude Code)

The repo already has `/Users/robinhesse/Documents/1. GitHub/3. Waymark/.mcp.json` configured with three MCP servers: **GitHub**, **Firebase**, and **Context7**. Each needs manual auth/setup before Claude Code can use it.

### GitHub MCP — needs a Personal Access Token

The config uses `${GITHUB_PERSONAL_ACCESS_TOKEN}` from your shell env.

1. Go to https://github.com/settings/tokens → **Generate new token → Fine-grained token**.
2. Name: `Claude Code Waymark MCP`
3. Expiration: 90 days (or "no expiration" if you want to forget about it).
4. Repository access: **Only select repositories** → pick the Waymark repo (create it first on GitHub if it doesn't exist yet).
5. Permissions (repository): Contents = Read/Write, Issues = Read/Write, Pull requests = Read/Write, Metadata = Read (auto).
6. Generate → copy the token (`github_pat_...`).
7. Add to your shell profile. If you use zsh:
   ```
   echo 'export GITHUB_PERSONAL_ACCESS_TOKEN="github_pat_XXXXX"' >> ~/.zshrc
   source ~/.zshrc
   ```
8. Verify: `echo $GITHUB_PERSONAL_ACCESS_TOKEN` should print the token.

### Firebase MCP — needs Firebase CLI login

The config launches `npx firebase-tools@latest mcp`, which reads your local Firebase CLI session.

1. Terminal: `npx firebase-tools@latest login`
2. It opens your browser → log in with the Google account that owns the `waymark-app` project (Section 1).
3. Back in terminal: `npx firebase-tools@latest projects:list` — you should see `waymark-app` in the list.
4. Set the default project for the Waymark directory:
   ```
   cd "/Users/robinhesse/Documents/1. GitHub/3. Waymark"
   npx firebase-tools@latest use waymark-app
   ```
5. That's it — the MCP server will pick up your session automatically.

### Context7 MCP — zero setup

`npx -y @upstash/context7-mcp` runs anonymously. No auth needed. First launch will download the package (~10s).

### Restart Claude Code

After setting the `GITHUB_PERSONAL_ACCESS_TOKEN` env var and logging into Firebase CLI:

1. **Quit Claude Code fully** (Cmd+Q, not just close window).
2. Reopen it in the Waymark directory: `cd "/Users/robinhesse/Documents/1. GitHub/3. Waymark" && claude`
3. On startup, Claude Code will prompt you to approve the MCP servers listed in `.mcp.json` — approve them.
4. Run `/mcp` in Claude Code to verify all three show as "connected".

If GitHub shows an auth error, your token isn't in the env — restart your terminal, then Claude Code again.

---

## 5. Verify current versions (from Theater reference)

Confirmed by reading `/Users/robinhesse/Documents/1. GitHub/1. Theater/event_log/package.json`:

| Package | Theater version | Waymark target |
| --- | --- | --- |
| `expo` | `~54.0.33` | **SDK 54** — same |
| `expo-apple-authentication` | `~8.0.8` | **`~8.0.8`** — same |
| `firebase` | `^12.12.0` | `^12.12.0` — same |
| `react` | `19.1.0` | `19.1.0` |
| `react-native` | `0.81.5` | `0.81.5` |
| `expo-auth-session` | `~7.0.10` | `~7.0.10` |
| `expo-crypto` | `~15.0.9` | `~15.0.9` |

Rationale: match Theater exactly to reuse the same code patterns (Firebase init, Apple auth handler) and avoid multi-version debugging.

### 5a. Known issues on Expo SDK 54 + `expo-apple-authentication`

Web-searched July 2026:

1. **`expo run:ios --device` returns `ERR_REQUEST_UNKNOWN`** on Sign in with Apple — see [expo/expo#36798](https://github.com/expo/expo/issues/36798). Works fine in Expo Go, EAS-built dev clients, and simulator dev builds. **Action:** use EAS dev builds or simulator, not local device runs, for Apple-auth testing.
2. **Xcode Swift compile error on newer Xcodes** — exhaustive switch in `AppleAuthenticationExceptions.swift` (older issue, [expo/expo#31555](https://github.com/expo/expo/issues/31555)) — patched in `~8.0.8`, no action needed if you stay on that version.
3. **SDK 55/56 iPhone 16 A18 Pro production crash** — [expo/expo#44680](https://github.com/expo/expo/issues/44680) — **not applicable**, we're staying on SDK 54.

No blockers for the setup path. Move ahead.

---

## Done — verification checklist

Before you tell Claude "code away," confirm all of these:

- [ ] Firebase project `waymark-app` exists, iOS app registered with bundle ID `com.robinhesse.waymark`
- [ ] `GoogleService-Info.plist` downloaded and saved to `/Users/robinhesse/Documents/1. GitHub/3. Waymark/GoogleService-Info.plist`
- [ ] Firestore, Storage, Functions (Blaze plan) all enabled
- [ ] Apple App ID `com.robinhesse.waymark` created with Sign In with Apple capability
- [ ] Apple Services ID `com.robinhesse.waymark.signin` created and configured with Firebase's return URL
- [ ] Apple `.p8` private key downloaded to `~/Documents/apple-keys/AuthKey_MAPPIES.p8` (backed up)
- [ ] Key ID (10-char) written down: `_______________`
- [ ] Team ID confirmed: `QFZK63FH8F`
- [ ] Firebase Console → Auth → Apple provider has Services ID + Team ID + Key ID + `.p8` contents pasted and saved
- [ ] `npx eas-cli whoami` returns `robiintesteur` (or your chosen Expo account)
- [ ] Simulator boots when you run `open -a Simulator`
- [ ] You understand: **Apple Sign-in requires a dev-client build; Expo Go will not work**
- [ ] `GITHUB_PERSONAL_ACCESS_TOKEN` exported in `~/.zshrc` and visible via `echo $GITHUB_PERSONAL_ACCESS_TOKEN`
- [ ] `npx firebase-tools@latest projects:list` shows `waymark-app`
- [ ] Claude Code `/mcp` shows GitHub, Firebase, Context7 all connected

When all boxes are ticked, tell Claude — code delivery can begin.

---

## Reference URLs

- Firebase Console: https://console.firebase.google.com/
- Apple Developer Identifiers: https://developer.apple.com/account/resources/identifiers/list
- Apple Developer Keys: https://developer.apple.com/account/resources/authkeys/list
- Expo dashboard: https://expo.dev/accounts/robiintesteur
- Expo Apple Auth docs: https://docs.expo.dev/versions/latest/sdk/apple-authentication/
- Known issue #36798 (dev-client Apple Sign-in): https://github.com/expo/expo/issues/36798
