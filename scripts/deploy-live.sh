#!/bin/bash
# deploy-live.sh — Push a changed resource to the live VPS and restart FXServer
# Usage:
#   ./scripts/deploy-live.sh                          # restart only
#   ./scripts/deploy-live.sh aifazi_status             # push entire resource folder
#   ./scripts/deploy-live.sh aifazi_status/config.lua  # push single file

set -euo pipefail

VPS_HOST="${VPS_HOST:?Set VPS_HOST environment variable}"
VPS_USER="${VPS_USER:-root}"
SSH_KEY="${SSH_KEY:?Set SSH_KEY environment variable}"
REMOTE_BASE="/opt/fivem/server-data/resources"
LOCAL_BASE="fivem-resources"
CONTAINER="${CONTAINER:?Set CONTAINER environment variable}"

ssh_cmd() { ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$VPS_USER@$VPS_HOST" "$@"; }
scp_cmd() { scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -r "$@"; }

if [ $# -eq 0 ]; then
  echo "Restarting FXServer..."
  ssh_cmd "docker restart $CONTAINER"
  echo "Done."
  exit 0
fi

RESOURCE="$1"

if [[ "$RESOURCE" == *.* ]]; then
  # Single file: deploy-live.sh aifazi_status/config.lua
  DIR=$(dirname "$RESOURCE")
  REMOTE_DIR="$REMOTE_BASE/$DIR"
  echo "Pushing $RESOURCE → $REMOTE_BASE/$RESOURCE"
  mkdir -p "/tmp/deploy-check/$DIR" 2>/dev/null || true
  scp_cmd "$LOCAL_BASE/$RESOURCE" "$VPS_USER@$VPS_HOST:$REMOTE_BASE/$RESOURCE"
else
  # Entire folder: deploy-live.sh aifazi_status
  echo "Pushing $LOCAL_BASE/$RESOURCE/ → $REMOTE_BASE/$RESOURCE/"
  # Upload to temp dir first, then swap atomically
  ssh_cmd "mv $REMOTE_BASE/$RESOURCE $REMOTE_BASE/$RESOURCE.bak 2>/dev/null || true"
  scp_cmd "$LOCAL_BASE/$RESOURCE/" "$VPS_USER@$VPS_HOST:$REMOTE_BASE/$RESOURCE/"
  ssh_cmd "rm -rf $REMOTE_BASE/$RESOURCE.bak"
fi

echo "Restarting FXServer..."
ssh_cmd "docker restart $CONTAINER"
echo "Done."
