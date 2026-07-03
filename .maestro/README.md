# Maestro E2E smoke tests

Fast smoke tests that drive the iOS Simulator via Expo Go. No native build required.

## One-time setup

1. Install Maestro CLI:
   ```
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```
   Add `~/.maestro/bin` to your PATH if the installer says so.

2. Install Expo Go on your iOS Simulator (once):
   ```
   xcrun simctl install booted "$(find ~/Library/Developer/Xcode -name 'Expo Go.app' | head -1)"
   ```
   Or: run `npx expo start`, press `i` to boot the sim + install Expo Go automatically.

## Running

In one terminal, start the dev server:
```
npx expo start
```
Open Expo Go in the sim and load Waymark once (tap the project in Expo Go's
"Recently opened", or scan the QR).

In another terminal:
```
npm run test:e2e            # runs all .maestro/*.yaml
npm run test:e2e:launch     # just the launch check
npm run test:e2e:login      # anon-login flow
```

## Extending

- Match elements by visible text OR by `testID` on the RN component.
- Add `testID="foo"` to any `<Pressable>` / `<View>` you want to target — much
  more stable than matching on French UI copy that may change.
- Reference: https://maestro.mobile.dev/api-reference/commands
