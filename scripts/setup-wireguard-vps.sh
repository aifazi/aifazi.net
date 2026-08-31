#!/usr/bin/env bash
# ── aifazi.net — WireGuard Full-Tunnel VPN Setup ─────────────────────────────
# Run this ONCE on your VPS host (Coolify server).
# Installs WireGuard, generates server keys, configures NAT/masquerade,
# enables IP forwarding, and creates the wg0 interface.
#
# Usage: sudo bash scripts/setup-wireguard-vps.sh
# ───────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ─ Config (override via env vars) ──────────────────────────────────────────
WG_INTERFACE="${WG_INTERFACE:-wg0}"
WG_PORT="${WG_PORT:-51820}"
WG_SUBNET="${WG_SUBNET:-10.8.0.0/24}"
WG_SERVER_IP="${WG_SERVER_IP:-10.8.0.1}"
WG_DNS="${WG_DNS:-1.1.1.1}"
WG_CONF_DIR="/etc/wireguard"
WG_CONF_FILE="${WG_CONF_DIR}/${WG_INTERFACE}.conf"

# ── Detect OS ──────────────────────────────────────────────────────────────
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "ERROR: Cannot detect OS"
    exit 1
fi

echo "=== aifazi.net WireGuard Full-Tunnel VPN Setup ==="
echo "OS: $OS"
echo "Interface: $WG_INTERFACE"
echo "Port: $WG_PORT/UDP"
echo "Subnet: $WG_SUBNET"
echo "Server IP: $WG_SERVER_IP"
echo ""

# ── 1. Install WireGuard ─────────────────────────────────────────────────────
echo "[1/6] Installing WireGuard..."
case $OS in
    ubuntu|debian)
        apt-get update
        apt-get install -y wireguard wireguard-tools iptables
        ;;
    centos|rhel|fedora|almalinux|rocky)
        dnf install -y wireguard-tools iptables || yum install -y wireguard-tools iptables
        ;;
    arch)
        pacman -Sy --noconfirm wireguard-tools iptables
        ;;
    *)
        echo "WARNING: Unknown OS ($OS). Install wireguard-tools manually."
        ;;
esac

# ── 2. Enable IP forwarding ──────────────────────────────────────────────────
echo "[2/6] Enabling IP forwarding..."
echo 'net.ipv4.ip_forward=1' > /etc/sysctl.d/99-wireguard.conf
echo 'net.ipv6.conf.all.forwarding=1' >> /etc/sysctl.d/99-wireguard.conf
sysctl --system

# ── 3. Generate server keys ──────────────────────────────────────────────────
echo "[3/6] Generating server WireGuard keys..."
mkdir -p "$WG_CONF_DIR"
chmod 700 "$WG_CONF_DIR"

if [ ! -f "${WG_CONF_DIR}/server_private.key" ]; then
    wg genkey | tee "${WG_CONF_DIR}/server_private.key" | wg pubkey > "${WG_CONF_DIR}/server_public.key"
    chmod 600 "${WG_CONF_DIR}/server_private.key"
    chmod 600 "${WG_CONF_DIR}/server_public.key"
    echo "  Server keys generated."
else
    echo "  Server keys already exist, skipping."
fi

SERVER_PRIV=$(cat "${WG_CONF_DIR}/server_private.key")
SERVER_PUB=$(cat "${WG_CONF_DIR}/server_public.key")

# ── 4. Detect public interface for NAT ───────────────────────────────────────
echo "[4/6] Detecting public network interface..."
PUBLIC_IFACE=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $5; exit}')
if [ -z "$PUBLIC_IFACE" ]; then
    PUBLIC_IFACE=$(ip -o link show up | awk -F': ' '{print $2}' | grep -v lo | head -1)
fi
echo "  Public interface: $PUBLIC_IFACE"

# ── 5. Write WireGuard server config ─────────────────────────────────────────
echo "[5/6] Writing WireGuard server config..."
cat > "$WG_CONF_FILE" <<EOF
[Interface]
PrivateKey = ${SERVER_PRIV}
Address = ${WG_SERVER_IP}/24
ListenPort = ${WG_PORT}
DNS = ${WG_DNS}
SaveConfig = true

# Full-tunnel NAT — masquerade all outbound traffic as VPS public IP
PostUp = iptables -A FORWARD -i ${WG_INTERFACE} -j ACCEPT; iptables -t nat -A POSTROUTING -o ${PUBLIC_IFACE} -j MASQUERADE; ip6tables -A FORWARD -i ${WG_INTERFACE} -j ACCEPT; ip6tables -t nat -A POSTROUTING -o ${PUBLIC_IFACE} -j MASQUERADE
PostDown = iptables -D FORWARD -i ${WG_INTERFACE} -j ACCEPT; iptables -t nat -D POSTROUTING -o ${PUBLIC_IFACE} -j MASQUERADE; ip6tables -D FORWARD -i ${WG_INTERFACE} -j ACCEPT; ip6tables -t nat -D POSTROUTING -o ${PUBLIC_IFACE} -j MASQUERADE
EOF

chmod 600 "$WG_CONF_FILE"

# ─ 6. Enable and start WireGuard ────────────────────────────────────────────
echo "[6/6] Starting WireGuard service..."
systemctl enable wg-quick@${WG_INTERFACE}
systemctl restart wg-quick@${WG_INTERFACE}

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo "=== WireGuard server is running ==="
echo "  Interface: ${WG_INTERFACE}"
echo "  Port: ${WG_PORT}/UDP"
echo "  Subnet: ${WG_SUBNET}"
echo "  Server IP: ${WG_SERVER_IP}"
echo "  Public Key: ${SERVER_PUB}"
echo ""
echo "Next steps:"
echo "  1. Open UDP port ${WG_PORT} in your firewall:"
echo "     ufw allow ${WG_PORT}/udp   # Ubuntu/Debian"
echo "     firewall-cmd --add-port=${WG_PORT}/udp --permanent && firewall-cmd --reload  # CentOS/RHEL"
echo ""
echo "  2. Update your backend Docker config in Coolify:"
echo "     - Add network_mode: host"
echo "     - Add cap_add: [NET_ADMIN, NET_RAW]"
echo ""
echo "  3. Seed the vpn_server table in Supabase with:"
echo "     public_key: ${SERVER_PUB}"
echo "     endpoint_host: $(curl -s ifconfig.me)"
echo "     endpoint_port: ${WG_PORT}"
echo "     subnet: ${WG_SUBNET}"
echo "     server_ip: ${WG_SERVER_IP}"
echo "     dns: ${WG_DNS}"
echo ""
