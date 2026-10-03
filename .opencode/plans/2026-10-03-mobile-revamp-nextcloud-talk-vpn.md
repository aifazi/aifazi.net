# Mobile App Revamp — Plan (Nextcloud Talk + VPN)

**Date:** 2026-10-03 · **Supersedes:** nothing — extends `apps/mobile/PLAN-ROADMAP.md` (#409) with a new **Track T (Nextcloud Talk)** and VPN hardening; ROADMAP stays the master doc.
**Inputs:** PLAN-ROADMAP.md verified state (2026-10-03), Full Audit Round 6 (docs/AUDIT.md §16), ROADMAP §0c/§0d (Nextcloud + Talk + coturn history), Talk API v4 docs (nextcloud-talk.readthedocs.io), Android/iOS WebView WebRTC behavior research.

---

## 1. Verified starting state

| Area | State | Evidence |
|------|-------|----------|
| App | 26 routes, no stubs; auth (PASETO + SecureStore refresh + biometric); EAS OTA `production` channel; 18 vitest tests; CI `mobile-lint` job | PLAN-ROADMAP.md "Verified current state" |
| Nextcloud | Live at `cloud.aifazi.net` (LE cert, Traefik); 21 apps enabled incl. **Talk (spreed)**; `twofactor_webauthn` enabled; 2FA on; **coturn 4.6 deployed & verified end-to-end 2026-09-07** (relay 49160–49200, 3478 reachable, `relay-ip=75.119.131.157`, STUN added; TURN echo test `tot_recv_msgs=10/10`) | ROADMAP §0c/§0d, VPS-INFRA-AUDIT.md |
| App ↔ Nextcloud | App already stores NC `serverUrl/username/password` in SecureStore (`lib/caldav.ts`, default `https://cloud.aifazi.net`); CalDAV + CardDAV working via Basic auth (`tsdav`) | `app/nextcloud-setup.tsx`, `src/lib/caldav.ts` |
| VPN | Backend `/vpn/*` API (status, peers CRUD, sessions, stats, public-ip, peer config/QR/conf). App = management UI: dashboard + peer config (QR/conf/copy, 60s clipboard auto-clear) + session history + traffic chart. Actual tunnel = user's native WireGuard app (import peer config). Keys never persisted (component state only) | `src/lib/vpn.ts`, `src/components/vpn/*`, backend `routers/vpn.py` |
| Open security items | H2: mobile OAuth `#token=` fragments (one-time exchange codes not implemented) · C7: VPN screen has no biometric app-lock gate | PLAN-ROADMAP.md "Debt/Security" |

## 2. Feasibility verdict: Nextcloud Talk in the app

**Answer: Yes — chat + calls are feasible, with a platform split.**

| Option | Effort | iOS | Android | Verdict |
|--------|--------|-----|---------|---------|
| **A. WebView-embed the Talk web UI** (`https://cloud.aifazi.net/apps/talk/…` / `/call/{token}`) with a Nextcloud session cookie | S–M | **Full** — WKWebView supports WebRTC natively (iOS 14.3+); media permission via WebChromeClient/WKUIDelegate bridge | **Unreliable** — Android WebView media capture (`getUserMedia`) is version-dependent and has documented failures (`CheckMediaAccessPermission: Not supported`, camera `NotReadableError`); some Chrome versions work, some don't. Treat as *opt-in experimental* | **Core of the integration** |
| **B. Native chat over Talk API v4** (`/ocs/v2.php/apps/spreed/api/v4`: rooms, participants, `POST /call/{token}`, `GET/POST /chat/{token}`) in our own UI | M | both | both | **Complement** — works everywhere, no WebRTC needed |
| C. Native WebRTC client speaking Talk's signaling v3 (what the official AGPL app does, incl. HPB) | XL (multi-week) | — | — | **Not recommended** — that is building the official app |
| D. "External call service" iframe delegation (Pexip-style) | — | n/a | n/a | Not applicable — we want Talk's own calls |

Key facts that make A+B tractable:

1. **Session bootstrap**: Talk calls require a cookie session ("joining a room is only possible with cookies"). The app already holds NC credentials in SecureStore. Because `twofactor_webauthn` is enabled, use the **app-password login** path (`POST /login/password` with a dedicated NC app password created for the mobile app) — an app password is a second factor in itself, so the interactive 2FA challenge is skipped. Fallback: in-WebView manual login form (session kept in the WebView cookie jar).
2. **TURN/STUN already server-side**: `signaling-v3` capabilities return the configured STUN/TURN; coturn verified relay-traffic in September — off-tunnel participants just work.
3. **Licensing**: embedding NC's own web UI in a WebView and calling its REST API redistribute nothing — no AGPL contamination of our app.
4. **Talk chat via API** is plain JSON (community-confirmed v4 endpoints: `GET /chat/{token}?lookIntoFuture=0&limit=100`, send-message POST, rooms `GET /room`, call state `hasCall`/`callStartTime`).

### Talk × VPN — how they interact (the "as well the vpn" part)

- **Both participants on the WireGuard tunnel** (10.x / fd00 subnet): no NAT inside the tunnel → WebRTC P2P connects **directly over the tunnel**, TURN untouched. The tunnel already carries DTLS-encrypted traffic;Talk media riding on it is a private-network fast path. This is the natural "secure call" story: **VPN on = private media path**.
- **One/both off-tunnel**: media relays through the verified coturn TURN (relay 49160–49200). No app-side work.
- **Reaching Nextcloud itself**: works via public `cloud.aifazi.net` (Traefik/LE) or via tunnel — both fine; no change needed.
- **Optional upgrades (only if needed, per ROADMAP §0c):** `turns:` on 5349 with the LE cert for networks blocking 3478; standalone HPB signaling only if 5+ participant group calls struggle (Whiteboard already skipped for this reason).
- **App-side VPN revamp (in scope, Track V):** biometric gate on the VPN screen (C7), live connection state (poll `connected`/`last_connected_at` from `/vpn/peers` + session history), WireGuard-app handoff actions (import checklist + open-app deep link), and a "tunnel active → direct media" hint on the Talk screen when the user's peer is connected.

## 3. Execution plan (PR-sized batches)

> Every batch: gate = CI `mobile-lint` green + new vitest tests where behavior is added; QA notes per batch. A1–A2 need the owner (EAS account, Play submission).

### M0 — Spikes & verification (1–2 days, gates Track T)

| # | Task | Output |
|---|------|--------|
| M0.1 | **T0 spike:** in a scratch branch — `react-native-webview` + Talk room on a real device: (a) bootstrap a session from the stored NC credentials (create a dedicated NC **app password** for the app; test `POST /login/password`), (b) open a Talk room, start a 1:1 call on **iOS** (expect full in-app call), (c) repeat on **Android** (expect: likely camera/mic failure → confirm which Chrome/WebView versions work; record the exact failure mode) | Written spike result → **owner decision: Android strategy** (in-WebView experimental / "join in browser" / chat-only) |
| M0.2 | Confirm API v4 surface live: `GET /room`, participants, `hasCall`, `GET /chat/{token}` + send-message POST, `signaling` capabilities (TURN entries present) against `cloud.aifazi.net` with the app-password session | Endpoint notes for M2 implementation |
| M0.3 | Re-verify current VPN screen UX + backend `/vpn/*` responses (status, peers, sessions) — expect **no backend changes** | Baseline notes |

### M1 — Release pipeline (ROADMAP Phase A; P0, owner-involved)

Unchanged from PLAN-ROADMAP.md: A1 EAS rebuild + submit (per `EAS-REBUILD.md`), A2 O1 end-to-end (ship a JS-only OTA, exercise the 2026-10-03 create-PR Actions setting), A3 CI trigger fixes (`mobile-auto-release` + `prune-deployments`), A4 versioning SOP.
**Everything in M2+ ships through this pipeline — do M1 first.**

### M2 — Talk MVP (Track T, core value)

| # | Task | Notes |
|---|------|-------|
| M2.1 | `lib/ncSession.ts` — Nextcloud session bootstrap: app-password `login/password` flow, session cookie handling (SecureStore-backed for the chat client; WebView cookie sync on iOS), 401 re-login, capability check (Talk enabled? TURN present?), reuses `caldav.ts` SecureStore credential pattern | Vitest: login success/fail, session-expiry refresh, missing-creds path |
| M2.2 | **Talk screen** (`app/talk.tsx`, entry under profile/Nextcloud section — owner confirms placement): room list (`GET /room`, show `hasCall` + active-call badge), "Join call" → platform strategy from M0.1: **iOS** in-WebView Talk UI (`/call/{token}` deep link, session cookie pre-seeded, media-permission bridge); **Android** per spike result — default "Open in browser" (system Chrome, WebRTC works) + in-app chat below | No new runtime deps beyond `react-native-webview` (add to package.json) |
| M2.3 | **Native chat pane** (API v4, both platforms): room messages (`lookIntoFuture=0&limit=…`), send, read-marker, presence (`lastMessage`/activity), focus-based polling (poll on screen focus + 15s interval while open, stop in background) | Vitest: chat reducer (ordering, dedupe by message id, offline-safe queue), polling lifecycle |
| M2.4 | Call-aware hints: "You're on the VPN tunnel — media goes direct, no TURN" when `/vpn/peers` shows the user connected; TURN-in-use hint otherwise (from `signaling` capabilities) | Small; ties Track T and Track V together |

QA matrix: iOS in-app 1:1 call · Android call in browser + chat in app · both-on-VPN P2P (verify no TURN in coturn stats) · one-off-VPN (verify relay traffic) · app-password re-login after NC restart.

### M3 — VPN hardening (Track V)

| # | Task | Notes |
|---|------|-------|
| M3.1 | **Biometric app-lock gate on the VPN screen** (C7): reuse the existing biometric unlock from auth; gate the whole VPN route, not just modals | Security item from the roadmap |
| M3.2 | Live connection state: poll `/vpn/peers` (`connected`, `last_connected_at`, transfer counters) on focus + interval; drive the existing `ConnectionRing`/`ServerInfoCard` off live data instead of one-shot load | Reuse `src/components/vpn/*` |
| M3.3 | WireGuard handoff: "Open WireGuard app" action (deep link / store link) + first-time import checklist (QR already generated by the backend; keep private-key config in component state only — do not persist) | UX |
| M3.4 | Session history + stats polish: `/vpn/sessions` + `/vpn/stats` already wired in `lib/vpn.ts`; surface bytes/duration per session on the existing `SessionHistory` | Low risk |

### M4 — Feature parity (ROADMAP Phase B, unchanged)

B1 forum search/sort/pagination · B2 store subscription management (+ delivery-agent follow-up) · B3 helpdesk staff console · B4 content deep links · B5 tools (scope decision) · B6 self-update source-of-truth decision.

### M5 — Debt & hardening (ROADMAP Phase C, unchanged + new)

C1 split `themes.ts` · C2 inline styles → StyleSheet · C3 `useAsyncData` hook · C4 type pass · C5 test depth · **C6 H2 mobile OAuth one-time exchange codes** (backend + mobile — recommended to schedule *before* the Talk ship since both touch the deep-link/auth surface) · C8 Expo SDK bump · C9 unused deps.

**Suggested order:** M0 → M1 (owner) → M2 (Talk MVP) → M3 (VPN) → C6 (H2) → M4 → M5. M4 can run in parallel with M3/M5 where screens don't conflict.

## 4. Owner decisions

1. **M0.1 result → Android Talk strategy** (in-WebView experimental / browser fallback / chat-only).
2. **Talk placement** — profile → Nextcloud section (recommended, matches the CalDAV setup screen) vs a main tab.
3. **M1/EAS** — account + Play submission involvement (A1/A2).
4. **NC app password** — approve creating a dedicated Nextcloud app password for the mobile app (T0 spike prerequisite).
5. **TURN-over-TLS / HPB upgrades** — only if off-VPN calls or 5+ group calls degrade (ROADMAP §0c triggers).

## 5. Risks

| Risk | Mitigation |
|------|------------|
| Android WebView WebRTC media flaky/unsupported | M0.1 spike decides; default Android strategy = browser-fallback call + in-app chat (Option B always works) |
| NC 2FA blocks headless session bootstrap | Dedicated **app password** via `POST /login/password` (app password = accepted second factor); in-WebView manual login as fallback |
| NC session expiry mid-call | WebView cookie jar handles it (re-login form); chat client auto re-login on 401 |
| Release pipeline still unverified (O1) | M1 before M2 — nothing ships on a broken OTA path |
| VPS load (TURN relay + coturn) | Existing ROADMAP load-watch; TURN relay counters in QA matrix |
| Talk API drift (NC major upgrades) | Pin to API v4 + capability checks (`conversation-v4`, `signaling-v3`) at bootstrap; fail with a clear "Talk unavailable" state |
| Private-key material in peer configs | Existing rule stands: component state only, 60s clipboard auto-clear — do not "improve" by persisting |

## 6. Verification gates

Per PR: `npm run typecheck` · `npm run lint` · `npm test` (mobile) · CI `mobile-lint` job.
Talk QA: matrix in M2.4. VPN QA: biometric gate denies without unlock; connection state matches `wg` on the server; keys never appear in AsyncStorage (assert in a test).
No backend changes are expected in M2–M3; if M0.2 finds an endpoint gap, file it as a separate backend PR first.
