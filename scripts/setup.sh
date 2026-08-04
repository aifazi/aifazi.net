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

if ! docker compose version &>/dev/null; then
  echo " WARN: 'docker compose' not found, trying 'docker-compose'..."
  DOCKER_COMPOSE="docker-compose"
else
  DOCKER_COMPOSE="docker compose"
fi

# 2. Create .env.local if not present
if [ ! -f .env.local ]; then
  echo " Creating .env.local from .env.local.example..."
  cp .env.local.example .env.local
  echo " Edit .env.local to set custom secrets if desired."
else
  echo " .env.local already exists — skipping."
fi

# 3. Generate local secrets
echo " Generating local secrets..."
PASETO_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || echo "dev-paseto-secret-local-$(date +%s)")
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || echo "dev-jwt-secret-local-$(date +%s)")
INTERNAL_API_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || echo "dev-internal-local-$(date +%s)")
CRON_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || echo "dev-cron-local-$(date +%s)")

# 4. Build and start all services
echo " Building and starting services..."
$DOCKER_COMPOSE up -d --build

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  All services are starting..."
echo ""
echo "  Frontend:   http://localhost:3000"
echo "  Backend:    http://localhost:8000"
echo "  Supabase:   http://localhost:54323 (Studio)"
echo "  Mailpit:    http://localhost:54324"
echo ""
echo "  Watch logs:  $DOCKER_COMPOSE logs -f"
echo "  Stop:        $DOCKER_COMPOSE down"
echo "  Rebuild:     $DOCKER_COMPOSE up -d --build"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
