# Docker

This wrapper folder runs both projects together:

- `frontend`: Next.js on <http://localhost:3000>
- `backend`: FastAPI on <http://localhost:8000>

## Setup

Docker Compose reads the local `.env` file in this wrapper folder. This file is
for your local computer only and must not be committed.

```bash
cp .env.docker.example .env
```

The local `.env` is currently pointed at the Supabase dev project:

```text
https://xdzhvwmttshrauemakea.supabase.co
```

Edit `.env` and set the real `SUPABASE_SERVICE_ROLE_KEY` from Supabase
Dashboard -> Project Settings -> API. The most important rule is that
`INTERNAL_API_SECRET` must be the same for the frontend and backend.

For local admin login, Docker uses:

```text
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin@Local2026!
```

Change that password in `.env` whenever you want; restart the backend after
changing it.

## Run

```bash
docker compose up --build
```

Open <http://localhost:3000>. Browser API calls use relative `/api/*` URLs, so they go through Next.js middleware first. The frontend container then proxies those requests to `http://backend:8000` inside the Docker network.

The backend is also exposed at <http://localhost:8000> for local checks, including:

```bash
curl http://localhost:8000/api/health
```

`/api/health` returns `503 degraded` until the real backend
`SUPABASE_SERVICE_ROLE_KEY` is set, so Docker uses a port-level liveness check
to allow the frontend and backend to start together during local setup.
