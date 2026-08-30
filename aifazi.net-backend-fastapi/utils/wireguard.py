"""
utils/wireguard.py — WireGuard server management

Handles key generation, IP allocation, peer CRUD via `wg` commands,
and client config generation. All operations are live (no interface restart).
"""
import asyncio
import base64
import ipaddress
import logging
import os
import subprocess
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
# Live WireGuard management via `wg` CLI
# ---------------------------------------------------------------------------

async def _run(cmd: list[str]) -> tuple[str, str]:
    """Run a shell command asynchronously, return (stdout, stderr)."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate()
    return out.decode().strip(), err.decode().strip()


async def add_peer(
    public_key: str,
    allowed_ips: str,
    preshared_key: str | None = None,
) -> str:
    """Add a peer to the running WireGuard interface (live, no restart)."""
    cmd = ["wg", "set", WG_INTERFACE, "peer", public_key, "allowed-ips", allowed_ips]
    if preshared_key:
        psk_path = Path("/tmp/wg_psk")
        psk_path.write_text(preshared_key)
        psk_path.chmod(0o600)
        cmd += ["preshared-key", str(psk_path)]
    out, err = await _run(cmd)
    if err:
        log.warning("wg set stderr: %s", err)
    # Add route for the peer IP
    ip = allowed_ips.split("/")[0]
    await _run(["ip", "-4", "route", "add", f"{ip}/32", "dev", WG_INTERFACE])
    return out


async def remove_peer(public_key: str, peer_ip: str | None = None) -> None:
    """Remove a peer from the running WireGuard interface."""
    await _run(["wg", "set", WG_INTERFACE, "peer", public_key, "remove"])
    if peer_ip:
        await _run(["ip", "-4", "route", "delete", f"{peer_ip}/32", "dev", WG_INTERFACE])


async def get_peers_dump() -> str:
    """Return raw `wg show` dump output."""
    out, _ = await _run(["wg", "show", WG_INTERFACE, "dump"])
    return out


async def get_server_public_key() -> str | None:
    """Read the server's public key from the WireGuard interface."""
    out, _ = await _run(["wg", "show", WG_INTERFACE, "public-key"])
    return out if out else None


async def parse_peer_stats() -> dict[str, dict]:
    """Parse `wg show <iface> dump` into per-peer stats keyed by public key."""
    dump = await get_peers_dump()
    stats: dict[str, dict] = {}
    if not dump:
        return stats
    for line in dump.splitlines()[1:]:  # skip header (interface line)
        parts = line.split("\t")
        if len(parts) < 9:
            continue
        pubkey = parts[3]
        transfer_rx = int(parts[5]) if parts[5] else 0
        transfer_tx = int(parts[6]) if parts[6] else 0
        latest_handshake = int(parts[7]) if parts[7] else 0
        stats[pubkey] = {
            "transfer_rx": transfer_rx,
            "transfer_tx": transfer_tx,
            "latest_handshake": latest_handshake,
        }
    return stats


async def is_interface_up() -> bool:
    """Check if the WireGuard interface exists and is up."""
    out, _ = await _run(["wg", "show", WG_INTERFACE])
    return bool(out)


def find_free_ip(used_ips: set[str], subnet: str = WG_SUBNET, server_ip: str = WG_SERVER_IP) -> str:
    """Find the first unused IP in the subnet. Raises ValueError if pool exhausted."""
    for ip in _allocatable_ips(subnet, server_ip):
        if ip not in used_ips:
            return ip
    raise ValueError("No free IPs available in the VPN subnet")
