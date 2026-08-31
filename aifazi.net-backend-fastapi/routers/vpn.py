"""
routers/vpn.py — WireGuard VPN peer management API

Provides endpoints to list, create, delete, and rotate WireGuard peers.
All endpoints require authentication. Peers are managed live via `wg set`.
"""
import base64
import io
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from database import supabase
from dependencies import get_current_user
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
        hs = stats.get("latest_handshake", 0)
        connected = (datetime.now(timezone.utc).timestamp() - hs) < 180 if hs else False
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
    server = _get_server_config()
    server_pub = server.get("public_key") or await get_server_public_key()
    if not server_pub:
        raise HTTPException(503, "WireGuard server public key not available")

    # Generate keys
    client_priv, client_pub = generate_keypair()
    psk = generate_preshared_key()

    # Allocate IP
    used_ips = _get_all_allocated_ips()
    allocated_ip = find_free_ip(used_ips)

    # Add peer to WireGuard (live)
    await add_peer(
        public_key=client_pub,
        allowed_ips=f"{allocated_ip}/32",
        preshared_key=psk,
    )

    # Store in database
    peer_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
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

    server = _get_server_config()
    server_pub = server.get("public_key") or await get_server_public_key()

    config = generate_client_config(
        client_private_key=peer["private_key"],
        client_address=peer["allocated_ip"],
        server_public_key=server_pub,
        preshared_key=peer.get("preshared_key"),
    )

    if format == "conf":
        return Response(
            content=config,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{peer["device_name"]}.conf"'},
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

    server = _get_server_config()
    server_pub = server.get("public_key") or await get_server_public_key()

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
        hs = stats.get("latest_handshake", 0)
        connected = (datetime.now(timezone.utc).timestamp() - hs) < 180 if hs else False
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
