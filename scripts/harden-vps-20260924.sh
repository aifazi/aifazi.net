#!/bin/bash
# harden-vps-20260924.sh — apply live audit fixes (idempotent)
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M%S)
echo "=== harden start $STAMP ==="

# ── 1. SSH: neutralize cloud-init password auth ─────────────────────────────
CFG=/etc/ssh/sshd_config.d/50-cloud-init.conf
if [ -f "$CFG" ] && ! grep -q '^PasswordAuthentication no' "$CFG"; then
  cp -a "$CFG" "$CFG.bak.$STAMP"
  printf 'PasswordAuthentication no\nPermitRootLogin prohibit-password\n' > "$CFG"
  echo "updated $CFG"
fi
sshd -t
systemctl reload ssh
echo "sshd -T:"
sshd -T | grep -E 'permitrootlogin|passwordauthentication|pubkeyauthentication'

# ── 2. WireGuard: SaveConfig must stay false (protect PostUp) ──────────────
WGC=/etc/wireguard/wg0.conf
if grep -q '^SaveConfig = true' "$WGC"; then
  cp -a "$WGC" "$WGC.bak.$STAMP"
  sed -i 's/^SaveConfig = true/SaveConfig = false/' "$WGC"
  echo "wg0.conf SaveConfig -> false"
fi
grep -n '^SaveConfig' "$WGC" || true
wg show wg0 | head -2 || true

# ── 3. Firewall: explicit allows then default-deny INPUT ───────────────────
# Safety: never remove ESTABLISHED/lo/SSH. Insert idempotent rules.

ipt() { iptables "$@"; }

# Ensure SSH is explicitly allowed FIRST (before any DROP/policy change)
if ! ipt -C INPUT -p tcp --dport 22 -j ACCEPT 2>/dev/null; then
  ipt -I INPUT 1 -p tcp --dport 22 -m conntrack --ctstate NEW,ESTABLISHED -j ACCEPT
  echo "inserted SSH ACCEPT"
fi
if ! ipt -C INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null; then
  ipt -I INPUT 1 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  echo "inserted ESTABLISHED ACCEPT"
fi
if ! ipt -C INPUT -i lo -j ACCEPT 2>/dev/null; then
  ipt -I INPUT 1 -i lo -j ACCEPT
  echo "inserted lo ACCEPT"
fi

# WireGuard UDP
if ! ipt -C INPUT -p udp --dport 51820 -j ACCEPT 2>/dev/null; then
  ipt -A INPUT -p udp --dport 51820 -j ACCEPT
  echo "inserted WG 51820 ACCEPT"
fi

# Mail (Stalwart) — intentional public
for p in 25 465 587 143 993 110 995 4190; do
  if ! ipt -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null; then
    ipt -A INPUT -p tcp --dport $p -j ACCEPT
    echo "inserted mail $p ACCEPT"
  fi
done

# TURN already has dedicated rules; ensure 3478 stays
if ! ipt -C INPUT -p tcp --dport 3478 -j ACCEPT 2>/dev/null; then
  ipt -A INPUT -p tcp --dport 3478 -j ACCEPT
fi
if ! ipt -C INPUT -p udp --dport 3478 -j ACCEPT 2>/dev/null; then
  ipt -A INPUT -p udp --dport 3478 -j ACCEPT
fi

# DROP public Coolify realtime (6001/6002) — after private ACCEPTs already exist
if ! ipt -C INPUT -p tcp -m multiport --dports 6001,6002 -j DROP 2>/dev/null; then
  # Prefer: allow RFC1918/lo first if not already, then drop the rest
  if ! ipt -C INPUT -p tcp -m multiport --dports 6001,6002 -s 127.0.0.1 -j ACCEPT 2>/dev/null; then
    ipt -I INPUT -p tcp -m multiport --dports 6001,6002 -s 127.0.0.1 -j ACCEPT
    ipt -I INPUT -p tcp -m multiport --dports 6001,6002 -s 10.0.0.0/8 -j ACCEPT
    ipt -I INPUT -p tcp -m multiport --dports 6001,6002 -s 172.16.0.0/12 -j ACCEPT
    ipt -I INPUT -p tcp -m multiport --dports 6001,6002 -s 192.168.0.0/16 -j ACCEPT
  fi
  ipt -A INPUT -p tcp -m multiport --dports 6001,6002 -j DROP
  echo "inserted 6001/6002 public DROP"
fi

# Final default: DROP anything else
# Keep policy DROP only if SSH allow is present (checked above)
ipt -P INPUT DROP
echo "INPUT policy -> DROP"

# IPv6: if ip6tables exists, at least ensure SSH stays open
if command -v ip6tables >/dev/null 2>&1; then
  if ! ip6tables -C INPUT -p tcp --dport 22 -j ACCEPT 2>/dev/null; then
    ip6tables -I INPUT 1 -p tcp --dport 22 -m conntrack --ctstate NEW,ESTABLISHED -j ACCEPT
  fi
  if ! ip6tables -C INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null; then
    ip6tables -I INPUT 1 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  fi
  if ! ip6tables -C INPUT -i lo -j ACCEPT 2>/dev/null; then
    ip6tables -I INPUT 1 -i lo -j ACCEPT
  fi
  ip6tables -P INPUT DROP
  echo "ip6tables INPUT policy -> DROP"
fi

# ── 4. Persist if netfilter-persistent available ───────────────────────────
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save
  echo "persisted via netfilter-persistent"
elif [ -d /etc/iptables ]; then
  iptables-save > /etc/iptables/rules.v4
  command -v ip6tables-save >/dev/null && ip6tables-save > /etc/iptables/rules.v6 || true
  echo "persisted to /etc/iptables/rules.v4"
else
  echo "WARN: no netfilter-persistent — rules are runtime only"
fi

echo "=== harden done ==="
echo "VERIFY: new SSH session must still work before disconnecting this one."
