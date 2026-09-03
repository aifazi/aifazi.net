"""
routers/vpn.py — WireGuard VPN peer management API

Provides endpoints to list, create, delete, and rotate WireGuard peers.
All endpoints require authentication. Peers are managed live via `wg set`.
"""
import asyncio
import base64
import io
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from database import supabase
from dependencies import get_current_user, require_staff
from utils.wireguard import (
    WG_DNS,
    WG_ENDPOINT,
    WG_MTU,
    WG_PORT,
    WG_SERVER_IP,
    WG_SUBNET,
    add_peer,
    find_free_ip,
    generate_client_config,
    generate_keypair,
    generate_preshared_key,
    get_peers_dump,
    get_server_public_key,
    is_interface_up,
    parse_peer_stats,
    remove_peer,
)

log = logging.getLogger("vpn")
router = APIRouter()


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class PeerCreate(BaseModel):
    device_name: str
    device_os: str = ""  # ios, android, windows, macos, linux


class PeerResponse(BaseModel):
    id: str
    device_name: str
    device_os: str
    allocated_ip: str
    status: str
    created_at: str
    transfer_rx: int = 0
    transfer_tx: int = 0
    connected: bool = False


class QRResponse(BaseModel):
    config: str
    qr_code: str  # base64-encoded PNG


class StatsResponse(BaseModel):
    peers: list[PeerResponse]
    total_rx: int
    total_tx: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_user_id(user: dict) -> str:
    return user.get("id") or user.get("sub")


def _get_user_peers(user_id: str) -> list[dict]:
    res = (
        supabase.table("vpn_peers")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at")
        .execute()
    )
    return res.data or []


def _get_peer_by_id(peer_id: str, user_id: str) -> dict | None:
    res = (
        supabase.table("vpn_peers")
        .select("*")
        .eq("id", peer_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    data = res.data or []
    return data[0] if data else None


def _get_all_allocated_ips() -> set[str]:
    res = supabase.table("vpn_peers").select("allocated_ip").execute()
    return {r["allocated_ip"] for r in (res.data or [])}


def _get_server_config() -> dict:
    res = supabase.table("vpn_server").select("*").limit(1).execute()
    data = res.data or []
    return data[0] if data else {}


async def _require_server_pub() -> str:
    """Return the stripped server public key, or fail loudly.

    A malformed key (e.g. with stray whitespace from a hand-edited DB row)
    must 503 here — never flow into a client config that strict parsers
    reject on import. WireGuard Curve25519 keys are always 44 base64 chars.
    """
    server = _get_server_config()
    pub = (server.get("public_key") or await get_server_public_key() or "").strip()
    if len(pub) != 44:
        log.error("WireGuard server public key missing or malformed in DB")
        raise HTTPException(503, "WireGuard server public key not available")
    return pub


_HANDSHAKE_UNIT_SECONDS = {
    "second": 1, "seconds": 1,
    "minute": 60, "minutes": 60,
    "hour": 3600, "hours": 3600,
    "day": 86400, "days": 86400,
    "week": 604800, "weeks": 604800,
}

# A peer counts as connected if its last handshake is fresher than this.
CONNECTED_HANDSHAKE_MAX_AGE_S = 180


def _handshake_age_seconds(hs: str | None) -> float | None:
    """Parse `wg show` handshake strings like "38 minutes, 8 seconds ago".

    Returns the age in seconds, or None for "(none)"/empty/unparseable.
    """
    if not hs:
        return None
    s = hs.strip().lower()
    if s in ("(none)", "none", "never"):
        return None
    import re
    total = 0.0
    found = False
    for amount, unit in re.findall(r"(\d+(?:\.\d+)?)\s*([a-z]+)", s):
        mult = _HANDSHAKE_UNIT_SECONDS.get(unit)
        if mult is None:
            continue
        total += float(amount) * mult
        found = True
    return total if found else None


def _is_connected(hs: str | None) -> bool:
    age = _handshake_age_seconds(hs)
    return age is not None and age < CONNECTED_HANDSHAKE_MAX_AGE_S


def _sync_sessions_from_handshakes(peers: list[dict]) -> None:
    """Best-effort session tracking driven by live handshake state.

    The WireGuard app connects externally, so the backend never sees an
    explicit "connect" event. When a peer's handshake is fresh and it has no
    open session row, open one; when the handshake goes stale, close any open
    session with the latest counters. Failures must never break the caller.
    Each item in `peers` needs: id, user_id, transfer_rx, transfer_tx,
    latest_handshake, endpoint.
    """
    try:
        open_res = (
            supabase.table("vpn_sessions")
            .select("id,peer_id")
            .is_("disconnected_at", "null")
            .execute()
        )
        open_by_peer = {r["peer_id"]: r["id"] for r in (open_res.data or [])}
    except Exception as e:
        log.warning("session sync: failed to list open sessions: %s", e)
        return
    now = datetime.now(timezone.utc).isoformat()
    for p in peers:
        try:
            peer_id = p["id"]
            connected = _is_connected(p.get("latest_handshake"))
            open_id = open_by_peer.get(peer_id)
            if connected and not open_id:
                endpoint = (p.get("endpoint") or "").split(":")[0]
                supabase.table("vpn_sessions").insert({
                    "id": str(uuid.uuid4()),
                    "peer_id": peer_id,
                    "user_id": p.get("user_id", ""),
                    "connected_at": now,
                    "client_public_ip": endpoint,
                }).execute()
            elif not connected and open_id:
                supabase.table("vpn_sessions").update({
                    "disconnected_at": now,
                    "bytes_rx": p.get("transfer_rx", 0),
                    "bytes_tx": p.get("transfer_tx", 0),
                }).eq("id", open_id).execute()
        except Exception as e:
            log.warning("session sync: peer %s failed: %s", p.get("id"), e)


def _generate_qr_base64(config_text: str) -> str:
    """Generate QR code as base64-encoded PNG."""
    try:
        import qrcode as qr_lib
    except ImportError:
        return ""
    qr = qr_lib.QRCode(version=1, error_correction=qr_lib.constants.ERROR_CORRECT_L)
    qr.add_data(config_text)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/status")
async def vpn_status(user: dict = Depends(get_current_user)):
    """Check if the WireGuard server is running."""
    up = await is_interface_up()
    server_pub = await get_server_public_key()
    return {
        "server_running": up,
        "server_public_key": server_pub,
        "endpoint": f"{WG_ENDPOINT}:{WG_PORT}",
        "subnet": WG_SUBNET,
    }


@router.get("/peers")
async def list_peers(user: dict = Depends(get_current_user)):
    """List all VPN devices/peers belonging to the authenticated user."""
    user_id = _get_user_id(user)
    peers = _get_user_peers(user_id)

    # Enrich with live stats
    wg_stats = await parse_peer_stats()
    result = []
    for p in peers:
        stats = wg_stats.get(p["public_key"], {})
        hs_str = stats.get("latest_handshake", "")
        connected = _is_connected(hs_str)
        result.append({
            "id": p["id"],
            "device_name": p["device_name"],
            "device_os": p.get("device_os", ""),
            "allocated_ip": p["allocated_ip"],
            "status": p.get("status", "active"),
            "created_at": p.get("created_at", ""),
            "transfer_rx": stats.get("transfer_rx", 0),
            "transfer_tx": stats.get("transfer_tx", 0),
            "connected": connected,
        })
    return {"peers": result}


@router.post("/peers")
async def create_peer(body: PeerCreate, user: dict = Depends(get_current_user)):
    """Create a new WireGuard peer (VPN device) and return its config + QR."""
    user_id = _get_user_id(user)

    # Check device limit (max 5 per user)
    existing = _get_user_peers(user_id)
    if len(existing) >= 5:
        raise HTTPException(400, "Device limit reached (max 5)")

    # Check WireGuard is running
    if not await is_interface_up():
        raise HTTPException(503, "WireGuard server is not running")

    # Get or create server config
    server_pub = await _require_server_pub()

    # Generate keys
    client_priv, client_pub = generate_keypair()
    psk = generate_preshared_key()

    # Allocate IP + insert with retries: two concurrent creates could read the
    # same free IP, so a unique-violation on allocated_ip re-reads and retries
    # instead of failing or double-allocating.
    peer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    allocated_ip = ""
    for attempt in range(3):
        used_ips = _get_all_allocated_ips()
        allocated_ip = find_free_ip(used_ips)
        try:
            supabase.table("vpn_peers").insert({
                "id": peer_id,
                "user_id": user_id,
                "public_key": client_pub,
                "private_key": client_priv,  # encrypted at rest via Supabase column encryption
                "preshared_key": psk,
                "allocated_ip": allocated_ip,
                "device_name": body.device_name,
                "device_os": body.device_os,
                "status": "active",
                "created_at": now,
            }).execute()
            break
        except Exception as e:
            msg = str(e).lower()
            if ("unique" in msg or "duplicate" in msg or "23505" in msg) and attempt < 2:
                log.warning("create_peer: IP %s raced, retrying (%d/3)", allocated_ip, attempt + 1)
                continue
            raise

    # Add peer to WireGuard (live). On failure, roll back the DB row so a
    # device that can never connect doesn't linger in the peer list.
    try:
        await add_peer(
            public_key=client_pub,
            allowed_ips=f"{allocated_ip}/32",
            preshared_key=psk,
        )
    except Exception as e:
        log.error("create_peer: WireGuard add failed, rolling back %s: %s", peer_id, e)
        try:
            supabase.table("vpn_peers").delete().eq("id", peer_id).execute()
        except Exception:
            pass
        raise HTTPException(503, "WireGuard server is not reachable")

    # Generate client config
    config = generate_client_config(
        client_private_key=client_priv,
        client_address=allocated_ip,
        server_public_key=server_pub,
        preshared_key=psk,
    )

    qr_b64 = _generate_qr_base64(config)

    return {
        "id": peer_id,
        "device_name": body.device_name,
        "allocated_ip": allocated_ip,
        "config": config,
        "qr_code": f"data:image/png;base64,{qr_b64}" if qr_b64 else "",
        "status": "active",
    }


@router.get("/peers/{peer_id}")
async def get_peer(
    peer_id: str,
    format: str = "json",
    user: dict = Depends(get_current_user),
):
    """Get peer details. Use ?format=qr for QR code image, ?format=conf for config file."""
    user_id = _get_user_id(user)
    peer = _get_peer_by_id(peer_id, user_id)
    if not peer:
        raise HTTPException(404, "Peer not found")

    server_pub = await _require_server_pub()

    config = generate_client_config(
        client_private_key=peer["private_key"],
        client_address=peer["allocated_ip"],
        server_public_key=server_pub,
        preshared_key=peer.get("preshared_key"),
    )

    if format == "conf":
        safe_name = peer["device_name"].encode("ascii", "ignore").decode().strip()
        return Response(
            content=config,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.conf"'},
        )

    if format == "qr":
        try:
            import qrcode as qr_lib
            qr = qr_lib.QRCode(version=1, error_correction=qr_lib.constants.ERROR_CORRECT_L)
            qr.add_data(config)
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            return Response(content=buf.getvalue(), media_type="image/png")
        except Exception:
            raise HTTPException(500, "QR code generation failed")

    return {
        "id": peer["id"],
        "device_name": peer["device_name"],
        "device_os": peer.get("device_os", ""),
        "allocated_ip": peer["allocated_ip"],
        "status": peer.get("status", "active"),
        "created_at": peer.get("created_at", ""),
    }


@router.delete("/peers/{peer_id}")
async def delete_peer(peer_id: str, user: dict = Depends(get_current_user)):
    """Delete a VPN peer and release its IP."""
    user_id = _get_user_id(user)
    peer = _get_peer_by_id(peer_id, user_id)
    if not peer:
        raise HTTPException(404, "Peer not found")

    # Remove from WireGuard
    await remove_peer(peer["public_key"], peer["allocated_ip"])

    # Delete from database
    supabase.table("vpn_peers").delete().eq("id", peer_id).execute()

    return {"message": "Peer deleted", "id": peer_id}


@router.post("/peers/{peer_id}/rotate")
async def rotate_keys(peer_id: str, user: dict = Depends(get_current_user)):
    """Rotate a peer's WireGuard keypair. Returns new config + QR."""
    user_id = _get_user_id(user)
    peer = _get_peer_by_id(peer_id, user_id)
    if not peer:
        raise HTTPException(404, "Peer not found")

    server_pub = await _require_server_pub()

    # Remove old peer from WireGuard
    await remove_peer(peer["public_key"], peer["allocated_ip"])

    # Generate new keys
    new_priv, new_pub = generate_keypair()
    new_psk = generate_preshared_key()

    # Add new peer to WireGuard (same IP)
    await add_peer(
        public_key=new_pub,
        allowed_ips=f"{peer['allocated_ip']}/32",
        preshared_key=new_psk,
    )

    # Update database
    supabase.table("vpn_peers").update({
        "private_key": new_priv,
        "public_key": new_pub,
        "preshared_key": new_psk,
    }).eq("id", peer_id).execute()

    # Generate new config
    config = generate_client_config(
        client_private_key=new_priv,
        client_address=peer["allocated_ip"],
        server_public_key=server_pub,
        preshared_key=new_psk,
    )

    qr_b64 = _generate_qr_base64(config)

    return {
        "id": peer_id,
        "config": config,
        "qr_code": f"data:image/png;base64,{qr_b64}" if qr_b64 else "",
    }


@router.get("/stats")
async def get_stats(user: dict = Depends(get_current_user)):
    """Get traffic statistics for all user's peers."""
    user_id = _get_user_id(user)
    peers = _get_user_peers(user_id)
    wg_stats = await parse_peer_stats()

    total_rx = 0
    total_tx = 0
    result = []
    for p in peers:
        stats = wg_stats.get(p["public_key"], {})
        rx = stats.get("transfer_rx", 0)
        tx = stats.get("transfer_tx", 0)
        total_rx += rx
        total_tx += tx
        hs_str = stats.get("latest_handshake", "")
        connected = _is_connected(hs_str)
        result.append({
            "id": p["id"],
            "device_name": p["device_name"],
            "allocated_ip": p["allocated_ip"],
            "transfer_rx": rx,
            "transfer_tx": tx,
            "connected": connected,
        })

    return {"peers": result, "total_rx": total_rx, "total_tx": total_tx}


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@router.get("/admin/all-peers")
async def admin_list_all_peers(_: dict = Depends(require_staff)):
    """List all VPN peers across all users (admin/staff only)."""
    res = supabase.table("vpn_peers").select("*").order("created_at", desc=True).execute()
    peers = res.data or []

    # Enrich with live WireGuard stats
    wg_stats = await parse_peer_stats()
    result = []
    for p in peers:
        stats = wg_stats.get(p.get("public_key", ""), {})
        rx = stats.get("transfer_rx", 0)
        tx = stats.get("transfer_tx", 0)
        hs_str = stats.get("latest_handshake", "")
        connected = _is_connected(hs_str)
        result.append({
            "id": p["id"],
            "user_id": p.get("user_id", ""),
            "device_name": p.get("device_name", ""),
            "device_os": p.get("device_os", ""),
            "allocated_ip": p.get("allocated_ip", ""),
            "public_key": p.get("public_key", ""),
            "status": p.get("status", "active"),
            "created_at": p.get("created_at", ""),
            "transfer_rx": rx,
            "transfer_tx": tx,
            "connected": connected,
            "latest_handshake": hs_str,
            "endpoint": stats.get("endpoint", ""),
        })

    # Best-effort: derive session rows from live handshake state so the
    # Sessions tab reflects real connect/disconnect activity.
    _sync_sessions_from_handshakes(result)

    return {"peers": result, "total": len(result)}


@router.delete("/admin/peers/{peer_id}")
async def admin_delete_peer(peer_id: str, _: dict = Depends(require_staff)):
    """Delete any VPN peer (staff only). The user-scoped DELETE endpoint
    only removes the caller's own peers, so the admin panel needs this."""
    res = (
        supabase.table("vpn_peers")
        .select("*")
        .eq("id", peer_id)
        .limit(1)
        .execute()
    )
    data = res.data or []
    if not data:
        raise HTTPException(404, "Peer not found")
    peer = data[0]

    # Remove from WireGuard (best-effort: keep DB consistent even if WG fails)
    try:
        await remove_peer(peer["public_key"], peer["allocated_ip"])
    except Exception as e:
        log.warning("admin delete: WireGuard removal failed for %s: %s", peer_id, e)

    # Close any open sessions, then delete the peer
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("vpn_sessions").update({
        "disconnected_at": now,
    }).eq("peer_id", peer_id).is_("disconnected_at", "null").execute()
    supabase.table("vpn_peers").delete().eq("id", peer_id).execute()

    return {"message": "Peer deleted", "id": peer_id}


@router.get("/admin/sessions")
async def admin_list_all_sessions(_: dict = Depends(require_staff)):
    """List all VPN sessions across all users (admin/staff only)."""
    res = (
        supabase.table("vpn_sessions")
        .select("*, vpn_peers(device_name, user_id)")
        .order("connected_at", desc=True)
        .limit(200)
        .execute()
    )
    sessions = res.data or []
    result = []
    for s in sessions:
        peer = s.get("vpn_peers") or {}
        result.append({
            "id": s.get("id", ""),
            "peer_id": s.get("peer_id", ""),
            "device_name": peer.get("device_name", ""),
            "user_id": peer.get("user_id", ""),
            "client_public_ip": s.get("client_public_ip", ""),
            "connected_at": s.get("connected_at", ""),
            "disconnected_at": s.get("disconnected_at"),
        })
    return {"sessions": result}


# ---------------------------------------------------------------------------
# Session tracking
# ---------------------------------------------------------------------------

class SessionCreate(BaseModel):
    peer_id: str
    client_public_ip: str = ""


class SessionResponse(BaseModel):
    id: str
    peer_id: str
    device_name: str
    connected_at: str
    disconnected_at: str | None = None
    client_public_ip: str
    bytes_rx: int = 0
    bytes_tx: int = 0


@router.post("/sessions")
async def start_session(body: SessionCreate, user: dict = Depends(get_current_user)):
    """Log a new VPN connection session."""
    user_id = _get_user_id(user)
    peer = _get_peer_by_id(body.peer_id, user_id)
    if not peer:
        raise HTTPException(404, "Peer not found")

    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("vpn_sessions").insert({
        "id": session_id,
        "peer_id": body.peer_id,
        "user_id": user_id,
        "connected_at": now,
        "client_public_ip": body.client_public_ip or "",
    }).execute()

    # Update peer's last_connected_at
    supabase.table("vpn_peers").update({
        "last_connected_at": now,
    }).eq("id", body.peer_id).execute()

    return {"id": session_id, "connected_at": now}


@router.post("/sessions/{session_id}/end")
async def end_session(session_id: str, user: dict = Depends(get_current_user)):
    """Log the end of a VPN session with final byte counts."""
    user_id = _get_user_id(user)

    res = (
        supabase.table("vpn_sessions")
        .select("*")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    data = res.data or []
    if not data:
        raise HTTPException(404, "Session not found")

    session = data[0]
    peer = _get_peer_by_id(session["peer_id"], user_id)
    wg_stats = await parse_peer_stats()
    stats = wg_stats.get(peer["public_key"], {}) if peer else {}

    now = datetime.now(timezone.utc).isoformat()
    supabase.table("vpn_sessions").update({
        "disconnected_at": now,
        "bytes_rx": stats.get("transfer_rx", 0),
        "bytes_tx": stats.get("transfer_tx", 0),
    }).eq("id", session_id).execute()

    return {"id": session_id, "disconnected_at": now}


@router.get("/sessions")
async def list_sessions(
    limit: int = 20,
    offset: int = 0,
    user: dict = Depends(get_current_user),
):
    """Get connection history for the authenticated user."""
    user_id = _get_user_id(user)
    res = (
        supabase.table("vpn_sessions")
        .select("*, vpn_peers(device_name)")
        .eq("user_id", user_id)
        .order("connected_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    sessions = []
    for s in (res.data or []):
        sessions.append({
            "id": s["id"],
            "peer_id": s["peer_id"],
            "device_name": s.get("vpn_peers", {}).get("device_name", "Unknown"),
            "connected_at": s.get("connected_at", ""),
            "disconnected_at": s.get("disconnected_at"),
            "client_public_ip": s.get("client_public_ip", ""),
            "bytes_rx": s.get("bytes_rx", 0),
            "bytes_tx": s.get("bytes_tx", 0),
        })
    return {"sessions": sessions}


@router.get("/public-ip")
async def get_public_ip(user: dict = Depends(get_current_user)):
    """Return the VPS public IP — what clients see when connected to the VPN."""
    import urllib.request
    import json
    try:
        resp = await asyncio.to_thread(
            urllib.request.urlopen, "https://api.ipify.org?format=json", timeout=5
        )
        data = json.loads(resp.read())
        return {"ip": data.get("ip", WG_ENDPOINT)}
    except Exception:
        return {"ip": WG_ENDPOINT}
