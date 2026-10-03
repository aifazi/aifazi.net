# aifazi.net — Project Status

> **What we're doing right now, and what's left to do.** Updated 2026-10-03.
> Audit history: [AUDIT.md](AUDIT.md) (latest §15, Round 5) · Ops backlog: [ROADMAP.md](ROADMAP.md) · PR flow: [PREVIEW.md](PREVIEW.md)

## Where we are (what we're doing)

| Work stream | Status | Latest |
|-------------|--------|--------|
| **Hybrid-infra diagram editor** | Feature complete + hardened | Audit batches #375–#377, fullscreen #378/#388, doc-driven decorations #389, library 26→62 items + sidebar redesign #390/#391 |
| **Core UI migration** | ~90% done | Native inputs/dialogs/buttons → `core/forms`, core dialog+notify, `Clickable` (#379–#384); leftovers remain (P2 below) |
| **Audit-driven hardening** | Round 4 closed same-day | 2026-10-03: 3 UI regressions + 2 security MEDIUMs fixed in #394/#395; 36 of 52 prior findings verified fixed |
| **Repo hygiene** | Mostly done | Branches/stashes/caches/artifacts cleaned; Playwright artifact untracked (#393). Leftover (Round 5, AUDIT §15): 3 local branches (`bevel-sandwich`, `unique-blade`, `chore/batch3-local-sync`) + 3 worktrees, all at `main`'s commit, no unmerged work, stash empty; remote has `main` only |
| **Mobile release pipeline** | Fix applied, **unverified** | Actions create-PR setting enabled 2026-10-03 (was broken 6 weeks); no OTA shipped since 2026-08-29 |
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

Current counts: frontend **132 passed** (+1 skip) · backend **213** · mobile **18** · npm audit **7 (0 critical)**.

## What remains

### P0 — next action

- [ ] **Verify the mobile release pipeline end-to-end**: dispatch `mobile-release-build.yml` — the version-bump PR must now be created (`app.json` 1.0.39 → current release), APK attaches, run goes green → `mobile-ota-update` unblocks. **Owner decision:** shipping the OTA also releases ~3 weeks of pending mobile changes to production users.

### P1 — this sprint

- [ ] **Close CI gaps** (audit O3): `dependency-review-config.yml` IS auto-loaded (round-5 correction — "inert" was wrong) but 2 of its keys are invalid/ignored, remove them; add mobile `npm test` to CI, add Playwright smoke to CI.
- [ ] **Fix theme hydration flake** (U1): `app/providers.tsx:394` first-theme-sync can drop `data-theme` (e2e flake + real flash to default) — initialise theme state from storage before first sync.
- [ ] **Dependency majors** (audit E1): ESLint 9 is EOL → 10; Sentry 10 → 11; clears much of the remaining npm advisory chain. Decide vitest 3 → 5 separately.
- [ ] **Pin hygiene** (O4): `PyJWT` requirements 2.15 vs lock 2.14; pin `pydantic`; fix `requirements.lock` reproducibility claim.

### P2 — backlog fixes (details in AUDIT.md §14)

- [ ] Open Round-3 series: **N9** (page_layouts restore lacks try/except), N10, N11, N12, N13, F10, F11, F12, F14, F16, F19, **B16** (prod CORS wipes dynamic subdomains).
- [ ] Round-5 additions: **A5-7** (draft restore forks saved diagrams — re-attach to original `docId` instead of `setDocId(null)`), **A5-8** (first-theme-sync writes stale theme to localStorage/cookie — fold into U1), A5-9 (untyped `workloads`/`deps` pass backend validation, drop on round-trip — B11 evidence). (A5-4 S1/R2 tests — done.)
- [ ] Core-ui leftovers (U2): native textarea/input in 4 files; `Select`/`Checkbox` drop caller `onClick`; keyboard-activate bubbles MouseEvent (video seek bar jumps to 0); lightbox upscale/distort.
- [ ] Decorations parity (U3): backend coord clamps; `sanitizeDoc` id dedupe (duplicate id renders locally but 400s on save).
- [ ] Docs/env (U4): missing backend keys in `.env.example` (`AUTHENTIK_*`, `UPSTASH_*`, `DISCORD_*`, `ADMIN_PASSWORD_HASH`, `LLDAP_*`…); README `docker compose up` needs `.env.local` setup; SECURITY.md line refs; stale `PLAN-REDESIGN-REVAMP.md` claims.
- [ ] LOW items: dependabot `docker/frontend` entry; `infra_diagrams` migration REVOKE parity; audit.py actor attribution; Safari fullscreen prefix + menu portal; DateTimePicker time-only edits; Escape for forum admin modals. (fonts.py redirect revalidation — done, round 5 A5-2.)

### P3 — structure / product

- [ ] God-file splits: `ThemeLibrary.jsx` (4038), `ServerRackAnimation.jsx` (2379), `AdminPanels.jsx` (1773), `auth.py` (1974).
- [ ] Canonicals + JSON-LD for `/p/[slug]`, store, forum; og:image for diagram share links.
- [ ] **ROADMAP.md reconciliation**: header says 2026-09-04, 33 unchecked items (at least one already done) — triage each: execute, park, or close.
- [ ] Dead files: delete or wire the 22 unreferenced `scripts/*` codemods; wire backend `check_migrations.py` / `check_policies.py` into CI or remove.
- [ ] Component test depth (audit E2): export/share/HISTORY/RESTORE/JSON-import coverage for hybrid-infra.

### Decisions & standing risks (owner)

- [ ] **C3 — R2 backup target #2**: backup still same-host WebDAV; needs bucket + S3 credentials, then dual-target job + restore test.
- [ ] **H1**: confirm prod secret rotation status. **H2**: OAuth `#token=` fragments → one-time exchange codes (long-term).
- [ ] **Authentik** enable/disable stay 501 stubs until an `AUTHENTIK_API_TOKEN` exists.
- [ ] **EAS rebuild** handoff (`apps/mobile/EAS-REBUILD.md`) once the pipeline is verified.
- [ ] Mobile npm advisories (31, 0 critical) — only clearable via Expo SDK bumps; build-chain only.

## Quick pointers

| Question | Where |
|----------|-------|
| What did the audits find, and what's fixed? | [AUDIT.md](AUDIT.md) — §15 Round 5 (2026-10-03) |
| Server/ops/inbox backlog? | [ROADMAP.md](ROADMAP.md) |
| How to test a PR before merge? | [PREVIEW.md](PREVIEW.md) |
| Infra/VPS hardening state? | [VPS-INFRA-AUDIT.md](VPS-INFRA-AUDIT.md) |
| Plan history (work sessions)? | `.opencode/plans/` |
