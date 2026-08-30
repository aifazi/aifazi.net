# aifazi.net

Monorepo for [aifazi.net](https://aifazi.net).

## Structure

| Directory | Description |
|-----------|-------------|
| `aifazi.net-frontend-next/` | Next.js frontend (Vercel) |
| `aifazi.net-backend-fastapi/` | FastAPI backend (Railway) |
| `apps/mobile/` | Expo React Native app (EAS) |
| `packages/shared/` | Shared utilities |
| `docker/` | Dev Dockerfiles |
| `supabase/` | Database migrations |

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

## CI/CD

- **Frontend**: Vercel (auto-deploy from `main`)
- **Backend**: Railway (auto-deploy from `main`)
- **Mobile**: EAS Build (`eas build`)
- **CI**: GitHub Actions — lint, typecheck, security scans on every PR

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting and security practices.
