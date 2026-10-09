#!/bin/bash
# /opt/aifazi.net/scripts/connect-stalwart-network.sh
# Ensures the backend container is connected to the Stalwart network.
# Run after deployments or as a cron job to survive container restarts.
set -euo pipefail

# Dynamically find the backend container. Match on Coolify's resource type —
# the app name is NOT "backend" anymore (serviceName aifazinetmain), so a
# name grep misses it; exactly one production application exists.
BACKEND_CONTAINER=$(docker ps \
  --filter "label=coolify.type=application" \
  --filter "label=coolify.projectName=aifazinet" \
  --filter "label=coolify.environmentName=production" \
  --format '{{.Names}}' | head -n 1 || true)
STALWART_NETWORK="mbkueai1hukfyan8mei8sdbc"

# Check if already connected
is_connected() {
  docker inspect "$1" 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
nets = list(d[0]['NetworkSettings']['Networks'].keys())
print('yes' if '$STALWART_NETWORK' in nets else 'no')
" 2>/dev/null || echo "no"
}

if [ -z "$BACKEND_CONTAINER" ]; then
  echo "connect-stalwart: backend container not found"
elif [ "$(is_connected "$BACKEND_CONTAINER")" = "yes" ]; then
  echo "connect-stalwart: already connected"
else
  docker network connect "$STALWART_NETWORK" "$BACKEND_CONTAINER" 2>/dev/null && \
    echo "connect-stalwart: connected $BACKEND_CONTAINER to $STALWART_NETWORK" || \
    echo "connect-stalwart: failed to connect"
fi

# Also keep supabase-db attached to the glue network: Authentik resolves the db
# container on it (AUTHENTIK_POSTGRESQL__HOST). A `docker compose up` in the
# Supabase service dir recreates the db container and drops manual attaches;
# the compose file now declares this network too, so this is the cron safety
# net in case a Coolify UI edit reverts that declaration.
DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -m1 '^supabase-db-' || true)
if [ -n "$DB_CONTAINER" ]; then
  if [ "$(is_connected "$DB_CONTAINER")" = "yes" ]; then
    echo "connect-stalwart: db already connected"
  else
    docker network connect "$STALWART_NETWORK" "$DB_CONTAINER" 2>/dev/null && \
      echo "connect-stalwart: connected $DB_CONTAINER to $STALWART_NETWORK" || \
      echo "connect-stalwart: failed to connect db"
  fi
fi
