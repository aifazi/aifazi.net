#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Merge production Vercel env into .env.local for Docker
# ═══════════════════════════════════════════════════════════════
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
B="$ROOT/aifazi.net-backend-fastapi/.env.vercel"
F="$ROOT/aifazi.net-frontend-next/.env.vercel"
OUT="$ROOT/.env.local"

if [ ! -f "$B" ] || [ ! -f "$F" ]; then
  echo "ERROR: .env.vercel files not found. Pull them first on Windows:"
  echo "  cd C:\\FAZI\\aifazi.net-main\\aifazi.net-backend-fastapi"
  echo "  vercel env pull .env.vercel --environment production --yes"
  echo "  cd ..\\aifazi.net-frontend-next"
  echo "  vercel env pull .env.vercel --environment production --yes"
  exit 1
fi

echo "Merging Vercel production env → .env.local ..."

# Merge both files, stripping quotes and skipping Vercel/Turbo internals
{
  # Backend first, frontend second (matching key from frontend overwrites backend)
  cat "$B" "$F"
} | while IFS='=' read -r line; do
  # Skip comments and empty lines
  [[ -z "$line" || "$line" == \#* ]] && continue

  # Split on first =
  key="${line%%=*}"
  val="${line#*=}"

  # Skip Vercel/Turbo admin vars
  [[ "$key" == VERCEL* || "$key" == TURBO* || "$key" == NX_DAEMON ]] && continue

  # Strip quotes
  val="${val#\"}"; val="${val%\"}"
  val="${val#\'}"; val="${val%\'}"

  printf '%s=%s\n' "$key" "$val"
done | sort -u -t= -k1,1 > "$OUT"

# Local overrides
cat >> "$OUT" << 'LOCAL'
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://backend:8000
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
COOKIE_DOMAIN=
NODE_ENV=development
ENV=development
NEXT_TELEMETRY_DISABLED=1
COMPOSE_PROJECT_NAME=aifazi-local
LOCAL

echo "Done — $(wc -l < "$OUT") variables in .env.local"
