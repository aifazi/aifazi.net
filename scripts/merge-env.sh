#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Merge production Vercel env into .env.local for Docker
# Usage (from WSL, after `vercel env pull` on Windows):
#   bash scripts/merge-env.sh
# ═══════════════════════════════════════════════════════════════
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
B="$ROOT/aifazi.net-backend-fastapi/.env.vercel"
F="$ROOT/aifazi.net-frontend-next/.env.vercel"
OUT="$ROOT/.env.local"

if [ ! -f "$B" ] || [ ! -f "$F" ]; then
  echo "ERROR: .env.vercel files not found. Pull them first on Windows:"
  echo "  cd aifazi.net-backend-fastapi && vercel env pull .env.vercel --environment production --yes"
  echo "  cd aifazi.net-frontend-next && vercel env pull .env.vercel --environment production --yes"
  exit 1
fi

echo "Merging Vercel production env → .env.local ..."

# Merge both files into an associative array; LAST value for a key wins
# (frontend listed first, backend second → backend overrides shared keys).
declare -A VARS
while IFS='=' read -r key val; do
  # Skip comments / empty lines
  [[ -z "$key" || "$key" == \#* ]] && continue
  # Split on first =
  k="${key%%=*}"
  v="${key#*=}"
  # Strip surrounding quotes (single or double)
  v="${v%\"}"; v="${v#\"}"
  v="${v%\'}"; v="${v#\'}"
  # Skip Vercel/Turbo internal vars
  [[ "$k" == VERCEL* || "$k" == TURBO* || "$k" == NX_DAEMON ]] && continue
  [[ -z "$k" || -z "$v" ]] && continue
  VARS["$k"]="$v"
done < <(cat "$F" "$B")

# Write sorted output
: > "$OUT"
for k in $(printf '%s\n' "${!VARS[@]}" | sort); do
  printf '%s=%s\n' "$k" "${VARS[$k]}" >> "$OUT"
done

# Local overrides (must not be in production)
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

# Warn about critical vars that must be present
echo ""
echo "Checking critical vars..."
for req in INTERNAL_API_SECRET PASETO_SECRET JWT_SECRET SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY ADMIN_GATE_SECRET; do
  if grep -q "^$req=." "$OUT" 2>/dev/null; then
    echo "  ✓ $req"
  else
    echo "  ✗ $req — MISSING! Add it to .env.local (or set ADMIN_GATE_SECRET in Vercel + re-pull)."
  fi
done

echo ""
echo "Done — $(grep -c '^[A-Z]' "$OUT") vars in .env.local"
echo "Next: docker compose down && docker compose up -d --build"
