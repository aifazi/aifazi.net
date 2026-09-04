# aifazi.net — Roadmap & TODO

> Living plan. Status as of 2026-09-04 (infra audit). Checked items ship via
> PR to `main` (CI required) → Vercel (frontend, auto) + Coolify (backend,
> manual deploy) + EAS auto-release (mobile, on `apps/mobile/**` changes).

## 0. Operations backlog (dashboard/SSH — no code deploy needed)

- [x] **Coolify: enable backend health check** — enabled 2026-09-04
      (`GET localhost:8000/api/health`, 5s/5s/10 retries). Gives
      auto-restart on failed health.
- [x] **Coolify: delete dead `wireguard-easy` service** — soft-deleted
      2026-09-04 (row + env vars removed, only `supabase-*` remains).
      Live VPN runs natively on the host (`wg-api.service`, `wg0`).
- [ ] **Coolify: set `MAIL_WEBHOOK_SECRET`** (runtime env, then redeploy).
      Value generated 2026-09-03 (kept out of git — ask Tanvir):
      64-hex string. Then configure Brevo/Resend inbound webhook:
      `https://api.aifazi.net/api/admin/mail/queue/webhook/inbound`
      with `X-Webhook-Key: <secret>`. Until set, `/webhook/inbound`
      rejects all delivery events (backend logs a warning at startup).
- [ ] **Vercel: confirm Node 22 runtime** — project Settings → General →
      Node.js Version → `22.x` (belt-and-suspenders next to the
      `engines` pin shipped in `aifazi-net-frontend-next/package.json`).
- [ ] **Vercel: delete the stale backend project** (if it still exists).
      `aifazi.net-backend-fastapi/vercel.json` + `api/index.py` were removed
      from the repo 2026-09-04; the backend runs on Coolify only. Deleting
      the dashboard project stops its daily `/api/cron/cleanup` from firing
      against production a second time.
- [ ] **Vercel: pull Function logs for `GET /`** from the latest production
      deployment — needed to root-cause §1 (actual exception + stack).
- [ ] **Coolify: deploy managed Redis** (+ New → Database → Redis → Deploy),
      then update backend `REDIS_URL` to the Coolify hostname, redeploy,
      and remove the manual `redis-aifazi` container. Backend already
      speaks standard `redis-py` (`REDIS_URL`) with Upstash fallback.

## 0b. Security & infra hardening (2026-09-04 audit — all applied)

- [x] **Close public `:8000`/`:8080`**: `DOCKER-USER` DROP rules persisted
      via `iptables-persistent`. Direct `http://75.119.131.157:8000` now
      times out; dashboard still served via `https://vps.aifazi.net:443`
      (Traefik path untouched); SSH-tunnel access unaffected (localhost
      never traverses `FORWARD`). `6001/6002` (coolify-realtime) left open
      — close later only after confirming live-logs/terminal still work.
- [x] **fail2ban** installed + enabled with `sshd` jail.
- [x] **Docs corrected**: root `README.md` + `SECURITY.md` said Railway →
      now Coolify; backend README Vercel section marked retired.
- [ ] Later: UFW allow-list the dashboard/SSH to your static IP if you
      have one; rotate the Coolify `APP_KEY`-adjacent secrets yearly;
      re-check `iptables -L DOCKER-USER` after any Docker/Coolify upgrade
      (rules persist via `iptables-persistent`, but verify).

## 1. Production outage follow-up (anon 500s since 2026-08-31)

- [x] Root-caused (first wave): `ERR_REQUIRE_ESM` — CJS `whatwg-url@17`
      requires ESM `@exodus/bytes`; Vercel fleet mixes Node 20.x minors,
      some without `require(esm)` support → same page randomly 200/500.
- [x] Fix shipped: `"engines": { "node": "22.x" }` (frontend `package.json`).
- [ ] **STILL OPEN (2026-09-04 audit): `GET /`, `/blog`, `/login`,
      `/status` all return 500 deterministically (3/3), serving the
      `__next_error__` global-error page; only the 404 route works. So this
      is a layout-level render throw, NOT the old flaky fleet issue.
      Ruled out: `siteSettingsServer`/`contentServer` (fail-safe `{}`),
      `SITE_URL` (has fallback), providers (window-guarded), middleware
      (heavily try/caught; `/api/health` → 200 through it). Shipped
      hardening: layout theme-CSS blocks wrapped in try/catch (#157) so
      theme builders can never 500 the page.
- [ ] Verify post-deploy: `curl https://aifazi.net/` → 200 (anonymous),
      Playwright smoke green, backend monitor flips Website to up.
- [ ] Correction: `isomorphic-dompurify` is NOT unused — imported by
      `pages-src/BlogPost.jsx:6` and `pages-src/admin/MailQueue.jsx:3`.
      Do not remove without replacing sanitization in those two files.

## 2. VPN — remaining work

- [x] Backend healthy on Coolify (host WireGuard via management API).
- [x] **wg-api lockdown (2026-09-04 audit fix)**: shared-secret `X-WG-Token`
      auth on all endpoints (#157 client: `utils/wireguard.py`,
      `scripts/init-wireguard.sh`; secret in Coolify `WG_API_TOKEN` env +
      host `/etc/wireguard/wg-api-token`, mode 600), request logging
      re-enabled, UFW `51821/tcp` scoped to `10.0.0.0/8` + `172.16.0.0/12`
      (Docker networks only — internet dropped).
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
- [ ] **Certificate pinning** (#11, prep done): `react-native-ssl-pinning`
      installed, `src/lib/sslPinning.ts` ready with live SPKI pins for
      `api.aifazi.net` + Expo-Go-safe fallback. Activation:
      `npx expo prebuild` → EAS production build → store release.
      Rotation runbook is in the module header (backup pins mandatory).

## 3. Testing (#28 — framework done, expand coverage)

- [x] Vitest (`apps/mobile`: `npm test`, 8 tests) — `vpn.ts` pure
      functions + `sslPinning` pins/fallback.
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
