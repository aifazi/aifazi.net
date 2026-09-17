#!/bin/bash
# sync-live.sh — Sync local fivem-resources/ to VPS and optionally restart
# Usage:
#   ./scripts/sync-live.sh                    # sync all + restart
#   ./scripts/sync-live.sh --no-restart        # sync all, no restart
#   ./scripts/sync-live.sh aifazi_status       # sync single resource + restart
#   ./scripts/sync-live.sh aifazi_status/config.lua  # sync single file + restart

set -euo pipefail

VPS_HOST="${VPS_HOST:?Set VPS_HOST environment variable}"
VPS_USER="${VPS_USER:-root}"
SSH_KEY="${SSH_KEY:?Set SSH_KEY environment variable}"
REMOTE_BASE="/opt/fivem/server-data/resources"
LOCAL_BASE="fivem-resources"
CONTAINER="${CONTAINER:?Set CONTAINER environment variable}"

RESTART=true
TARGET=""

for arg in "$@"; do
  case "$arg" in
    --no-restart) RESTART=false ;;
    *) TARGET="$arg" ;;
  esac
done

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new"

if [ -z "$TARGET" ]; then
  # Sync entire directory
  echo "Syncing $LOCAL_BASE/ → $VPS_HOST:$REMOTE_BASE/"
  rsync -avz --delete --exclude='.git*' --exclude='node_modules' --exclude='__pycache__' --exclude='*.pyc' -e "ssh $SSH_OPTS" "$LOCAL_BASE/" "$VPS_USER@$VPS_HOST:$REMOTE_BASE/"
elif [[ "$TARGET" == *.* ]]; then
  # Single file
  DIR=$(dirname "$TARGET")
  echo "Syncing $LOCAL_BASE/$TARGET → $VPS_HOST:$REMOTE_BASE/$TARGET"
  rsync -avz --delete --exclude='.git*' --exclude='node_modules' --exclude='__pycache__' --exclude='*.pyc' -e "ssh $SSH_OPTS" "$LOCAL_BASE/$TARGET" "$VPS_USER@$VPS_HOST:$REMOTE_BASE/$TARGET"
else
  # Single resource folder
  echo "Syncing $LOCAL_BASE/$TARGET/ → $VPS_HOST:$REMOTE_BASE/$TARGET/"
  rsync -avz --delete --exclude='.git*' --exclude='node_modules' --exclude='__pycache__' --exclude='*.pyc' -e "ssh $SSH_OPTS" "$LOCAL_BASE/$TARGET/" "$VPS_USER@$VPS_HOST:$REMOTE_BASE/$TARGET/"
fi

if [ "$RESTART" = true ]; then
  echo "Restarting FXServer..."
  ssh $SSH_OPTS "$VPS_USER@$VPS_HOST" "docker restart $CONTAINER"
  echo "Done."
else
  echo "Done. (no restart)"
fi
