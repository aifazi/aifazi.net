# aifazi.net — Project Status

> **What we're doing right now, and what's left to do.** Updated 2026-10-05.
> Audit history: [AUDIT.md](AUDIT.md) (latest §19: full Round 7 — 2 Critical, 25 High) · Ops backlog: [ROADMAP.md](ROADMAP.md) · PR flow: [PREVIEW.md](PREVIEW.md)

## Where we are (what we're doing)

| Work stream | Status | Latest |
|-------------|--------|--------|
| **Hybrid-infra diagram editor** | Feature complete + hardened | Audit batches #375–#377, fullscreen #378/#388, doc-driven decorations #389, library 26→62 items + sidebar redesign #390/#391 |
| **Core UI migration** | ~90% done | Native inputs/dialogs/buttons → `core/forms`, core dialog+notify, `Clickable` (#379–#384); leftovers remain (P2 below) |
| **Audit-driven hardening** | Round 7 published 2026-10-05 | 4 parallel audits + full suites green (backend 321, frontend 0/58, mobile clean); **2 Critical** (staff settings mass-assignment → IdP config; CDN PUT leaks plaintext secrets), **25 High** across backend/frontend/mobile/infra; 1 shipped in-round (provider-save enabled default). Fix plan P0→P2 in AUDIT §19 |
| **Repo hygiene** | Mostly done | Branches/stashes/caches/artifacts cleaned; Playwright artifact untracked (#393). Leftover (Round 5, AUDIT §15): 3 local branches (`bevel-sandwich`, `unique-blade`, `chore/batch3-local-sync`) + 3 worktrees, all at `main`'s commit, no unmerged work, stash empty; remote has `main` only |
| **Mobile release pipeline** | Fix applied, **unverified** | Actions create-PR setting enabled 2026-10-03 (was broken 6 weeks); no OTA shipped since 2026-08-29 |
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

Current counts: frontend **151 passed** (+1 skip) · backend **280** · mobile **83** · npm audit **7 (0 critical)**.

## What remains

### P0 — next action

- [x] **Run the `mobile_oauth_claims` migration** (Supabase SQL editor, SQL in AUDIT §17) — **done + verified live 2026-10-04** (`mobile_oauth_claims` table present in prod Supabase; `users.authentik_id` column confirmed).
- [ ] **Verify the mobile release pipeline end-to-end**: dispatch `mobile-release-build.yml` — the version-bump PR must now be created (`app.json` 1.0.39 → current release), APK attaches, run goes green → `mobile-ota-update` unblocks. **Owner decision:** shipping the OTA also releases ~3 weeks of pending mobile changes to production users.

### P1 — this sprint

- [x] **Close CI gaps** (audit O3): `dependency-review-config.yml` IS auto-loaded (round-5 correction — "inert" was wrong) but 2 of its keys were invalid/ignored — removed (#400); mobile `npm test` + `lint:hooks` now in CI, Playwright e2e runs as its own job (read-only GETs against production), mobile vitest include now covers `*.test.tsx` (this PR).
- [x] **Fix theme hydration flake** (U1): `app/providers.tsx:394` first-theme-sync can drop `data-theme` (e2e flake + real flash to default) — resolved by A5-8: first sync adopts the FOUC-stamped value instead of clobbering it, and never writes stale state to storage (decision in `core/themeSync.ts` + tests).
- [x] **Dependency majors** (audit E1): Sentry 10 → 11 done (this PR): `@sentry/nextjs` ^11.4.0, `withSentryConfig` from `@sentry/nextjs/config`, `onRequestError` hook in `instrumentation.ts`. **ESLint 10 blocked** — eslint-config-next's nested plugins (react 7.37.5 / jsx-a11y 6.10.2 / import 2.32.0) crash on eslint 10's removed `getFilename` API; no compatible releases exist (verified 2026-10-03, AUDIT.md §15.8); staying on the maintenance line (9.39.5) until they ship. Decide vitest 3 → 5 separately.
- [x] **Pin hygiene** (O4): `PyJWT` requirements 2.15 vs lock 2.14; pin `pydantic`; fix `requirements.lock` reproducibility claim — closed in #406: PyJWT lock aligned 2.15, pydantic pinned 2.13.5, CI tooling pinned via `requirements-dev.txt` (ruff/mypy/bandit/pip-audit no longer float), lock's "pip-compile reproducible" claim corrected.

### P2 — backlog fixes (details in AUDIT.md §14)

- [x] Open Round-3 series: **N9** (page_layouts restore lacks try/except), N10, N11, N12, N13, F10, F11, F12, F14, F16, F19, **B16** (prod CORS wipes dynamic subdomains) — all 12 closed in #406 (N12: drafts now base64-encoded in `lib/infraDraft.ts`; F14: labels carry `htmlFor`/`aria-label`; B16: CORS construction in `utils/cors_origins.py`, prod keeps subdomain pattern).
- [x] Round-5 additions: **A5-7** (draft restore forks saved diagrams — re-attach to original `docId` via `draftRestoreDocId`), **A5-8** (first-theme-sync writes stale theme to localStorage/cookie — first sync adopts the DOM stamp, skips the storage write; resolves U1), **A5-9** (untyped `workloads`/`deps` entries now 400 at the write gate instead of being dropped on round-trip — B11 evidence closed). (A5-4 S1/R2 tests — done.)
- [ ] Core-ui leftovers (U2): native textarea/input in 4 files; `Select`/`Checkbox` drop caller `onClick`; keyboard-activate bubbles MouseEvent (video seek bar jumps to 0); lightbox upscale/distort.
- [ ] Decorations parity (U3): backend coord clamps; decoration/annotation id dedupe (node-id dedupe landed in #406 F19; dup annotation ids still render locally but 400 on save).
- [ ] Docs/env (U4): missing backend keys in `.env.example` (`AUTHENTIK_*`, `UPSTASH_*`, `DISCORD_*`, `ADMIN_PASSWORD_HASH`, `LLDAP_*`…); README `docker compose up` needs `.env.local` setup; SECURITY.md line refs (7 of 13 stale per §16.4); `PLAN-REDESIGN-REVAMP.md` still on disk with no deprecation banner despite #409's roadmap superseding it.
- [ ] Round-6 additions: **R6-1** (dep-review policy file inert — add `config-file` input to `ci.yml` + owner policy call), R6-2 (drop invalid `max-vulnerabilities` key), R6-3 (`_validate_ldap_url` mapped-IPv6 bypass), R6-4 (drop duplicate `/api/auth/config-check` include at `main.py:761`).
- [ ] LOW items: dependabot `docker/frontend` entry; `infra_diagrams` migration REVOKE parity; audit.py actor attribution; Safari fullscreen prefix + menu portal; DateTimePicker time-only edits; Escape for forum admin modals. (fonts.py redirect revalidation — done, round 5 A5-2.)

### P3 — structure / product

- [x] God-file split: `auth.py` — done in #408: 2145 → 29-line assembly module; shared helpers in `routers/auth_shared.py`; `/config-check` in its own `routers/config_check.py`; remaining routes moved to the domain sub-routers (auth_sessions/auth_register/auth_profile/auth_staff); ~1300 lines of shadowed dead implementations removed; route surface verified identical (61 /api/auth routes before/after, pytest 244 green).
- [ ] God-file splits remaining: `ThemeLibrary.jsx` (4240), `HybridInfraEditor.tsx` (3241), `HybridInfraCanvas.tsx` (2502) — new top-3 since round 6, `ServerRackAnimation.jsx` (2494), `AdminPanels.jsx` (1891); backend `fivem.py` (2003, largest backend file, newly tracked in §16.4).
- [ ] Canonicals + JSON-LD for `/p/[slug]`, store, forum; og:image for diagram share links.
- [ ] **ROADMAP.md reconciliation**: header says 2026-09-04 (~4 weeks stale), 32 unchecked items — triage each: execute, park, or close.
- [ ] Dead files: delete or wire the 22 unreferenced `scripts/*` codemods (now failing `ruff` with 26 errors — silently rotting outside CI scope, AUDIT §16.4); wire backend `check_migrations.py` / `check_policies.py` into CI or remove.
- [ ] Component test depth (audit E2): export/share/HISTORY/RESTORE/JSON-import coverage for hybrid-infra.

### Decisions & standing risks (owner)

- [ ] **C3 — R2 backup target #2**: backup still same-host WebDAV; needs bucket + S3 credentials, then dual-target job + restore test.
- [ ] **H1**: confirm prod secret rotation status. **R7-20 (2026-10-05): live dumps (`.env.prod-pull`, `.env.pull`, `.env.pulled`, both `.env.local`) found on disk again — delete + rotate.** **H2: closed 2026-10-04** (AUDIT §17) — mobile OAuth deep links now carry one-time exchange codes; the `mobile_oauth_claims` migration (P0 above) is also done + verified live. The PASETO `purpose`-claim clobber follow-up (broke GitHub/Steam account-linking) is **closed** in §18 — link tokens now use `token_type`.
- [x] **Authentik** enable/disable implemented (AUDIT §18): local `banned` enforcement first, then best-effort admin-API sync when `AUTHENTIK_API_TOKEN` is set (`PATCH {issuer}/api/v3/core/users/{uuid}/`); without the token the local change stands with a `warning` instead of the old 501. Login `invalid_client` (2026-10-03) was a DB↔env client-secret desync — synced + verified end-to-end 2026-10-04 (AUDIT §18.4).
- [ ] **EAS rebuild** handoff (`apps/mobile/EAS-REBUILD.md`) once the pipeline is verified.
- [ ] Mobile npm advisories (31, 0 critical) — only clearable via Expo SDK bumps; build-chain only.

## Quick pointers

| Question | Where |
|----------|-------|
| What did the audits find, and what's fixed? | [AUDIT.md](AUDIT.md) — §19 Round 7 (2026-10-05) |
| Server/ops/inbox backlog? | [ROADMAP.md](ROADMAP.md) |
| How to test a PR before merge? | [PREVIEW.md](PREVIEW.md) |
| Infra/VPS hardening state? | [VPS-INFRA-AUDIT.md](VPS-INFRA-AUDIT.md) |
| Plan history (work sessions)? | `.opencode/plans/` |
