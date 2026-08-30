"""
utils/wireguard.py — WireGuard server management via pyroute2

Uses pyroute2's generic netlink interface to communicate directly with the
WireGuard kernel module. No `wg` binary or `wireguard-tools` package needed.
Only requires NET_ADMIN capability on the container.
"""
import asyncio
import base64
import ipaddress
import logging
import os
import struct
import threading
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

# Lock for thread-safe pyroute2 operations (it's not async-native)
_wg_lock = threading.Lock()


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
# WireGuard management via pyroute2 (netlink to kernel module)
# ---------------------------------------------------------------------------

def _get_wg():
    """Get a WireGuard netlink socket."""
    from pyroute2 import WireGuard
    return WireGuard()


def _get_ipr():
    """Get an IPRoute socket for routing operations."""
    from pyroute2 import IPRoute
    return IPRoute()


def _wg_set_peer_sync(
    public_key: str,
    allowed_ips: str,
    preshared_key: str | None = None,
) -> None:
    """Add a peer to the WireGuard interface (synchronous, runs in thread)."""
    with _wg_lock:
        wg = _get_wg()
        try:
            peer_attrs = {
                "public_key": base64.b64decode(public_key),
                "allowed_ips": [
                    {"family": 2, "cidr": int(cidr)}
                    for cidr in allowed_ips.split(",")
                    for _, cidr in [cidr.strip().split("/")]
                ],
            }
            if preshared_key:
                peer_attrs["preshared_key"] = base64.b64decode(preshared_key)

            wg.set_device(WG_INTERFACE, peer=peer_attrs)
            log.info("WireGuard peer added: %s", public_key[:12] + "...")
        finally:
            wg.close()


def _wg_remove_peer_sync(public_key: str) -> None:
    """Remove a peer from the WireGuard interface (synchronous)."""
    with _wg_lock:
        wg = _get_wg()
        try:
            # Remove peer by setting it with zero allowed IPs (remove action)
            wg.set_device(
                WG_INTERFACE,
                peer={"public_key": base64.b64decode(public_key), "remove": True},
            )
            log.info("WireGuard peer removed: %s", public_key[:12] + "...")
        finally:
            wg.close()


def _wg_get_device_sync() -> dict:
    """Get WireGuard device info (synchronous)."""
    with _wg_lock:
        wg = _get_wg()
        try:
            devices = wg.get_device(WG_INTERFACE)
            return devices[0] if devices else {}
        finally:
            wg.close()


def _ip_route_add_sync(dest: str, dev: str) -> None:
    """Add an IP route (synchronous)."""
    with _wg_lock:
        ipr = _get_ipr()
        try:
            ipr.route(
                "add",
                dst=dest,
                oif=ipr.link_lookup(ifname=dev)[0],
            )
        except Exception:
            pass  # Route may already exist
        finally:
            ipr.close()


def _ip_route_del_sync(dest: str, dev: str) -> None:
    """Delete an IP route (synchronous)."""
    with _wg_lock:
        ipr = _get_ipr()
        try:
            ipr.route(
                "del",
                dst=dest,
                oif=ipr.link_lookup(ifname=dev)[0],
            )
        except Exception:
            pass  # Route may not exist
        finally:
            ipr.close()


async def add_peer(
    public_key: str,
    allowed_ips: str,
    preshared_key: str | None = None,
) -> str:
    """Add a peer to the running WireGuard interface (live, no restart)."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None, _wg_set_peer_sync, public_key, allowed_ips, preshared_key
    )
    # Add route for the peer IP
    ip = allowed_ips.split("/")[0]
    try:
        await loop.run_in_executor(None, _ip_route_add_sync, f"{ip}/32", WG_INTERFACE)
    except Exception:
        pass
    return ""


async def remove_peer(public_key: str, peer_ip: str | None = None) -> None:
    """Remove a peer from the running WireGuard interface."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _wg_remove_peer_sync, public_key)
    if peer_ip:
        try:
            await loop.run_in_executor(
                None, _ip_route_del_sync, f"{peer_ip}/32", WG_INTERFACE
            )
        except Exception:
            pass


async def get_peers_dump() -> str:
    """Return peer data from the WireGuard interface via pyroute2."""
    loop = asyncio.get_event_loop()
    device = await loop.run_in_executor(None, _wg_get_device_sync)
    if not device:
        return ""
    # Format similar to `wg show dump` for compatibility
    peers = device.get("peers", [])
    lines = [f"{WG_INTERFACE}\t{device.get('public_key', '')}\t{device.get('listen_port', 0)}"]
    for p in peers:
        lines.append(
            f"{WG_INTERFACE}\t\t{p.get('public_key', '')}\t"
            f"{p.get('persistent_keepalive', 0)}\t"
            f"{p.get('endpoint', {}).get('address', '')}\t"
            f"{p.get('transfer_rx', 0)}\t{p.get('transfer_tx', 0)}\t"
            f"{p.get('last_handshake', 0)}\t"
        )
    return "\n".join(lines)


async def get_server_public_key() -> str | None:
    """Read the server's public key from the WireGuard interface."""
    loop = asyncio.get_event_loop()
    device = await loop.run_in_executor(None, _wg_get_device_sync)
    if not device:
        return None
    pk = device.get("public_key")
    if pk and isinstance(pk, bytes):
        return base64.b64encode(pk).decode()
    return pk


async def parse_peer_stats() -> dict[str, dict]:
    """Get per-peer stats from the WireGuard interface via pyroute2."""
    loop = asyncio.get_event_loop()
    device = await loop.run_in_executor(None, _wg_get_device_sync)
    stats: dict[str, dict] = {}
    if not device:
        return stats
    for p in device.get("peers", []):
        pk = p.get("public_key")
        if pk and isinstance(pk, bytes):
            pk = base64.b64encode(pk).decode()
        if pk:
            stats[pk] = {
                "transfer_rx": p.get("transfer_rx", 0),
                "transfer_tx": p.get("transfer_tx", 0),
                "latest_handshake": p.get("last_handshake", 0),
            }
    return stats


async def is_interface_up() -> bool:
    """Check if the WireGuard interface exists and is up."""
    try:
        loop = asyncio.get_event_loop()
        device = await loop.run_in_executor(None, _wg_get_device_sync)
        return bool(device)
    except Exception:
        return False


def find_free_ip(used_ips: set[str], subnet: str = WG_SUBNET, server_ip: str = WG_SERVER_IP) -> str:
    """Find the first unused IP in the subnet. Raises ValueError if pool exhausted."""
    for ip in _allocatable_ips(subnet, server_ip):
        if ip not in used_ips:
            return ip
    raise ValueError("No free IPs available in the VPN subnet")
