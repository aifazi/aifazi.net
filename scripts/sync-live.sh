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
ALLOW_DELETE=false

for arg in "$@"; do
  case "$arg" in
    --no-restart) RESTART=false ;;
    --delete) ALLOW_DELETE=true ;;
    *) TARGET="$arg" ;;
  esac
done

# Bash array (no word-splitting) for SSH options.
SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)
# rsync -e takes a single shell string: re-quote each element safely.
printf -v SSH_RSH 'ssh %q %q %q %q' "${SSH_OPTS[@]}"

# Never sync from a missing/typo'd source tree (rsync + --delete on an empty
# dir would wipe the remote).
if [ ! -d "$LOCAL_BASE" ]; then
  echo "sync-live: local base not found: $LOCAL_BASE" >&2
  exit 1
fi

# CONTAINER is interpolated into the remote shell — restrict to a safe name.
if [[ ! "$CONTAINER" =~ ^[A-Za-z0-9_.-]+$ ]]; then
  echo "sync-live: refusing unsafe CONTAINER value: $CONTAINER" >&2
  exit 1
fi

# --delete is destructive: require the explicit flag (default: no delete).
RSYNC_DELETE=()
if [ "$ALLOW_DELETE" = true ]; then
  RSYNC_DELETE=(--delete)
fi

if [ -z "$TARGET" ]; then
  # Sync entire directory
  echo "Syncing $LOCAL_BASE/ → $VPS_HOST:$REMOTE_BASE/"
  rsync -avz "${RSYNC_DELETE[@]}" --exclude='.git*' --exclude='node_modules' --exclude='__pycache__' --exclude='*.pyc' -e "$SSH_RSH" "$LOCAL_BASE/" "$VPS_USER@$VPS_HOST:$REMOTE_BASE/"
elif [[ "$TARGET" == *.* ]]; then
  # Single file
  DIR=$(dirname "$TARGET")
  echo "Syncing $LOCAL_BASE/$TARGET → $VPS_HOST:$REMOTE_BASE/$TARGET"
  rsync -avz "${RSYNC_DELETE[@]}" --exclude='.git*' --exclude='node_modules' --exclude='__pycache__' --exclude='*.pyc' -e "$SSH_RSH" "$LOCAL_BASE/$TARGET" "$VPS_USER@$VPS_HOST:$REMOTE_BASE/$TARGET"
else
  # Single resource folder
  echo "Syncing $LOCAL_BASE/$TARGET/ → $VPS_HOST:$REMOTE_BASE/$TARGET/"
  rsync -avz "${RSYNC_DELETE[@]}" --exclude='.git*' --exclude='node_modules' --exclude='__pycache__' --exclude='*.pyc' -e "$SSH_RSH" "$LOCAL_BASE/$TARGET/" "$VPS_USER@$VPS_HOST:$REMOTE_BASE/$TARGET/"
fi

if [ "$RESTART" = true ]; then
  echo "Restarting FXServer..."
  ssh "${SSH_OPTS[@]}" "$VPS_USER@$VPS_HOST" "docker restart -- '$CONTAINER'"
  echo "Done."
else
  echo "Done. (no restart)"
fi
