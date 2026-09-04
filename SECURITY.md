# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| `main`  | ✅        |

## Reporting a Vulnerability

**Do not** open a public issue for a security finding. Email **security@aifazi.net** with:

- Affected route/file:line (e.g. `aifazi.net-backend-fastapi/routers/fivem.py:945`)
- Steps to reproduce (curl / browser)
- Impact

We aim to acknowledge within 48h and ship a fix within 7 days. We use coordinated disclosure.

## What is Sensitive

- `aifazi.net-frontend-next/.env.local`, `aifazi.net-backend-fastapi/.env`, `apps/mobile/.env.local` — **never committed** (see `.gitignore:2` `.env` / `.env.*`). Only `.env.example` with `CHANGE_ME` / `YOURPROJECT` placeholders is tracked.
- Production secrets live in **Vercel Environment Variables** (frontend), **Coolify Environment Variables** (backend, AES-encrypted in its DB), and **EAS Secrets** (mobile). They are read via `process.env` / `os.environ` (`proxy.ts:39`, `dependencies.py:25`). No `SUPABASE_SERVICE_ROLE_KEY`, `PASETO_SECRET`, `INTERNAL_API_SECRET`, `STRIPE_SECRET_KEY`, `GITHUB_TOKEN`, or `CLOUDINARY` secrets are hardcoded; `git ls-files` shows only `*.example` files.
- One stale bcrypt hash was committed at `680fc2b:.env.example:12` (`$2b$12$REMOVED...`) and scrubbed in `225c733` → `CHANGE_ME`. Railway prod uses a different live hash. If you fork, rotate `ADMIN_PASSWORD` via `aifazi.net-backend-fastapi/reset_password.py`.

## Hardening for Public Source

This repo was private and is now public. Source alone does **not** give access to prod:

- Auth is `PASETO v4` (XChaCha20-Poly1305) via HttpOnly `auth_token` cookie (`lib/api.ts:60` `withCredentials: true`, `dependencies.py:56` `CookieHTTPBearer`). No `localStorage` token to steal via XSS.
- `app/admin/[[...slug]]/page.tsx:44` SSR gate enforces `role in ['admin','moderator','editor']`; client `Dashboard.jsx:98` is view-only.
- `database.py:19` uses `SUPABASE_SERVICE_ROLE_KEY` server-side only; RLS is enforced via `supabase/migrations/202608*` (`REVOKE EXECUTE ON exec_sql`, `REVOKE ALL ON store_*`, column-level `encryption_key` revoke). Even with schema visible, anon `SELECT` is locked.
- `fivem.py:945` / `forum.py:186` search inputs are sanitized via `database.py:103` `safe_search_term`; `pdf_editor.py:248` requires `Depends(get_current_user)`.
- `proxy.ts:68` `X-Internal-Token` is an HMAC (`method:pathname:ts`, 300s TTL), not the raw `INTERNAL_API_SECRET`.

If you run your own deploy, copy `.env.example` → `.env` and fill real values. Do **not** set `ADMIN_PASSWORD` to a plaintext committed value — generate a bcrypt hash with `reset_password.py`.

## Branch Protection (recommended)

`main` should require:

- Require PR, 1 approval
- Require status checks: `CI` (frontend-lint, frontend-build, backend-lint, backend-security/mypy, pip-audit, bandit, mobile-lint)
- Require secret scanning + push protection
- No force-push

Apply via **Settings → Branches → Add rule** or `gh api repos/aifazi/aifazi.net/branches/main/protection -X PUT -f ...` (see `.github/branch-protection.json` if present).

## Past History

`git log -p --all -S "REMOVED"` still shows the stale hash from `680fc2b`. To purge before going public: `git filter-repo --replace-text <(echo "REMOVED==>REMOVED") --force && git push --force`. Otherwise, treat it as already rotated and document here.
