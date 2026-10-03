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
| DB | `supabase/migrations/` | 62 migrations, self-hosted Supabase |
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
| SSRF defense with IP pinning | `routers/seo_proxy.py`, `utils/ssrf.py` | Excellent |
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
5. Playwright: login → admin gate deny for `user`, blog comment.

### 3.4 Dependency hygiene (MEDIUM)

- `requirements.txt` pins `httpx==0.27.2` while `requirements-dev.txt` has `httpx==0.28.1` — **version skew**. Align on one (prefer the newer patched line after audit).
- Comment says “pin with pip-compile” but there is no lockfile — add `requirements.lock` / `uv.lock`.
- Frontend Next 16 / React 19 — fine; keep Dependabot (already configured).

### 3.5 Structure (INFO/GOOD)

- Monorepo layout matches README.
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
| Mobile bundle | MEDIUM | `themes.ts` 47k — split theme data |

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

You already have `aifazi.net-frontend-next/DESIGN-UX-A11Y-AUDIT.md` (frontend dir, `DESIGN-UX-A11Y-AUDIT.md`) with solid HIGH items (clickable divs without roles, dialog focus trap, tiny 7–10px type, focus outline killed on command inputs). Treat that document as the a11y backlog; this audit concurs.

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
- SSRF IP-pinning (`seo_proxy`) avoids classic TOCTOU.
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
| `auth.py` | 2145 | 29 | `auth_shared.py` (489) + `config_check.py`; routes to auth_sessions/auth_register/auth_profile/auth_staff; ~1300 lines shadowed dead code removed (#408, route surface verified identical) |

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

---

## 11. Home-batch audit (2026-09-29, range `064f9ea..e210eee`)

59 files, +4886/−314 across PRs #351–#358 (audit batches A/B, UI tweaks, SW/globe fixes, session-refresh recovery, hybrid-infra builder). Static review + ruff + pytest + vitest + eslint. No CRITICAL/HIGH.

| Area | Verdict |
|------|---------|
| Auth refresh flow (#356: `ForumContext.jsx` silent refresh) | SAFE — one-shot server-validated refresh, no fail-closed weakening; satisfies CSRF gate (`main.py:554-565`) |
| `auth_discord.py` signed-state upgrade | SAFE — HMAC/600s/provider-bound; callback cookie-only, no URL tokens |
| Dead-chat cleanup (`dependencies.py`, `permissions.py`, `auth.py`) | SAFE — chat feature fully removed; no `'chat'` residue left in `proxy.ts` / `permissions.py` |
| Username lockout (`rate_limit.py` + `auth_login.py`) | MEDIUM — username-only key leaks enumeration (`429` vs `400`) + lockout-DoS; `_get_redis()` unguarded at `rate_limit.py:151,171` |
| Legacy-admin refresh (`auth_login.py:275-282`) | MEDIUM — bearer-only, no server-side revocation until 7d expiry |
| Hybrid-infra backend (`infra_diagrams.py` + migration) | SAFE — admin-gated writes, published-only public reads, typed queries, no SQLi; LOW: migration skips `REVOKE` lockdown convention; LOW: `_optional_admin` skips `_enrich_user` |
| Hybrid-infra frontend (canvas 1262 + editor 1068 lines) | SAFE — no HTML sinks, parked rAF, reduced-motion, clean persistence errors; god-file advisory; tests lack negative-authz cases (MEDIUM process gap) |
| SW (`sw.js`) | SAFE — crash fix + network-only APIs, no cache poisoning; LOW: nav handler lacks `res.ok` guard |
| `ServerRackAnimation.jsx` +33 | SAFE — no conflict with radar/INFO rework; LOW: `glLostRef` declared after use |
| Admin SSR gate, privacy/terms, mobile (offlineQueue removal clean, manifest plugin least-privilege) | SAFE |
| Prior remediation (discord fragment, no `exec_sql`, opencode `$COOLIFY_TOKEN`) | Intact — verified |

Verified: ruff clean · pytest 12 passed (`test_oauth_no_query_tokens` + `test_infra_diagrams`) · vitest 21 passed · eslint clean on new HybridInfra files · zero secrets in home diff.

New open items: uniform-400 login errors + user+IP lockout key; revoke legacy refresh server-side; `REVOKE` lockdown for `infra_diagrams`; negative-authz tests; SW nav `res.ok` guard.

---

## 12. Full Audit Round 3 (2026-10-01, range `06d4129..f561bad`)

**Scope:** full monorepo — frontend (Next.js 16), backend (FastAPI), mobile (Expo), migrations, CI, infra configs, local disk state.
**Method:** static code review + deep-dive agent reviews of batch-3 backend/frontend + live verification suites. No live pen-test.
**Baseline:** `06d4129` (post-#367) → `f561bad` (post-#374). 10 PRs landed (#368–#374 + dependabot).

### Executive Summary

Since the last audit (2026-09-24), the project executed **two full audit-remediation rounds** (round-2 plan → PRs #368/#369, then Batch 3 → PRs #370–#374). Security posture remains strong; the remediation work was real and verified. **No CRITICAL or HIGH findings in this round.** The remaining issues are MEDIUM/LOW correctness and completeness gaps, plus one standing infra risk (backup target #2).

**Grades:** Security **9/10** (up from 8.5) · Maintainability **B+** (up from C+) · Tests **B** (up from C+) · Ops **B** (unchanged).

### Verification (all live, 2026-10-01)

| Suite | Result |
|-------|--------|
| `npx tsc --noEmit` (frontend) | **0 errors** |
| `npx eslint .` (frontend) | **0 errors, 121 warnings** (85 exhaustive-deps, 28 no-img-element, 8 other) |
| `npx vitest run` (frontend) | **93 passed**, 1 skipped |
| `python -m ruff check .` | **0 errors** |
| `python -m pytest -q` (backend) | **167 passed** (was 127 at last audit) |
| `npx tsc --noEmit` (mobile) | **0 errors** |
| `npm run build` | **success** |
| CI (PR #374) | **all 11 checks pass** |
| Secrets in diff scan | **clean** (only plan-doc/test references) |

### Status of Last Audit Findings

| ID | Title | Status | Notes |
|----|-------|--------|-------|
| H1 | Prod secrets in local env dumps | **Partially fixed** | `.env.prod-pull/.pulled/.pull` **deleted** (verified on disk). Frontend `.env.local` still holds `VERCEL_OIDC_TOKEN` (gitignored, low risk). **Rotation status unknown** — owner action. |
| H2 | Tokens in URL on OAuth callbacks | **Partially fixed** | `authentik_oidc.py` mobile path moved `?token=` → `#token=`. Web path cookie-only. **Still open:** `steam_auth.py:428`, `github_auth.py:383,389`, `discord_auth.py:219`, `auth.py:2067,2073` all use `#token=` fragments (history/deep-link exposure). Email verify/reset `?token=` remain (acceptable for one-time links). |
| H3 | Role claims in localStorage | **Mitigated** | Unchanged — server gate still required. |
| H4 | `exec_sql` outside DB console | **Fixed** | `backup.py` + `email_settings.py` now use typed probes (comments confirm). Only `db_console.py` (admin-gated) + `audit.py:194` (migration bootstrap) remain. |
| H5 | Docker dev against prod Supabase | **Fixed** | `docker-compose.yml` now has isolation guidance + `scripts/check_compose_env.ps1` guard (blocks prod unless `COMPOSE_ALLOW_PROD=1`). |
| H6 | Cookie domain/SameSite | **Documented** | Unchanged — acceptable tradeoff. |
| H7 | Stale bcrypt in git history | **Documented** | Unchanged — known. |
| H8 | `JWT_SECRET` vs `PASETO_SECRET` naming | **Fixed** | Renamed to `PASETO_SIGNING_KEY`. |
| Q1 | God files | **Improved** | `fivem.py` 3151→1754, `auth.py` 2492→1974, `ForumProfile.jsx` 2034→869, `Login.jsx` 1971→929, `DatabaseGUI.jsx` 1734→389, `globals.css` 7874→3721. `ThemeLibrary.jsx` 4407→4058 (data extracted). `ServerRackAnimation.jsx` 2629→2389. |
| Q2 | Test coverage | **Improved** | Backend 86→**167** (+81). Frontend 20→**93** (+73). Mobile 4→**18** (+14). Total ~278 vs ~110 at last audit. |
| Q3 | Lint debt | **Improved** | `F821` removed from ruff ignores (clean). eslint warnings 150→**121** (85 are `exhaustive-deps` — mostly intentional in React hooks). |
| Q4 | httpx pin skew | **Fixed** | Aligned at `0.28.1`. |
| P1 | 342KB globals.css | **Improved** | 7874→3721 lines; theme CSS extracted to `theme-library.css` (4009 lines, loaded on-demand). |
| P2 | Boot loaders / JS motion | **Fixed** | `prefers-reduced-motion` guards in MatrixLoader rAF + ServerRack tick. |
| P3 | Large admin/client components | **Improved** | AdminPanels 1778 (unchanged), DatabaseGUI 1734→389, ForumProfile 2034→869. |
| A1 | A11y backlog | **Partially done** | Dialog focus trap, CommandPalette `aria-modal`, `:focus-visible` restored, type floors raised. Remaining: ThemeLibrary 7–9px preview chrome, other hover-only cards. |
| S1 | SEO canonicals/JSON-LD | **Partially done** | `/p/[slug]` public route with `seo_title`/`seo_description` live. Canonicals/JSON-LD still missing. |
| O1 | Bandit HIGH triage | **Fixed** | 0 findings at HIGH severity (CI runs `--severity-level high`). |

### New Findings (this round)

#### MEDIUM

**N1 — `?diagram=constructor` crashes the editor island** (`HybridInfraEditor.tsx:219`)
`BUILTIN_DOCS` is a plain object literal. `BUILTIN_DOCS['constructor']` returns `Object` (truthy via prototype chain), calling it returns `{}`, which flows into `setDoc({})` → render crash. `?diagram=__proto__` is worse: `BUILTIN_DOCS['__proto__']` is `Object.prototype` (truthy), calling it throws `TypeError` outside any try/catch. Caught by `HybridInfraErrorBoundary` — feature DoS, not RCE. **Fix:** `Object.hasOwn(BUILTIN_DOCS, slug)` or use a `Map`.

**N2 — Draft-restore banner never rendered** (`HybridInfraEditor.tsx:422–467`)
`acceptDraft`/`discardDraft` are defined but no JSX renders the offer. Drafts are silently written to localStorage but never restorable. The feature is incomplete. **Fix:** wire the banner (Restore/Discard + timestamp).

**N3 — `acceptDraft` destroys unsaved changes without confirmation** (`HybridInfraEditor.tsx:451–464`)
Silently overwrites current doc + resets undo history. Compare `newDoc`/`switchDoc` which both `window.confirm()` first. Latent data-loss trap once N2 is fixed. **Fix:** confirm-before-discard.

**N4 — `togglePublish` does not roll back on failure** (`HybridInfraEditor.tsx:931–944`)
Optimistic local toggle; on API failure the PUBLISHED/DRAFT button shows wrong state until reload. **Fix:** rollback `applyDoc` on catch.

**N5 — Revision snapshot TOCTOU race** (`infra_diagrams.py:353–384`, `page_layouts.py:239–261`)
Read-then-write not atomic. Concurrent admin updates can both snapshot the same pre-update state, losing the intermediate revision. **Fix:** wrap in a DB transaction or use `SELECT ... FOR UPDATE`.

**N6 — Draft autosave key is global, not per-diagram** (`HybridInfraEditor.tsx:421`)
`DRAFT_KEY = 'hi-editor-draft'` — one key for all diagrams. Edit A, switch to B, A's draft is offered. **Fix:** namespace `hi-editor-draft:<slug>`.

#### LOW

**N7 — Revision snapshot failure is silent** (`infra_diagrams.py:221–235`)
Best-effort insert; update commits even if snapshot fails. No alert beyond `log.warning`. Acceptable for now.

**N8 — `_prune_revisions` race + non-deterministic ordering** (`infra_diagrams.py:212–218`)
Concurrent updates can delete wrong rows. `created_at` ties (microsecond) make "oldest" non-deterministic.

**N9 — `restore_revision` in `page_layouts.py` lacks try/except** (`page_layouts.py:332–339`)
Inconsistent with `infra_diagrams.py` which wraps in try/except. Raw exceptions propagate to global handler.

**N10 — `_validate_doc` does not strip extra fields** (`infra_diagrams.py:123–144`)
Appends original node dict, not a sanitized copy. Extra fields beyond validated set are preserved. Not a security issue but schema-drift risk.

**N11 — Share snippet escapes only `"` in title** (`HybridInfraEditor.tsx:1076`)
Not exploitable (readOnly input, never injected as HTML) but a full escape would be more robust.

**N12 — Draft persisted in plaintext localStorage** (`HybridInfraEditor.tsx:441–444`)
Full doc including operator notes. Origin-scoped, not transmitted. Given XSS surface, LOW.

**N13 — `save()` client-side slug-collision check uses stale `diagrams` state** (`HybridInfraEditor.tsx:879`)
UX-only; server is the real enforcer (409).

#### INFO

- Mobile token handling is solid: access token memory-only, refresh token in SecureStore (AFTER_FIRST_UNLOCK).
- `infraSvgExport.ts` is clean: proper `esc()` for all text/attributes, no XSS, no prototype pollution.
- Embed route is safe: backend enforces `published` check (404 for drafts), `frame-ancentors *` scoped to embed path only.
- CI: Python 3.12 (not 3.14), bandit at HIGH severity, pip-audit + gitleaks + CodeQL all active.
- Dependabot: 5 ecosystems configured, no open PRs. ESLint 10 + Sentry 11 decided for next bump; Python 3.14 held.
- No TODO/FIXME/HACK in new hybrid-infra code.
- `docker-compose.yml` isolation guard script present and documented.

### Standing Infra Risks (unchanged from VPS-INFRA-AUDIT.md)

1. **Backup target #2 still same-host** (WebDAV on same VPS). R2 decision made but needs bucket + credentials. Top standing DR risk.
2. Authentik disable/enable 501 stubs (documented, needs `AUTHENTIK_API_TOKEN`).
3. EAS rebuild pending (handoff doc written).

### Recommended Action Plan

**This week (correctness):**
1. N1: `Object.hasOwn(BUILTIN_DOCS, slug)` — one-line fix, prevents URL-triggered crash.
2. N2+N3+N6: wire draft-restore banner, namespace key, confirm-before-discard, clear key on accept.
3. N4: rollback `applyDoc` on publish failure.
4. N5: wrap revision snapshot in transaction or `FOR UPDATE`.

**Next 2 weeks (hardening):**
5. N9: add try/except to `page_layouts.py` restore.
6. N10: strip extra fields in `_validate_doc`.
7. N7+N8: alert on snapshot failure; add `id` tiebreaker to prune ordering.
8. Mobile OAuth: move `#token=` fragments to one-time exchange codes (long-term H2 completion).

**Next 30 days (structure):**
9. Split remaining god files: `ThemeLibrary.jsx` (4058), `AdminPanels.jsx` (1778), `ServerRackAnimation.jsx` (2389).
10. Execute remaining a11y items from `DESIGN-UX-A11Y-AUDIT.md`.
11. Add canonical URLs + JSON-LD for key templates.
12. Set up R2 backup target #2 (needs credentials).
13. E2: hybrid-infra component tests (jsdom + Testing Library).

### Positive Callouts (do not regress)

- Two consecutive audit-remediation rounds executed and verified — rare discipline.
- Test count nearly tripled in 2 weeks (110 → 278).
- God-file splits are real: `fivem.py` −1400 lines, `auth.py` −520, `DatabaseGUI.jsx` −1345, `Login.jsx` −1042.
- `exec_sql` removed from all non-console paths.
- Docker compose prod-Supabase guard script.
- Mobile token architecture (memory-only access + SecureStore refresh) is best-practice.
- SVG export sanitizer is thorough (escapes all text/attributes, no prototype pollution).
- CI security stack (gitleaks, pip-audit, bandit, CodeQL, dependency-review) is comprehensive.

---

*Static audit + live verification. No production traffic tested. N1 is a URL-triggerable crash — fix first.*

---

## 13. Hybrid-Infra Deep Audit (2026-10-01)

**Scope:** entire `/hybrid-infra` feature — editor, canvas, viewer, library, SVG export, data layer, `lib/infraApi.ts`, backend `routers/infra_diagrams.py`, revisions schema, auth dependency.
**Method:** two independent deep-review agents (frontend / backend) + manual verification of every HIGH claim and all prior N-series findings against source. Read-only.
**Verification:** tsc 0 · vitest 93 passed/1 skipped · ruff 0 · pytest 167 passed.

### Verdict

The **data boundary is sound**: every write and draft/revision read sits behind `require_admin`, published-only filters are consistent across API/RLS/sitemap, revision queries are scoped by both ids (no IDOR), SVG export escaping is thorough, and there is no SQL-injection surface. The weaknesses are **editing integrity** (frontend) and **operational robustness** (backend validation/error paths, one fail-open auth branch, one expensive list query).

### Prior N-series status — ALL STILL OPEN

N1 (`BUILTIN_DOCS[slug]` prototype lookup, `HybridInfraEditor.tsx:219,1017`) · N2 (draft banner never rendered, `:422–472`) · N3 (acceptDraft no confirm) · N4 (togglePublish no rollback, `:926–945`) · N5 (revision TOCTOU, `infra_diagrams.py:353→384`) · N6 (global `DRAFT_KEY`, `:421`) · N7/N8 (snapshot silent, prune nondeterministic). N9–N13 also unchanged.

### New findings — Frontend

| # | Sev | Finding |
|---|-----|---------|
| F1 | **HIGH** | **Unguarded navigation loses unsaved edits.** `HybridInfraLibrary.tsx:45` does `window.location.assign(...)` — bypasses the dirty-confirm that `switchDoc`/`newDoc` enforce — and no `beforeunload` handler exists anywhere in the feature. Reload/close/library-click = silent total edit loss. Fix: dirty-confirm path + `beforeunload` while dirty. |
| F2 | **HIGH** | **Save/publish lost-update race.** `save()` (`Editor:890–916`) and `togglePublish` await the server then unconditionally adopt the response (`docRef.current = clean`) — edits made during the round-trip are silently reverted and absent from undo history. PUBLISHED button is never disabled in-flight → double-click fires two contradictory PUTs. Fix: adopt response only if local doc still matches outgoing snapshot; shared in-flight guard. |
| F3 | MEDIUM | Drag/click suppression is dead code: `finalizeDrag()` resets `dragMoved=false` (`Canvas:1513`) inside `pointerup`, before the browser dispatches `click` — so `onClick`'s guard (`:1563`) never fires. Every real drag ends in a selection side-effect (group drag collapses multi-select to one node; shift-drag toggles the node out). Fix: `suppressNextClick` flag consumed by `onClick`. |
| F4 | MEDIUM | Group drag pushes duplicate undo checkpoints: finalize loop emits `onMoveNode(done=true)` per member; the first resets `dragRef` (`Editor:365`), the rest re-push identical final state → two dead UNDOs that evict real history (50-cap `shift()`). Same for sub-threshold click jitter. Fix: one checkpoint per gesture. |
| F5 | MEDIUM | **Editor only ever sees published diagrams.** `lib/infraApi.ts` never calls the existing `/diagrams/admin/all` (`infra_diagrams.py:256`). Consequences: slug-uniqueness check (`Editor:879`) misses drafts → "SAVE AS NEW" can 409 unexpectedly; after saving a draft, `refreshList()` drops it from the controlled `<select>` → picker renders blank, doc unreachable except via `?diagram=`. The DRAFT badge in `HybridInfraLibrary.tsx:115` can never fire. Fix: admin list for admins + always include current doc in options. |
| F6 | MEDIUM | Window `keydown` (`Editor:560–605`) has no `editMode` gate; DONE doesn't clear selection → Delete/Ctrl+Z/Ctrl+V still mutate the doc while the read-only viewer is shown (and the draft effect is disabled, so mutations aren't drafted). Fix: early-return unless `editMode && isAdmin`; `resetTransient()` on DONE. |
| F7 | MEDIUM | Unclamped X/Y/W/H inputs (`Editor:1922`, `Number(e.target.value) \|\| 0`) allow negative `w`/`h` → `roundRect` passes negative radius to `ctx.arcTo` → `IndexSizeError` thrown **every rAF frame outside the error boundary** (rAF reschedules before render, `Canvas:1219–1227`) → endless console errors + partially drawn canvas. Fix: clamp to `sanitizeDoc` floors (`w≥40, h≥20`) + defensive `Math.max(0, r)` in `infraCanvasKit.ts:68`. |
| F8 | MEDIUM | `switchDoc` has no request token — rapid picker changes resolve out of order, last response wins; doc and `<select>` can disagree with the final choice. Fix: monotonically increasing `reqIdRef`. |
| F9 | MEDIUM | Draft autosave debounces 1200 ms and its cleanup cancels pending writes whenever `doc`/`editMode` changes → last <1.2 s of edits before DONE/switch/tab-close are never persisted; `save()` never clears the draft key either. Combined with F1 this is the main remaining edit-loss path. Fix: flush on cleanup + clear key on successful save. |
| F10 | LOW | `hitAt` returns last-in-array but render draws in layer groups → click selects visually bottom node on overlaps. |
| F11 | LOW | Wheel-zoom during an active drag rebakes design coords under the new transform while pointer offsets are stale → node teleports. Fix: ignore wheel while `dragId`/`panId` set. |
| F12 | LOW | `selIds` not pruned on undo/redo → "N NODES SELECTED" badge counts deleted ids (functional paths filter safely). |
| F13–F15 | LOW | A11y: canvas `outline:'none'` beats global `:focus-visible` + `role="img"` on interactive surface; zero `htmlFor` in properties panel; `notice` span lacks `role="status"`. |
| F16 | LOW | Duplicate hidden `<input type="file" ref={fileRef}>` (`Editor:1385,2036`) — one is dead markup. |
| F17 | LOW | Category-id `in` check hits prototype chain (`Editor:484`) — naming a category "constructor" falsely errors (N1 sibling; safe direction). |
| F18 | LOW | `infra:edit` listener flips edit mode without re-checking `isAdmin` (UI-only; server enforces). |
| F19 | LOW | `sanitizeDoc` fails open on `published` and doesn't dedupe node ids → import with duplicate ids breaks selection/hit-testing. |
| F20 | LOW | **Zero component/canvas/e2e tests.** `vitest.config.ts` is node-env over `lib/**` only — history integrity, drag/click semantics, save races, deep-links all unguarded; Playwright specs have no hybrid-infra coverage. |

### New findings — Backend

| # | Sev | Finding |
|---|-----|---------|
| B1 | **HIGH** | **List endpoints fetch full 500 KB doc bodies just to count nodes.** `infra_diagrams.py:244` and `:261` `SELECT …,doc` then `_row_to_doc(include_body=False)` discards it. Worst case ~50 MB jsonb per request on every `/hybrid-infra` library load (100/200 per page). Fix: `node_count`/`flow_count` generated columns (or store at write time) + select only metas. |
| B2 | MEDIUM | Malformed uuid path params (`update/delete/revisions*`) hit PostgREST with non-uuid → `APIError` → generic 500 instead of 404. **Tests hide it**: the fake `_Query.eq` (`test_infra_diagrams.py:50`) never casts uuids. Fix: `uuid.UUID()` validate up front; make the fake raise like PostgREST. |
| B3 | MEDIUM | Unhashable flow refs crash validation: `f.get("from") not in ids` (`:152`) raises `TypeError` for `{"from":["a"]}` inside `_validate_doc`, called outside every try → 500 instead of 400. |
| B4 | MEDIUM | `NaN`/`Infinity`/`1e400` pass `_validate_doc` (no numeric checks at all, `:124–144`) and `json.dumps(allow_nan=True)` emits them → PostgREST rejects → 500 instead of 400. |
| B5 | MEDIUM | `restore_revision` splices `categoryColors`/`customCategories` with only `isinstance(dict)` (`:470–471`) — skips `_validate_palette`/`_validate_custom_categories`, the only CSS-injection defense. Latent (revision rows come from validated saves) but it's the one unvalidated path into the public payload. |
| B6 | MEDIUM | **`require_admin` fails OPEN on stale roles.** `dependencies.py:111–119`: when the directory read throws, cached claims are served **without the 60 s TTL check** used at `:89` — a demoted admin keeps `role:"admin"` for the whole DB-outage window, contradicting the "Fail closed" comment. All infra routes hang off this dependency. Fix: apply TTL in the `not db_ok` branch (stale → 503). |
| B7 | MEDIUM | Body cap is `Content-Length`-only (`main.py:513`); chunked bodies unbounded until Cloudflare's 100 MB edge cap — **documented tradeoff** (`main.py:112–114` comment), but any authenticated low-priv member can buffer up to that into RAM before `require_admin` 403s. Worth a streaming guard eventually. |
| B8 | MEDIUM | No concurrency control on full-doc PUT → last-write-wins with no warning; combined with N5 (stale snapshot) + 20-revision prune, concurrent saves can discard each other **and** evict the snapshot. Fix: `expectedUpdatedAt`/version column → 409 on mismatch. |
| B9 | LOW | No audit trail: router never calls `utils.audit.record` (siblings do) — publish/unpublish/delete/restore, including `published` flips by restore, are unattributable. |
| B10 | LOW | Whitespace-only titles accepted (`Field(min_length=1)` allows `" "`) → slug collapses to `diagram`, confusing 409 on second occurrence. |
| B11 | LOW | Validation parity narrower than docstring: `layer`/`shape`/`category` enums, numerics, flow ids, workload/deps element types all unchecked — frontend `sanitizeDoc` rescues every render, but DB can hold docs the editor wouldn't produce. |
| B12 | LOW | No index for the hot list query: `infra_diagrams` has only `UNIQUE(slug)`; list filters `published` + `ORDER BY updated_at DESC` → seq-scan + sort per request. Fix: `(published, updated_at DESC)` index. (Revisions index + FK cascade + RLS all correct.) |
| B13 | LOW | Public diagram reads uncacheable — no `Cache-Control`/`ETag` despite stable published content. |
| B14 | LOW | 409 classification by substring (`"unique"/"duplicate"` in message, `:331,375`) can mis-map unrelated failures; match `APIError.code == "23505"` instead. |
| B15 | LOW | Revision retention tiny (20 rows, pruned on every snapshot) — a restore ping-pong evicts the pre-incident state the feature exists to protect; raise cap + `id` tiebreak. |
| B16 | LOW | Prod CORS drops the appended dynamic-subdomain pattern (`main.py:380` `= []` overrides `:372`) — fail-closed, no hole, but contradicts its own comment. |
| B17 | LOW | Test gaps on security-relevant branches: `_optional_admin` draft-preview has **zero** tests (dependencies module fully stubbed); `test_revision_404s` asserts `in (404, 200)` (asserts nothing); no tests for palette/category validators, restore validation, uuid-500s, NaN, or the SecurityMiddleware path. |
| B18 | INFO | Data boundary cross-check **clean** — public/admin gating, route ordering, revision scoping, RLS, sitemap all verified correct. |
| B19 | INFO | Query-building surface injection-clean: no user-supplied sort/ilike; `_slugify` restricts charset; `offset` bounded. |
| B20 | INFO | `/diagrams/admin/all` is dead product code (frontend never calls it); `/api/infra` undocumented in README; `_slugify` can emit trailing dashes. |

### Fix priority

**Batch 1 (data-loss + auth, this week):**
1. F1 — dirty-confirm on library nav + `beforeunload`.
2. F2 — save response adoption guard + in-flight lock.
3. B6 — TTL check in `require_admin` stale branch (one line, security).
4. F7 — clamp geometry inputs + defensive `roundRect` (prevents uncatchable render-loop crash).
5. F5 — wire editor/library to `/diagrams/admin/all`.

**Batch 2 (correctness, next week):**
6. F3 + F4 — click suppression flag; one undo checkpoint per gesture.
7. F6 — gate keydown on `editMode`, `resetTransient` on DONE.
8. F8 + F9 — request tokens; flush/clear drafts.
9. N1+N17 — `Object.hasOwn` everywhere (`BUILTIN_DOCS`, category ids).
10. N2+N3+N6 — actually render the draft banner, confirm-before-discard, per-slug key.
11. B1 — `node_count`/`flow_count` columns (needs migration) + meta-only selects.
12. B3+B4+B5 — type checks, finite-number checks, re-validate palettes on restore.

**Batch 3 (hardening):**
13. B2 (uuid validation + honest test fake), B8 (version/If-Match), B9 (audit records), B12 (index migration), B17 (auth-branch tests).
14. N4/N5/N7/N8 — publish rollback, snapshot transaction, prune tiebreak.
15. F20 — jsdom component tests (history/click/save-race) + one Playwright hybrid-infra spec.

### What's genuinely good

- Public/admin boundary correct end-to-end (API + RLS + sitemap + route ordering, no IDOR on revisions).
- SVG export + viewer deep-link params fully escaped/validated; only `dangerouslySetInnerHTML` is static JSON-LD.
- Canvas transform math consistent between render and hit-testing; listener/rAF cleanup correct.
- `_validate_palette`/`_validate_custom_categories` are tight (`#rrggbb` only, key charset, built-in shadowing) — they just need to run on the restore path too.
- Revision table: FK `ON DELETE CASCADE` (no orphans), RLS `REVOKE`d from anon/authenticated, indexed correctly.

---

*Deep audit, static + source-verified. No production traffic tested. Highest-value fixes: F1, F2, B6, F7.*

---

## 14. Full Audit Round 4 (2026-10-03, range `f561bad..19f3652`)

**Scope:** full monorepo — 41 commits / PRs #375–#393 since Round 3 (hybrid-infra audit batches #375–#377, core-ui migration #379–#384, lint debt #386, next/image #387, fullscreen #388, decorations #389, library #390/#391, repo cleanup #392/#393).
**Method:** 4 parallel deep-dive agents (prior-findings verification, new-code diff review, security sweep, deps/ops/docs) + full local verification suites + manual source verification of every HIGH claim. No live pen-test.

### Verification (all live, 2026-10-03; post-fix values in brackets)

| Suite | Result |
|-------|--------|
| Frontend tsc / eslint / vitest / build / lint:hooks | 0 errors · 0 errors / 58 warnings · 125 passed +1 skip [**132** +1] · ok · ok |
| Backend ruff / mypy / pytest | 0 · 0 · 200 passed [**203**] |
| Mobile tsc / eslint / vitest | 0 · 0 · 18 passed |
| Playwright e2e (29 tests, local) | 24 passed, 3 skipped, 2 failed — both pre-existing: smoke `/api/health` (local `.env.local` has no `API_URL`; prod health 200) + themes flake (below) |
| npm audit frontend | 10 → [**7**] (critical `next` RCE + `dompurify` fixed in #394; remainder = vitest/eslint-toolchain majors) |
| npm audit mobile | 31 (0 critical) — all build-chain (expo/metro/node-forge) |
| Secrets-in-repo scan | clean (only `.env*example` placeholders) |

### Status of Round-3 / Deep-Audit findings (source-verified per ID)

**36 FIXED · 5 PARTIAL · 11 OPEN.**
Fixed: N1–N8, F1–F9, F15/F17/F18, B1–B10, B12–B14, B17 (incl. all data-loss HIGHs F1/F2, auth-TTL B6, count columns B1).
**OPEN:** N9 (`page_layouts.py:332` restore no try/except), N10, N11, N12, N13, F10, F11, F12, F14, F16, F19, B16 (prod CORS wipes dynamic subdomain pattern).
**PARTIAL:** N5 (page_layouts TOCTOU still open), B11, B15 (revision cap still 20), F13, F20 (component tests exist but narrower than planned).
**Action items open:** god files unchanged (ThemeLibrary 4038, AdminPanels 1773, ServerRack 2379, auth.py 1974); canonicals/JSON-LD partial (`/p/[slug]` has canonical only); **E1 unexecuted** (eslint still ^9 = EOL, Sentry 10 vs 11); **C3 R2 backup** untouched; og:image still deferred.

### New Findings (this round)

#### HIGH — core-ui/img regressions (all FIXED in PR #394)

| # | Finding |
|---|---------|
| R1 | **Clickable avatars rendered blank** — `lib/avatar.jsx:94` used `Clickable` (a div) as the image element, swallowing `src`/`alt`; broke `ForumAdmin.jsx:474` + `Navbar.jsx:723,838` since PR #383. Now a real `next/image`, keyboard-activatable when `onClick`. |
| R2 | **Page-builder images lost sizing for visitors** — `context/EditContext.jsx:1433` non-admin branch ignored `imgStyle` (only caller `BlockRenderer.jsx:91` sizes via it) → 800px, no border/maxWidth since PR #387. Both style channels merged. |
| R3 | **Slider keyboard operability lost** at 16 call sites — `core/forms.jsx` div proxy had no `tabIndex`/key handling (native range replaced in PR #380). Arrows/Home/End/PageUp/Down + `aria-disabled` restored. |

#### Security MEDIUM (both FIXED in PR #395)

- **S1 — view-only staff could write financial data** — `store_marketing_admin.py:19-20`: all 8 coupon/deal routes gated on `action="view"`; `POST/PATCH/DELETE` now require `manage` (CRM REFUND pattern), reads keep `view`.
- **S2 — SSRF blocklist bypass via IPv4-mapped IPv6** — `utils/ssrf.py:32`: `is_blocked_ip("::ffff:169.254.169.254")` → `False` (verified by execution); now unwraps `ipv4_mapped`. Affects `monitor.py`, `oauth_admin.py`.

#### Ops / supply chain

- **O1 (HIGH, ops) — mobile release pipeline broken 6 weeks:** `mobile-release-build.yml:103` 403 "GitHub Actions is not permitted to create pull requests" → `app.json` frozen at 1.0.39 while releases reached v1.0.67, `mobile-ota-update.yml` skipped since 2026-08-29. **Repo setting applied 2026-10-03** (`can_approve_pull_request_reviews: true` via API — the "Allow GitHub Actions to create and approve pull requests" knob); next release exercises it end-to-end. Tradeoff: workflows can now both create and approve PRs — no workflow here calls approve.
- **O2 (MEDIUM)** npm critical: `next` 16.2.0–16.3.5 RCE in `next/og` (GHSA-vcvr-r3jv-pc5j) + `dompurify` GHSA-p98j-92pf-mc4p — **fixed in #394** (16.3.8 / 3.4.16). Remaining 7 advisories need breaking majors (vitest 5, eslint-config-next chain) — decision pending with E1.
- **O3 (MEDIUM)** CI gaps: `dependency-review-config.yml` never referenced by `ci.yml` (rules inert); mobile vitest (18 tests), Playwright e2e, `lint:hooks` never run in CI.
- **O4 (MEDIUM)** `PyJWT` pin skew `requirements.txt` 2.15 vs `requirements.lock` 2.14; `pydantic` unpinned; `requirements.lock` claims pip-compile reproducibility it doesn't deliver; pip-audit/ruff/mypy float unpinned in CI (LOW).
- **O5 (LOW)** dependabot missing `docker/frontend` ecosystem; Dockerfiles pinned by tag not digest; `notify-failure` job is a no-op echo.

#### Correctness / UX (MEDIUM)

- **U1** Themes e2e flake = real hydration race: `app/providers.tsx:394-414` first-theme-sync can drop `data-theme` stamped by the FOUC script → transient flash to default; different theme fails per run.
- **U2** Core-ui migration leftovers: native textarea/input in `blogPostParts.jsx:430`, `EditContext.jsx:289,566`, `Changelog.jsx:1040`, `DeliveryAgentPortal.jsx:88`; `Select`/`Checkbox` silently drop caller `onClick` (`forms.jsx:188,293` — spread order); keyboard-activate bubbles a real MouseEvent (video seek bar jumps to 0, `blogPostParts.jsx:143`); lightbox upscale/distort (`MediaPreview.jsx:145`).
- **U3** Decorations parity: backend accepts any finite coord (`infra_diagrams.py:157`) vs frontend clamps; duplicate annotation ids render locally but 400 on save (`data/hybrid-infra.ts` doesn't dedupe).
- **U4** Docs/env: backend keys missing from every `.env.example` (`AUTHENTIK_*`, `UPSTASH_*`, `DISCORD_*`, `ADMIN_PASSWORD_HASH`, `LLDAP_*`, `COOKIE_DOMAIN`, `MAIL_FROM`…); README `docker compose up` onboarding omits `.env.local` (root example says `.env`); ROADMAP header 3 weeks stale, 33 unchecked incl. one done (:397 CI-debt); `PLAN-REDESIGN-REVAMP.md:45` "no lint/CI/tests" stale; SECURITY.md line refs drift.
- **U5** Dead weight: 22/34 `scripts/*` unreferenced codemods; backend `check_migrations.py`/`check_policies.py` unwired; 4 unused mobile deps.

#### LOW

fonts.py redirect target not revalidated per hop · `infra_diagrams` migration lacks `REVOKE` parity with `page_layouts` · `audit.py:180` accepts caller-supplied actor/ip · ETag substring match (misses `*`, weak compare) · Safari <16.4 fullscreen prefix ignored (`core/fullscreen.jsx:23`) + menus not portaled (`core/menu.jsx:38`) · DateTimePicker drops time-only edits (`core/DateTimePicker.jsx:81`) · forum modals no Escape · `saveRef` written during render (`HybridInfraEditor.tsx:1742`) · Slider ignores accentColor on track · palette `aria-pressed` during search · mobile vitest include misses `*.test.tsx`.

### Standing Risks (unchanged)

Backup target #2 still same-host (R2 decision, needs bucket) · Authentik 501 stubs · EAS rebuild pending (compounded by O1) · H2 `#token=` OAuth fragments · H1 rotation status unknown.

### Grades

Security **8.5/10** (S1/S2 found & fixed same day; O1 setting tradeoff) · Maintainability **B** (3 core-ui regressions fixed; god files unchanged) · Tests **B** (343 unit + e2e exists but not in CI) · Ops **C+** (mobile pipeline down 6 weeks, now setting-unblocked pending next release).

### Fix status

- **PR #394** (merged `78642dd`): R1 + R2 + R3 + npm audit fix + 7 regression tests.
- **PR #395** (merged `38ab7e9`): S1 + S2 + 3 tests.
- **Repo setting**: `can_approve_pull_request_reviews: true` applied 2026-10-03 (verify on next mobile release).
- **Remaining backlog:** O1 verify next release · U1 theme-init fix · O3 wire mobile-vitest/e2e/lint:hooks + dependency-review config into `ci.yml` · O4 lockfile/pin hygiene · E1 (eslint 10 / sentry 11) · open N9–N13 / F10–F19 / B16 series · god files · C3.

---

*Round-4 audit, static + source-verified. Every HIGH claim manually confirmed. Highest-value remaining: O1 verification, U1, O3.*

---

## 15. Full Audit Round 5 — 2026-10-03 (PRs #394–#397 + repo-wide re-verification)

**Scope:** full monorepo at `76e2294` — (a) diff audit of the two same-day fix PRs (#394 UI regressions R1-R3 + deps, #395 security S1/S2), (b) source re-verification of every OPEN/PARTIAL item from Rounds 3-4, (c) full local verification suites run live, (d) docs/hygiene cross-check of STATUS.md claims.
**Method:** 3 parallel deep-dive passes (open-findings verification, #394/#395 diff audit, STATUS/docs cross-check) + live gate runs in a clean worktree + manual source verification of every MEDIUM+ claim. No live pen-test.

### 15.1 Verification (all live, 2026-10-03)

| Suite | Result |
|-------|--------|
| Frontend tsc / eslint / vitest / build | 0 errors · 0 errors / 58 warnings · 132 passed +1 skip · success (Next 16.3.8) |
| Backend ruff / mypy / pytest | 0 · 0 (73 files) · **213 passed** (203 + 10 new, see 15.4) |
| Mobile tsc / eslint / vitest | 0 · 0 · 18 passed |
| npm audit frontend | 7 (2 moderate, 5 high, 0 critical) — matches §14 post-fix |
| npm audit mobile | 31 (0 critical) — unchanged |
| Playwright e2e | not re-run this round (needs local server + backend env); §14 state stands: 24/29 pass locally, 2 pre-existing failures (smoke needs `API_URL` in `.env.local`, theme flake = real U1 race) |

**Environment notes.** Frontend gates ran in a clean worktree install (`npm ci`): the main checkout's `node_modules` was stale (still next 16.3.5, no `jsdom`, broken `node_modules` entries — its build failed with "Cannot find module 'next/package.json'"). Stale tree initially reported 112 tests; after re-sync the exact §14 counts reproduce. Backend ran on local Python 3.14; CI targets 3.12 (deploy target 3.12.9 — the S2 regression was re-verified executable on 3.12 in round 4).

### 15.2 #394/#395 fixes — verified complete (5/5)

| Fix | Verdict |
|-----|---------|
| R1 avatar blanking | Complete — real `next/image` in both branches, keyboard activation when `onClick` (`core/Clickable.jsx:10-21`), regression tests. Minor: `loading="lazy"` dropped (LOW). |
| R2 `imgStyle` ignored | Complete — `EditContext.jsx:1435` merges both style channels; sole caller `BlockRenderer.jsx:86-91` sizes via `imgStyle`. |
| R3 slider keyboard | Complete — `role="slider"` + Arrow/Home/End/PageUp/Down with step-snap and clamp, `aria-disabled`, 4 tests. Minor: PageUp/Down = 10×step (LOW, differs from native large-step). |
| S1 coupon/deal view-writes | Complete — all 8 routes verified (`store_marketing_admin.py`): reads `view`, POST/PATCH/DELETE `manage`; no write left on view. **No gating test exists (A5-4).** |
| S2 SSRF mapped-IPv6 | Complete — `utils/ssrf.py:36-37` unwraps `ipv4_mapped` before ALL checks; 20 meaningful assertions incl. allowed `::ffff:1.1.1.1`. |
| Deps | `next` 16.3.5→16.3.8 (+ SWC suite), `dompurify`→3.4.16, `brace-expansion`/`fastq` transitive — all with integrity hashes; live `npm audit` confirms both criticals gone. |

Diff contains no unexplained code changes (12 files: 5 fix + 2 test + lockfile + 3 docs). Commit-message nit: `43e18d0` claims "micromatch chain updates" but no micromatch entry moved (A5-6, INFO).

### 15.3 P2 backlog re-verification — all stand as documented

Source-verified against current `HEAD`: **N9** (`page_layouts.py:332` bare execute), **N10** (original node/flow dicts appended, `infra_diagrams.py:352,374`), **N11** (only `"` escaped, `:1945`), **N12** (plaintext draft, `:79-85`), **N13** (stale `diagrams` set, `:1692`), **F10** (hit order ≠ paint order), **F11** (no drag/pan guard in `onWheel`), **F12** (`selIds` unpruned on undo/redo, `:522-552`), **F14** **PARTIAL** — `role="status"` now present, zero `htmlFor` still, **F16** (two hidden file inputs, same `ref`), **F19** (`hybrid-infra.ts:880` fail-open `published`, no id dedupe), **B16** (CORS refactor kept the bug: `main.py:374` prod `else: _DYNAMIC_PATTERNS = []` wipes the subdomain pattern appended at `:365`), **U1** (theme state still seeded from server-global `initialTheme` at `providers.tsx:146`), **U2** (all 5 native controls in 4 files), **U3** (backend any-finite vs frontend clamps; no annotation-id dedupe), **N5-partial** (`page_layouts` still lacks the `updated_at` gate infra got at `:652-653`), **B15** (cap still 20 in both routers). Also confirmed: `Select`/`Checkbox` still drop caller `onClick` (`forms.jsx:184-187,288-293`); Clickable keyboard-activation still zeroes the video seek bar (`clientX=0`, `blogPostParts.jsx:143`).

### 15.4 New findings this round

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| A5-1 | MEDIUM | **S2-class bypass survived in two legacy routers.** `seo_proxy.py:82-91` (property checks + raw blocklist scan) and `fonts.py:57-70` (property checks only) did their own IP validation instead of calling the fixed `is_blocked_ip()` — `::ffff:169.254.169.254` passed both. Exposure low (both host-allowlisted) but the shared-guard contract was broken. | **FIXED this round** — both now route through `is_blocked_ip`; 6 tests |
| A5-2 | LOW | `fonts.py` `/from-url` used `follow_redirects=True` without re-validating redirect targets (validated host 1, follow to host 2). | **FIXED this round** — `request` event hook re-checks every hop against the allowlist; 2 tests; 400 on escape |
| A5-3 | LOW | `dependency-review-config.yml` contains two keys the action's schema does not know (`severity-threshold`, `allowed-registries`) — silently ignored. **Corrects §14 O3**: the file IS auto-loaded by `actions/dependency-review-action`; its valid keys (`fail-on-severity: high`, `allow-licenses`, `max-vulnerabilities: 50`) are in effect — "(rules inert)" was wrong. Job runs on `pull_request` only. | **FIXED in #400** (auto-merge pending) — invalid keys removed; `notify-failure` now covers dependency-review |
| A5-4 | LOW | S1 (coupon/deal gating) and R2 (visitor image sizing) landed without tests. S1 is the only security fix in #394/#395 unguarded. | **FIXED** — 8 S1 gating tests + 2 R2 visitor tests (`tests/test_store_marketing_gating.py`, `context/EditContext.test.tsx`); `vitest.config.ts` include gained `context/**` |
| A5-5 | LOW (env) | Main checkout frontend `node_modules` stale/corrupt (pre-#394 tree) — raw local `npm test`/`build` there misreport. Fixed by `npm ci` (re-synced). | open → re-synced |
| A5-6 | INFO | `43e18d0` commit message claims "micromatch chain updates" — no micromatch entry moved. | n/a |
| A5-7 | MEDIUM | **Draft restore silently forks saved diagrams.** `HybridInfraEditor.tsx:1082` `acceptDraft` → `setDocId(null)`; next save takes the create branch, slug is in `taken` → creates `slug-2`. Restoring a draft of a saved diagram detaches from the server row and spawns a duplicate sibling (original untouched, revisions stranded) instead of re-attaching to the original `docId`. | **FIXED (this PR)** — `acceptDraft` re-attaches the server row uuid via `draftRestoreDocId()` (`lib/infraDocOps.ts`); the backend stamps the row uuid on every diagram response while never-saved docs carry a client `doc-*` id, which stays unattached so save() still creates the row; 4 tests |
| A5-8 | MEDIUM | **U1 clobbers storage, not just paint.** The first-sync branch writes the stale theme to `localStorage` + cross-domain cookie (`providers.tsx:409-410`) before the mount-init effect's corrected value lands — a FOUC-stamped user preference is briefly overwritten in storage too. | **FIXED (this PR, resolves U1)** — first sync now adopts the DOM stamp when it is a valid theme instead of clobbering it, and skips the storage write on the first pass; decision extracted to `core/themeSync.ts` + 5 tests |
| A5-9 | LOW | Untyped `workloads`/`deps` entries pass backend validation (`infra_diagrams.py:348-351` — `isinstance(list)` only), are stored, then silently dropped by `sanitizeDoc` on next load (round-trip data loss); `deps` never validated against node ids (dangling ids persist). Concrete evidence for B11's "narrower than docstring" status. | **FIXED (this PR)** — `_validate_doc` now rejects non-string/empty `workloads`/`deps` entries and >60-char workloads (400), mirroring `sanitizeDoc`'s per-entry rules so stored data can't be lost on round-trip; deps stay length-uncapped (sanitizeDoc keeps any string). Dangling-id deps are kept by design: the frontend keeps and displays them, the editor cleans them on node delete. 13 tests |

Minor (no IDs): N8 tiebreak fixed in `infra_diagrams` only — `page_layouts.py:146-149` still prunes on `created_at desc` alone; `page_layouts` never surfaces `snapshotFailed` (N7 parity); three coordinate ranges coexist (drag clamp ±200/1480 · `sanitizeDoc` ±50000 · backend any-finite); `forms.jsx` `Input` datetime branch drops extra props (same family as the Select/Checkbox finding).

### 15.5 Doc / claim corrections (applied this round)

- **STATUS.md "Repo hygiene: only `main` remains" — wrong.** 3 extra local branches (`bevel-sandwich`, `unique-blade`, `chore/batch3-local-sync` @ a63d590, remote-gone/merged) and 3 extra worktrees exist; all at `main`'s commit, no unmerged work, stash empty, remote has `main` only. Corrected in STATUS.md.
- **§14 O3 "(rules inert)" — wrong** (see A5-3); left in place as history, corrected here.
- **ROADMAP.md staleness:** 33 unchecked items; 2 are factually done — expired-stock sweep `:155` (now calls `release_expired_stock_reservations` RPC) and CI-debt `:397` (mypy/bandit are blocking; the only `continue-on-error` left is `: false` for bandit). Marked done with dated notes. Header "as of 2026-09-04" predates its own 09-07/09-08 content; ~6 more items partially stale (firewall `:71-79` largely done 2026-09-24, `:321`, `:317`, `:423`, `:231`) — left for the owner's ROADMAP refresh.
- All other STATUS.md/§14 claims verified CONFIRMED: test counts, npm audit counts, U4 missing env keys (12+ keys incl. `REDIS_URL`), U5 22/34 unreferenced scripts + unwired check scripts, O4 PyJWT 2.15-vs-2.14, mobile CI gap, Playwright-not-in-CI, SECRETS-ROTATION H1 pending, `app.json` frozen at 1.0.39.

### 15.6 Grades & state

Security **8.5/10** (no new HIGH; A5-1/A5-2 closed) · Maintainability **B** · Testing **B** (backend 221, frontend 134, mobile 18; S1/R2 now guarded) · Operations **C+** (mobile pipeline still unverified — P0 stands).

### 15.7 P2 backlog batch — closed in #406

All §15.3 P2 items + O4 closed in one PR (`batch-p2-o4`, squash auto-merge):

| ID | Fix |
|----|-----|
| N9 | `page_layouts.restore_revision` try/except → logged, typed 500 (infra parity); 1 test |
| N10 | `_validate_doc` rebuilds node/flow dicts from the field whitelist — unknown keys dropped on write; 1 test |
| N11 | `escapeHtmlAttr`: full entity set (`& < > " '`) for snippet titles |
| N12 | Draft payloads base64-encoded in localStorage (`lib/infraDraft.ts`, 6 tests); legacy plaintext still readable, rewritten on next autosave |
| N13 | Stale client-side slug-collision check removed — server 409 stays the enforcer |
| F10 | `hitAt` walks reverse paint order (rack first, chips last) so clicks land on the topmost node |
| F11 | `onWheel` ignores zoom while a drag/pan/marquee is in flight |
| F12 | `undo`/`redo` prune `selIds` entries whose ids no longer exist |
| F14 | Form labels now carry `htmlFor`/`aria-label` (19 labels) — closes the last P2 a11y gap |
| F16 | Single hidden file input; dead second `ref` removed |
| F19 | `published` fails closed (explicit `true` only); duplicate node ids rejected in `sanitizeDoc`; 2 tests |
| B16 | CORS construction moved to `utils/cors_origins.py` — prod keeps the frontend-root subdomain pattern the old `else` branch wiped; localhost stays dev-only; 8 tests |
| O4 | PyJWT lock 2.14→2.15; pydantic pinned 2.13.5 (requirements + lock); CI tooling pinned via `requirements-dev.txt`; `requirements.lock` "pip-compile reproducible" claim corrected |

Gates on the batch: frontend tsc 0 · eslint 0 err / 58 warn (baseline) · vitest 151 passed · next build clean; backend ruff clean · mypy clean (73 files) · pytest 244 passed (10 new backend tests, 8 new frontend).

### 15.8 E1 dependency majors — Sentry done, eslint 10 blocked (verified 2026-10-03)

- **Sentry 10 → 11 (done, this PR):** `@sentry/nextjs` ^11.4.0. `withSentryConfig` now imported from `@sentry/nextjs/config` (the root import stopped working in v11); `instrumentation.ts` exports `onRequestError = Sentry.captureRequestError` (v11 manual-setup requirement — captures Server Component / middleware / proxy errors; both build-time deprecation warnings gone).
- **ESLint 9 → 10 — NOT executed, blocked.** Verified against published artifacts: ESLint 10.0.0 removed `context.getFilename()` (absent from all 10.x), and the newest nested plugins in `eslint-config-next` 16.3.8 — eslint-plugin-react 7.37.5 (last release 2025-04), eslint-plugin-jsx-a11y 6.10.2, eslint-plugin-import 2.32.0 — all predate ESLint 10 and crash at rule load (`react/display-name` → `lib/util/version.js` → `getFilename is not a function`). No eslint-10-compatible releases exist on npm (checked latest + dist-tags). Kept eslint on the `maintenance` dist-tag (9.39.5, still updated). Re-open once the config-next plugin chain ships eslint-10 support.

**Fixed this round:** A5-1 + A5-2 (merged #394/#395) · A5-3/A5-4 (#400/#401) · A5-7/A5-8 + U1 (#402) · A5-9 (#403) · P1 O3 (#404) · P2 backlog N9–N13/F10–F12/F14/F16/F19/B16 + O4 (#406) · E1 Sentry 11 (this PR).
**Next:** P0 mobile-release verification; eslint 10 (blocked — §15.8); P3. (Round-5 additions A5-3/A5-9 and P1 O3 closed via #400/#403/#404; §15.3 P2 list + O4 closed in #406.)

---

## 16. Full Audit Round 6 — 2026-10-03 (range `76e2294..2ca3e1b`)

**Scope:** full monorepo — 19 commits across PRs #398–#409 since Round 5 (58 files, +2919/−3582): SSRF shared guard + font-redirect revalidation (#398), docs reorg into `docs/` (#399), dependency-review keys + notify-failure (#400), S1/R2 regression tests (#401), draft-restore re-attach + first-theme-sync (#402), workloads/deps type validation (#403), O3 CI gaps (#404), P2 batch + O4 pin hygiene (#406), Sentry 11 (#407), `auth.py` god-file split (#408), mobile roadmap doc (#409).
**Method:** 5 parallel deep-dive agents (auth-split route/security parity, #406 closure verification, #398/#400–#404/#407 verification, open-findings re-verification, docs-reorg + roadmap) + full live verification suites + manual source verification of every MEDIUM+ claim, including cross-checking the pinned `actions/dependency-review-action` config semantics against the action's current official docs. No live pen-test.

### 16.1 Verification (all live, 2026-10-03, branch @ `2ca3e1b`)

| Suite | Result |
|-------|--------|
| Frontend tsc / eslint / vitest / build | 0 errors · 0 errors / 58 warnings · **151 passed** +1 skip (16 files) · success (Next 16.3.8, Sentry 11.4.0 installed) |
| Backend ruff / mypy / pytest | 0 · 0 (75 files, was 73) · **244 passed** |
| Mobile tsc / eslint / vitest | 0 · 0 · 18 passed |
| npm audit frontend / mobile | 7 (2 moderate, 5 high, 0 critical) / 31 (11 moderate, 20 high, 0 critical) — matches §14 post-fix |
| Secrets-in-diff scan (`76e2294..HEAD`) | clean — 0 token-pattern hits; the only KEY/SECRET/PASSWORD lines are env reads with empty defaults + password hashing |

Counts up from Round 5: frontend 132 → **151**, backend 213 → **244** (+8 S1 gating, +8 SSRF, +13 A5-9, +1 N9, +8 CORS, +7 regression… across #398/#400–#406), mobile unchanged.

### 16.2 Work in the window — verified complete

| Work | Verdict (source-verified) |
|------|---------------------------|
| **#398 A5-1/A5-2 — shared SSRF guard + font redirects** | Complete. `utils/ssrf.py:32-38` unwraps `ipv4_mapped` before all checks; `seo_proxy.py:85` + `fonts.py:70` route through it; `fonts.py:79-84` `request` hook re-validates every redirect hop against the allowlist (400 on escape). `tests/test_ssrf_routers.py` (10 tests incl. the S2 `::ffff:169.254.169.254` regression). All other fetch-URL routers either use the guard (`monitor.py`, `oauth_admin._validate_public_https_uri`) or are legitimate fixed/allowlisted/env-configured outbound (fivem Discord API + txAdmin, mobile_release GitHub API, CDN/upload fixed hosts, mail/push providers, txadmin/stalwart/authentik service URLs). |
| **#400 A5-3 — dependency-review keys** | **Partial** — two invalid keys removed, but see R6-1/R6-2: the file is still not loaded by the action and one more invalid key survives. |
| **#401 A5-4 — S1/R2 regression tests** | Complete. `tests/test_store_marketing_gating.py` loads the real router + real `permissions` code (view → 200 reads / 403 on all 6 writes; manage → writes recorded); `context/EditContext.test.tsx` renders the real visitor `EditableImage` branch and asserts the merged `imgStyle` + no admin chrome. |
| **#402 A5-7/A5-8 — draft restore + first theme sync** | Complete. `acceptDraft` re-attaches the server-row uuid via `draftRestoreDocId()` (`HybridInfraEditor.tsx:1112`) so save PUTs the original row instead of forking (4 tests). First theme-sync adopts the DOM-stamped value and skips the first-pass storage write (`providers.tsx:400-421`; pure decision extracted to `core/themeSync.ts` + 5 non-vacuous tests). **U1 (theme e2e flake / FOUC clobber) closed.** |
| **#403 A5-9 — write-gate type validation** | Complete. `_validate_doc` 400s on non-string/empty and >60-char `workloads`/`deps` entries (create + PUT, 13 tests incl. boundary round-trips). **B11 closed.** |
| **#404 O3 — CI gaps** | Complete. Mobile vitest job (`ci.yml:203-204`), `lint:hooks` (`ci.yml:45-46` → `scripts/check_hook_imports.py`, real check), Playwright e2e job (`ci.yml:73-99`, `@playwright/test ^1.63.0`, 6 specs, read-only GETs against production confirmed, no secrets needed). INFO: e2e gates PRs on production availability with `retries: 0`. |
| **#406 P2 batch + O4** | All 13 items re-verified in current source (N9 try/except → typed 500; N10 field-whitelist rebuild with no valid field dropped; N11 full `escapeHtmlAttr`; N12 base64 drafts in `lib/infraDraft.ts` + 6 tests; N13 authoritative 409 re-derive; F10 hit order = exact reverse paint order across all 6 layers; F11 wheel ignored mid-gesture; F12 `pruneSelection` on undo/redo; F14 20 `htmlFor` labels + `aria-label` on the rest, 1 residual unassociated label LOW; F16 single hidden file input; F19 fail-closed `published` + node-id dedupe; B16 `utils/cors_origins.py` with 8 tests asserting both allow and deny directions; O4 PyJWT 2.15.0 in requirements+lock, pydantic 2.13.5 pinned, CI tooling pinned via `requirements-dev.txt`, lock reproducibility claim corrected). No regressions found in the batch diff. |
| **#407 E1 — Sentry 10 → 11** | Complete. `withSentryConfig` from `@sentry/nextjs/config` (export confirmed in installed 11.4.0 build); `instrumentation.ts:12` `onRequestError = Sentry.captureRequestError` (export present in both node and edge entry points); init args valid in v11 with nothing silently dropped; `@sentry/tracing → false` client alias + `productionBrowserSourceMaps: false` intact. ESLint 10 remains blocked (§15.8, unchanged). |
| **#408 — `auth.py` god-file split** | Behavior-preserving. All 8 live routes map 1:1 to their new homes (verified against a pre-split decorator grep; the other ~40 pre-split functions were undecorated dead copies already served by the sub-routers). PASETO mint/verify, Set-Cookie flags, fail-closed env gates (byte-equivalent at `auth_shared.py:45-58,86-88`), rate limiting, and CSRF gates all unchanged; the four OAuth-provider diffs are import re-pointing only (`#token=` fragments untouched — H2 neither fixed nor broken). `config_check.py` is admin-gated and exposes only 4 non-secret fields. 1 LOW wiring defect (R6-4). |
| **#409 — mobile roadmap** | Coherent (dated, phased A/B/C, ownership, execution order) and directly supersedes `PLAN-REDESIGN-REVAMP.md`'s stale claims — but the old plan was left in place with no deprecation banner (U4 residual). |
| **#399 — docs reorg** | Clean. `docs/README.md` index complete (8/8 docs), zero broken cross-references repo-wide (all in-scope surfaces: root README, docs/*, workflows, scripts, code), no content loss on the moves (STATUS.md 99% similar, single round-pointer edit), dropped commit-msg helper unreferenced. |

### 16.3 New findings (this round)

| ID | Sev | Finding |
|----|-----|---------|
| **R6-1** | **MEDIUM (CI)** | **Dependency-review policy file is inert.** `ci.yml`'s `dependency-review` job invokes `actions/dependency-review-action@a1d282…` **without the `config-file` input** — the action only reads an external config when it is explicitly passed (verified against the action's current docs; "auto-loading" is a property of GitHub's built-in Dependency Review *product*, not this action). Effective policy = defaults: `fail-on-severity: low` (stricter than the intended `high` on vulnerabilities) and the `allow-licenses` allowlist **unenforced** (looser than intended on licenses). The config file's own comment ("auto-loaded … no workflow wiring needed") is wrong and is what #400 relied on. Fix: `with: config-file: .github/dependency-review-config.yml` — owner call: wire the file (high + allowlist) or move the desired policy inline. |
| R6-2 | LOW (CI) | `max-vulnerabilities: 50` in `dependency-review-config.yml` is not a key in the action's config schema (checked against the current options list) — silently ignored; same bug class A5-3 removed two of. Remove it. |
| R6-3 | LOW | `_validate_ldap_url` (`oauth_admin.py:78-81`) has the same S2-class mapped-IPv6 hole: property checks and the exact-string `169.254.169.254` check both miss `::ffff:169.254.169.254`. Blast radius minimal — admin-only, the URL is stored in `site_config` only, no server-side LDAP fetch (LLDAP itself is the consumer). Fix: compare `ip.ipv4_mapped` / use `is_blocked_ip` for loopback+link-local while keeping the RFC1918 allowance. |
| R6-4 | LOW | `/api/auth/config-check` is registered **twice**: `main.py:761` (direct include) and via `auth.py:29` inside the auth assembly (`main.py:757`). FastAPI first-match-wins, so behavior is identical, but it contradicts the new `auth.py` docstring claim that "every /api/auth/* endpoint is registered exactly once." Drop one include. |

**INFO notes (unnumbered):** `notify-failure` remains echo-only (no notification channel, pre-existing); e2e job couples PR gating to production availability (`retries: 0`); `pip install -r requirements-dev.txt` runs twice in backend-lint (`ci.yml:121,131`); `requirements.lock` "mirror" header omits the four CI-tooling pins; dev-CORS custom-root subdomain pattern is wiped for non-localhost `FRONTEND_URL` (dev-only, no security impact); F11 side effect — wheel fully ignored mid-gesture, so Ctrl+wheel page zoom passes through (documented in code); **U3 is now PARTIAL** — node-id dedupe landed in #406 (F19) but decoration/annotation ids still aren't deduped in `sanitizeDoc` (`data/hybrid-infra.ts:776-784`) while the backend 400s on duplicates (`infra_diagrams.py:216`); `lib/infraDoc.ts` was consolidated into `lib/infraDocOps.ts` (older audit line-refs to the former name are stale); frontend `vitest.config.ts` includes a `tests/**` pattern that matches no directory.

### 16.4 Open findings — re-verified against current source

| Item | Status | Evidence |
|------|--------|----------|
| U2 core-ui leftovers | **OPEN** | Native `textarea`/`input` still at `blogPostParts.jsx:430`, `EditContext.jsx:289,566`, `admin/Changelog.jsx:1040`, `store/DeliveryAgentPortal.jsx:88` (two files moved paths, lines unchanged); `Select`/`Checkbox` still clobber caller `onClick` (`forms.jsx:184,187 / 288,293` spread order); keyboard-activate still emits a real MouseEvent with `clientX=0` (video seek jump, `Clickable.jsx:15-17` + `blogPostParts.jsx:143`); lightbox fixed-ratio upscale still at `MediaPreview.jsx:145`. |
| U3 decorations parity | **OPEN / PARTIAL** | Backend accepts any finite coord (`infra_diagrams.py:166-175,338-345`) vs frontend ±50000 clamps; node-id dedupe **done** (#406), **decoration/annotation-id dedupe still missing** (400-on-save path). |
| U4 docs/env | **OPEN** | `.env.example` still missing `AUTHENTIK_*` (incl. `AUTHENTIK_API_TOKEN`), `UPSTASH_REDIS_REST_*`, `DISCORD_CLIENT_*`, `ADMIN_PASSWORD_HASH`, `LLDAP_*`, `COOKIE_DOMAIN`, `MAIL_FROM`; root README `docker compose up` onboarding still omits `.env.local` (which `docker-compose.yml` hard-requires); `docs/SECURITY.md` line refs **7 of 13 stale** (worst: `dependencies.py:56→32`, `fivem.py:945` cited twice, `proxy.ts:68`, `database.py:103→112`, `pdf_editor.py:248`, `Dashboard.jsx:98`); `apps/mobile/PLAN-REDESIGN-REVAMP.md` still exists undeprecated with contradicted claims. |
| P2 LOW items | **OPEN (all 6)** | dependabot `docker/frontend` entry; `infra_diagrams` migration REVOKE parity (page_layouts has it, infra_diagrams migration has no GRANT/REVOKE at all); `utils/audit.py:108-113` caller-supplied actor/ip; Safari <16.4 fullscreen prefix (now at `HybridInfraEditor.tsx:434,474-475`, `HybridInfra.tsx:127`) + `core/menu.jsx` still not portaled; `DateTimePicker.jsx` time-only edits still dropped (`emit()` guard); forum admin modals (5 in `forumAdminModals.jsx`) still no Escape. |
| P3 god files | **OPEN (3 known + 2 new)** | `ThemeLibrary.jsx` **4240** · `HybridInfraEditor.tsx` **3241** · `HybridInfraCanvas.tsx` **2502** · `ServerRackAnimation.jsx` **2494** · `AdminPanels.jsx` **1891** (frontend); backend `fivem.py` **2003** is the largest backend file (never tracked before). **`auth.py` now 29 lines** — split done clean (auth_shared 443 · auth_register 350 · auth_login 306 · auth_profile 276 · auth_staff 257 · auth_discord 251 · auth_sessions 192 · config_check 26). |
| P3 canonicals/JSON-LD | **PARTIAL** | `/p/[slug]` has canonical + OG/Twitter, no JSON-LD; store/forum have no per-route canonicals; diagram share route OG has no `image` (no og:image anywhere on that route). |
| P3 ROADMAP | **OPEN** | `docs/ROADMAP.md` header still "as of 2026-09-04" (~4 weeks stale); **32 unchecked** / 52 checked (was 33). |
| P3 dead weight | **OPEN** | 22/34 root `scripts/*` still unreferenced — and they now fail `ruff` with 26 errors (import order, F601 dup keys, BLE001, UP031, FURB167), i.e. they rot silently outside the backend lint scope and outside CI; delete-or-wire decision is more urgent than when first logged. `check_migrations.py`/`check_policies.py` still 0 references in CI. |
| P3 component test depth (E2) | **OPEN** | Frontend 16 test files (include now `lib/** + core/** + context/** + tests/**`); covered: sanitize/dedupe/clamp, doc ops, draft codec + re-attach, SVG export, view math, palette, library, `?diagram=` enter/exit. **Not covered:** undo/redo (HISTORY) stack behavior, JSON import, share-link generation; RESTORE only at codec/id level, no component-level draft-restore flow. |
| Standing risks | **OPEN (unchanged)** | C3 R2 backup target #2 same-host · H1 rotation status unknown (dumps absent from this worktree's tree; main checkout not observable) · H2 `#token=` fragments still at `github_auth.py:382,388`, `steam_auth.py:428`, `authentik_oidc.py:289`, `discord_auth.py` (now pinned by `test_oauth_no_query_tokens.py`) · EAS rebuild pending; P0 mobile pipeline still unverified (open PRs #405 v1.0.68 / #410 v1.0.69). |

### 16.5 Grades & state

Security **8.5/10** (no new exploitable finding; R6-3 minimal; all three S2-class bypass sites from prior rounds closed) · Maintainability **B** (auth.py split landed clean and verified; five frontend god files remain, two of them previously untracked) · Testing **B+** (413 unit tests: 244 backend / 151 frontend / 18 mobile; e2e now in CI; editor-behavior depth still thin) · Operations **B-** (mobile pipeline config-unblocked but unverified; R6-1 policy gap; e2e production coupling).

**Next (highest value):** R6-1 (one-line CI input + owner policy call) · P0 mobile-release verification · U4 `.env.example` + README onboarding + SECURITY.md line refs · P3 god files (start with HybridInfraEditor/Canvas or ThemeLibrary) · U2/U3 residuals.

---

*Round-6 audit, static + source-verified + action-docs cross-check. Every MEDIUM claim manually confirmed. No production traffic tested.*
