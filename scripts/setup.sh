#!/bin/bash
# ═══════════════════════════════════════════════════════════
# aifazi.net — Local Development Setup (WSL / Linux / macOS)
# ═══════════════════════════════════════════════════════════
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  aifazi.net — local development environment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Check prerequisites
if ! command -v docker &>/dev/null; then
  echo " ERROR: Docker is not installed. Install Docker Desktop or Docker Engine first."
  exit 1
fi

DOCKER_COMPOSE="docker compose"
if ! docker compose version &>/dev/null; then
  if ! command -v docker-compose &>/dev/null; then
    echo " ERROR: neither 'docker compose' nor 'docker-compose' is available."
    exit 1
  fi
  DOCKER_COMPOSE="docker-compose"
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 2. Build .env.local
if [ ! -f .env.local ]; then
  if [ -f aifazi.net-backend-fastapi/.env.vercel ] && [ -f aifazi.net-frontend-next/.env.vercel ]; then
    echo " Merging production env vars from Vercel..."
    bash scripts/merge-env.sh
  else
    echo " WARNING: No Vercel env files (.env.vercel) found — creating a bare .env.local."
    echo " You MUST run 'bash scripts/merge-env.sh' (after 'vercel env pull') to get working secrets."
    cat > .env.local << 'ENVEOF'
# Fill these in (or run merge-env.sh after pulling from Vercel)
ENV=development
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://backend:8000
NEXT_PUBLIC_SUPABASE_URL=REPLACE_ME
NEXT_PUBLIC_SUPABASE_ANON_KEY=REPLACE_ME
SUPABASE_URL=REPLACE_ME
SUPABASE_SERVICE_ROLE_KEY=REPLACE_ME
PASETO_SECRET=REPLACE_ME
JWT_SECRET=REPLACE_ME
INTERNAL_API_SECRET=REPLACE_ME
ADMIN_GATE_SECRET=REPLACE_ME
CRON_SECRET=REPLACE_ME
ADMIN_USERNAME=admin
ADMIN_PASSWORD=REPLACE_ME
COOKIE_DOMAIN=
NEXT_TELEMETRY_DISABLED=1
COMPOSE_PROJECT_NAME=aifazi-local
ENVEOF
    echo "  → .env.local created. Fill the REPLACE_ME values, then re-run setup."
    echo ""
    echo "  Tip: to pull real values, run on Windows:"
    echo "   cd aifazi.net-backend-fastapi && vercel env pull .env.vercel --environment production --yes"
    echo "   cd aifazi.net-frontend-next && vercel env pull .env.vercel --environment production --yes"
    exit 1
  fi
else
  echo " .env.local already exists — keeping it (run scripts/merge-env.sh to refresh from Vercel)."
fi

# 3. Warn on placeholder/weak values (non-fatal)
grep -q "REPLACE_ME" .env.local && echo " ⚠ WARNING: .env.local still has REPLACE_ME placeholders — features will fail until filled."
grep -qiE "^ADMIN_PASSWORD=(password|passw0rd|admin|administrator|test|123456|tanvir123|changeme)" .env.local && echo "  ⚠ WARNING: ADMIN_PASSWORD is a common/weak default. Set a strong random password."
if grep -q "ADMIN_PASSWORD=" .env.local && [ "$(grep 'ADMIN_PASSWORD=' .env.local | cut -d= -f2-)" = "$(grep 'ADMIN_USERNAME=' .env.local | cut -d= -f2-)" ] && [ -n "$(grep 'ADMIN_PASSWORD=' .env.local | cut -d= -f2-)" ]; then
  echo "  ⚠ WARNING: ADMIN_PASSWORD matches ADMIN_USERNAME. Set a distinct strong password."
fi

# 4. Build and start all services
echo " Building and starting services..."
$DOCKER_COMPOSE up -d --build

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  All services are starting..."
echo ""
echo "  Frontend:   http://localhost:3000"
echo "  Backend:    http://localhost:8000"
echo ""
echo "  Watch logs:  $DOCKER_COMPOSE logs -f"
echo "  Stop:        $DOCKER_COMPOSE down"
echo "  Rebuild:     $DOCKER_COMPOSE up -d --build"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
