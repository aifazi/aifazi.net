# Secret Rotation Checklist

**Why:** Local untracked dumps (`.env.prod-pull`, `.env.pulled`, `.env.pull`, `aifazi.net-frontend-next/.env.local`) may still hold live production credentials. Treat every value in those files as compromised until rotated.

**Do this before deleting the dumps.** Copy this file and tick items as you rotate.

---

## 0. Preconditions

- [ ] You have admin access to: Supabase dashboard, Stripe, GitHub OAuth apps, Discord developer portal, Steam Web API key page, Coolify/Vercel, FiveM/txAdmin, Stalwart (if used).
- [ ] Production can be redeployed / env vars updated without downtime you cannot afford.
- [ ] You will **not** paste rotated secrets into chat, tickets, or git.

---

## 1. Core auth & internal (do first — unlocks everything else)

| Secret | Where to rotate | Where to update |
|--------|-----------------|-----------------|
| `PASETO_SECRET` | Generate new 32+ byte random | Coolify (backend) **and** Vercel (frontend if it signs/verifies) |
| `INTERNAL_API_SECRET` | Generate new 32+ byte random | Coolify + Vercel (must match) |
| `ADMIN_PASSWORD` / `ADMIN_PASSWORD_HASH` | New bcrypt via `reset_password.py` | Coolify (backend) |
| `ADMIN_GATE_SECRET` | New random | Vercel |
| `CRON_SECRET` | New random | Coolify + any cron caller |
| `JWT_SECRET` | New random (if still used) | Coolify |
| `FIVEM_CONNECT_SECRET` / `FIVEM_SERVER_SECRET` | New random | Coolify + FiveM resource config |
| `VERCEL_OIDC_TOKEN` | Vercel dashboard → regenerate | Local only; do not store long-term |

After rotating `PASETO_SECRET` / `INTERNAL_API_SECRET`: **restart backend and redeploy frontend**. All sessions and HMAC tokens become invalid (expected).

---

## 2. Data plane

| Secret | Where to rotate | Notes |
|--------|-----------------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → rotate service_role key | Update Coolify immediately; old key is full bypass of RLS |
| `SUPABASE_URL` | Only if project is replaced | Usually unchanged |

---

## 3. Payments

| Secret | Where to rotate | Notes |
|--------|-----------------|-------|
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys (roll secret) | Update Coolify |
| `STRIPE_WEBHOOK_SECRET` | Recreate/roll webhook signing secret | Update Coolify; re-send test webhook |

---

## 4. OAuth / third-party

| Secret | Where to rotate |
|--------|-----------------|
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub → Settings → Developer settings → OAuth Apps → generate new client secret (id may stay) |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord developer portal → reset secret |
| `STEAM_API_KEY` | Steam Web API key page (delete + create) |
| Authentik client secret | Authentik application credentials (if used) |
| Stalwart admin password | Stalwart admin (if used) |
| `CLOUDFLARE_R2_*` / Cloudinary / ImageKit / Bunny keys | Provider dashboards — rotate all access keys present in dumps |
| `SENTRY_DSN` | Sentry → regenerate DSN / new key |

---

## 5. After rotation

- [ ] Smoke-test: login (password + OAuth), admin gate, one upload, Stripe test checkout, webhook delivery.
- [ ] Confirm mobile login if you ship the app.
- [ ] Confirm FiveM store bridge / status Lua still authenticates.
- [ ] Delete local dumps (see `scripts/wipe-local-env-dumps.ps1`).
- [ ] Search Vercel/Coolify env UI for any value that still matches the old dumps and remove it.
- [ ] Update `SECURITY.md` “Past History” with the rotation date.

---

## 6. Optional git history purge

Only if the old bcrypt / any secret ever landed in **tracked** git:

```bash
git filter-repo --replace-text <(echo 'OLD_VALUE==>REMOVED') --force
# then force-push with team agreement
```

Already documented for the scrubbed bcrypt in `SECURITY.md`.
