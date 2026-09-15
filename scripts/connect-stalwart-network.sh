#!/bin/bash
# /opt/aifazi.net/scripts/connect-stalwart-network.sh
# Ensures the backend container is connected to the Stalwart network.
# Run after deployments or as a cron job to survive container restarts.
set -euo pipefail

BACKEND_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E '^rp0p1tarlng33nepycd61adp-' | head -n 1)
STALWART_NETWORK="mbkueai1hukfyan8mei8sdbc"

if [ -z "$BACKEND_CONTAINER" ]; then
  echo "connect-stalwart: backend container not found"
  exit 0
fi

# Check if already connected
CONNECTED=$(docker inspect "$BACKEND_CONTAINER" 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
nets = list(d[0]['NetworkSettings']['Networks'].keys())
print('yes' if '$STALWART_NETWORK' in nets else 'no')
" 2>/dev/null || echo "no")

if [ "$CONNECTED" = "yes" ]; then
  echo "connect-stalwart: already connected"
else
  docker network connect "$STALWART_NETWORK" "$BACKEND_CONTAINER" 2>/dev/null && \
    echo "connect-stalwart: connected $BACKEND_CONTAINER to $STALWART_NETWORK" || \
    echo "connect-stalwart: failed to connect"
fi
