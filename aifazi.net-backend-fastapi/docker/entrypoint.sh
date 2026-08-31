#!/usr/bin/env bash
# ── Backend Container Entrypoint ─────────────────────────────────────────────
# 1. Optionally initialize WireGuard VPN (requires NET_ADMIN capability)
# 2. Drop privileges to the 'app' user
# 3. Start uvicorn
# ────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# WireGuard init — skip if explicitly disabled or running without caps
if [ "${WG_ENABLED:-true}" = "true" ] && [ "$(id -u)" = "0" ]; then
    echo "[entrypoint] Initializing WireGuard..."
    /usr/local/bin/init-wireguard.sh || echo "[entrypoint] WARNING: WireGuard init failed (non-fatal)"
fi

# Drop to app user and start uvicorn
echo "[entrypoint] Starting uvicorn as app user..."
exec gosu app uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
