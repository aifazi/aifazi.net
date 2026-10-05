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
  build (currently 1.0.70 / 1000070; versionCode derives from the version
  as maj*1e6 + min*1e3 + pat).
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

## Cert pinning (R7-15) — NOT implemented; groundwork + remaining steps

Status 2026-10-05: the API host (`https://api.aifazi.net`, see
`src/lib/getApiBase.ts`) is plain TLS. Verified present: iOS
`NSAppTransportSecurity` exception domains in `app.json` (TLSv1.2+, forward
secrecy, subdomains, certificate transparency for `api.aifazi.net`) and
`expo-build-properties` (Android proguard/shrink only). Verified absent: any
pin set — no Android `networkSecurityConfig`, no TrustKit / manual `SecTrust`
evaluation, no JS pinning (impossible: JS never sees the TLS handshake).
Nothing below was executed — no native rebuild was attempted here.

Why this needs a native rebuild (not OTA): pins live in the Android
`networkSecurityConfig` XML and the iOS bundle (Info.plist / TrustKit config),
both baked at prebuild time. Shipping pins also has store implications: a
wrong/expired pin bricks the app's API access until the next store release, so
pins need a backup pin + a rotation runbook before they ship.

Exact remaining steps (owner):

1. Mint the pin set — long-lived ISRG CA pins, NOT leaf (leaf rotates often):
   `echo | openssl s_client -connect api.aifazi.net:443 -servername api.aifazi.net 2>/dev/null | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64`
   Record two pins: the live chain's CA SPKI plus a backup CA SPKI (e.g. ISRG
   Root X1 + ISRG Root X2); re-verify with `openssl s_client -showcerts` that
   both are in the chain's trust path.
2. Android: add `android/res/xml/network_security_config.xml` with a
   `<domain-config cleartextTrafficPermitted="false">` for `api.aifazi.net`
   (+ `cdn.aifazi.net` if pinned) containing the `<pin-set>` (+ `expiration`
   ≥ 6 months out as a fail-safe), and wire it via a small config plugin
   (new `plugins/with-network-security-config.js`, run alongside
   `with-android-manifest`) setting
   `application/@android:networkSecurityConfig="@xml/network_security_config"`.
   (`expo-build-properties` cannot inject this — a plugin is required.)
3. iOS: pin via TrustKit (`TSKPinnedDomains` in Info.plist through the same
   plugin style, or `expo-build-properties` `extraPods`) with the same SPKI
   hashes; keep the existing ATS exception domains as-is.
4. `npx expo prebuild --platform android --clean`, inspect the generated
   manifest + merged `network_security_config.xml`; `eas build -p android
   --profile preview`, then verify with mitmproxy/Charles: pinned hosts fail
   closed on interception, unpinned hosts unaffected; mic/cam Talk flows
   untouched (different host, out of scope).
5. Rotation runbook: calendar reminder before `<pin-set> expiration`; ship new
   pins (overlapping old+new) one release ahead of any CA change; staged
   rollout like any native release above.

## Known caveat (owner decision, do not "fix" via trigger edits)

- `mobile-release-build.yml` creates its `app.json` version-bump PR with
  `GITHUB_TOKEN`, and merges performed by `owner-automerge` also push as
  `GITHUB_TOKEN` — pushes from that token do **not** fire push-triggered
  workflows. So `mobile-auto-release` + `prune-deployments` (both
  push-triggered only) silently skip those merges; if the bump PR is what
  lands, no follow-up auto-release fires. Workaround: manual
  `gh workflow run mobile-auto-release` after such merges (see
  `docs/ROADMAP.md` §7 "Automerge cascade gap"). Changing workflow triggers
  to compensate is an owner call — left as-is.
