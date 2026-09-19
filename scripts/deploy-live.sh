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

# CONTAINER is interpolated into the remote shell — restrict to a safe name.
if [[ ! "$CONTAINER" =~ ^[A-Za-z0-9_.-]+$ ]]; then
  echo "deploy-live: refusing unsafe CONTAINER value: $CONTAINER" >&2
  exit 1
fi

restart_fxserver() {
  ssh_cmd "docker restart -- '$CONTAINER'"
}

# Restart, then verify the container is running before dropping the backup.
restart_and_verify() {
  restart_fxserver
  echo "Waiting for FXServer to come back..."
  sleep 10
  local running
  running=$(ssh_cmd "docker inspect --format=\"{{.State.Running}}\" '$CONTAINER'") || running=""
  if [ "$running" != "true" ]; then
    echo "deploy-live: ALERT — $CONTAINER is not running after restart" >&2
    return 1
  fi
}

if [ $# -eq 0 ]; then
  echo "Restarting FXServer..."
  restart_fxserver
  echo "Done."
  exit 0
fi

RESOURCE="$1"

# RESOURCE becomes remote paths — allow only safe relative paths, no "..".
if [[ ! "$RESOURCE" =~ ^[A-Za-z0-9_./-]+$ ]] || [[ "$RESOURCE" == *".."* ]]; then
  echo "deploy-live: refusing unsafe RESOURCE value: $RESOURCE" >&2
  exit 1
fi

# Must exist locally, otherwise we'd push nothing / delete remote state.
if [ ! -e "$LOCAL_BASE/$RESOURCE" ]; then
  echo "deploy-live: local path not found: $LOCAL_BASE/$RESOURCE" >&2
  exit 1
fi

if [[ "$RESOURCE" == *.* ]]; then
  # Single file: deploy-live.sh aifazi_status/config.lua
  DIR=$(dirname "$RESOURCE")
  REMOTE_DIR="$REMOTE_BASE/$DIR"
  echo "Pushing $RESOURCE → $REMOTE_BASE/$RESOURCE"
  # Atomic upload: stage as .new, then move into place on the remote.
  scp_cmd "$LOCAL_BASE/$RESOURCE" "$VPS_USER@$VPS_HOST:$REMOTE_BASE/$RESOURCE.new"
  ssh_cmd "mv -- '$REMOTE_BASE/$RESOURCE.new' '$REMOTE_BASE/$RESOURCE'"
else
  # Entire folder: deploy-live.sh aifazi_status
  echo "Pushing $LOCAL_BASE/$RESOURCE/ → $REMOTE_BASE/$RESOURCE/"
  # Upload to temp dir first, then swap atomically; keep .bak until healthy.
  scp_cmd "$LOCAL_BASE/$RESOURCE/" "$VPS_USER@$VPS_HOST:$REMOTE_BASE/$RESOURCE.new/"
  ssh_cmd "mv -- '$REMOTE_BASE/$RESOURCE' '$REMOTE_BASE/$RESOURCE.bak' 2>/dev/null || true; mv -- '$REMOTE_BASE/$RESOURCE.new' '$REMOTE_BASE/$RESOURCE'"
fi

echo "Restarting FXServer..."
if ! restart_and_verify; then
  if [[ "$RESOURCE" != *.* ]]; then
    echo "deploy-live: restoring previous version from .bak..." >&2
    ssh_cmd "rm -rf '$REMOTE_BASE/$RESOURCE'; mv -- '$REMOTE_BASE/$RESOURCE.bak' '$REMOTE_BASE/$RESOURCE'; docker restart -- '$CONTAINER'" || true
  fi
  exit 1
fi
# Healthy — only now drop the backup.
if [[ "$RESOURCE" != *.* ]]; then
  ssh_cmd "rm -rf -- '$REMOTE_BASE/$RESOURCE.bak'"
fi
echo "Done."
