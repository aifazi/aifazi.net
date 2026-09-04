#!/usr/bin/env bash
# ── WireGuard Init Script ──────────────────────────────────────────────────
# Detects host WireGuard via the management API on port 51821.
# WireGuard runs on the VPS host, NOT inside this container.
# ────────────────────────────────────────────────────────────────────────────

set -euo pipefail

WG_API_URL="${WG_API_URL:-http://10.0.1.1:51821}"
WG_PORT="${WG_PORT:-51820}"

echo "[wireguard] Probing host WireGuard API at ${WG_API_URL}..."

# Try the host management API (token required since the 2026-09-04 lockdown)
AUTH_ARGS=()
if [ -n "${WG_API_TOKEN:-}" ]; then
    AUTH_ARGS=(-H "X-WG-Token: ${WG_API_TOKEN}")
fi
if API_RESPONSE=$(curl -sf --connect-timeout 3 "${AUTH_ARGS[@]}" "${WG_API_URL}/status" 2>/dev/null); then
    echo "[wireguard] Host WireGuard API is reachable."
    echo "$API_RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data.get('running'):
    print('[wireguard] WireGuard is RUNNING on the host.')
    # Extract and display public key from output
    for line in data.get('output', '').splitlines():
        if 'public key:' in line:
            pub = line.split('public key:')[1].strip()
            print(f'[wireguard] Server Public Key: {pub}')
        elif 'listening port:' in line:
            port = line.split('listening port:')[1].strip()
            print(f'[wireguard] Listening on port: {port}/UDP')
        elif line.strip().startswith('peer:'):
            pk = line.split('peer:')[1].strip()
            print(f'[wireguard] Peer: {pk[:12]}...')
else:
    print('[wireguard] WireGuard is NOT running on the host!')
    sys.exit(1)
" 2>/dev/null || echo "[wireguard] Could not parse API response."
else
    echo "[wireguard] WARNING: Could not reach host WireGuard API."
    echo "[wireguard] VPN management will not work until the host API is available."
fi

echo "[wireguard] Init complete (host-mode)."
