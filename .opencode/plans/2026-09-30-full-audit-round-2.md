# Full Audit Round 2 + Improvement/Feature Plan (2026-09-30)

Baseline: `06d4129` (main HEAD, after PR #367). Last audit batch was PR #361 (`1a1c4a7`).

## 1. Recent git history (since last audit)

Since #361, 6 PRs landed — all through reviewed PRs with green CI, no secrets, no orphaned branches
(all 10 remote branches fully merged; local `fix/audit-batch-b` is patch-equivalent to main → delete):

| PR | Feature |
|----|---------|
| #357/#358 | `/hybrid-infra` interactive case study + diagram builder (edit mode, IT library, notes, persistence) |
| #362 | hybrid-infra batch: theme sync, library, grid tools, zoom, cloud seed, sitemap |
| #363 | PageBlocks foundation: `page_layouts` table+CRUD, block registry, 3 seed blocks, renderer |
| #364 | PageBlocks editor: dnd-kit shell, schema options, history, device preview, admin route |
| #365/#366 | diagram drag fix, canvas zoom/pan (wheel/keyboard/touch) |
| #367 | flex batch: multi-select/clipboard, custom categories+flow styling, view system w/ URL deep-links, god-file splits (`infraCanvasKit.ts`, `infraDocOps.ts`) + tests |

Scale: 39 files, +5439/−574 across 21 commits. Backend tests grew 116 → **127 passed**.

## 2. Audit findings (verified)

### P0 — broken today (2)

1. **Mobile `tsc` fails locally; CI can't catch it.** Confirmed: 3 errors from stale generated
   `apps/mobile/.expo/types/router.d.ts` (gitignored, mtime 2026-08-18, still lists deleted chat routes
   `/call` etc., missing `/auth/forgot-password` + `/nextcloud-setup`). CI is green because route types
   are never regenerated (`typedRoutes: true` in app.json but no typegen step) → `Href` collapses to
   `string`, so **any bogus `router.push()` typechecks in CI**. Fix: add route-typegen step before
   `npm run typecheck` in `ci.yml` + `mobile-lint-typecheck.yml` (e.g. `npx expo customize tsconfig.json`
   or run `expo start`/`expo-router` typegen headless; verify what SDK 57 offers — `npx expo export --help`
   or generate via `expo customize`). Then the 3 real errors must be fixed by regenerating locally.

2. **hybrid-infra "SAVE AS NEW" always 422s.** Confirmed: `HybridInfraEditor.tsx:737` sends
   `slug: cur.slug === 'plan-a' ? '' : cur.slug` but `infra_diagrams.py:28` declares
   `slug: str = Field(min_length=1, ...)` → pydantic rejects before `_slugify` can run. The seeded
   flagship plan can never be persisted. Fix: send `slugify(cur.title)` (dead `slugify()` helper at
   `HybridInfraEditor.tsx:58` already exists) or omit slug entirely and let backend derive.

### P1 — correctness (11)

Backend:
- **`updated_at` never written** by `infra_diagrams.py:290-305` or `page_layouts.py:183-188` (no DB
  trigger either) → sort order = creation order, `updatedAt`/`timeAgo`/sitemap `lastmod` all lie.
  Fix: set `updated_at` in both update paths (repo convention: `blog.py:285`).
- **No app-level request-body cap** (`main.py` SecurityMiddleware) → JSON bodies buffered before
  `require_admin` runs; `infra_diagrams._validate_doc` has **no byte cap** (page_layouts has 500KB).
  Fix: Content-Length/body cap middleware (413) + byte cap in `_validate_doc`.
- **Slug-unique collision → 500 not 409** (`infra_diagrams.py:250-254, 281-308`); `page_layouts`
  already maps 23505→409. Also `delete_layout` never 404s (`page_layouts.py:200-204`).
- **VPN IPv6 alloc outside retry loop** (`vpn.py:792`) — v6 unique conflict exhausts retries → 500
  (only when `WG_DUALSTACK=true`, currently default false).

Frontend:
- **Empty-doc save orphans a row**: backend accepts `nodes:[]`, frontend `sanitizeDoc` returns null →
  client throws "invalid doc", `docId` never set, retry 409 (`HybridInfraEditor.tsx:741,794-811`).
- **Hydration mismatches ×2**: `EditSiteFab` imported into server component `app/hybrid-infra/page.tsx`
  (getRole() null on server) and `BlockEditor` in `app/admin/blocks/page.tsx` → admin sees error/staff
  flash. Fix: client wrapper or dynamic import with loader.
- **View memory/deep-links apply to wrong doc**: `<HybridInfra doc viewKey>` passes `viewKey` as prop
  not `key` → island never remounts on doc switch (`HybridInfraEditor.tsx:961`); `?node=` validated
  once against first doc. Fix: `key={viewKey}` + revalidate node on doc switch.
- **vm/legacy/users layers ignore authored x/y** (`HybridInfraCanvas.tsx:307-336`): drag appears to
  work then pointer-up commits hardcoded box → destroys coords; auto-arrange lies for 4/6 layers;
  Plan C seed nodes render at Plan A positions (`data/cloud-infra.ts:73-81`).
- **Silent duplicate node IDs**: `counterRef` not persisted → `${id}-c1` collides after reload;
  backend collapses dupes into a set, canvas (last-wins) vs editor (first-wins) disagree.
- **Mobile push double-navigation**: listener + `getLastNotificationResponseAsync` both fire with no
  identifier dedupe; `clearLastNotificationResponseAsync()` never called (`_layout.tsx:145-160`).
- **Command palette blank product titles**: reads `r.title`, search API returns `name`
  (`mobile/src/components/command-palette.tsx:96-99`, `search.py:13`, same bug web:
  `components/CommandPalette.jsx:72`).

### P2 — hygiene (selected)

- **PageBlocks has no public consumer** — renderer imported only by editor preview; saved layouts
  render nowhere (may be intentional foundation, but #363/#364 are dead from visitor side).
- Canvas keyboard nav crash on empty doc: `kbIndex % nl.length` → `NaN` (`HybridInfraCanvas.tsx:1568`).
- Drag-cancel never closes undo checkpoint (`onPointerCancel` skips `done=true`) → cross-drag undo drift.
- Stale state across doc switches: `selIds`, `lockedIds` (never reset!), `connectFrom`.
- `BlockEditor.updateProp` passes `hist=false` (every keystroke undo-less); `flash()` timeout leaks.
- Validation parity: `sanitizeDoc` doesn't cap nodes at 200, accepts NaN/Infinity x/y; BlockEditor
  import lacks dedupe/type-regex/100-block cap (all 400s server-side).
- XSS-adjacent: `seedBlocks.tsx` CTA `href` has no scheme check → `javascript:` persists (admin-only
  writer, but served to everyone).
- Backend: `_optional_admin` skips DB re-enrichment (demoted admin keeps preview ≤24h); new-router
  auth untested (fixtures stub `require_admin`, no 403/401 tests); `_OPEN_GET_PREFIXES` omits
  `/api/infra` `/api/blocks` (docstrings say public — works only via proxy); `MAX_DEPTH=2` allows 3;
  no pagination on list endpoints; `sitemap.py:42` f-string XML without escaping.
- Docs drift: README says Next 14 + live chat; AUDIT.md cites `packages/shared`, 58 migrations
  (actual 62), `chat-room.tsx`; DESIGN-AUDIT.md links a nonexistent file; PREVIEW.md missing from
  README table.
- Mobile: dead `getAccessToken()` export (added comment instead of deleting it); duplicate mobile CI
  job (`mobile-lint-typecheck.yml` duplicates `ci.yml` job, no paths filter); 19 eslint warnings
  (unused imports in nextcloud-setup/projects/status); 14 moderate npm audit (Expo toolchain, needs
  SDK bump); `app.json` indentation artifact; `ethers`-era leftovers?
- Hybrid-infra dead code: `slugify` (currently the *fix* for P0-2), `stampFromLibrary`,
  duplicate unreachable `<input type=file>` sharing `fileRef`.
- `oauth_state.verify` fails open on empty secret (parity: `make_` fails closed).
- P1 leftovers from round 1 that remain open: dependabot majors held (Python 3.14 ×2, Sentry 11,
  ESLint 10), Authentik disable/enable 501 stubs, txAdmin ops, second backup target (WebDAV same-host
  = top standing risk), EAS rebuild, per-resource CPU, client VPN keygen adoption.

## 3. Proposed batches (build order)

### Batch 1 — Fix round-2 audit (one PR, mirrors #361 playbook)
1. P0-2: SAVE AS NEW slug (`HybridInfraEditor.tsx:737` → derive from title; drop empty-slug branch).
2. P0-1: mobile route-typegen in both workflows + regenerate `.expo/types` locally → fix/verify the
   3 TS errors (expect they vanish once types match reality).
3. Backend: `updated_at` on both update paths; app-level body cap (413) + byte cap in `_validate_doc`;
   409 mapping for slug conflicts; 404 on `delete_layout`; optional: 403/401 tests for both new routers.
4. Frontend: empty-doc guard (reject before save / allow client to accept and set docId);
   hydration wrappers for `EditSiteFab` + `BlockEditor`; `key={viewKey}` + node revalidation;
   empty-doc kb-nav guard; `onPointerCancel` closes undo checkpoint; reset `selIds`/`lockedIds`/
   `connectFrom` on doc switch.
5. Canvas layers: honor authored x/y for vm/legacy/users (fallback to hardcoded only when coords
   absent) so drag + auto-arrange + Plan C seed behave.
6. Mobile: notification response dedupe (identifier guard + `clearLastNotificationResponseAsync`);
   palette `name` field fix (also fix web `CommandPalette.jsx`); delete dead `getAccessToken()`.
7. Docs refresh: README (Next 16, drop chat, add PREVIEW.md), AUDIT.md (62 migrations, drop
   packages/shared + chat refs), fix DESIGN-AUDIT link.
8. Tests: backend pytest (127→more), frontend `tsc`/`eslint`/`build`, mobile `tsc` (post-typegen) +
   eslint, then sequential merge loop (6 required checks + Vercel).

### Batch 2 — Hardening/hygiene leftovers (second PR)
- BlockEditor validation parity (dedupe, type regex, 100-block cap, `hist=true` on edits, timeout cleanup).
- `sanitizeDoc`: node cap 200, finite x/y clamp; backend: dup/dangling-id rejection, string length caps.
- CTA href scheme allowlist (frontend + backend) in blocks.
- `_optional_admin` re-enrichment; `_OPEN_GET_PREFIXES` decision (add infra/blocks or fix docstrings);
  `MAX_DEPTH` off-by-one; pagination on both list endpoints; sitemap XML escaping; oauth_state verify
  fail-closed.
- Mobile: drop duplicate CI job or add paths filter; clear eslint warnings; OTA `checkAutomatically`.
- Delete stale local branch `fix/audit-batch-b`.

### Batch 3 — Features/improvements (suggestions, pick what you want)
**A. PageBlocks → live (biggest gap):**
1. Public route wiring: render published layout on a real page (e.g. `/p/[slug]` or override landing
   hero) so #363/#364 have a visitor-facing payoff.
2. Preview/publish flow: draft vs published states, rollback (history exists in editor), SEO fields.
3. More block types: FAQ, pricing, gallery, testimonials (registry makes this cheap).

**B. hybrid-infra polish:**
1. Export PNG/SVG/PDF from canvas (print-quality, given the IT-portfolio use case).
2. Share/publish UX: public read-only link w/ embed `<iframe>`, og:image card generation.
3. Templates gallery: seed 3-5 more architecture templates (multi-site, hybrid join, DR site).
4. Diff/versions for diagrams (updated_at fix in Batch 1 is the prerequisite).
5. Wire `?diagram=` into sitemap + internal links (discoverability).

**C. Backend platform:**
1. DB trigger `moddatetime` for `updated_at` on both tables (fixes it for all future routers).
2. Request metrics: count 413/429/500 by route in `/api/monitor/status`.
3. Backup target #2 (R2/S3) — still the top standing infra risk (WebDAV is same-host).
4. Authentik disable/enable endpoints (501 stubs today) — needs `AUTHENTIK_API_TOKEN`.

**D. Mobile:**
1. OTA update channel check (`checkAutomatically: NEVER` today — consider `ON_LOAD_STRICT`).
2. Offline favorites/saved articles, push notification preferences screen.
3. EAS rebuild (owner-side) once manifest-strip plugin verified.

**E. Process:**
1. Dependabot majors decision (Python 3.14, Sentry 11, ESLint 10) — schedule or close with reason.
2. Component-test pass for hybrid-infra React surface (every P1 lives where tests can't reach).

## 4. Verification (per batch)
- Backend: `python -m pytest tests/ -q` (expect ≥127), `python -m compileall -q routers utils`.
- Frontend: `npx tsc --noEmit`, `npx eslint .` (0 errors), `npm run build`.
- Mobile: `npx tsc --noEmit` (post-typegen must be 0), `npx eslint .`, lockfile sync untouched.
- CI: sequential merge loop (update-branch → wait → ignore "Notify on Failure" skip → squash).
- Live: Coolify image = new SHA, `/hybrid-infra` SAVE AS NEW works, `/helpdesk` clean,
  bogus login 400, zero Traceback in container logs.

## 5. Status (updated 2026-09-30/10-01, Batch 3 split into sub-PRs)
- **Batch 1 — DONE**: PR #368 merged (main `a422128`), live-verified same day.
- **Batch 2 — DONE**: PR #369 merged (main `f4ec820`), live-verified. Added in-flight: mypy
  `allocated_ipv6: str | None` fix (CI failure); mobile eslint 19 → 0/0; frontend 0 errors / 121
  warnings; backend pytest 144 (+6 new tests); duplicate `mobile-lint-typecheck.yml` deleted.
- **OPS — page_layouts migration applied 2026-09-30** (via `psql -f`, table was missing in prod —
  live 500 on `GET /api/blocks/layouts` surfaced it). `20260930000000_page_layouts.sql` applied to
  supabase-db; verified: public GET 200 + `offset` key, POST unauth 401, sitemap valid XML, 0
  Tracebacks. Lesson: migrations in merged PRs need an explicit apply step — infra_diagrams was
  applied earlier by hand, page_layouts was missed until a live probe caught it.
- **Batch 3 — split into 6 sub-PRs, merge loop = push → 260s → gh pr checks (EXIT 0, ignore
  "Notify on Failure" skip) → squash → sync main → delete branch → apply migrations → live probe.**
  - **Sub-PR 1 (C1+C2) — DONE**: #370 (main `591f4bb`); moddatetime triggers applied+verified,
    request metrics + `errors_24h` + 5 tests.
  - **Sub-PR 2 (A1–A3) — DONE**: #371 (main `a0f8c10`), deployed (`a0f8c10` image), live-verified:
    `/p/[slug]` 404/preview 404, layouts 200, revisions 401/401, sitemap valid, 0 Tracebacks;
    `seo_title`/`seo_description` + `page_layout_revisions` applied to prod.
  - **Sub-PR 3 (B1–B5) — DONE**: #372 (main `ea9fada`), backend image `ea9fada` @20:11Z,
    `20260930000500_infra_diagram_revisions.sql` applied (CREATE TABLE/INDEX/RLS/NOTIFY), verified:
    `/hybrid-infra/embed` 200 + `frame-ancestors *` + no XFO, `/hybrid-infra` still
    `frame-ancestors 'none'` + XFO DENY, revisions 401 unauth, infra list 200, sitemap valid
    (11 urls), 0 Tracebacks. Frontend 93 tests (+16: SVG recorder 11, diff 2, templates 3);
    backend 167 tests (+7 revisions); eslint 0/121; build green. B5 verify-only (sitemap/footer/
    palette already done in #371).
  - **Deferred from B2**: og:image card generation (share panel ships link+iframe only).
  - **Sub-PR 4 (C3+C4) — DECIDED 2026-10-01**: C3 approved → set up **Cloudflare R2** as backup
    target #2 (needs bucket + S3 access key/secret, or a CF API token; then wire into the VPS
    backup job, run dual-target backup, verify restore). C4 decided → leave the 501 stubs as-is
    (documented; reopen only if an `AUTHENTIK_API_TOKEN` is bootstrapped).
  - **Sub-PR 5 (D1+D2+D3) — DONE** (#373, main `59a5ee1`): D1 closed as decision — SDK 57 has no
    `ON_LOAD_STRICT` (valid: ON_LOAD/ON_ERROR_RECOVERY/WIFI_ONLY/NEVER), `ON_LOAD` would lose the
    auth-route reload guard, so `NEVER` + boot/foreground checks stays (rationale recorded in
    `app/_layout.tsx`). D2: `src/lib/savedArticles.ts` (offline saved articles w/ body enrichment),
    blog SAVED pill + star toggle + offline fallback in `blog-post` ("OFFLINE COPY" badge), new
    profile **Alerts** tab (push opt-out flag respected by `registerPushToken`, OS permission row
    with open-settings). D3: `apps/mobile/EAS-REBUILD.md` handoff. Mobile: lint 0/0, tsc 0,
    18 vitest tests (+14).
  - **Sub-PR 6 (E1+E2) — E1 DECIDED**: bump **ESLint 10 + Sentry 11**, hold Python 3.14 until the
    next planned backend rebuild. **E2 OPEN**: hybrid-infra component tests.

## 6. Office handoff (2026-10-01) — remaining work, in order

### A. Local `test` commit (103c032) — reviewed, gaps to finish first
Contents (unpushed until 2026-10-01 push): canvas pointer-capture drag (touch/pen node drag via
`updateDrag`/`updateCursor` + pointermove), Space+drag pans, locked-node click-only, cursor fix;
editor: library filter input, Ctrl+A select-all, Esc cancels link mode, draft autosave
(`hi-editor-draft`, 1.2 s debounce, sanitize-on-load), help-text refresh.
**Gaps found in review:**
1. Draft-restore banner not rendered — `acceptDraft`/`discardDraft` (HybridInfraEditor ~L450/464)
   are defined but never referenced in JSX; wire an offer banner (Restore/Discard + timestamp).
2. Successful `save()` (~L918) does not `localStorage.removeItem(DRAFT_KEY)` → stale draft offered
   after a clean save; clear on save success (and ideally on diagram switch/delete).
3. Lint error fixed in push commit: `react-hooks/set-state-in-effect` at the draft-load effect
   (repo convention: disable comment with reason).

### B. Remaining sub-PRs
1. **Sub-PR 6 / E2 — hybrid-infra component tests**: `npm i -D jsdom @testing-library/react`;
   vitest include `components/**/*.test.tsx` + per-file `@vitest-environment jsdom`; polyfill
   `URL.createObjectURL`; mock `HybridInfraCanvas` (handle spies) + `@/lib/infraApi`; cover
   PNG/SVG export wiring, SHARE snippet (embed URL, draft warning), HISTORY list/VIEW-diff/RESTORE,
   template select seeds, JSON export/import, NEW draft-restore banner (once wired above).
   Checks: vitest / eslint 0-errors≤150 / tsc / build → PR → merge loop (260s → checks → squash).
2. **E1 — dependabot majors**: bump ESLint 10 + Sentry 11 (small PR, frontend lint/build +
   backend sentry tests green), comment "held until next planned Python rebuild" on the two
   Python 3.14 PRs (do not merge).
3. **C3 — R2 backup target #2**: prerequisite = bucket + S3 key/secret (or CF API token; check
   `wrangler whoami` first). Then: add target to the VPS backup job (alongside WebDAV), run a
   dual-target backup, verify restore from R2, record in the risk register.
4. **C4 — no action** (501 stubs stay, already documented).
5. **Deferred/backlog**: og:image card generation for diagram share links; owner actions —
   Authentik API token, EAS rebuild per `apps/mobile/EAS-REBUILD.md`.
