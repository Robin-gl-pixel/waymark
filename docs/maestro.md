# Maestro E2E tests

Automated iOS flows to catch regressions before shipping.

## Prereqs

- Xcode + iPhone simulator booted (any recent iPhone, iOS 26.x)
- Java 17 (`brew install openjdk@17`)
- Maestro CLI (`curl -Ls https://get.maestro.mobile.dev | bash`)
- `PATH` must include `/opt/homebrew/opt/openjdk@17/bin` and `~/.maestro/bin`

Quick add to shell:
```bash
export PATH="/opt/homebrew/opt/openjdk@17/bin:$HOME/.maestro/bin:$PATH"
```

## Setup a fresh sim

Assumes iPhone 17 Pro sim ID `D068A5AD-153E-475E-BD84-6EC714A15BA4` (adjust if you use a different one).

```bash
SIM=D068A5AD-153E-475E-BD84-6EC714A15BA4

# Fresh state (wipes media + settings)
xcrun simctl shutdown $SIM && xcrun simctl erase $SIM && xcrun simctl boot $SIM

# Build + install the app
cd ios && xcodebuild -workspace Pinti.xcworkspace -scheme Pinti \
  -configuration Debug \
  -destination "platform=iOS Simulator,id=$SIM" \
  -derivedDataPath build build
xcrun simctl install $SIM ios/build/Build/Products/Debug-iphonesimulator/Pinti.app

# Seed the Photos library with the reference screenshot (for tests that need it later)
xcrun simctl addmedia $SIM screenshots-examples/scr1.png
```

## Run tests

```bash
maestro test .maestro/00_smoke.yaml
maestro test .maestro/10_golden_path.yaml
```

Or run the whole folder:
```bash
maestro test .maestro/
```

## What each test covers

| File | Scope |
|---|---|
| `00_smoke.yaml` | App launches, auth screen renders with all buttons |
| `10_golden_path.yaml` | Auth → Map → + tab → Upload → open Photo picker |

## What Maestro does NOT cover

- **PHPicker cell selection** (iOS 26 quirk — Maestro tap on a photo cell doesn't register as selection). We stop at "picker chrome visible".
- **Extract / geocode / save** — covered instead by curl in `docs/preflight.md` (server-authoritative).
- **Sign in with Apple** — needs a real device with iCloud session.
- **Share Extension trigger** — needs manual test in Photos app or Instagram.

## Debugging a failure

Maestro dumps artifacts to `~/.maestro/tests/<timestamp>/`:
- `screenshot-❌-*.png` — screen state at the failing step
- `maestro.log` — verbose Maestro internals
- `commands-*.json` — replay-able command sequence

If a step consistently fails on a new iOS version:
1. Read the failing screenshot — does the UI actually match what we assert?
2. Update the assertion text (e.g. Apple renames "Continue with Apple" between versions)
3. Coordinate-based taps (`point: "X%,Y%"`) may need re-measuring — layouts shift between iOS majors
