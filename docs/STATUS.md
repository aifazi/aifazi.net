# aifazi.net — Project Status

> **What we're doing right now, and what's left to do.** Updated 2026-10-07.
> Audit history: [AUDIT.md](AUDIT.md) (latest §20: Round 8 + remediation close-outs) · Ops backlog: [ROADMAP.md](ROADMAP.md) · PR flow: [PREVIEW.md](PREVIEW.md)

## Where we are (what we're doing)

| Work stream | Status | Latest |
|-------------|--------|--------|
| **Hybrid-infra diagram editor** | Feature complete + hardened | Audit batches #375–#377, fullscreen #378/#388, doc-driven decorations #389, library 26→62 items + sidebar redesign #390/#391 |
| **Core UI migration** | ~90% done | Native inputs/dialogs/buttons → `core/forms`, core dialog+notify, `Clickable` (#379–#384); leftovers remain (P2 below) |
| **Audit-driven hardening** | Round 8 fix batch **landed #449** 2026-10-06, CodeQL batch **#462** 2026-10-07 — **code scanning 0 open** | R7-1/R7-2 + P1s in #447; R8 remainder (LDAP authorize ban, mobile exchange fail-closed, CDN admin scope, page_layout counts) in #449; 10 code-scanning alerts fixed in #462 (exception-text exposure, sanitizer hardening), 6 dismissed as false positive with justification |
| **Mail + LDAP identity infra** | Rebuilt 2026-10-06/07, **working** | Stalwart LDAP bind went stale (rc=49 on every login) → per-app service accounts (`ldapbind-stalwart/nextcloud/backend`, type service_account) + `LDAP bind accounts` group + `LDAP directory searchers` role (`search_full_directory` on the provider) + app access bindings; Nextcloud + portal (`site_config`) + Stalwart all on service binds; backend username lookup fixed to `cn` (#464); zombie LDAP outpost removed; noreply re-passworded + added to `mail` group; backend SMTP + NC mail verified end-to-end (Gmail delivery ~1s) |
| **Repo hygiene** | Mostly done | Branches/stashes/caches/artifacts cleaned; Playwright artifact untracked (#393). Leftover (Round 5, AUDIT §15): 3 local branches (`bevel-sandwich`, `unique-blade`, `chore/batch3-local-sync`) + 3 worktrees, all at `main`'s commit, no unmerged work, stash empty; remote has `main` only |
| **Mobile release pipeline** | Verified end-to-end 2026-10-06 | Bump PRs auto-merge since #453 ([skip ci] dropped); v1.0.71→1.0.73 released with EAS builds green; **OTA v1.0.73 published** (first since 2026-08-29); cascade guard #457; fully automatic chain still needs owner `WORKFLOW_PAT` secret |
| **Talk + realtime infra** | Deployed 2026-10-07, pending call test | Standalone signaling (`24e899d`) + NATS on private net, `spreed.aifazi.net` + LE, registered with verify; coturn TURN wired in; `notify_push` 1.4.1 at `cloud.aifazi.net/push`, setup 6/6 green; HPB shows version-skew notice (`changed-users` not in any published image yet — calls unaffected); needs a real multi-party call test |
| **Mobile revamp (Talk + VPN)** | M2/M3 + C6 implemented, pending device QA | 2026-10-04: **C6/H2 done** — mobile OAuth deep links carry one-time exchange codes (never tokens): `POST /api/auth/mobile/exchange` + `mobile_oauth_claims` claim table, all four provider callbacks converted, mobile Discord login (previously broken/web-only) now works, app state echoed end-to-end; backend 244→257 tests, mobile 66→83. Before ship: `mobile_oauth_claims` migration **run + verified live 2026-10-04** (incl. `users.authentik_id` column in prod), then M0.1 Android media spike, NC app password (owner), M1/EAS — ledger in `apps/mobile/PLAN-ROADMAP.md` |
| **Docs consolidation** | In progress | This file + AUDIT.md §14; ROADMAP.md still stale (see P3) |

### How we ship (per change)

```
branch off fresh main → implement → verify (gate below) → commit (-F msg file)
→ push → gh pr create → gh pr checks --watch → squash auto-merge → sync main → delete branch
```

Verification gate — every PR:

| Where | Commands |
|-------|----------|
| Frontend | `npx tsc --noEmit` · `npm run lint` (0 errors, ≤150 warnings; baseline 58) · `npm run test` · `npm run build` |
| Backend | `python -m ruff check .` · `python -m mypy routers/ --ignore-missing-imports` · `python -m pytest tests/ -q` |
| Mobile | `npm run typecheck` · `npm run lint` · `npm test` |
| e2e (feature PRs) | start server → `npx playwright test` |

Current counts: frontend **167** (166 passed +1 skip) · backend **356** · mobile **87** · code scanning **0 open** · dependabot queue **empty** (13 merged 2026-10-06, 4 majors migrated separately).

## What remains

### P0 — next action

- [x] **Run the `mobile_oauth_claims` migration** (Supabase SQL editor, SQL in AUDIT §17) — **done + verified live 2026-10-04** (`mobile_oauth_claims` table present in prod Supabase; `users.authentik_id` column confirmed).
- [x] **Apply the `users.authentik_id` migration to prod** (`supabase/migrations/20261005000001_users_authentik_id.sql`) — **applied + verified live 2026-10-06** (column + index already present; `page_layouts.block_count` migration `20261006000000` likewise applied, 0 rows needed backfill).
- [ ] **Coolify backend redeploy** (activates #447 + #449 + #464 LDAP fix): re-run Identity Doctor, one live LDAP login, hard-refresh `/login`. Then verify prod `bind_user` end-to-end (unit + staging proofs in #464).
- [x] **Mobile pipeline verified + OTA shipped** (was P0): bump PRs auto-merge (#453), v1.0.71→1.0.73 released, **OTA v1.0.73 published** 2026-10-06. Fully automatic chain still needs owner `WORKFLOW_PAT` (classic PAT, `repo`+`workflow`).
- [ ] **Mail/user verification round**: Talk multi-party call test; Nextcloud "Send email" test button; confirm inbound (Google reports) flowing.
- [ ] **Owner secrets**: `VERCEL_TOKEN` refresh (repo secret; prune automation 403s without it), `WORKFLOW_PAT` (above), admin mailbox password for the health monitor (`imap-login` still checks stale `admin123`).
- [ ] **Coolify Stalwart compose**: image tag aligned to `v0.16.21` in DB 2026-10-07 — redeploy from Coolify whenever convenient (no urgency; live container already on .21).

### P1 — this sprint

- [ ] **CI runner starvation (2026-10-05)**: GitHub-hosted jobs repeatedly failed acquisition ("not acquired by Runner even after multiple attempts") across 3 consecutive runs — green only after manual `gh run rerun --failed` ×3. Code was clean every time (verified locally). Consider longer `timeout-minutes` + documented rerun procedure, or a fallback runner pool — every merge currently risks a 30+ min stall.
- [x] **Close CI gaps** (audit O3): `dependency-review-config.yml` IS auto-loaded (round-5 correction — "inert" was wrong) but 2 of its keys were invalid/ignored — removed (#400); mobile `npm test` + `lint:hooks` now in CI, Playwright e2e runs as its own job (read-only GETs against production), mobile vitest include now covers `*.test.tsx` (this PR). 2026-10-05 correction (AUDIT §19, R6-1): the action does NOT auto-load the file — `ci.yml` now passes it explicitly via the `config-file` input, so the round-5 "auto-loaded" claim is superseded.
- [x] **Fix theme hydration flake** (U1): `app/providers.tsx:394` first-theme-sync can drop `data-theme` (e2e flake + real flash to default) — resolved by A5-8: first sync adopts the FOUC-stamped value instead of clobbering it, and never writes stale state to storage (decision in `core/themeSync.ts` + tests).
- [x] **Dependency majors — all 4 landed 2026-10-07**: stripe 15→16 (#427 + Terminal `payment_method_types`→`allowed_payment_method_types` migration); frontend vitest 3→5 (#428 — dropped obsolete esbuild-jsx override, Vite 8/Oxc handles it); eslint 9→10 (#430 — preset 16.4.0 for the Babel-parser crash + pinned react version for the `getFilename` removal); expo/RN 0.86→0.87 (#432 — `ElementRef` host refs, `undefined` list components, npm-10 lockfile regen). Native-build validation rides the normal mobile release pipeline.
- [x] **Dependabot queue: empty.** Parked set fully drained; no open PRs.
- [x] **Pin hygiene** (O4): `PyJWT` requirements 2.15 vs lock 2.14; pin `pydantic`; fix `requirements.lock` reproducibility claim — closed in #406: PyJWT lock aligned 2.15, pydantic pinned 2.13.5, CI tooling pinned via `requirements-dev.txt` (ruff/mypy/bandit/pip-audit no longer float), lock's "pip-compile reproducible" claim corrected.

### P2 — backlog fixes (details in AUDIT.md §14)

- [x] Open Round-3 series: **N9** (page_layouts restore lacks try/except), N10, N11, N12, N13, F10, F11, F12, F14, F16, F19, **B16** (prod CORS wipes dynamic subdomains) — all 12 closed in #406 (N12: drafts now base64-encoded in `lib/infraDraft.ts`; F14: labels carry `htmlFor`/`aria-label`; B16: CORS construction in `utils/cors_origins.py`, prod keeps subdomain pattern).
- [x] Round-5 additions: **A5-7** (draft restore forks saved diagrams — re-attach to original `docId` via `draftRestoreDocId`), **A5-8** (first-theme-sync writes stale theme to localStorage/cookie — first sync adopts the DOM stamp, skips the storage write; resolves U1), **A5-9** (untyped `workloads`/`deps` entries now 400 at the write gate instead of being dropped on round-trip — B11 evidence closed). (A5-4 S1/R2 tests — done.)
- [ ] Core-ui leftovers (U2): Dashboard/shared migrated to core forms + States in #447; remain: 58 bespoke `S.btn` in Dashboard, PostEditor toolbar/action buttons, 1 hidden file input (needs ref-click), Changelog/StorePanel/ThemeLibrary/ScanCam natives (color/file inputs); `Select`/`Checkbox` drop caller `onClick`; keyboard-activate bubbles MouseEvent (video seek bar jumps to 0); lightbox upscale/distort.
- [ ] Decorations parity (U3): backend coord clamps; decoration/annotation id dedupe (node-id dedupe landed in #406 F19; dup annotation ids still render locally but 400 on save).
- [ ] Docs/env (U4): missing backend keys in `.env.example` (`AUTHENTIK_*`, `UPSTASH_*`, `DISCORD_*`, `ADMIN_PASSWORD_HASH`, `LLDAP_*`…) — inventory synced 2026-10-05 (AUDIT §19, placeholders only); still open: README `docker compose up` needs `.env.local` setup; SECURITY.md line refs (7 of 13 stale per §16.4); `PLAN-REDESIGN-REVAMP.md` still on disk with no deprecation banner despite #409's roadmap superseding it.
- [x] Round-6 additions: R6-1/R6-2 dep-review wiring **done 2026-10-05**; R6-3 (mapped-IPv6 bypass) + R6-4 (duplicate config-check mount) **done in #449**.
- [ ] LOW items: dependabot `docker/frontend` entry; `infra_diagrams` migration REVOKE parity; audit.py actor attribution; Safari fullscreen prefix + menu portal; DateTimePicker time-only edits; Escape for forum admin modals. (fonts.py redirect revalidation — done, round 5 A5-2.)

### P3 — structure / product

- [x] God-file split: `auth.py` — done in #408: 2145 → 29-line assembly module; shared helpers in `routers/auth_shared.py`; `/config-check` in its own `routers/config_check.py`; remaining routes moved to the domain sub-routers (auth_sessions/auth_register/auth_profile/auth_staff); ~1300 lines of shadowed dead implementations removed; route surface verified identical (61 /api/auth routes before/after, pytest 244 green).
- [ ] God-file splits remaining: `ThemeLibrary.jsx` (4240), `HybridInfraEditor.tsx` (3301), `HybridInfraCanvas.tsx` (2502) — new top-3 since round 6, `ServerRackAnimation.jsx` (2494), `AdminPanels.jsx` (1891); backend `fivem.py` (2003, largest backend file, newly tracked in §16.4).
- [x] Canonicals + JSON-LD for `/p/[slug]`, store, forum; og:image for diagram share links — done in #447 (zero-dep `/api/og` SVG route + share-panel wiring, hybrid-infra JSON-LD escaping fixed).
- [ ] Round-7 Mediums/Lows still open (full list in AUDIT §19): PKCE `plain` + optional challenge, `file_tools` CPU caps, check-username oracle, CDN audit trail, callback RL suffix-match, WG L3-IP trust, dashboard 5-API abort, forum double-refresh, login stale `next`, Discord-error coupling, abuse undo in sessionStorage, contacts N-fanout, Google fonts (kept: remote theme fonts by design), avatars `unoptimized` (kept: wildcard remotePatterns = open fetch proxy), mobile cold-start offline, chat outbox persistence, `partial_token` in deeplink, iOS mic strings, background polling guards, OTA channel pin, arm64-only, NC scrape fragility, RLS parity, audit-table bootstrap, `check_migrations.py` refresh, mypy `utils/` scope, `pytest -x`, preview-build hosts, E2E-on-prod gating, notify echo-only, dead LiveKit refs, images-by-tag, header skew, L1 token hashing, `db/check` gating, flash-timer overlap, username-check timer, tab long-press a11y, EXPO_PUBLIC dev-defaults, Talk `hasMore` pagination.
- [ ] **ROADMAP.md reconciliation**: header says 2026-09-04 (~4 weeks stale), 32 unchecked items — triage each: execute, park, or close.
- [ ] Dead files: delete or wire the 22 unreferenced `scripts/*` codemods (now failing `ruff` with 26 errors — silently rotting outside CI scope, AUDIT §16.4); wire backend `check_migrations.py` / `check_policies.py` into CI or remove.
- [ ] Component test depth (audit E2): export/share/HISTORY/RESTORE/JSON-import coverage for hybrid-infra.

### Decisions & standing risks (owner)

- [ ] **C3 — R2 backup target #2**: backup still same-host WebDAV; needs bucket + S3 credentials, then dual-target job + restore test.
- [ ] **H1**: confirm prod secret rotation status. **R7-20 (2026-10-05): live dumps (`.env.prod-pull`, `.env.pull`, `.env.pulled`, both `.env.local`) found on disk again — delete + rotate.** **H2: closed 2026-10-04** (AUDIT §17) — mobile OAuth deep links now carry one-time exchange codes; the `mobile_oauth_claims` migration (P0 above) is also done + verified live. The PASETO `purpose`-claim clobber follow-up (broke GitHub/Steam account-linking) is **closed** in §18 — link tokens now use `token_type`.
- [x] **Authentik** enable/disable implemented (AUDIT §18): local `banned` enforcement first, then best-effort admin-API sync when `AUTHENTIK_API_TOKEN` is set (`PATCH {issuer}/api/v3/core/users/{uuid}/`); without the token the local change stands with a `warning` instead of the old 501. Login `invalid_client` (2026-10-03) was a DB↔env client-secret desync — synced + verified end-to-end 2026-10-04 (AUDIT §18.4).
- [ ] **EAS rebuild** handoff (`apps/mobile/EAS-REBUILD.md`) once the pipeline is verified.
- [ ] Mobile npm advisories (31, 0 critical) — only clearable via Expo SDK bumps; build-chain only.
- [x] **Dependabot queue: drained 2026-10-06/07** — was 17 open; 13 safe minors merged as-is, 4 majors migrated in dedicated PRs (see P1 majors item). Zero open.
- [ ] **Net-new features need taste call (from design+features plan)**: **F5** passkeys/WebAuthn (kills password-attack classes; Authentik supports upstream) · **F6** web notification center (failed-login spikes invisible to users today) · **F7** store order-tracking + stock/price alerts · **F8** full-text site search. Proposed order after P0: D1/D3 foundation are done; next highest-ROI bundle is D2-perf + F1–F3 (shipped) — then owner picks D4/D5 vs F5/F6 vs P1-security balance. Do NOT start F-track on unpatched P0s (done — R7-1/R7-2 closed in #447).

## Quick pointers

| Question | Where |
|----------|-------|
| What did the audits find, and what's fixed? | [AUDIT.md](AUDIT.md) — §20 Round 8 + close-outs (2026-10-06) |
| Server/ops/inbox backlog? | [ROADMAP.md](ROADMAP.md) |
| How to test a PR before merge? | [PREVIEW.md](PREVIEW.md) |
| Infra/VPS hardening state? | [VPS-INFRA-AUDIT.md](VPS-INFRA-AUDIT.md) |
| Plan history (work sessions)? | `.opencode/plans/` |
