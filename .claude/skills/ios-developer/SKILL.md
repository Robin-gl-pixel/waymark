---
name: ios-developer
description: Guidance for shipping an iOS app to the App Store — Apple submission requirements (metadata, privacy, screenshots, Info.plist, Sign in with Apple, data collection, delete account, encryption), RGPD/GDPR compliance for EU users, provisioning + signing, TestFlight distribution, common rejection reasons. Use when preparing an App Store submission, reviewing an app for compliance, updating Info.plist keys, or planning a TestFlight release.
---

# iOS Developer — App Store Submission

Take the perspective of an experienced iOS release engineer who has shipped ~30 apps through App Review and has an itemised checklist in memory. The goal is not to write code — it's to catch anything Apple or a European regulator will flag before the user does.

Ground every claim in what you can observe in the repo (`app.json`, `docs/privacy-policy.md`, `docs/app-store-metadata.md`, native Info.plist entries in `ios/*/Info.plist` when generated). If a section isn't verifiable from the repo state, say "unverified — needs to be checked in App Store Connect / device" rather than assuming.

## The reality of App Review

App Review is a human plus automated pipeline. Small metadata mismatches (screenshot showing a different name than the App Store title, privacy policy URL that 404s, missing "Delete Account" affordance) trigger rejection. Most rejections in 2025-2026 fall into ~10 buckets, listed below. Enumerate them before saying "ready to ship".

## Compliance checklist (must-pass before submission)

### 1. Sign in with Apple (guideline 4.8)

If the app offers third-party or social login, it MUST also offer Sign in with Apple, and the SIWA button must render first or with equivalent visual weight. If the ONLY auth is anonymous / email-password / Apple → no obligation.

- Check `AuthScreen` for the Sign in with Apple button.
- Verify `expo-apple-authentication` is in dependencies.
- Verify `usesAppleSignIn: true` in `app.json` under `ios`.
- If SIWA is present, verify server-side revocation is wired for `deleteAccount` (Apple guideline 5.1.1(v) — see below).

### 2. Delete account inside the app (5.1.1(v))

Since June 30, 2022. The affordance MUST live inside the app, not in a support ticket or email.

- Check for a "Supprimer mon compte" / "Delete account" button in Settings.
- Verify it calls the backend to fully purge Firestore + Storage + Auth records (`deleteAccount` Cloud Function).
- For SIWA sign-ins, verify the app also revokes the Apple refresh token server-side (`exchangeAppleAuthorizationCode` → stored token → revoke on delete). Apple review DOES test this.

### 3. Info.plist usage descriptions (2.5.16 / privacy)

Every native permission the app requests needs a human-readable string. In Expo, these live under `expo.ios.infoPlist` in `app.json`:

- `NSPhotoLibraryUsageDescription` — required for `expo-image-picker` and `expo-share-intent` image intake
- `NSCameraUsageDescription` — required if `expo-camera` or if Info.plist declares camera capability
- `NSLocationWhenInUseUsageDescription` — required for `expo-location`
- `NSMicrophoneUsageDescription` — required for video recording
- `NSContactsUsageDescription` — required for the SeededFollow contacts import if implemented

The string must be specific to the app's actual use — Apple rejects generic "This app uses your camera." Include the user-visible product name.

### 4. Privacy Manifest (`PrivacyInfo.xcprivacy`)

Required since May 2024. Two axes:

- **`NSPrivacyAccessedAPITypes`** — declare each "required reason API" used by the app or any bundled framework (UserDefaults, filesystem timestamps, disk space, system uptime, active keyboard). Missing declarations → rejection.
  - `NSPrivacyAccessedAPICategoryUserDefaults` → reason CA92.1 (functionality of your app) covers most persistent-flag usage.
- **`NSPrivacyTrackingDomains`** — list any domain that tracks user activity across apps.

In Expo, configured under `expo-build-properties` plugin → `ios.privacyManifests.NSPrivacyAccessedAPITypes`.

Also verify the same manifest exists inside each Share Extension bundle if one is shipped (native `PrivacyInfo.xcprivacy` file, common oversight).

### 5. App Privacy questionnaire (App Store Connect)

Filled directly in App Store Connect, NOT in code, but must match what the app actually does. Common categories to declare accurately:

- **Contact info** — email if you use Firebase Auth email flow.
- **Identifiers** — Firebase Analytics ID / device identifier.
- **Usage data** — analytics events.
- **User content** — screenshots, notes, place data.
- **Location** — if the map centres on user's position.

For each category, declare: linked to identity, used for tracking, used for advertising. Under-declaring is the #2 rejection reason in 2026.

### 6. Encryption export compliance (ITSAppUsesNonExemptEncryption)

- If you use only standard HTTPS (TLS from iOS system libraries), set `ITSAppUsesNonExemptEncryption: false` in Info.plist to skip the yearly export compliance form.
- If you bundle a non-Apple crypto library, you must file the annual self-classification.

### 7. RGPD / GDPR (users in the EU)

Not part of App Review but enforceable and separately audited. Required:

- **Privacy policy URL** live at a stable URL, referenced in App Store Connect AND in-app. Must cover: what data is collected, why, retention, subject rights (access, rectification, deletion, portability, objection), controller identity, DPO if applicable, legal basis, third-party processors (Firebase, Anthropic, Mapbox, etc.).
- **Right to delete** — covered by the delete-account flow above.
- **Right to access / export** — implement a data export or explicitly allow via email request in the privacy policy.
- **Cookie / tracking consent** — only if the app uses tracking. If the app declares "not used to track" in the App Privacy questionnaire, no CMP banner is required.
- **Sub-processors** disclosed in the privacy policy: Firebase (Google), Anthropic (US), Mapbox (US), and any others. Include their data processing agreements.

### 8. Metadata & screenshots

- **App name** in App Store Connect must match `CFBundleDisplayName` and marketing name. Mismatch → rejection.
- **Screenshots**: 6.7" iPhone (1290×2796 or 1320×2868 depending on the pinned device) — must show real UI, not concept mockups. No competitors' logos.
- **App preview video** optional but boosts install rate; must be under 30s.
- **Promotional text** (170 chars) can be edited post-submission; **description** cannot until an app update.
- **Keywords** (100 chars total) — separate with commas, no spaces. Search algorithm heavily weights these.
- **Support URL** must be a live page. Reject a placeholder / "coming soon" page.

### 9. Age rating

Set based on Apple's questionnaire. For a general audience social app with no user-generated NSFW content: usually 12+ (User Generated Content — Infrequent / Mild) if any social features exist, else 4+.

### 10. Test on TestFlight before final submission

Internal testers first (up to 100, no review, instant), then external testers (up to 10,000, requires an initial review — usually 1-2 days). Never submit to production without at least one TestFlight build tested end-to-end on a real device.

## Common rejection reasons (memorise these)

1. **Guideline 5.1.1(v)** — no in-app delete account, or delete doesn't purge server-side.
2. **App Privacy under-declaration** — data collected but not listed in questionnaire.
3. **Missing Privacy Manifest** — introduced 2024, still catches teams.
4. **Sign in with Apple missing** while offering another 3rd-party login.
5. **NSXxxUsageDescription too vague** — must be specific.
6. **Metadata mismatch** — display name in app ≠ App Store name.
7. **Sandbox test account not provided** for demo login.
8. **Guideline 4.3 spam** — clone of an existing app template. Not usually relevant if you built the app from scratch.
9. **Privacy policy URL 404** or hosted on a domain that redirects.
10. **Uses undocumented API** — flagged by static scan.

## How to use this skill

When the user asks "is the app ready to ship", walk through sections 1-10 in order. For each, produce a verdict:

- ✅ **Verified** — I read file `X`, it says `Y`, that satisfies the requirement.
- ⚠️ **Unverified — user must check** — this lives in App Store Connect / requires a device / needs an external test. Provide the exact steps to check.
- ❌ **Blocker** — something is missing or wrong. Say what and how to fix.

Never say "ready to ship" without walking the whole list.

For a first submission, the workflow is:

1. Section 1-6 review (code + Info.plist) — the pre-flight I can do from the repo.
2. Give the user the App Store Connect setup checklist for section 7-9 (metadata + App Privacy + Age Rating).
3. Ship a TestFlight build (section 10), test the golden path on a real device, verify Sign in with Apple + delete account + one Share Extension flow.
4. Only then hit "Submit for Review".

## Repo-specific pointers

- App name history and pointer to the current name: check the memory file `project_waymark_rename.md`. The name has pivoted a few times — don't assume from `app.json` alone.
- Bundle IDs stay `com.robinhesse.waymark` regardless of display-name pivots (deliberate, keeps Firebase / repo / provisioning stable).
- Privacy policy is hosted via GitHub Pages from `docs/privacy-policy.md` (see git log: "docs(metadata): point privacy + support URLs to live GitHub Pages").
- Share Extension bundle `com.robinhesse.waymark.share-extension` requires its OWN `PrivacyInfo.xcprivacy` — verify at build time.
- Cloud Functions live in `europe-west1` — data residency claim in the privacy policy should say "servers in the EU (europe-west1)".
- Firebase project `mappies-7748d` is the data controller alias. Referenced in `.env` — that's the operational name to use in the privacy policy sub-processor list ("Google Firebase — project mappies-7748d").
- Delete account path: `SettingsScreen → deleteAccount Cloud Function → Firestore purge + Auth delete + Apple token revoke via stored refresh token`. All wired — verify each leg still passes on TestFlight.
- IAM: all Cloud Functions in europe-west1 have `roles/run.invoker: allUsers` — that's how the client (Firebase SDK) invokes them. The functions do their own auth check.

## When NOT to use this skill

- Not for design questions (use `frontend-design`).
- Not for React Native runtime bugs (regular code diagnosis).
- Not for backend / Cloud Functions logic — those are just standard Node code.
- Not for pre-App-Store questions like "which auth to build" — the skill assumes the app is close to submission-ready and needs a final pass.
