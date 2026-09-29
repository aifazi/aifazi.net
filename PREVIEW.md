# Preview → Test → Merge (or Rework)

Every change lands on `main` through a pull request. Each PR gets an
automatic **Vercel preview deployment** of the frontend — test there,
then merge or push rework to the same branch.

## 1. Open a branch + PR

```bash
git checkout -b fix/what-you-change
# ... work, commit ...
git push -u origin fix/what-you-change
gh pr create --base main --head fix/what-you-change \
  --title "Short imperative title" \
  --body "What + why + how you tested"
```

Branch naming: `fix/*`, `feat/*`, `chore/*` (dependabot uses its own).

## 2. Find the preview URL

* Vercel posts a **Preview Comments** check on the PR — the deployment
  URL looks like `https://aifazi-net-<hash>-<team>.vercel.app`.
* The 6 required checks must pass before merge: Frontend Lint &
  Typecheck, Backend Lint & Typecheck, Mobile Lint & Typecheck,
  Backend Security Scan, Secret Scan, Frontend Build.

## 3. Know which backend your preview talks to

The preview frontend uses the **Preview** environment's
`NEXT_PUBLIC_API_URL` from Vercel project settings — confirm what it
points at before testing:

| Preview API target | Safe for | Not safe for |
|--------------------|----------|--------------|
| Staging backend (recommended) | Anything, incl. writes | — |
| Production API | Read-only clicks, layout, console-error checks | Login writes, uploads, purchases, admin mutations |

If no staging backend exists yet: either test read-only against prod,
or run the backend locally against a **staging** Supabase project and
exercise the flows there:

```bash
# terminal 1 — backend against staging (.env.local points at staging)
docker compose up backend
# terminal 2 — frontend against local backend
cd aifazi.net-frontend-next
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

`scripts/check_compose_env.ps1` blocks compose against prod unless
`COMPOSE_ALLOW_PROD=1` — never override for a preview test.
See `docker-compose.yml:7-14` for the staging `.env.local` shape.

## 4. Test checklist (on the preview URL)

- [ ] Page loads with no console errors (the #355 SW/globe spam guards exist — don't reintroduce noise)
- [ ] Login → refresh (reload mid-session) → logout, no stray 401 loops
- [ ] The flows your PR touches, incl. mobile widths (≤720px: INFO popover, radar clearance)
- [ ] `prefers-reduced-motion`: globe + infra canvas render static frames
- [ ] New API routes: anon-write denied, drafts stay invisible, RLS as designed

## 5. Merge or rework

* **Looks good + checks green** → merge the PR (merge commit; branch
  auto-deletes if enabled, otherwise `git push origin --delete <branch>`).
* **Needs rework** → push more commits to the **same branch**; Vercel
  rebuilds the preview automatically; re-run the checklist.
* **Abandon** → `gh pr close <number> --delete-branch`.

After merge, `main` auto-deploys (Vercel frontend, Coolify backend) and
`prune-deployments.yml` cleans stale previews.

## Housekeeping

* Dependabot PRs pile up fast — triage weekly: merge green minors,
  schedule majors (sentry/eslint/python) deliberately, close stale ones
  (dependabot recreates them fresh).
* Delete merged branches promptly; tags (`v1.0.x`) are releases — never delete.
* Keep `.env.*` and `opencode.json` (holds `$COOLIFY_TOKEN`) out of git —
  both are gitignored; CI secret-scan enforces it.
