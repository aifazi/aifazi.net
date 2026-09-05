# aifazi.net — Roadmap & TODO

> Living plan. Status as of 2026-09-04 (infra audit + outage closed).
> Checked items ship via PR to `main` (CI required, owner PRs auto-merge
> on green via `owner-automerge.yml`) → Vercel (frontend, auto) + Coolify
> (backend, manual deploy) + EAS auto-release (mobile, on
> `apps/mobile/**` changes).

## 0. Operations backlog (dashboard/SSH — no code deploy needed)

- [x] **Coolify: enable backend health check** — enabled 2026-09-04
      (`GET localhost:8000/api/health`, 5s/5s/10 retries). Gives
      auto-restart on failed health.
- [x] **Coolify: delete dead `wireguard-easy` service** — soft-deleted
      2026-09-04 (row + env vars removed, only `supabase-*` remains).
      Live VPN runs natively on the host (`wg-api.service`, `wg0`).
- [x] **Mail provider moved to Resend (decision 2026-09-05, Brevo out)**.
      Verified live same day: `delivered` webhook flipped a row, 154
      sent total. 12 stale `pending` rows (Aug 16–Sep 3, never claimed
      by the drain, retry 0) cancelled 2026-09-05 — expired
      transactional mail, would only confuse recipients. Drain
      observability shipped (#175) so the next run is diagnosable;
      root cause of the silent skip still open — trigger a manual
      drain (Admin → Mail → process pending) and read claimed/sent.
      Domain verified in Resend by Tanvir. Remaining user steps:
      (a) Resend dashboard → Webhooks → Add endpoint
      `https://api.aifazi.net/api/admin/mail/queue/webhook/resend`,
      subscribe `email.delivered`, `email.bounced`, `email.complained`,
      `email.opened`, `email.clicked`; (b) confirm the shown `whsec_…`
      secret matches Coolify `RESEND_WEBHOOK_SECRET` (already set — if
      the webhook is new, update the env + redeploy); (c) Admin →
      Mail → Resend tab → paste API key + from-address on the verified
      domain → Save → Test. The generic Brevo `/webhook/inbound` path
      stays dormant (no `MAIL_WEBHOOK_SECRET` needed anymore).
- [x] **Vercel: confirm Node 22 runtime** — confirmed 2026-09-04 via
      dashboard screenshot (`22.x`). (Did not fix the 500 by itself —
      the cause was the `isomorphic-dompurify` import, §1.)
- [ ] **Vercel: delete the stale backend project** (if it still exists).
      `aifazi.net-backend-fastapi/vercel.json` + `api/index.py` were removed
      from the repo 2026-09-04; the backend runs on Coolify only. Deleting
      the dashboard project stops its daily `/api/cron/cleanup` from firing
      against production a second time.
- [x] **Vercel: pull Function logs for `GET /`** — pulled 2026-09-04 via
      `vercel logs`: exact `ERR_REQUIRE_ESM` stack (`whatwg-url` ←
      `@exodus/bytes`), same digest `3292404401` on every SSR route.
- [x] **Coolify: deploy managed Redis** — deployed 2026-09-04 (plain Redis
      card, container `i89plmiumzdljg0artlvabos`, healthy, `coolify`
      network). Backend `REDIS_URL` repointed (env ID 319), redeployed,
      `is_redis_available() == True`, manual `redis-aifazi` + volume
      removed.

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
- [ ] **Firewall follow-up (2026-09-04 incident)**: installing
      `iptables-persistent` auto-REMOVED the `ufw` package; the old UFW
      user rules vanished leaving `INPUT ACCEPT`. Mitigated with raw
      iptables (`:51821` scoped to loopback + Docker subnets, rest DROPPED
      for that port; `:8000`/`:8080` DROPPED in `DOCKER-USER`) + saved via
      `netfilter-persistent`. Remaining gap: no default-deny baseline for
      other ports — consider a full `iptables` default-deny policy
      (22/80/443/51820-udp ALLOW) or reinstall `ufw` (note: it conflicts
      with `iptables-persistent`; pick one manager, not both).
- [ ] **Build-stall watch**: two Coolify deploys wedged at `0/0` build steps
      with an idle buildx client (jobs showed `in_progress` for 30+ min;
      one build client vanished entirely). Resolved by cancelling the stuck
      queue entries; the retry then built + deployed cleanly (image
      `624c64e`, container healthy). If it recurs: restart the
      `buildx_buildkit_coolify-railpack0` builder before retrying.
- [ ] **Secret hygiene**: Coolify passes all env vars as `docker build`
      `--build-arg`s, so `GITHUB_TOKEN`, `ADMIN_PASSWORD` (bcrypt hash),
      and other secrets are visible in `docker buildx history inspect`
      output + host process list. Root-only exposure on a single-admin
      VPS — accepted risk, but rotate `GITHUB_TOKEN` if the VPS is ever
      shared, and prefer Coolify file-mount secrets for the most sensitive
      values long-term.

## 1. Production outage follow-up (anon 500s since 2026-08-31)

- [x] Root-caused (first wave): `ERR_REQUIRE_ESM` — CJS `whatwg-url@17`
      requires ESM `@exodus/bytes`; Vercel fleet mixes Node 20.x minors,
      some without `require(esm)` support → same page randomly 200/500.
- [x] Fix shipped: `"engines": { "node": "22.x" }` (frontend `package.json`).
- [x] **500 root-cause chain (2026-09-04 audit, now closed)**:
      `GET /`, `/blog`, `/login`, `/status` 500'd deterministically with
      the `__next_error__` page (layout-level throw, not the old flaky
      fleet issue). Ruled out: failsafe server fetches, `SITE_URL`,
      providers, middleware. Local standalone SSR rendered 200 (Node 24
      masks the bug via `require(esm)`). Vercel function logs gave the
      exact stack → `EditContext`'s `isomorphic-dompurify` import (see
      root-cause item below). Shipped hardening along the way: layout
      theme-CSS try/catch (#157).
- [x] Verify post-deploy: `curl https://aifazi.net/` → 200 (anonymous),
      `/blog` `/login` `/status` 200, Vercel function logs error-free —
      outage closed 2026-09-04 ~13:00 UTC. (Correction to the local-repro
      note above: the bug WAS in the code — `EditContext`'s
      `isomorphic-dompurify` import — it just doesn't throw on Node 24
      local, only on Vercel's function runtime. The Node dashboard setting
      was already `22.x`; the runtime wasn't the cause.)
- [ ] Playwright smoke green + backend monitor flips Website to up.
      Homepage hand-verified 200 on 2026-09-04; run `npm run test:e2e`
      and confirm the monitor cycle.
- [x] **Root-caused for real (2026-09-04)**: `context/EditContext.jsx`
      (a provider wrapping every page) imported `isomorphic-dompurify`,
      whose server path loads `jsdom → whatwg-url@17 → @exodus/bytes`
      (ESM-only) → `ERR_REQUIRE_ESM` on Vercel's function runtime, even on
      Node 22.x. Fix (#159): new `lib/sanitizeHtml.ts` (real DOMPurify on
      client, no-op regex fallback on server) in the 4 call sites
      (`EditContext`, `BlockRenderer`, `BlogPost`, `MailQueue`);
      `isomorphic-dompurify` uninstalled (`npm ls jsdom` empty,
      `whatwg-url@17` gone). Verified: local standalone SSR serves `/`,
      `/blog`, `/login` → 200 with zero `__next_error__`.

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
- [x] Deploy the whitespace-strip fix — verified live 2026-09-04
      (deployed `wireguard.py` contains the strip logic; ships since the
      post-#157 backend deploys).
- [ ] Users: one peer per device (never reuse a peer on two devices);
      log in as `admin@aifazi.net` to manage the existing peers.
- [x] **VPN monitor**: `vpn` service in the uptime monitor (host API +
      interface + peer mix check, idleness is UP not DOWN so 4am doesn't
      page); `GET /vpn/admin/activity?days=` per-day sessions/bytes;
      VpnPanel Monitor tab (alerts, server/uptime cards, 7-day chart,
      live peer freshness). Auto-enabled for fresh installs; existing
      installs add `vpn` to monitor `enabled_services`.
- [ ] **Native in-app tunnel** (mobile): needs `npx expo prebuild` +
      native WireGuard module + EAS build. Management (CRUD/QR/stats)
      works today; the tunnel itself lives in the external WireGuard app.
- [ ] **Certificate pinning** (#11): live SPKI pins for `api.aifazi.net`
      extracted 2026-09-04 and kept here (leaf + chain backups):
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

## 6b. PDF suite — BentoPDF declined (2026-09-04, licensing)

- [x] Evaluated `ghcr.io/alam00000/bentopdf` for `/tools/files`: client-side
      only (no API), own UI, **AGPL-3.0**. Decision: no copyleft surface —
      embed PR #168 closed unmerged, Coolify `bento-pdf-*` service record
      + container removed. Our File Tools stay 100% clean-room
      (pdf-lib/pdf.js client-side + PyMuPDF backend).
- [ ] Legal-safe paths forward (pick one): (a) buy the $79 lifetime
      Commercial License, then embed/self-host freely incl. rebranding;
      (b) build native tools incrementally (merge/split/compress first)
      with pdf-lib + existing backend — full design match, zero license
      surface. Do NOT re-introduce AGPL PDF code (jsdom-adjacent WASM,
      cpdf, Ghostscript bundles) without the commercial license.

## 6. Small items

- [ ] #14 leftover: RoamingRobot animation speed tied to live visitor
      count (pass count as prop, scale speed; cosmetic).
- [ ] i18n / multi-language: explicitly OUT OF SCOPE (decision 2026-09-03).
- [ ] TypeScript migration (#72): incremental, 200+ JSX files. Start
      with `pages-src/admin/access.js` → `.ts` + `lib/api.ts` strict
      types when touching those areas; no big-bang rewrite.

## 8. Security audit follow-ups (2026-09-04 full audit — code shipped, ops pending)

- [x] Backend: staff-JWT path of mail `process-pending` auth fixed
      (missing `await` → 500); generic `/webhook/inbound` gets timestamp
      freshness + terminal-state-sticks replay guard.
- [x] Backend: cookie-session logout now revokes server refresh token
      (+ previous); `require_staff` rule gaps closed (`/actions/search`,
      `/fivem/players`, `/fivem/txadmin`, `/fivem/sync`, `/portfolio`,
      `/auth/lookup`); moderator VPN PII redacted (user_id/endpoint IPs
      admin-only); `WG_API_TOKEN` missing → loud startup error.
- [x] Backend: VPN client secrets encrypted at rest (Fernet `enc1:`,
      key from `PASETO_SECRET`); legacy plaintext rows auto-upgrade on
      next read/rotation.
- [x] Frontend: SSR sanitizer hardened (quote/slash-tolerant stripping,
      forbidden elements, fail-closed `catch`); BlogPost iframe filter
      quote-tolerant; theme-CSS builder strips breakout vectors;
      X-Forwarded-For no longer forwarded; `chat` role admitted to admin
      shell (lands on Live Chat); logout revokes before notifying;
      403s clear stale staff claims; dashboard fetches gated per-section;
      HSTS added for non-Vercel runtimes.
- [x] Mobile: pinning lib removed (broke Gradle); VPN config preview
      redacts keys, Share gated behind warning confirm, secrets cleared
      on modal close.
- [x] CI: `Frontend - Build` added as 6th required check; prune keeps
      3 newest deployments; `create-pull-request` pinned to SHA.
- [ ] CI debt (mypy + Bandit still `continue-on-error`): ~40 pre-existing
      mypy errors (ssrf, jwt_compat, txadmin_service, seo_proxy,
      file_tools, pdf_editor, store_delivery, backup, audit, newsletter
      incl. a real un-awaited coroutine at `newsletter.py:66`, monitor,
      fivem, mail_queue, vpn `_get_user_id`) + unresolved Bandit HIGHs
      (report only exists as a CI artifact). Fix file-by-file with a
      local interpreter, then drop the flags. Making them blocking now
      would freeze `main` on pre-existing debt — verified none of the
      errors are from this batch's code.
- [x] Repo: `.gitignore` covers keys/certs/signing artifacts + example
      re-allow ordering fixed; RLS lockdown migration written
      (`20260904000000_lockdown_chat_write_rls.sql`).
- [x] **OPS — RLS migration applied 2026-09-05** (via `psql -f`, verified
      in `pg_policies`): authenticated chat WRITES gone on all 5 tables,
      reads intact, `service_role_all_*` on all 5. Follow-up fix same day:
      the lockdown had also dropped `authenticated_read_chat_mutes/bans`,
      silently killing live mute/ban Realtime for logged-in moderators —
      restored (`auth_read_chat_mutes/bans`). `chat_room_user_keys`
      verified correctly scoped (`user_id = auth.uid()`).
- [x] **OPS — nightly DB backups installed 2026-09-05**: script at
      `/opt/aifazi.net/scripts/backup-db.sh` (LF endings), passphrase in
      root-only `/root/.aifazi-backup-pass` (shown once to Tanvir — needed
      for restores), root cron `0 3 * * *`, first dump verified
      (`postgres-20260905T082155Z.sql.gz.enc`, 304 KB, decrypt-check
      passed), 7-day rotation. Still to do once: test restore to a
      scratch DB.
- [ ] **Mobile hardening leftovers**: biometric app-lock before VPN
      secrets (expo-local-authentication already installed); SecureStore
      `requireAuthentication`/`keychainAccessible` review; verify
      `secure_store_backup_rules` excludes tokens at next prebuild;
      push deep-link targets already server-authorized (verified).
- [ ] **Decisions for Tanvir**: (a) purge unreachable bcrypt object via
      history rewrite, or accept (unreachable, scrubbed at HEAD —
      recommendation 2026-09-05: ACCEPT, no evidence of reuse; rewrite
      would force every clone to re-clone);
      (b) require 1 reviewer on `main` — recommendation 2026-09-05: DO NOT
      enable. Repo has exactly one collaborator (`aifazi`); authors cannot
      approve their own PRs, so this would deadlock ALL merges. The
      owner-automerge + 6 required checks model is correct for solo;
      (c) Vercel preview protection (dashboard: project Settings →
      Deployment Protection → enable for previews);
      (d) ClamAV scan default stays OFF — verified 2026-09-05: no daemon,
      container, or process anywhere on the VPS; turning the default ON
      would 503 all uploads. Deploy a daemon first if scanning is wanted.

## 7. Release process (reference)

- Frontend → push `main` → Vercel production auto-deploy. Verify:
  deployment Ready + `curl` homepage 200.
- Backend → push `main` → **manual** Coolify deploy of the backend
  application → poll deployment status → check container logs.
- Mobile → push `main` touching `apps/mobile/**` →
  `mobile-auto-release.yml` bumps tag + GitHub release →
  `mobile-release-build.yml` EAS APK+AAB → in-app updater offers it.
- Branch protection: 6 required checks on `main` (Frontend Lint &
  Typecheck, Backend Lint & Typecheck, Mobile Lint & Typecheck, Backend
  Security Scan, Secret Scan, Frontend - Build); always ship via PR.
  Owner PRs auto-merge on green CI (`owner-automerge.yml`; needs the
  "Allow auto-merge" repo setting ticked).
- **Automerge cascade gap (found 2026-09-04)**: merges performed by
  `owner-automerge` run as `GITHUB_TOKEN`, whose pushes do NOT fire
  push-triggered workflows — mobile auto-release and prune-deployments
  silently skip those merges (caught when v1.0.57 had to be dispatched
  by hand). Fix options: manual `gh workflow run mobile-auto-release`
  after such merges (works), or give automerge a PAT so downstream
  workflows fire, or add a scheduled sweep.
