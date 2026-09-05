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
from datetime import datetime, timedelta, timezone

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
    decrypt_peer_secret,
    encrypt_peer_secret,
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
    expires_in_hours: int | None = None  # guest peer: auto-removed after N hours


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


def _month_key(now: datetime) -> str:
    return now.strftime("%Y-%m")


def _month_start_iso(now: datetime) -> str:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()


def _month_usage_bytes(peer_id: str, month_start_iso: str) -> int:
    """Closed-session traffic for a peer since the month started.

    Open sessions report 0 bytes until they close, so quota enforcement lags
    live traffic by at most one sync tick — acceptable for monthly caps.
    """
    try:
        res = (
            supabase.table("vpn_sessions")
            .select("bytes_rx,bytes_tx")
            .eq("peer_id", peer_id)
            .gte("connected_at", month_start_iso)
            .limit(5000)
            .execute()
        )
    except Exception:
        return 0
    total = 0
    for s in (res.data or []):
        try:
            total += int(s.get("bytes_rx") or 0) + int(s.get("bytes_tx") or 0)
        except (TypeError, ValueError):
            continue
    return total


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


async def _sync_core(db_peers: list[dict], wg_stats: dict, now: datetime) -> tuple[list[dict], list[dict]]:
    """Reconcile DB peers with live WireGuard state.

    Handles, per peer: session open/close from handshake freshness, monthly
    quota accounting (warn once per cycle, suspend, auto-restore on rollover),
    guest expiry, and suspended-peer enforcement (a suspended peer that
    reappears on the host is removed again).

    Returns (events, views). Events drive alert mails; views are the
    unredacted display rows for the admin endpoint. Failures are per-peer
    and best-effort — they never break the caller.
    """
    now_iso = now.isoformat()
    month = _month_key(now)
    month_start = _month_start_iso(now)
    events: list[dict] = []
    views: list[dict] = []

    try:
        open_res = (
            supabase.table("vpn_sessions")
            .select("id,peer_id,connected_at")
            .is_("disconnected_at", "null")
            .execute()
        )
        open_by_peer = {r["peer_id"]: r for r in (open_res.data or [])}
    except Exception as e:
        log.warning("vpn sync: failed to list open sessions: %s", e)
        open_by_peer = {}

    for p in db_peers:
        try:
            peer_id = p["id"]
            stats = wg_stats.get(p.get("public_key", ""), {})
            rx = stats.get("transfer_rx", 0)
            tx = stats.get("transfer_tx", 0)
            if not isinstance(rx, (int, float)):
                rx = 0
            if not isinstance(tx, (int, float)):
                tx = 0
            hs = stats.get("latest_handshake", "")
            if not isinstance(hs, str):
                hs = ""
            endpoint = stats.get("endpoint", "") or ""
            connected = _is_connected(hs)
            status = p.get("status", "active")
            view = {
                "id": peer_id,
                "user_id": p.get("user_id", ""),
                "device_name": p.get("device_name", ""),
                "device_os": p.get("device_os", ""),
                "allocated_ip": p.get("allocated_ip", ""),
                "public_key": p.get("public_key", ""),
                "status": status,
                "created_at": p.get("created_at", ""),
                "transfer_rx": rx,
                "transfer_tx": tx,
                "connected": connected,
                "latest_handshake": hs,
                "endpoint": endpoint,
                "quota_bytes": p.get("quota_bytes"),
                "expires_at": p.get("expires_at"),
                "notify_events": bool(p.get("notify_events")),
            }

            # --- Guest expiry ------------------------------------------------
            exp = _parse_iso(p.get("expires_at"))
            if exp is not None and now >= exp and status != "expired":
                try:
                    await remove_peer(p.get("public_key", ""), p.get("allocated_ip", ""))
                except Exception as e:
                    log.warning("vpn sync: WG removal failed on expiry for %s: %s", peer_id, e)
                supabase.table("vpn_peers").update({
                    "status": "expired",
                }).eq("id", peer_id).execute()
                view["status"] = "expired"
                events.append({"type": "expired", "peer": dict(view), "user_id": p.get("user_id", "")})
                views.append(view)
                continue

            # --- Suspended peers must stay off the host ----------------------
            if status == "suspended":
                if connected:
                    # Reappeared (manual wg add?) — remove again.
                    try:
                        await remove_peer(p.get("public_key", ""), p.get("allocated_ip", ""))
                    except Exception as e:
                        log.warning("vpn sync: WG removal failed for suspended %s: %s", peer_id, e)
                    connected = False
                    view["connected"] = False
                # Quota auto-restore on month rollover (usage sums reset).
                if p.get("suspended_reason") == "quota":
                    usage = _month_usage_bytes(peer_id, month_start)
                    if p.get("quota_bytes") and usage < int(p["quota_bytes"]):
                        try:
                            peer_psk = decrypt_peer_secret(p.get("preshared_key"))
                        except Exception:
                            peer_psk = None
                        try:
                            await add_peer(
                                public_key=p.get("public_key", ""),
                                allowed_ips=f"{p.get('allocated_ip', '')}/32",
                                preshared_key=peer_psk,
                            )
                            supabase.table("vpn_peers").update({
                                "status": "active",
                                "suspended_reason": None,
                                "quota_warned_month": None,
                            }).eq("id", peer_id).execute()
                            view["status"] = "active"
                            events.append({"type": "quota_restored", "peer": dict(view),
                                           "user_id": p.get("user_id", "")})
                        except Exception as e:
                            log.warning("vpn sync: WG restore failed for %s: %s", peer_id, e)
                views.append(view)
                # Suspended peers don't open sessions.
                _close_if_open(peer_id, open_by_peer, now_iso, rx, tx)
                continue

            # --- Monthly quota ------------------------------------------------
            quota = p.get("quota_bytes")
            try:
                quota = int(quota) if quota is not None else None
            except (TypeError, ValueError):
                quota = None
            if quota:
                usage = _month_usage_bytes(peer_id, month_start)
                view["usage_month_rx_tx"] = usage
                if usage >= quota:
                    try:
                        await remove_peer(p.get("public_key", ""), p.get("allocated_ip", ""))
                    except Exception as e:
                        log.warning("vpn sync: WG removal failed on quota for %s: %s", peer_id, e)
                    supabase.table("vpn_peers").update({
                        "status": "suspended",
                        "suspended_reason": "quota",
                    }).eq("id", peer_id).execute()
                    view["status"] = "suspended"
                    view["connected"] = False
                    events.append({"type": "quota_suspended", "peer": dict(view),
                                   "user_id": p.get("user_id", ""), "usage": usage, "quota": quota})
                    views.append(view)
                    _close_if_open(peer_id, open_by_peer, now_iso, rx, tx)
                    continue
                if usage >= int(quota * 0.8) and p.get("quota_warned_month") != month:
                    supabase.table("vpn_peers").update({
                        "quota_warned_month": month,
                    }).eq("id", peer_id).execute()
                    events.append({"type": "quota_warned", "peer": dict(view),
                                   "user_id": p.get("user_id", ""), "usage": usage, "quota": quota})

            # --- Session open/close ------------------------------------------
            open_row = open_by_peer.get(peer_id)
            if connected and not open_row:
                endpoint_ip = endpoint.split(":")[0]
                supabase.table("vpn_sessions").insert({
                    "id": str(uuid.uuid4()),
                    "peer_id": peer_id,
                    "user_id": p.get("user_id", ""),
                    "connected_at": now_iso,
                    "client_public_ip": endpoint_ip,
                }).execute()
                events.append({"type": "connected", "peer": dict(view),
                               "user_id": p.get("user_id", ""), "endpoint_ip": endpoint_ip})
            elif not connected and open_row:
                supabase.table("vpn_sessions").update({
                    "disconnected_at": now_iso,
                    "bytes_rx": rx,
                    "bytes_tx": tx,
                }).eq("id", open_row["id"]).execute()
                events.append({"type": "disconnected", "peer": dict(view),
                               "user_id": p.get("user_id", ""),
                               "connected_at": open_row.get("connected_at"),
                               "bytes_rx": rx, "bytes_tx": tx})
            views.append(view)
        except Exception as e:
            log.warning("vpn sync: peer %s failed: %s", p.get("id"), e)
            views.append({
                "id": p.get("id", ""), "user_id": "", "device_name": p.get("device_name", ""),
                "device_os": p.get("device_os", ""), "allocated_ip": p.get("allocated_ip", ""),
                "public_key": p.get("public_key", ""), "status": p.get("status", "active"),
                "created_at": p.get("created_at", ""), "transfer_rx": 0, "transfer_tx": 0,
                "connected": False, "latest_handshake": "", "endpoint": "",
                "quota_bytes": p.get("quota_bytes"), "expires_at": p.get("expires_at"),
                "notify_events": bool(p.get("notify_events")),
            })
    return events, views


def _close_if_open(peer_id: str, open_by_peer: dict, now_iso: str, rx: int, tx: int) -> None:
    open_row = open_by_peer.get(peer_id)
    if not open_row:
        return
    try:
        supabase.table("vpn_sessions").update({
            "disconnected_at": now_iso,
            "bytes_rx": rx,
            "bytes_tx": tx,
        }).eq("id", open_row["id"]).execute()
    except Exception as e:
        log.warning("vpn sync: session close failed for %s: %s", peer_id, e)


def _vpn_alert_content(event: dict, username: str) -> tuple[str, str] | None:
    """Subject + HTML body for a VPN event, or None to skip silently.

    Connect/disconnect mails only go to peers opted in via `notify_events`
    (tunnels flap on mobile networks — unfiltered they'd spam). Quota and
    expiry mails always send: they change what the account may do.
    Very short sessions (<60s, no traffic) never mail on disconnect.
    """
    peer = event.get("peer") or {}
    name = peer.get("device_name", "VPN device")
    etype = event.get("type")
    if etype in ("connected", "disconnected") and not peer.get("notify_events"):
        return None
    if etype == "connected":
        ep = event.get("endpoint_ip") or "unknown address"
        return (
            f"VPN connected: {name}",
            f"<p>Hi {username or 'there'},</p>"
            f"<p>Your VPN device <strong>{name}</strong> just connected "
            f"from <code>{ep}</code>.</p>"
            f"<p>If this wasn't you, remove the device immediately.</p>",
        )
    if etype == "disconnected":
        try:
            started = _parse_iso(event.get("connected_at"))
            dur_s = (datetime.now(timezone.utc) - started).total_seconds() if started else 0
        except Exception:
            dur_s = 0
        moved = int(event.get("bytes_rx") or 0) + int(event.get("bytes_tx") or 0)
        if dur_s < 60 and moved == 0:
            return None
        mins = int(dur_s // 60)
        return (
            f"VPN disconnected: {name}",
            f"<p>Hi {username or 'there'},</p>"
            f"<p>Your VPN device <strong>{name}</strong> disconnected after "
            f"about {mins} minute(s).</p>",
        )
    if etype == "quota_warned":
        return (
            f"VPN data warning: {name}",
            f"<p>Hi {username or 'there'},</p>"
            f"<p>Your VPN device <strong>{name}</strong> used "
            f"{_fmt_mb(event.get('usage', 0))} of its "
            f"{_fmt_mb(event.get('quota', 0))} monthly quota (80%+).</p>",
        )
    if etype == "quota_suspended":
        return (
            f"VPN suspended: {name}",
            f"<p>Hi {username or 'there'},</p>"
            f"<p>Your VPN device <strong>{name}</strong> hit its monthly "
            f"quota ({_fmt_mb(event.get('quota', 0))}) and was suspended. "
            f"It resumes automatically next month.</p>",
        )
    if etype == "quota_restored":
        return (
            f"VPN restored: {name}",
            f"<p>Hi {username or 'there'},</p>"
            f"<p>Your VPN device <strong>{name}</strong> is active again "
            f"for the new month.</p>",
        )
    if etype == "expired":
        return (
            f"VPN guest access expired: {name}",
            f"<p>Hi {username or 'there'},</p>"
            f"<p>Guest VPN access for <strong>{name}</strong> has expired "
            f"and the device was removed.</p>",
        )
    return None


def _fmt_mb(n) -> str:
    try:
        return f"{float(n or 0) / (1024 * 1024):.1f} MB"
    except (TypeError, ValueError):
        return "0.0 MB"


async def _dispatch_vpn_alerts(events: list[dict]) -> None:
    """Mail alert content for sync events. Best-effort, never raises."""
    if not events:
        return
    try:
        from utils.email_queue import queue_email
    except Exception as e:
        log.warning("vpn alerts: email queue unavailable: %s", e)
        return
    try:
        user_ids = list({e.get("user_id") for e in events if e.get("user_id")})
        owners: dict[str, dict] = {}
        if user_ids:
            res = supabase.table("users").select("id,email,username").in_("id", user_ids).execute()
            for r in (res.data or []):
                owners[r["id"]] = r
    except Exception as e:
        log.warning("vpn alerts: owner lookup failed: %s", e)
        return
    for e in events:
        try:
            owner = owners.get(e.get("user_id", ""), {})
            to = (owner.get("email") or "").strip()
            if not to:
                continue
            content = _vpn_alert_content(e, owner.get("username", ""))
            if not content:
                continue
            subject, html = content
            await queue_email(to=to, subject=subject, html=html, purpose="vpn_alert")
        except Exception as ex:
            log.warning("vpn alerts: event %s failed: %s", e.get("type"), ex)


async def vpn_maintenance_tick() -> dict:
    """Hourly (scheduler) + on-demand reconciliation pass.

    Loads all peers + live stats, runs the sync core, and dispatches alert
    mails. Returns a small summary. Never raises.
    """
    try:
        res = supabase.table("vpn_peers").select("*").execute()
        peers = res.data or []
        wg_stats = await parse_peer_stats()
        events, _views = await _sync_core(peers, wg_stats, datetime.now(timezone.utc))
        await _dispatch_vpn_alerts(events)
        return {"peers": len(peers), "events": [e.get("type") for e in events]}
    except Exception as e:
        log.warning("vpn maintenance tick failed: %s", e)
        return {"peers": 0, "events": [], "error": str(e)[:200]}


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
        # Per-peer guard: one corrupt row or unexpected WG line must degrade
        # to safe defaults, never 500 the whole list (cf. Sep-2026
        # float-vs-str handshake outage on these endpoints).
        try:
            stats = wg_stats.get(p["public_key"], {})
            hs_str = stats.get("latest_handshake", "")
            connected = _is_connected(hs_str)
            rx = stats.get("transfer_rx", 0)
            tx = stats.get("transfer_tx", 0)
            result.append({
                "id": p["id"],
                "device_name": p["device_name"],
                "device_os": p.get("device_os", ""),
                "allocated_ip": p["allocated_ip"],
                "status": p.get("status", "active"),
                "created_at": p.get("created_at", ""),
                "transfer_rx": rx if isinstance(rx, (int, float)) else 0,
                "transfer_tx": tx if isinstance(tx, (int, float)) else 0,
                "connected": bool(connected),
            })
        except Exception as e:
            log.warning("list_peers: skipping corrupt peer %s: %s", p.get("id"), e)
            result.append({
                "id": p.get("id", ""),
                "device_name": p.get("device_name", ""),
                "device_os": p.get("device_os", ""),
                "allocated_ip": p.get("allocated_ip", ""),
                "status": p.get("status", "active"),
                "created_at": p.get("created_at", ""),
                "transfer_rx": 0,
                "transfer_tx": 0,
                "connected": False,
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

    # Encrypt client secrets before storage — a DB row read must never
    # yield a usable tunnel identity on its own. Fail closed when the
    # encryption secret is unavailable.
    try:
        stored_priv = encrypt_peer_secret(client_priv)
        stored_psk = encrypt_peer_secret(psk)
    except RuntimeError as e:
        raise HTTPException(503, str(e))

    # Guest peers expire automatically (sync enforces + mails on expiry).
    expires_at = None
    if body.expires_in_hours is not None:
        try:
            hours = max(1, min(int(body.expires_in_hours), 720))
        except (TypeError, ValueError):
            raise HTTPException(400, "expires_in_hours must be 1..720")
        expires_at = (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()

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
                "private_key": stored_priv,  # Fernet enc1: (see utils/wireguard)
                "preshared_key": stored_psk,
                "allocated_ip": allocated_ip,
                "device_name": body.device_name,
                "device_os": body.device_os,
                "status": "active",
                "created_at": now,
                "expires_at": expires_at,
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
        "expires_at": expires_at,
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

    try:
        client_priv = decrypt_peer_secret(peer["private_key"])
        peer_psk = decrypt_peer_secret(peer.get("preshared_key"))
    except RuntimeError as e:
        raise HTTPException(503, str(e))

    # Lazy migration: rows created before at-rest encryption carry plaintext.
    # Upgrade them to enc1: on first successful read (best-effort).
    try:
        updates = {}
        if peer.get("private_key") and not str(peer["private_key"]).startswith("enc1:"):
            updates["private_key"] = encrypt_peer_secret(client_priv)
        if peer.get("preshared_key") and not str(peer.get("preshared_key")).startswith("enc1:"):
            updates["preshared_key"] = encrypt_peer_secret(peer_psk)
        if updates:
            supabase.table("vpn_peers").update(updates).eq("id", peer_id).execute()
    except Exception as e:
        log.warning("get_peer: at-rest upgrade failed for %s: %s", peer_id, e)

    config = generate_client_config(
        client_private_key=client_priv,
        client_address=peer["allocated_ip"],
        server_public_key=server_pub,
        preshared_key=peer_psk,
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


class PeerUpdate(BaseModel):
    device_name: str | None = None
    device_os: str | None = None
    notify_events: bool | None = None


@router.patch("/peers/{peer_id}")
async def update_peer(peer_id: str, body: PeerUpdate, user: dict = Depends(get_current_user)):
    """Rename a peer, correct its OS tag, toggle connect alerts. Scoped to the caller's peers."""
    user_id = _get_user_id(user)
    peer = _get_peer_by_id(peer_id, user_id)
    if not peer:
        raise HTTPException(404, "Peer not found")
    updates: dict = {}
    if body.device_name is not None:
        name = body.device_name.strip()[:64]
        if not name:
            raise HTTPException(400, "Device name cannot be empty")
        updates["device_name"] = name
    if body.device_os is not None:
        updates["device_os"] = body.device_os.strip()[:32]
    if body.notify_events is not None:
        updates["notify_events"] = bool(body.notify_events)
    if not updates:
        raise HTTPException(400, "Nothing to update")
    supabase.table("vpn_peers").update(updates).eq("id", peer_id).execute()
    return {"id": peer_id, **updates}


@router.post("/peers/{peer_id}/rotate")
async def rotate_keys(peer_id: str, user: dict = Depends(get_current_user)):
    """Rotate a peer's WireGuard keypair. Returns new config + QR.

    Owners rotate their own peers; staff (e.g. from the admin panel's
    one-click reissue) may rotate any peer.
    """
    from permissions import STAFF_ROLES
    user_id = _get_user_id(user)
    peer = _get_peer_by_id(peer_id, user_id)
    if not peer and str(user.get("role", "")).lower() in STAFF_ROLES:
        res = (
            supabase.table("vpn_peers")
            .select("*")
            .eq("id", peer_id)
            .limit(1)
            .execute()
        )
        peer = (res.data or [None])[0]
    if not peer:
        raise HTTPException(404, "Peer not found")

    server_pub = await _require_server_pub()

    # Remove old peer from WireGuard
    await remove_peer(peer["public_key"], peer["allocated_ip"])

    # Generate new keys
    new_priv, new_pub = generate_keypair()
    new_psk = generate_preshared_key()
    try:
        stored_priv = encrypt_peer_secret(new_priv)
        stored_psk = encrypt_peer_secret(new_psk)
    except RuntimeError as e:
        raise HTTPException(503, str(e))

    # Add new peer to WireGuard (same IP)
    await add_peer(
        public_key=new_pub,
        allowed_ips=f"{peer['allocated_ip']}/32",
        preshared_key=new_psk,
    )

    # Update database (rotating also upgrades legacy plaintext rows to enc1:)
    supabase.table("vpn_peers").update({
        "private_key": stored_priv,
        "public_key": new_pub,
        "preshared_key": stored_psk,
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
        # Same per-peer guard as list_peers: degrade, never 500 the list.
        try:
            stats = wg_stats.get(p["public_key"], {})
            rx = stats.get("transfer_rx", 0)
            tx = stats.get("transfer_tx", 0)
            if not isinstance(rx, (int, float)):
                rx = 0
            if not isinstance(tx, (int, float)):
                tx = 0
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
                "connected": bool(connected),
            })
        except Exception as e:
            log.warning("get_stats: skipping corrupt peer %s: %s", p.get("id"), e)
            result.append({
                "id": p.get("id", ""),
                "device_name": p.get("device_name", ""),
                "allocated_ip": p.get("allocated_ip", ""),
                "transfer_rx": 0,
                "transfer_tx": 0,
                "connected": False,
            })

    return {"peers": result, "total_rx": total_rx, "total_tx": total_tx}


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@router.get("/admin/all-peers")
async def admin_list_all_peers(user: dict = Depends(require_staff)):
    """List all VPN peers across all users (admin/staff only).

    Non-admin staff get operational fields only — user_ids and live
    endpoint IPs are admin-only (cross-user PII).
    """
    is_admin = user.get("role") == "admin"
    res = supabase.table("vpn_peers").select("*").order("created_at", desc=True).execute()
    peers = res.data or []

    # Reconcile + enrich via the shared sync core (sessions, quota, expiry).
    # Runs on the full rows (needs real user_ids) BEFORE display redaction.
    wg_stats = await parse_peer_stats()
    events, result = await _sync_core(peers, wg_stats, datetime.now(timezone.utc))
    await _dispatch_vpn_alerts(events)

    if not is_admin:
        for p in result:
            p["user_id"] = ""
            p["endpoint"] = ""

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


class AdminPeerUpdate(BaseModel):
    device_name: str | None = None
    status: str | None = None  # active | suspended (manual)
    quota_bytes: int | None = None  # null clears; 0 also clears
    expires_at: str | None = None  # ISO timestamp, "" clears
    notify_events: bool | None = None
    extend_hours: int | None = None  # shift expires_at forward (guest extend)


@router.patch("/admin/peers/{peer_id}")
async def admin_update_peer(peer_id: str, body: AdminPeerUpdate, _: dict = Depends(require_staff)):
    """Manage any peer: rename, suspend/unsuspend, quota, expiry, alerts."""
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
    updates: dict = {}
    if body.device_name is not None:
        name = body.device_name.strip()[:64]
        if not name:
            raise HTTPException(400, "Device name cannot be empty")
        updates["device_name"] = name
    if body.status is not None:
        if body.status not in ("active", "suspended"):
            raise HTTPException(400, "status must be active|suspended")
        updates["status"] = body.status
        updates["suspended_reason"] = "manual" if body.status == "suspended" else None
        if body.status == "active":
            updates["quota_warned_month"] = None
    if body.quota_bytes is not None:
        try:
            q = int(body.quota_bytes)
        except (TypeError, ValueError):
            raise HTTPException(400, "quota_bytes must be a number")
        updates["quota_bytes"] = q if q > 0 else None
        if q <= 0:
            updates["quota_warned_month"] = None
    if body.expires_at is not None:
        exp_raw = (body.expires_at or "").strip()
        if not exp_raw:
            updates["expires_at"] = None
        else:
            exp = _parse_iso(exp_raw)
            if exp is None:
                raise HTTPException(400, "expires_at must be an ISO timestamp")
            updates["expires_at"] = exp.isoformat()
    if body.extend_hours is not None:
        try:
            hours = max(1, min(int(body.extend_hours), 720))
        except (TypeError, ValueError):
            raise HTTPException(400, "extend_hours must be 1..720")
        base = _parse_iso(peer.get("expires_at")) or datetime.now(timezone.utc)
        if base.tzinfo is None:
            base = base.replace(tzinfo=timezone.utc)
        anchor = max(base, datetime.now(timezone.utc))
        updates["expires_at"] = (anchor + timedelta(hours=hours)).isoformat()
        if peer.get("status") == "expired":
            updates["status"] = "active"
    if body.notify_events is not None:
        updates["notify_events"] = bool(body.notify_events)
    if not updates:
        raise HTTPException(400, "Nothing to update")

    # Suspend takes effect immediately on the host; unsuspend re-adds.
    if updates.get("status") == "suspended":
        try:
            await remove_peer(peer["public_key"], peer["allocated_ip"])
        except Exception as e:
            log.warning("admin update: WG removal failed for %s: %s", peer_id, e)
    if updates.get("status") == "active" and peer.get("status") != "active":
        try:
            psk = decrypt_peer_secret(peer.get("preshared_key"))
        except Exception:
            psk = None
        try:
            await add_peer(
                public_key=peer["public_key"],
                allowed_ips=f"{peer['allocated_ip']}/32",
                preshared_key=psk,
            )
        except Exception as e:
            log.warning("admin update: WG re-add failed for %s: %s", peer_id, e)

    supabase.table("vpn_peers").update(updates).eq("id", peer_id).execute()
    return {"id": peer_id, **updates}


@router.get("/admin/activity")
async def admin_activity(
    days: int = 7,
    peer_id: str | None = None,
    _: dict = Depends(require_staff),
):
    """Per-day VPN activity for the Monitor tab: sessions + bytes.

    `days` clamped to 1..30. Bytes come from closed sessions (open ones
    report 0 until they close); session counts are exact regardless.
    Optional `peer_id` scopes the chart to a single device.
    """
    days = max(1, min(days, 30))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    q = (
        supabase.table("vpn_sessions")
        .select("connected_at,bytes_rx,bytes_tx")
        .gte("connected_at", cutoff)
    )
    if peer_id:
        q = q.eq("peer_id", peer_id)
    res = (
        q.order("connected_at")
        .limit(5000)
        .execute()
    )
    buckets: dict[str, dict] = {}
    for s in (res.data or []):
        day = str(s.get("connected_at", ""))[:10] or "unknown"
        b = buckets.setdefault(day, {"date": day, "sessions": 0, "rx": 0, "tx": 0})
        b["sessions"] += 1
        try:
            b["rx"] += int(s.get("bytes_rx") or 0)
            b["tx"] += int(s.get("bytes_tx") or 0)
        except (TypeError, ValueError):
            pass
    return {"days": sorted(buckets.values(), key=lambda b: b["date"])}


@router.get("/admin/sessions")
async def admin_list_all_sessions(user: dict = Depends(require_staff)):
    """List all VPN sessions across all users (admin/staff only).

    Non-admin staff don't get user_ids or client IPs (cross-user PII).
    """
    is_admin = user.get("role") == "admin"
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
            "user_id": peer.get("user_id", "") if is_admin else "",
            "client_public_ip": s.get("client_public_ip", "") if is_admin else "",
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


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(get_current_user)):
    """Delete a session record belonging to the authenticated user."""
    user_id = _get_user_id(user)
    res = (
        supabase.table("vpn_sessions")
        .select("id")
        .eq("id", session_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not (res.data or []):
        raise HTTPException(404, "Session not found")
    supabase.table("vpn_sessions").delete().eq("id", session_id).execute()
    return {"message": "Session deleted", "id": session_id}


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
