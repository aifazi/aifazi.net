#!/usr/bin/env bash
# ── WireGuard Full-Tunnel Init Script ───────────────────────────────────────
# Runs inside the backend container at startup. Creates the wg0 interface,
# enables IP forwarding, and sets up NAT masquerade so all client traffic
# exits with the container's (host's) public IP.
#
# Requires: NET_ADMIN, SYS_ADMIN capabilities (already set in Coolify).
# ────────────────────────────────────────────────────────────────────────────

set -euo pipefail

WG_INTERFACE="${WG_INTERFACE:-wg0}"
WG_PORT="${WG_PORT:-51820}"
WG_SUBNET="${WG_SUBNET:-10.8.0.0/24}"
WG_SERVER_IP="${WG_SERVER_IP:-10.8.0.1}"
WG_DNS="${WG_DNS:-1.1.1.1}"

# Read server private key from env or generate + persist to /data
WG_PRIV_KEY="${WG_SERVER_PRIVATE_KEY:-}"
WG_DATA_DIR="/data/wireguard"
mkdir -p "$WG_DATA_DIR"

if [ -z "$WG_PRIV_KEY" ]; then
    KEY_FILE="${WG_DATA_DIR}/server_private.key"
    if [ -f "$KEY_FILE" ]; then
        WG_PRIV_KEY=$(cat "$KEY_FILE")
        echo "[wireguard] Loaded existing server private key"
    else
        WG_PRIV_KEY=$(wg genkey)
        echo "$WG_PRIV_KEY" > "$KEY_FILE"
        chmod 600 "$KEY_FILE"
        echo "[wireguard] Generated new server private key"
    fi
fi

# Derive public key
WG_PUB_KEY=$(echo "$WG_PRIV_KEY" | wg pubkey)
echo "[wireguard] Server Public Key: $WG_PUB_KEY"

# Detect public interface for NAT
PUBLIC_IFACE=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $5; exit}')
if [ -z "$PUBLIC_IFACE" ]; then
    PUBLIC_IFACE=$(ip -o link show up | awk -F': ' '{print $2}' | grep -v lo | head -1)
fi
echo "[wireguard] Public interface: $PUBLIC_IFACE"

# Enable IP forwarding
echo 1 > /proc/sys/net/ipv4/ip_forward
echo 1 > /proc/sys/net/ipv6/conf/all/forwarding 2>/dev/null || true

# Remove existing interface if present
wg-quick down "$WG_INTERFACE" 2>/dev/null || true

# Write config
cat > "/etc/wireguard/${WG_INTERFACE}.conf" <<EOF
[Interface]
PrivateKey = ${WG_PRIV_KEY}
Address = ${WG_SERVER_IP}/24
ListenPort = ${WG_PORT}
DNS = ${WG_DNS}
SaveConfig = true

PostUp = iptables -A FORWARD -i ${WG_INTERFACE} -j ACCEPT; iptables -t nat -A POSTROUTING -o ${PUBLIC_IFACE} -j MASQUERADE; ip6tables -A FORWARD -i ${WG_INTERFACE} -j ACCEPT; ip6tables -t nat -A POSTROUTING -o ${PUBLIC_IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i ${WG_INTERFACE} -j ACCEPT; iptables -t nat -D POSTROUTING -o ${PUBLIC_IFACE} -j MASQUERADE; ip6tables -D FORWARD -i ${WG_INTERFACE} -j ACCEPT; ip6tables -t nat -D POSTROUTING -o ${PUBLIC_IFACE} -j MASQUERADE
EOF

chmod 600 "/etc/wireguard/${WG_INTERFACE}.conf"

# Bring up the interface
wg-quick up "$WG_INTERFACE"
echo "[wireguard] Interface ${WG_INTERFACE} is up on port ${WG_PORT}/UDP"

# Print config for seeding the database
echo "[wireguard] SEED_DATA:pub_key=${WG_PUB_KEY}"
echo "[wireguard] SEED_DATA:endpoint_port=${WG_PORT}"
echo "[wireguard] SEED_DATA:subnet=${WG_SUBNET}"
echo "[wireguard] SEED_DATA:server_ip=${WG_SERVER_IP}"
echo "[wireguard] SEED_DATA:dns=${WG_DNS}"
