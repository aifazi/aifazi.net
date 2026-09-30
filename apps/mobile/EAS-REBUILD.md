# EAS rebuild handoff (D3, audit round 2)

Owner-side task: ship a fresh native build. OTA updates cannot carry native
manifest changes, so the fixes below only reach installed APKs after a rebuild.

## Why a rebuild is pending

`plugins/with-android-manifest` (runs last in `app.json` `plugins`) rewrites the
generated `AndroidManifest.xml` at prebuild time. Its changes — `allowBackup`
forced off (audit P0-3), dev scheme entry removed (P1-6) — are native-only.
Everything currently in the stores predates it.

## Prerequisites

1. Confirm the plugin still runs last in `app.json` → `expo.plugins` and its
   edits are what you expect (grep `allowBackup` / `exp+fazi` in a fresh
   prebuild output).
2. Local: `npx expo prebuild --platform android --clean` then inspect
   `android/app/src/main/AndroidManifest.xml` (gitignored — regenerated, never
   committed).
3. `npm run lint && npm run typegen && npm run typecheck && npm test` from
   `apps/mobile` must be green.

## Build

- Versioning is local (`eas.json` → `appVersionSource: "local"`): bump
  `expo.version` + `expo.android.versionCode` in `app.json` **before** the
  build (currently 1.0.39 / 1000039; bump versionCode by 1 each build).
- `runtimeVersion` policy is `appVersion` → builds with a new `version` leave
  the current OTA channel; publish a matching `eas update` for the new
  runtime afterwards if JS-only changes should roll out.
- Profiles (`eas.json`):
  - `eas build -p android --profile preview` — internal APK (QA install).
  - `eas build -p android --profile production` — Play Store bundle (AAB).
  - `eas build -p android --profile production-apk` — store-signed APK if the
    target track needs APK.
- Signing: `plugins/with-release-signing` provides the keystore config; the
  EAS account must have access (`EXPO_TOKEN`/logged-in owner).

## After the build

1. Install the QA APK from the `preview` channel, verify: cold start, backup
   disabled (`adb shell bmgr backupnow` shows nothing for the app), `aifazi://`
   deep links work and `exp+fazi://` does not.
2. Submit: `eas submit -p android --profile production` (or Play Console
   upload).
3. Publish OTA for JS-only fixes on the new runtime: `eas update --channel
   production`.
4. Note: OTA checks are app-level (`checkAutomatically: NEVER` +
   boot/foreground checks in `app/_layout.tsx`) — after `eas update`, devices
   pick it up on next foreground, deferred while on auth routes.
