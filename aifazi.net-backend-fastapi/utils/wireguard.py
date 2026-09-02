"""
utils/wireguard.py — WireGuard server management via host API

Calls the WireGuard Management API running on the host (port 51821)
to manage WireGuard peers. The backend container cannot access the host's
WireGuard interface directly, so we use this HTTP API instead.
"""
import asyncio
import base64
import ipaddress
import json
import logging
import os
import urllib.request
import urllib.error
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey

log = logging.getLogger("wireguard")

WG_INTERFACE = os.getenv("WG_INTERFACE", "wg0")
WG_SUBNET = os.getenv("WG_SUBNET", "10.8.0.0/24")
WG_SERVER_IP = os.getenv("WG_SERVER_IP", "10.8.0.1")
WG_ENDPOINT = os.getenv("WG_ENDPOINT", "75.119.131.157")
WG_PORT = int(os.getenv("WG_PORT", "51820"))
WG_DNS = os.getenv("WG_DNS", "1.1.1.1,1.0.0.1")
WG_MTU = int(os.getenv("WG_MTU", "1420"))

# Host WireGuard Management API
# The container reaches the host via the Docker gateway (usually 10.0.1.1)
WG_API_URL = os.getenv("WG_API_URL", "http://10.0.1.1:51821")


def _clamped_private_key() -> bytes:
    """Generate 32 random bytes clamped for Curve25519."""
    key = bytearray(os.urandom(32))
    key[0] &= 248
    key[31] &= 127
    key[31] |= 64
    return bytes(key)


def generate_keypair() -> tuple[str, str]:
    """Generate a WireGuard private/public key pair (base64-encoded)."""
    raw_priv = _clamped_private_key()
    priv_key = X25519PrivateKey._from_private_bytes(raw_priv)
    pub_key = priv_key.public_key()

    priv_b64 = base64.b64encode(raw_priv).decode()
    pub_b64 = base64.b64encode(
        pub_key.public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw
        )
    ).decode()
    return priv_b64, pub_b64


def generate_preshared_key() -> str:
    """Generate a 32-byte preshared key (base64-encoded)."""
    return base64.b64encode(os.urandom(32)).decode()


def generate_client_config(
    client_private_key: str,
    client_address: str,
    server_public_key: str,
    preshared_key: str | None = None,
    endpoint: str | None = None,
    dns: str | None = None,
    mtu: int | None = None,
) -> str:
    """Build a wg-quick config string for a client."""
    ep = endpoint or f"{WG_ENDPOINT}:{WG_PORT}"
    dns_val = dns or WG_DNS
    mtu_val = mtu or WG_MTU

    lines = [
        "[Interface]",
        f"PrivateKey = {client_private_key}",
        f"Address = {client_address}/32",
        f"DNS = {dns_val}",
        f"MTU = {mtu_val}",
        "",
        "[Peer]",
        f"PublicKey = {server_public_key}",
    ]
    if preshared_key:
        lines.append(f"PresharedKey = {preshared_key}")
    lines += [
        "AllowedIPs = 0.0.0.0/0, ::/0",
        f"Endpoint = {ep}",
        "PersistentKeepalive = 25",
    ]
    return "\n".join(lines) + "\n"


def _allocatable_ips(subnet: str, server_ip: str) -> list[str]:
    """Return all usable host IPs in the subnet, excluding the server IP."""
    net = ipaddress.ip_network(subnet, strict=False)
    return [str(ip) for ip in net.hosts() if str(ip) != server_ip]


# ---------------------------------------------------------------------------
# WireGuard management via host API
# ---------------------------------------------------------------------------

def _call_wg_api(endpoint: str, method: str = "GET", data: dict | None = None) -> dict:
    """Call the WireGuard Management API on the host."""
    url = f"{WG_API_URL}{endpoint}"
    try:
        if method == "GET":
            req = urllib.request.Request(url)
        else:
            req = urllib.request.Request(
                url,
                data=json.dumps(data).encode() if data else None,
                headers={"Content-Type": "application/json"},
                method=method,
            )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        log.error("WireGuard API call failed: %s", e)
        raise


async def is_interface_up() -> bool:
    """Check if the WireGuard interface exists and is up."""
    try:
        result = await asyncio.to_thread(_call_wg_api, "/status")
        return result.get("running", False)
    except Exception:
        return False


async def get_server_public_key() -> str | None:
    """Get the server's public key from WireGuard."""
    try:
        result = await asyncio.to_thread(_call_wg_api, "/status")
        if result.get("running"):
            # Parse public key from output
            for line in result.get("output", "").split("\n"):
                if "public key:" in line:
                    return line.split("public key:")[1].strip()
        return None
    except Exception:
        return None


async def add_peer(
    public_key: str,
    allowed_ips: str,
    preshared_key: str | None = None,
) -> str:
    """Add a peer to the WireGuard interface."""
    try:
        data = {
            "public_key": public_key,
            "allowed_ips": allowed_ips,
        }
        if preshared_key:
            data["preshared_key"] = preshared_key
        result = await asyncio.to_thread(_call_wg_api, "/peers", "POST", data)
        if result.get("success"):
            log.info("WireGuard peer added: %s", public_key[:12] + "...")
        return ""
    except Exception as e:
        log.error("Failed to add peer: %s", e)
        raise


async def remove_peer(public_key: str, peer_ip: str | None = None) -> None:
    """Remove a peer from the WireGuard interface."""
    try:
        data = {"public_key": public_key, "remove": True}
        result = await asyncio.to_thread(_call_wg_api, "/peers", "POST", data)
        if result.get("success"):
            log.info("WireGuard peer removed: %s", public_key[:12] + "...")
    except Exception as e:
        log.error("Failed to remove peer: %s", e)
        raise


async def get_peers_dump() -> str:
    """Get peer data from the WireGuard interface."""
    try:
        result = await asyncio.to_thread(_call_wg_api, "/status")
        return result.get("output", "")
    except Exception:
        return ""


async def parse_peer_stats() -> dict[str, dict]:
    """Get per-peer stats from the WireGuard interface."""
    stats: dict[str, dict] = {}
    try:
        output = await get_peers_dump()
        # Parse wg show output
        current_peer = None
        for line in output.split("\n"):
            if line.startswith("peer:"):
                current_peer = line.split("peer:")[1].strip()
                stats[current_peer] = {}
            elif current_peer and "transfer:" in line:
                parts = line.split("transfer:")
                if len(parts) > 1:
                    rx_tx = parts[1].strip().split(",")
                    if len(rx_tx) == 2:
                        stats[current_peer]["transfer_rx"] = int(rx_tx[0].strip().split()[0])
                        stats[current_peer]["transfer_tx"] = int(rx_tx[1].strip().split()[0])
            elif current_peer and "latest handshake:" in line:
                parts = line.split("latest handshake:")
                if len(parts) > 1:
                    stats[current_peer]["latest_handshake"] = parts[1].strip()
    except Exception:
        pass
    return stats


def find_free_ip(used_ips: set[str], subnet: str = WG_SUBNET, server_ip: str = WG_SERVER_IP) -> str:
    """Find the first unused IP in the subnet. Raises ValueError if pool exhausted."""
    for ip in _allocatable_ips(subnet, server_ip):
        if ip not in used_ips:
            return ip
    raise ValueError("No free IPs available in the VPN subnet")
