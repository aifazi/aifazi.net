# aifazi.net — Roadmap & TODO

> Living plan. Status as of 2026-09-03. Checked items ship via PR to `main`
> (CI required) → Vercel (frontend, auto) + Coolify (backend, manual deploy)
> + EAS auto-release (mobile, on `apps/mobile/**` changes).

## 0. Operations backlog (dashboard/SSH — no code deploy needed)

- [ ] **Coolify: enable backend health check** — project → production →
      application `aifazi.net:main-*` → Configuration → enable (already
      configured: `GET /api/health:8000`, interval 5s). Gives auto-restart
      on failed health.
- [ ] **Coolify: delete dead `wireguard-easy` service** (`exited`, no
      container on host). Live VPN runs natively on the host
      (`wg-api.service`, `wg0`) — deleting the record is zero-risk.
- [ ] **Coolify: set `MAIL_WEBHOOK_SECRET`** (runtime env, then redeploy).
      Value generated 2026-09-03 (kept out of git — ask Tanvir):
      64-hex string. Then configure Brevo/Resend inbound webhook:
      `https://api.aifazi.net/api/admin/mail/queue/webhook/inbound`
      with `X-Webhook-Key: <secret>`. Until set, `/webhook/inbound`
      rejects all delivery events (backend logs a warning at startup).
- [ ] **Vercel: confirm Node 22 runtime** — project Settings → General →
      Node.js Version → `22.x` (belt-and-suspenders next to the
      `engines` pin shipped in `aifazi-net-frontend-next/package.json`).

## 1. Production outage follow-up (anon 500s since 2026-08-31)

- [x] Root-caused: `ERR_REQUIRE_ESM` — CJS `whatwg-url@17` requires ESM
      `@exodus/bytes`; Vercel fleet mixes Node 20.x minors, some without
      `require(esm)` support → same page randomly 200/500 per instance.
- [x] Fix: `"engines": { "node": "22.x" }` (frontend `package.json`).
- [ ] Verify post-deploy: `curl https://aifazi.net/` → 200 (anonymous),
      Playwright smoke green, backend monitor flips Website to up.
- [ ] Follow-up hygiene (separate change): remove dead
      `isomorphic-dompurify` dep (used by zero first-party files; it drags
      in the `jsdom → whatwg-url@17` chain). Do NOT do this as an outage
      fix — the Node pin is the risk-free one.

## 2. VPN — remaining work

- [x] Backend healthy on Coolify (host WireGuard via management API).
- [x] Traffic counters, age-based presence, auto session tracking,
      staff delete endpoint, IP-race retry, config whitespace strip +
      `system.vpn` module + staff rule.
- [ ] Deploy the whitespace-strip fix (in tree, ships with next backend
      deploy) so Windows imports work without hand-editing the `.conf`.
- [ ] Users: one peer per device (never reuse a peer on two devices);
      log in as `admin@aifazi.net` to manage the existing peers.
- [ ] **Native in-app tunnel** (mobile): needs `npx expo prebuild` +
      native WireGuard module + EAS build. Management (CRUD/QR/stats)
      works today; the tunnel itself lives in the external WireGuard app.
- [ ] **Certificate pinning** (#11): live SPKI pins for `api.aifazi.net`
      extracted 2026-09-03 and kept here (leaf + chain backups):
      `sha256/boAH2RgUdVzrKMPj3pKVN2W+3GN872/6f3ea0BgajaY=`,
      `sha256/LoMHBotttiDko50Gi13uXW71eIy7LAttI+rYT8wXF4w=`,
      `sha256/fk6IOKit1ild5647BH06ujSIq5XbCgqlbYl6ANhhi88=`,
      `sha256/C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=`.
      Do NOT use `react-native-ssl-pinning@1.6.0` — tried 2026-09-03,
      removed same day: its 2018-era `android/build.gradle` calls
      `jcenter()` (removed in Gradle 9) and breaks the release build.
      Activation needs a maintained approach (`expo prebuild` + either
      Android Network Security Config via config plugin, or a current
      pinning library) + EAS production build + store release.
      Rotation rule: always ship new pins alongside old ones, wait for
      >80% adoption, then switch the server cert.

## 3. Testing (#28 — framework done, expand coverage)

- [x] Vitest (`apps/mobile`: `npm test`, 4 tests) — `vpn.ts` pure
      functions (formatBytes/formatDuration/detectDeviceOs).
- [x] Playwright (`aifazi.net-frontend-next`: `npm run test:e2e`) —
      homepage + `/api/health` smoke (caught the real outage).
- [ ] Grow mobile coverage: API client interceptors, auth refresh flow,
      VPN peer CRUD with mocked transport.
- [ ] Grow e2e: login flow, blog/forum reads, admin gate redirect,
      VPN QR modal (against preview deploys, not production).
- [ ] Backend: pytest for VPN helpers (`parse_byte_count`,
      `_handshake_age_seconds`, IP allocation) — currently CI-covered
      only by lint/typecheck.

## 4. Role-based section access (shipped, needs deploy)

- [x] `pages-src/admin/access.js`: complete view→module map, stored
      grants ∪ role-preset fallback, fail-closed unknown views.
- [x] Dashboard: all 20+ panel gates per-module; sidebar, search,
      quick actions, stat cards, shortcuts funneled through `goView()`;
      denied views redirect to first permitted section.
- [x] Backend: `system.vpn` module + `/vpn` staff rule (moderators keep
      view; editors/chat get 403 — UI hides it too).
- [ ] Verify post-deploy with a moderator + editor account (sidebar
      contents, direct-view denial toast, API 403s).

## 5. Plugin / widget system (not started)

Goal: mount custom dashboard widgets without core changes.
Proposed design (to refine before build):
- [ ] Widget registry: `pages-src/admin/widgets/registry.js` mapping
      `{ id, title, group, component, requiredModule }`.
- [ ] Widget slots on the home dashboard (grid) + admin-configurable
      order/visibility persisted in `site_settings` (reuse auto-save).
- [ ] Permission-aware: widgets render only if `canViewKey()` passes
      their `requiredModule`; data fetching stays inside each widget.
- [ ] Migrate 2–3 existing home cards (StatsGrid cards, system health)
      to the registry as proof, no visual change.
- [ ] Document `docs/widgets.md` with a minimal example widget.

## 6. Small items

- [ ] #14 leftover: RoamingRobot animation speed tied to live visitor
      count (pass count as prop, scale speed; cosmetic).
- [ ] i18n / multi-language: explicitly OUT OF SCOPE (decision 2026-09-03).
- [ ] TypeScript migration (#72): incremental, 200+ JSX files. Start
      with `pages-src/admin/access.js` → `.ts` + `lib/api.ts` strict
      types when touching those areas; no big-bang rewrite.

## 7. Release process (reference)

- Frontend → push `main` → Vercel production auto-deploy. Verify:
  deployment Ready + `curl` homepage 200.
- Backend → push `main` → **manual** Coolify deploy of the backend
  application → poll deployment status → check container logs.
- Mobile → push `main` touching `apps/mobile/**` →
  `mobile-auto-release.yml` bumps tag + GitHub release →
  `mobile-release-build.yml` EAS APK+AAB → in-app updater offers it.
- Branch protection: 5 required checks on `main`; always ship via PR.
