# aifazi.net Mobile — Roadmap (2026-10)

Supersedes `PLAN-REDESIGN-REVAMP.md` (its Phase 0–1 work landed; its gap/debt
tables are stale — see "Verified current state" below for what is actually
true as of 2026-10-03).

## Verified current state (2026-10-03)

- **26 routes, no stubs**: dashboard, forum, blog (+offline), profile
  (8 sub-screens), store (catalog / detail / cart / checkout / success),
  helpdesk (new ticket / detail + replies), VPN dashboard + peer config,
  CalDAV calendar + Nextcloud setup, notification center, status
  (incidents render), projects, auth (login / 2FA / biometric / OAuth),
  verify-email.
- **Tooling**: CI `mobile-lint` job (lint + route typegen + typecheck +
  vitest), 18 passing tests; ESLint + tsc scripts.
- **Release**: EAS local versioning — `app.json` 1.0.39 / versionCode
  1000039, package `net.aifazi.mobile`, 4 build profiles
  (development/preview/production/production-apk), OTA channel
  `production` (`checkAutomatically: NEVER`, foreground checks in
  `_layout.tsx`, expo-updates wired).
- **Auth**: in-memory access token + SecureStore refresh
  (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`), single-flight 401 refresh,
  biometric unlock, PASETO tokens.
- **API config**: `EXPO_PUBLIC_API_URL` via `getApiBase.ts` (one env-backed
  fallback in code), interceptor-based refresh (no URL-matching hacks).
- **Backend surface the app already uses**: auth (incl. 2FA + sessions),
  forum (threads/replies/categories/notifications), blog (+comments), store
  (products/reviews/cart/checkout/orders/wishlist), helpdesk (tickets/
  messages), documents, search, push register/unregister, VPN (status/
  peers/stats/sessions/public-ip), monitor/status, portfolio/projects,
  verify-email/forgot-password.
- **Chat is gone everywhere** — no chat router in the backend, no chat
  screens in web or mobile (the `chat` staff role was removed; the old
  plan's "port chat / LiveKit voice / E2EE" gap is obsolete). If chat is
  ever wanted again it is a green-field product decision, not a port.

## Open items (verified against code, not the stale plan)

Feature gaps vs web:
- Forum: no search / sort / pagination in the UI (backend already supports
  `search`, `sort=new|top|hot`, `page`, `limit` on `GET /forum/threads`)
- Store: no subscription management UI (backend has Stripe plans,
  `GET /api/store/my-subscription`, checkout, webhook, portal)
- Store: no delivery-agent portal (backend has `store_delivery.py`)
- Helpdesk: no staff console (backend `helpdesk.py` admin endpoints exist)
- Deep links: only OAuth + notification routing; no content share links
  (store-item / blog-post / forum-thread)
- Tools: none (web has network / file / SEO / DB GUI surfaces)

Release:
- **O1 (P0)**: release/OTA pipeline unverified — `app.json` frozen at
  1.0.39, no OTA since 2026-08-29; the Actions create-PR setting applied
  2026-10-03 must be exercised end-to-end on a real release
- **EAS-REBUILD.md handoff**: `with-android-manifest` native fixes
  (P0-3 `allowBackup` off, P1-6 dev-scheme removal) only reach installed
  APKs after a native rebuild + store submit
- CI: `mobile-auto-release` + `prune-deployments` are push-triggered only
  (manual `gh workflow run` workaround)

Debt:
- `src/themes.ts` god-file: 1854 lines (palette data mixed with logic)
- 811 inline `style={{}}` (plan claimed ~400 — it has grown)
- 49 `: any` in code
- No shared load/refresh hook — every data screen re-implements
  load / onRefresh / useFocusEffect / RefreshControl
- 4 unused dependencies (U5); 31 npm advisories (only clearable via
  Expo SDK bumps)

Security:
- **H2**: mobile OAuth `#token=` fragments (steam / github / discord /
  auth) — one-time exchange codes not yet implemented for the mobile
  deep-link path
- VPN screen reachable without an app-level biometric lock gate

---

## Phase A — Release pipeline (P0; owner-involved)

- **A1. EAS rebuild + submit** (per `EAS-REBUILD.md`):
  - bump `app.json` version + versionCode (local `appVersionSource`)
  - prebuild check: regenerated `AndroidManifest.xml` shows
    `allowBackup=false` and no `exp+fazi://` scheme entry
  - `eas build -p android --profile preview` → QA install: cold start,
    `adb shell bmgr backupnow` yields nothing for the app, `aifazi://`
    deep links work, `exp+fazi://` is dead
  - `eas submit -p android --profile production`
- **A2. Verify O1 end-to-end**: ship a JS-only change via
  `eas update --channel production`, confirm pickup on next foreground;
  exercise the 2026-10-03 create-PR Actions setting on the real release
  (closes O1).
- **A3. Fix CI triggers**: `mobile-auto-release` + `prune-deployments`
  on tag/release instead of push-only.
- **A4. SOP**: versionCode +1 per build; OTA carries JS-only changes
  (runtimeVersion policy `appVersion` leaves old channels behind).

## Phase B — Feature parity (owner-priority: "implement more into the app")

- **B1. Forum search / sort / pagination** — UI-only win (backend ready):
  search box, sort chips (hot/new/top), page-based load-more + cached
  page state; vitest for the pagination/cache reducer.
- **B2. Store subscription management** — plans list, current
  subscription + perks (`/api/store/my-subscription`), checkout to a plan,
  Stripe portal link; delivery-agent portal (queue view + mark-delivered)
  as a follow-up slice.
- **B3. Helpdesk staff console** — mobile port of the admin endpoints:
  queue, assign, reply, close (staff-only, reuse `helpdesk-detail`
  patterns).
- **B4. Content deep links** — shareable URLs for store-item / blog-post /
  forum-thread (+ reply), routed through the existing `_layout.tsx`
  guards; `aifazi://` scheme + universal links; notify users via the
  notifications screen where already wired.
- **B5. Tools (scope decision)** — file tools first (most
  mobile-native fit); network / SEO / DB GUI optional follow-ups.
- **B6. Self-update source of truth (decision)** — wire
  `mobile_release.py` (latest/download) into the app's updater or remove
  the router; EAS OTA is the current mechanism, the APK endpoint is
  vestigial. Decide, then clear related unused deps (U5).

## Phase C — Debt & hardening

- **C1. Split `themes.ts`** (1854) — extract palette/theme data into a
  data module (same pattern as the frontend `themeLibraryData.js` split).
- **C2. Inline styles 811 → StyleSheet + tokens**, hot files first
  (`(tabs)/index` 508, `vpn` 348, `forum` 300, `forum-thread` 289,
  `blog-post` 266).
- **C3. `useAsyncData` hook + `<Screen>` refresh wiring** — kill
  per-screen load/refresh boilerplate.
- **C4. Type pass** — the 49 `: any`: API response types +
  `apiErrorMessage`-style shared error helper.
- **C5. Test depth (18 → N)** — API client interceptors, single-flight
  refresh, `auth-cleared` event, cache/offline behavior.
- **C6. H2 OAuth one-time exchange codes** — backend
  (steam/github/discord/auth) + mobile callback; removes `#token=`
  fragments from the mobile deep-link path.
- **C7. Biometric app-lock gate on the VPN screen.**
- **C8. Expo SDK bump** for the 31 advisories — coordinate with C1/C2
  (large, separate effort).
- **C9. Remove the 4 unused deps** (U5) after the B6 decision.

## Execution notes

- Each item = its own PR; gate = CI `mobile-lint` job green + new vitest
  tests for feature/debt work.
- A1–A2 need the owner (EAS account/signing, Play submission).
- Owner decisions: B5 scope, B6 source-of-truth, and whether chat is
  ever worth reviving (green-field, not in this plan).
- Suggested order: **A** (release first) → **B1** (quick parity win) →
  **B4** → C1–C4 in parallel → **B2/B3** → **B6** → C5–C9.
