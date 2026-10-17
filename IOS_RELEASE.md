# AmpMap iPhone app: how releases work

The iPhone app is a Capacitor 8 shell in `native/` that bundles the same Vite web app (built into `native/www`).
The website on Vercel is not affected by anything in `native/`.

- Bundle id `com.funline30.ampmap`, app name AmpMap, version 1.0, iPhone only.
- Native-only behaviour lives in `src/native.js` and is gated by `window.Capacitor.isNativePlatform()`:
  public links/QR codes point at https://panel-buddy.vercel.app, website pages open in Safari,
  Print = iOS print sheet, Share/exports = iOS share sheet (`native/ios/App/App/AmpNativePlugin.swift`).
- `Delete my account` (More screen, route `#/account/delete`) works on web and iPhone with the current Firestore rules.

## Workflows (GitHub Actions, macOS runner; repo is public so minutes are free)
- `iOS build (simulator, unsigned)` (`.github/workflows/ios-build.yml`): every push to `ios-capacitor`; runs web tests,
  builds for the simulator, boots it and takes two screenshots. No secrets.
- `iOS release (TestFlight)` (`.github/workflows/ios-release.yml`): **edit `native/release.txt` on `ios-capacitor`**
  (add a line) to start it, or run it by hand from the Actions tab. Archive unsigned, export with Xcode cloud-managed
  signing using the App Store Connect API key, upload with altool, then (Linux job) wait for processing, set export
  compliance, add the build to the internal group "Caleb" and invite funlinevlogs@icloud.com.
  Build number = the workflow's run number.

Repository secrets (set by Caleb, never printed): `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`
(the whole .p8 text; same key as Runs Ledger, Admin role).

## Local
    cd native && npm ci && npm run sync:ios && npx cap open ios   # on a Mac with Xcode
