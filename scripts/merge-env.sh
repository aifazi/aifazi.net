#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Merge production Vercel env vars into Docker .env.local
# Run inside WSL after `vercel env pull` has created .env.vercel
# ═══════════════════════════════════════════════════════════════
set -e

ROOT="/mnt/c/FAZI/aifazi.net-main"
BE_ENV="$ROOT/aifazi.net-backend-fastapi/.env.vercel"
FE_ENV="$ROOT/aifazi.net-frontend-next/.env.vercel"
OUT="$ROOT/.env.local"

if [ ! -f "$BE_ENV" ] || [ ! -f "$FE_ENV" ]; then
  echo " ERROR: .env.vercel files not found."
  echo " Run on Windows first:"
  echo "   cd backend   && vercel env pull .env.vercel --environment production --yes"
  echo "   cd frontend  && vercel env pull .env.vercel --environment production --yes"
  exit 1
fi

echo " Building .env.local from production Vercel env vars..."

# Start fresh
echo "# ── Docker local environment — merged from Vercel production ──" > "$OUT"

# Parse a key=value file, stripping wrapping quotes
parse_env() {
  local file="$1"
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    # Strip surrounding quotes if present
    value="${value#\"}"; value="${value%\"}"
    echo "$key=$value"
  done < "$file"
}

# Merge both, backend wins on duplicates (it has the definitive secrets)
{
  parse_env "$FE_ENV"
  parse_env "$BE_ENV"
} | sort -u -t= -k1,1 | while IFS='=' read -r k v; do
  # Skip Vercel-internal vars
  [[ "$k" == VERCEL* ]] && continue
  [[ "$k" == TURBO* ]] && continue
  [[ "$k" == NX_DAEMON ]] && continue
  echo "$k=$v" >> "$OUT"
done

# Override local-specific values
echo "" >> "$OUT"
echo "# ── Local overrides ──" >> "$OUT"
echo "FRONTEND_URL=http://localhost:3000" >> "$OUT"
echo "NEXT_PUBLIC_API_URL=http://backend:8000" >> "$OUT"
echo "ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000" >> "$OUT"
echo "NODE_ENV=development" >> "$OUT"
echo "ENV=production" >> "$OUT"
echo "NEXT_TELEMETRY_DISABLED=1" >> "$OUT"
echo "COMPOSE_PROJECT_NAME=aifazi-local" >> "$OUT"

echo " Done — .env.local created with production values + local overrides"
echo " Review it:  cat $OUT"
