# Docker — Monorepo Deployment

This repo contains both projects:

- **aifazi.net-backend-fastapi/** — FastAPI backend on <http://localhost:8000>
- **aifazi.net-frontend-next/** — Next.js frontend on <http://localhost:3000>

## Setup

Docker Compose reads the root `.env` file. Copy the example and fill in secrets:

```bash
cp .env.docker.example .env
# Edit .env — set real keys for SUPABASE_SERVICE_ROLE_KEY, PASETO_SECRET, etc.
```

The most important rule: `INTERNAL_API_SECRET` and `PASETO_SECRET` must match between frontend and backend.

## Run

```bash
docker compose up --build
```

Open <http://localhost:3000>. Browser API calls go through Next.js middleware → FastAPI backend.

Backend health check:

```bash
curl http://localhost:8000/api/health
```

## Vercel (Frontend)

1. Go to https://vercel.com/new → Import `aifazi/aifazi.net`
2. **Root Directory**: set to `aifazi.net-frontend-next`
3. Framework: Next.js (auto-detected)
4. Add environment variables from `.env`

## Render (Backend)

1. Go to https://render.com/new → Blueprint
2. Connect `aifazi/aifazi.net`
3. Render will detect `render.yaml` at the repo root
4. Set environment variables in Render dashboard

## Single VPS (Alternative)

```bash
git clone https://github.com/aifazi/aifazi.net.git
cd aifazi.net
cp .env.docker.example .env
# Edit .env with real secrets
docker compose up -d --build
```
