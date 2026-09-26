# aifazi.net — Full Project Audit

**Date:** 2026-09-24  
**Scope:** monorepo root `E:\aifazi Neon city\aifazi.net`  
**Stack:** Next.js 16 frontend · FastAPI backend · Expo mobile · Supabase (self-hosted) · Docker/Coolify · GitHub Actions · Vercel  
**Method:** static code review of source, configs, migrations, CI, and local disk state (no live pen-test)

Severity: **CRITICAL / HIGH / MEDIUM / LOW / INFO**

---

## Executive Summary

This is a large, production-minded monorepo with unusually strong security hygiene for a solo/small-team product: PASETO + HttpOnly cookies, fail-closed secrets, HMAC internal tokens, ClamAV uploads, SSRF IP pinning, RLS lockdowns, gitleaks + pip-audit + bandit + CodeQL in CI, and a written SECURITY.md.

The main risks are **not** missing auth. They are:

1. **Production secrets sitting in local `.env.*` dumps** (untracked, but live).
2. **Auth tokens delivered in URL fragments/queries** on OAuth callbacks (history / referrer / deep-link exposure).
3. **Thin automated tests** (4 backend test modules + 1 smoke e2e + 1 mobile unit) against ~72 API routers and a huge UI surface.
4. **God files and CSS bloat** that raise regression and XSS-survival risk over time.
5. **Lint debt** (`F821` undefined-name ignored, `--max-warnings=150`, Bandit HIGH triage still open).

Overall grade: **B+ / strong for security posture, C+ for maintainability & test coverage**.

---

## 1. Architecture Map

| Area | Path | Notes |
|------|------|-------|
| Frontend | `aifazi.net-frontend-next/` | Next.js 16 App Router + `pages-src/*` admin islands, Vercel |
| Backend | `aifazi.net-backend-fastapi/` | FastAPI + 72 routers, Coolify on VPS |
| Mobile | `apps/mobile/` | Expo RN, EAS |
| Shared | `packages/shared/` | Chat contract + E2EE helpers |
| DB | `supabase/migrations/` | 58 migrations, self-hosted Supabase |
| Infra | `docker-compose.yml`, `Dockerfile.backend`, `scripts/` | ClamAV, WireGuard, Stalwart, backups |
| CI | `.github/workflows/` | lint, build, pip-audit, bandit, gitleaks, dependency-review, CodeQL |

Deploy topology: browser → Vercel Next.js (Edge middleware HMAC) → FastAPI on VPS → Supabase (service role, RLS).

---

## 2. Security

### 2.1 What is solid (keep these)

| Control | Where | Verdict |
|---------|-------|---------|
| Secrets via env, not committed | `.gitignore` + `SECURITY.md` | Good |
| Fail-closed missing secrets in prod | `main.py:22`, `dependencies.py:23-29`, `auth.py:116-127` | Excellent |
| PASETO v4 auth, HttpOnly + Secure cookies | `auth.py:790-824`, `lib/api.ts` | Excellent |
| No tokens in `localStorage` (cleared legacy keys) | `lib/api.ts:38-57` | Good |
| HMAC `X-Internal-Token` (not raw secret) | `proxy.ts:68+`, `main.py:127+` | Excellent |
| CSP with per-request nonce + `strict-dynamic` | `proxy.ts`, `next.config.js:96-97` | Excellent |
| HTML sanitizer (DOMPurify + fail-closed SSR scrubber) | `lib/sanitizeHtml.ts` | Strong |
| Path-traversal-safe upload names + MIME sniff + ClamAV | `routers/upload.py` | Strong |
| SSRF defense with IP pinning | `routers/seo_proxy.py`, `chat_url_preview.py`, `utils/ssrf.py` | Excellent |
| `exec_sql` revoked from authenticated | `migrations/20260801000500_*` | Good |
| RLS lockdowns + column REVOKEs | `migrations/202609*`, `202608*` | Good |
| Admin UI gated server-side | `app/admin/[[...slug]]/page.tsx` | Good |
| Rate limiting + IP bans (Redis) | `utils/rate_limit.py`, `ip_bans` table | Good |
| Security headers (HSTS, XFO, nosniff, Permissions-Policy) | `next.config.js:80-100`, `main.py:644-685` | Good |
| CI: gitleaks, pip-audit, bandit (blocking), dependency-review, CodeQL | `.github/workflows/` | Strong |
| Mobile tokens in SecureStore (AFTER_FIRST_UNLOCK) | `apps/mobile/src/lib/api.ts` | Good |
| Docker: non-root, healthchecks, ClamAV not on host net | Dockerfiles / compose | Good |
| Network tools require staff + public-IP-only hosts | `routers/network.py` | Good |

### 2.2 Findings

#### H1 — Production secrets live in untracked local env dumps (CRITICAL if machine/shared)

**Files (on disk, correctly gitignored):**
- `aifazi.net-backend-fastapi/.env.prod-pull`
- `aifazi.net-backend-fastapi/.env.pulled`
- `aifazi.net-backend-fastapi/.env.pull`
- `aifazi.net-frontend-next/.env.local`

Key names present (values not printed here) include: `SUPABASE_SERVICE_ROLE_KEY`, `PASETO_SECRET`, `INTERNAL_API_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GITHUB_CLIENT_SECRET`, `DISCORD_CLIENT_SECRET`, `STEAM_API_KEY`, `FIVEM_SERVER_SECRET`, `ADMIN_PASSWORD`, `CRON_SECRET`, `VERCEL_OIDC_TOKEN`.

**Impact:** Full service-role DB access, payment API, OAuth apps, and admin auth if these files leak (backup, malware, shared machine, cloud sync of the project folder).

**Actions:**
1. Delete `.env.prod-pull`, `.env.pulled`, `.env.pull` after rotating.
2. Rotate every secret listed above (Supabase service role, PASETO, INTERNAL_API, Stripe, GitHub OAuth, Discord OAuth, Steam, FiveM, admin bcrypt, CRON_SECRET, Vercel OIDC).
3. Prefer `vercel env pull` → one-shot copy → shred; never leave multi-day copies in the repo tree.
4. Keep `.gitignore` rules as-is (they are correct).

#### H2 — Access tokens in URL on OAuth / deep-link callbacks (HIGH)

| Location | Pattern | Risk |
|----------|---------|------|
| `steam_auth.py:428` | `#token=&refresh=` | Fragment still hits history + some mobile deep links |
| `github_auth.py:383,389` | `#token=` | Same |
| `auth.py:2411,2417` | `#token=&refresh=` | Same |
| `authentik_oidc.py:288` | **`?token=` (query!)** | Query is worse: server logs, proxies, Referer |
| `discord_auth.py:212` | `aifazi://auth/discord?token=` | Deep-link query |
| `auth.py:471,1726,...` | email verify/reset `?token=` | OK for one-time links if short TTL |

**Impact:** Token leakage via browser history, shared screens, mobile deep-link intent logs, reverse-proxy access logs, and (for query) Referer on subsequent navigations.

**Actions:**
1. Prefer server-set HttpOnly cookies on the callback `Set-Cookie` and a redirect **without** tokens (web path already half-does this — finish the migration).
2. For mobile deep links: one-time exchange code, not raw JWT in the URL.
3. At minimum: move `authentik_oidc.py:288` off `?token=` to hash fragment or cookie-only.

#### H3 — Role/permissions cached in `localStorage` (MEDIUM, mitigated)

`lib/api.ts:229-256` stores `aifazi_effective_role`, `aifazi_username`, `aifazi_permissions` in `localStorage`. Comments and `app/admin/[[...slug]]/page.tsx` correctly treat this as **view-only UX**; real gate is server-side + `sessionStorage` staff flag. Keep the dual gate; never trust `localStorage` alone for navigation to privileged UI that talks to privileged APIs without the server re-check (already true for admin).

#### H4 — `exec_sql` RPC still used by several admin routers (MEDIUM)

`db_console.py`, `backup.py`, `email_settings.py`, `utils/audit.py` call `supabase.rpc("exec_sql", ...)`. Fail-closed tests exist (`tests/test_db_console_failclosed.py`) and the function is revoked from `authenticated`. Residual risk: a service-role compromise becomes arbitrary SQL. Prefer typed RPCs / parameterized queries for non-console paths (`backup`, `audit` bootstrap).

#### H5 — Local docker-compose points at **production** Supabase (MEDIUM)

`docker-compose.yml:7-9` documents “Uses PRODUCTION Supabase”. Accidental data mutation from a laptop is one `.env.local` slip away. Prefer a dedicated staging project or a local Supabase for compose.

#### H6 — Cookie domain `.aifazi.net` + `SameSite=Lax` (LOW/INFO)

Documented tradeoff in `auth.py:144-147` for cross-subdomain SSO. Lax is acceptable; `Strict` would break the topology. Ensure `__Host-` prefix is not claimed while `Domain=` is set (it can’t be). Fine as designed.

#### H7 — Git history contains a scrubbed bcrypt hash (INFO, known)

Documented in `SECURITY.md:23,48-49`. Treat as rotated; optional `git filter-repo` if going fully public with a clean history.

#### H8 — `discord_auth.py` names env var `JWT_SECRET` but reads `PASETO_SECRET` (LOW)

`discord_auth.py:55` — naming confusion for operators. Align names.

### 2.3 Security score: **8.5/10** (after treating H1 as operational, not code)

---

## 3. Code Quality & Maintainability

### 3.1 God files (HIGH)

| File | Lines | Problem |
|------|------:|---------|
| `pages-src/admin/ThemeLibrary.jsx` | 4198 | Theme editor monolith |
| `components/ServerRackAnimation.jsx` | 2629 | Single animation component |
| `routers/fivem.py` | 2815 | Entire FiveM surface |
| `routers/auth.py` | 2307 | Auth + profile + staff + OAuth glue |
| `pages-src/ForumProfile.jsx` | 2034 | Profile + tickets + orders |
| `pages-src/Login.jsx` | 1971 | Login + 2FA + OAuth UI |
| `pages-src/admin/AdminPanels.jsx` | 1778 | Multiple admin panels |
| `pages-src/DatabaseGUI.jsx` | 1734 | DB admin UI |
| `app/globals.css` | ~342KB | All themes + components |

**Impact:** review friction, merge conflicts, bundle size, hard XSS audit surface.

**Actions (incremental, not big-bang):**
1. Split `auth.py` into `auth_login` / `auth_refresh` / `auth_profile` / `auth_staff` (some already exist — finish the cutover and shrink `auth.py`).
2. Split `fivem.py` by domain (players, txadmin, store bridge, status).
3. Extract ThemeLibrary into data (`core/themePresets`) + pure preview components + form panels.
4. Split `globals.css` by layer: tokens, base, components, themes (import via CSS layers or Next `app/` partials).

### 3.2 Lint / type debt (MEDIUM)

`aifazi.net-backend-fastapi/pyproject.toml` **ignores**:
- `F821` undefined name — **this is a real bug-finder; do not ignore**
- `F401` unused import
- `E722` / `BLE001` bare except
- `B904` raise-from
- `F841` unused variable

Frontend: `eslint . --max-warnings=150` allows a large warning budget.

**Actions:**
1. Remove `F821` from ignore immediately and fix fallout.
2. Schedule `BLE001`/`E722` cleanup (log + narrow exceptions).
3. Drive `--max-warnings` down in ratchets (150 → 50 → 0).

### 3.3 Tests (HIGH gap)

| Suite | Count | Files |
|-------|------:|-------|
| Backend unit | 4 | `test_auth_failclosed`, `test_db_console_failclosed`, `test_store`, `test_vpn` |
| Frontend e2e | 1 | `e2e/smoke.spec.ts` (~400B) |
| Mobile unit | 1 | `vpn.test.ts` |
| Frontend unit | 0 | — |
| `sanitizeHtml` tests | 0 | custom SSR sanitizer is untested |

Against **72 routers** and a large SPA this is ~5–8% behavioral coverage.

**Priority test matrix (add in this order):**
1. `sanitizeHtml` XSS corpus (script/iframe/svg/on*/javascript:/data: cases).
2. Auth: login, refresh rotation/replay, 2FA, logout cookie domain, open-redirect allowlist.
3. Upload: MIME sniff reject, traversal names, size limits, ClamAV fail-closed.
4. Store: Stripe webhook signature, stock reservation race.
5. Playwright: login → admin gate deny for `user`, chat send, blog comment.

### 3.4 Dependency hygiene (MEDIUM)

- `requirements.txt` pins `httpx==0.27.2` while `requirements-dev.txt` has `httpx==0.28.1` — **version skew**. Align on one (prefer the newer patched line after audit).
- Comment says “pin with pip-compile” but there is no lockfile — add `requirements.lock` / `uv.lock`.
- Frontend Next 16 / React 19 — fine; keep Dependabot (already configured).
- ~~`chat_ai.py` is a stub (“OpenAI removed”) but README still lists OpenAI models~~ — **done**: backend README no longer claims OpenAI.

### 3.5 Structure (INFO/GOOD)

- Monorepo layout matches README.
- Shared chat E2EE in `packages/shared` is the right place.
- Backend split into `routers/` + `utils/` is good; finish auth split.
- `__pycache__` / `.ruff_cache` present under source trees — ensure they stay gitignored (they are).

---

## 4. Performance

| Finding | Severity | Detail |
|---------|----------|--------|
| `globals.css` ~342KB | HIGH | All themes compile into one sheet; split + critical CSS |
| 4k-line ThemeLibrary / 2.6k ServerRack | HIGH | Parse + hydration cost; code-split admin routes (admin is `[[...slug]]` — verify dynamic import) |
| Boot / Matrix loaders | MEDIUM | First-paint delay; gate behind first-visit only + `prefers-reduced-motion` in **JS** loops (CSS already has kill-switch) |
| Dynamic rendering everywhere | MEDIUM | `layout.tsx` awaits `headers()` → full dynamic; fine for auth, but marketing/blog should be ISR (blog already `revalidate=300`) |
| CDN route caching | GOOD | `app/api/cdn/...` uses long `revalidate` |
| Lazy home sections | GOOD | `Home.jsx` lazy-loads Experience/Skills/… |
| Sentry client trim | GOOD | `@sentry/tracing` aliased off client |
| `productionBrowserSourceMaps: false` | GOOD | — |
| Mobile bundle | MEDIUM | `chat-room.tsx` 50k, `themes.ts` 47k — split theme data |

**Actions:** extract theme CSS to on-demand chunks; dynamic-import admin and ServerRack; measure LCP on `/` and `/blog`; ensure hero images use `next/image` + `priority` where LCP.

---

## 5. SEO, Accessibility, Metadata

### 5.1 SEO — good base

- Per-route `metadata` with description + OpenGraph (`app/layout.tsx`, blog, status, fivem, whitelist…).
- `app/robots.ts` + sitemap rewrite to backend.
- `metadataBase` set.
- Admin `robots: { index: false }`.

**Gaps:** canonical URLs on dynamic pages, structured data (JSON-LD Article/Organization/Breadcrumb), Twitter card defaults at root, `manifest` present (good). Blog titles/excerpts handled.

### 5.2 Accessibility — partially documented

You already have `aifazi.net-frontend-next/DESIGN-UX-A11Y-AUDIT.md` with solid HIGH items (clickable divs without roles, dialog focus trap, tiny 7–10px type, focus outline killed on command inputs). Treat that document as the a11y backlog; this audit concurs.

Quick wins to do first:
1. Focus trap + restore in `core/dialog.jsx`; unique ids for `aria-labelledby`.
2. Keyboard support (`role="button"` + Enter/Space) for the 49 click-divs listed there.
3. Floor body/label type at 12–14px; never `!important` 9px.
4. Restore `:focus-visible` outline on terminal/command inputs.
5. JS `matchMedia('(prefers-reduced-motion: reduce)')` guards for rAF/setInterval loops.

---

## 6. Ops & CI/CD

| Item | Status |
|------|--------|
| CI lint/build/security | Strong (pinned action SHAs, good) |
| Bandit HIGH pre-existing debt | Open TODO in `ci.yml:127-131` — triage |
| Branch protection | Recommended in SECURITY.md; verify it is actually applied |
| Deploy scripts | `deploy-live.sh`, `sync-live.sh`, `backup-db.sh` present |
| Healthchecks | Docker healthchecks + `/api/health` (ban-exempt — good) |
| Observability | Sentry configured (client/server/edge) |
| Secrets in CI | Uses `secrets.GITHUB_TOKEN` only in workflow file — good |
| Compose prod Supabase | Risky (H5) |

---

## 7. Findings Summary Table

| ID | Severity | Area | Title |
|----|----------|------|-------|
| H1 | CRITICAL | Secrets | Local `.env.prod-pull/.pulled/.pull` hold live prod secrets |
| H2 | HIGH | Auth | Tokens in URL fragments/queries on OAuth callbacks |
| H3 | MEDIUM | Auth | Role claims in `localStorage` (mitigated by server gate) |
| H4 | MEDIUM | Data | `exec_sql` still used outside DB console |
| H5 | MEDIUM | Ops | Docker dev against production Supabase |
| H6 | LOW | Auth | Cookie domain/SameSite tradeoff (documented) |
| H7 | INFO | Secrets | Stale bcrypt in git history (documented) |
| H8 | LOW | Auth | `JWT_SECRET` name vs `PASETO_SECRET` read |
| Q1 | HIGH | Quality | God files (ThemeLibrary, ServerRack, fivem, auth, Login…) |
| Q2 | HIGH | Quality | Test coverage critically thin |
| Q3 | MEDIUM | Quality | Ruff ignores `F821`; eslint allows 150 warnings |
| Q4 | MEDIUM | Quality | httpx pin skew (0.27.2 vs 0.28.1); no lockfile |
| P1 | HIGH | Perf | 342KB `globals.css` |
| P2 | MEDIUM | Perf | Boot loaders / JS motion not reduced-motion gated |
| P3 | MEDIUM | Perf | Large admin/client components; mobile theme data |
| A1 | HIGH | A11y | Existing DESIGN-UX-A11Y backlog (focus trap, click-divs, tiny type) |
| S1 | MEDIUM | SEO | Missing canonicals / JSON-LD on key templates |
| O1 | MEDIUM | Ops | Bandit HIGH triage still open |

---

## 8. Recommended Action Plan

### This week (security first)
1. **Rotate all secrets** in H1; delete `.env.prod-pull`, `.env.pulled`, `.env.pull`.
2. Move `authentik_oidc` off `?token=`; start cookie-only OAuth completion for web.
3. Remove `F821` from ruff ignores; fix undefined names.
4. Align `httpx` pins.

### Next 2 weeks (safety net)
5. Add `sanitizeHtml` + auth + upload security test suites.
6. Triage Bandit HIGH artifact; either fix or scoped per-line ignore with reason.
7. Apply branch protection checklist from SECURITY.md if not already on.

### Next 30 days (structure)
8. Split `auth.py` / `fivem.py` / ThemeLibrary.
9. Split `globals.css`; dynamic-import admin + ServerRackAnimation.
10. Execute top 5 items from DESIGN-UX-A11Y-AUDIT.md.
11. Point compose at a non-prod Supabase.
12. Add lockfile (`uv.lock` or `requirements.lock`).

### Ongoing
13. Ratchet eslint warnings and mypy strictness.
14. Add Playwright happy-path + authz-negative e2e in CI.
15. Keep SECURITY.md “Past History” accurate after rotations.

---

## 9. Positive callouts (do not regress)

- Fail-closed secret loading and production gates are better than most startups.
- Custom HTML sanitizer with quote-aware tokenizer + entity decode before scheme checks is thoughtful.
- SSRF IP-pinning (`seo_proxy`, chat previews) avoids classic TOCTOU.
- Upload pipeline: size cap, MIME magic, path strip, ClamAV fail-closed option.
- CI action pinning by SHA, gitleaks, dependency-review, CodeQL.
- SECURITY.md is honest about history and threat model.

---

*Static audit only. No production traffic was tested. Findings H1–H8 should be validated against live config; rotate before publishing this report outside the team.*

---

## 10. Remediation Status (2026-09-24 follow-up)

| ID | Status | Notes |
|----|--------|-------|
| H1 | **Blocked on you** | Checklist + wipe script added. Rotate secrets first, then run `scripts/wipe-local-env-dumps.ps1`. Dumps still on disk. |
| H2 | **Partially fixed** | `authentik_oidc.py` mobile path now uses `#token=&refresh=&dest=` (was `?token=`). Web path already cookie-only. Long-term: one-time exchange codes for mobile. |
| H3 | Mitigated | Unchanged — server gate still required. |
| H4 | Open | Prefer typed RPCs outside `db_console`. |
| H5 | Open | Point compose at non-prod Supabase. |
| H8 | **Fixed** | `JWT_SECRET` → `PASETO_SIGNING_KEY` in `discord_auth.py`. |
| Q2 | **Improved** | +3 test modules. **86 backend + 20 frontend unit tests passing.** |
| Q3 | **Improved** | `F821` removed from ruff ignores (clean). |
| Q4 | **Fixed** | `httpx==0.28.1` aligned in `requirements.txt`. |
| — | **Bugfix** | SSR scrubber left `<svg>`/`<math>` — now in `FORBIDDEN_TAGS`. |
| — | **Bugfix** | `_sniff_mimetype` rejected legitimate `.docx`/`.xlsx` (PK header matched `application/zip` before Office fallback). |
| CI | **Updated** | Frontend lint job now runs `npm test` (vitest). |

### Still open (next)

1. **You: rotate secrets** (`SECRETS-ROTATION.md`) → wipe dumps. *(Deferred by choice.)*
2. Mobile OAuth one-time exchange codes (replace `#token=` long-term).
3. Further god-file splits (auth.py, fivem.py routes, full `globals.css` theme extract).
4. Remaining a11y (ThemeLibrary 7–9px preview chrome, other hover-only cards).
5. Non-prod Supabase for compose.

### Phase 4 (2026-09-24) — remaining splits + polish

| Item | Status |
|------|--------|
| `utils/auth_tokens.py` (token minting + cookies) | **Extracted** from `auth.py` |
| `utils/fivem_ids.py` + `utils/fivem_bans.py` | **Extracted** from `fivem.py` |
| Theme CSS → `app/theme-library.css` | **Extracted** — `globals.css` 7874 → 3910 lines |
| ThemeLibrary 7–9px chrome | **Raised to 11px** (198 spots) |
| Compose non-prod Supabase | **Isolation guidance** in `docker-compose.yml` |
| Secrets rotation | **Left as-is** (your choice) |

**Verified:** typecheck clean · 86 backend + 20 frontend tests · ruff clean.

### Cumulative god-file progress

| File | Before | After | Extracted to |
|------|-------:|------:|--------------|
| `ThemeLibrary.jsx` | 4407 | ~4051 + data | `themeLibraryData.js` (~39KB) |
| `globals.css` | 7874 | 3910 | `theme-library.css` (~179KB) |
| `fivem.py` | 3151 | ~2723 | `fivem_emails`, `fivem_ids`, `fivem_bans` |
| `auth.py` | 2492 | ~2421 | `auth_tokens.py` |

### Phase 2 (2026-09-24) — structure & a11y

| Item | Status |
|------|--------|
| Dialog focus trap / restore / unique ids | Already present (audit stale) — verified |
| CommandPalette `aria-modal` + focus trap | **Done** (`core/useFocusTrap.js`) |
| Terminal/palette `outline:0 !important` | **Fixed** — `:focus-visible` outline restored |
| Type floors (dialog, CommandPalette, breadcrumb, badges) | **Improved** 9px → 11px on worst chrome |
| `prefers-reduced-motion` in JS loops | **Done** (MatrixLoader rAF, ServerRack tick) |
| Code-split ThemeLibrary / CommandPalette | **Done** (`dynamic()`) |
| Bandit HIGH | **0 findings** — CI comment updated |

---

## 10. Remediation Status (2026-09-24)

| ID | Action | Status |
|----|--------|--------|
| **H1** | `SECRETS-ROTATION.md` + `scripts/wipe-local-env-dumps.ps1` | **You must rotate secrets and run the wipe script** — dumps still on disk |
| **H2** | Authentik mobile `?token=` → `#token=&refresh=&dest=` | Done |
| **H8** | `JWT_SECRET` → `PASETO_SIGNING_KEY` in `discord_auth.py` | Done |
| **Q2** | `tests/test_upload_security.py`, `tests/test_ssrf.py`, `lib/sanitizeHtml.test.ts` | Done — **86 backend + 20 frontend unit tests pass** |
| **Q3** | Removed `F821` from ruff ignores | Done (was already clean) |
| **Q4** | Unified `httpx==0.28.1` | Done |
| **CI** | Frontend job runs `npm test` (vitest) | Done |
| **Bug** | `_sniff_mimetype` rejected all `.docx`/`.xlsx` (PK → zip before Office fallback) | Fixed |
| **Bug** | SSR sanitizer left `<svg>` (not in FORBIDDEN_TAGS) | Fixed — SVG/MathML containers now dropped |

### Still open (next)

1. **Rotate secrets** (`SECRETS-ROTATION.md`) then `scripts/wipe-local-env-dumps.ps1`.
2. Mobile OAuth one-time exchange codes (replace `#token=` long-term).
3. God-file splits (ThemeLibrary, fivem.py, auth.py) + `globals.css` split.
4. A11y backlog from `DESIGN-UX-A11Y-AUDIT.md`.
5. Point `docker-compose.yml` at non-prod Supabase.
6. Bandit HIGH triage in `ci.yml`.
