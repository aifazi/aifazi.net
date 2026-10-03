# aifazi.net

Monorepo for [aifazi.net](https://aifazi.net) — personal platform with portfolio, blog, community forum, store, FiveM integration, and a developer-tools suite.

## Structure

| Directory | Description |
|-----------|-------------|
| `aifazi.net-frontend-next/` | Next.js 16 App Router frontend (Vercel) |
| `aifazi.net-backend-fastapi/` | FastAPI backend (Coolify on VPS) |
| `apps/mobile/` | Expo React Native app (EAS) |
| `docker/` | Dev Dockerfiles |
| `supabase/` | Database migrations (self-hosted Supabase) |
| `scripts/` | Ops, deploy, and migration helpers |
| `docs/` | Project docs: status, audits, roadmap, security, PR workflow |

## Highlights

### Interactive globe (COBE WebGL)
The hero hosts a live network globe built on [COBE](https://github.com/shuding/cobe):
- Bindable city markers + arcs with CSS Anchor Positioning labels
- Realtime client ⇄ server routing packets and a live hop ticker
- FPS guard (auto quality tiers), mini radar, PNG export
- Theme-synced earth, glow, and nodes (`--cyan` / `--green` / `--orange`)

### Layered theme design system
Themes own a **full design package** (palette + every component) without clashing with global admin framework settings. See `aifazi.net-frontend-next/core/themeDesign.js`:

| Layer | Owner | Applied as |
|-------|-------|------------|
| **LOOK** | Theme | Scoped CSS vars `--comp-*` (button, card, menu, notify, alert…) |
| **PATTERN** | Admin | `siteConfig` style ids (cyber/glass/terminal…) — never mutated by theme switch |

Export/import full design packages (`.design.json`) from **Admin → Theme Library**.

### Developer tools
Network tools (IP/geo + live Leaflet map), file tools (PDF, OCR, diff), SEO tools, store, forum, helpdesk.

## Development

```bash
# Frontend
cd aifazi.net-frontend-next && npm install && npm run dev

# Backend
cd aifazi.net-backend-fastapi && pip install -r requirements.txt && uvicorn main:app --reload

# Mobile
cd apps/mobile && npm install && npx expo start

# Docker
docker compose up
```

### Frontend scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint (max 150 warnings) |
| `npm run typecheck` | TypeScript |
| `npm run test` | Vitest unit tests |

## CI/CD

- **Frontend**: Vercel (auto-deploy from `main`)
- **Backend**: Coolify on VPS (manual deploy from `main`)
- **Database**: Self-hosted Supabase on Coolify (`supabase.aifazi.net`)
- **Mobile**: EAS Build (`eas build`)
- **CI**: GitHub Actions — lint, typecheck, security scans on every PR
- **Merges**: `main` is protected — all changes go through PRs with required checks + auto-merge

## Security

- CSP is emitted per-request in `aifazi.net-frontend-next/proxy.ts` (nonce-based `script-src`)
- HTML sanitization: `lib/sanitizeHtml.ts` (DOMPurify on client, strict scrubber on SSR)
- See [docs/SECURITY.md](docs/SECURITY.md) for vulnerability reporting and [docs/SECRETS-ROTATION.md](docs/SECRETS-ROTATION.md) for key hygiene

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/STATUS.md](docs/STATUS.md) | Current focus + open backlog (start here) |
| [docs/AUDIT.md](docs/AUDIT.md) | Security / UX audit findings |
| [docs/DESIGN-AUDIT.md](docs/DESIGN-AUDIT.md) | Visual design review |
| [docs/VPS-INFRA-AUDIT.md](docs/VPS-INFRA-AUDIT.md) | Infrastructure hardening |
| [docs/PREVIEW.md](docs/PREVIEW.md) | PR workflow: preview deploy → test → merge |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Planned work |
| `aifazi.net-frontend-next/docs/` | Frontend QA & theme certification |
