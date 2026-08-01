"""routers/fivem.py  v5.1 â€” Bidirectional txAdmin sync, full history, real-time.

Fixes in v5.1:
  â€¢ pending-sync returns a LIST (not dict) â€” Lua expects an array
  â€¢ StatusUpdate accepts 'players' list from Lua heartbeat (was silently dropped)
  â€¢ txadmin-event handles 'whitelistPlayer' and 'playerWhitelisted' both ways
  â€¢ _sync_to_txadmin tries license: prefix variants before giving up
  â€¢ fivem_realtime_events cleanup wired to cron endpoint
  â€¢ history source labels cover all sync_source values
"""

from __future__ import annotations
from typing import Optional, Literal, List, Any
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel
import txadmin_service as txa
from database import supabase
from dependencies import get_current_user, require_admin, require_staff
from utils.fivem_shared import push_realtime as shared_push_realtime, active_priority as shared_active_priority, now as shared_now
_push_realtime = shared_push_realtime
_active_priority = shared_active_priority
_now = shared_now
import os, hmac, logging, httpx, secrets
from jwt_compat import jwt

# H19 â€” escape helper. The f-string email templates below previously inlined
# raw `reason`, `note`, `name`, and `char` straight into HTML email bodies. A
# staff member (or a txAdmin event payload) containing <script>...</script> or
# <img onerror=...> would be reflected verbatim into the victim's email client.
from html import escape as _fivem_html_escape
def _e(value) -> str:
    """HTML-escape user/staff-controlled free-text before splicing into HTML."""
    return _fivem_html_escape(str(value if value is not None else ""), quote=True)
from utils.email import render_template
from utils.email_queue import queue_email

log = logging.getLogger("fivem")
router = APIRouter()

# Hot-path throttle: the Lua heartbeat fires every ~30s and each stamping pass
# runs up to 64 players x (1 fivem_whitelist UPDATE + 2 application_submissions
# queries) — a serious N+1 against Supabase. Gate the whole stamping pass so it
# runs at most once per 120s regardless of heartbeat frequency.
_STAMP_INTERVAL_SECONDS = 120
_stamp_last_ran: float = 0.0

def _stamp_due() -> bool:
    import time as _t
    global _stamp_last_ran
    now = _t.time()
    if now - _stamp_last_ran < _STAMP_INTERVAL_SECONDS:
        return False
    _stamp_last_ran = now
    return True

WL_PUBLIC_FIELDS = (
    "id,status,txadmin_synced,character_name,fivem_id,fivem_license,steam_hex,"
    "discord_id,discord_name,email,applied_at,reviewed_at,reviewer_note,"
    "priority_tier,priority_level,priority_expires_at"
)
WL_PUBLIC_FIELDS_WITH_PLAY = f"{WL_PUBLIC_FIELDS},last_played_at,last_played_name"


def _effective_whitelist_status(app: dict | None) -> dict | None:
    if not app:
        return app
    if app.get("status") == "approved" and app.get("last_played_at"):
        app["display_status"] = "active"
    elif app.get("status") == "approved" and not app.get("txadmin_synced"):
        app["display_status"] = "syncing"
    else:
        app["display_status"] = app.get("status")
    app["submitted_at"] = app.get("applied_at")
    app["denial_reason"] = app.get("reviewer_note")
    return app


def _player_identifiers(player: dict) -> dict[str, Any]:
    identifiers = player.get("identifiers") if isinstance(player.get("identifiers"), list) else []
    out: dict[str, Any] = {"all": []}

    for raw in identifiers:
        ident = str(raw or "").strip()
        if not ident:
            continue
        out["all"].append(ident)
        low = ident.lower()
        if low.startswith("discord:"):
            out["discord_id"] = ident.split(":", 1)[1]
        elif low.startswith("steam:"):
            out["steam_hex"] = ident
        elif low.startswith("fivem:"):
            out["fivem_id"] = ident
        elif low.startswith("license2:"):
            out["license2"] = ident
            out.setdefault("fivem_license", ident)
        elif low.startswith("license:"):
            out["license"] = ident
            out.setdefault("fivem_license", ident)

    for key, aliases in {
        "license": ("license",),
        "license2": ("license2",),
        "fivem_license": ("fivem_license", "license"),
        "discord_id": ("discord", "discord_id"),
        "steam_hex": ("steam", "steam_hex"),
        "fivem_id": ("fivem", "fivem_id"),
    }.items():
        for alias in aliases:
            val = str(player.get(alias) or "").strip()
            if val:
                if key == "discord_id" and val.startswith("discord:"):
                    val = val.split(":", 1)[1]
                out[key] = val
                prefixed = val
                if key == "discord_id" and not prefixed.startswith("discord:"):
                    prefixed = f"discord:{prefixed}"
                elif key == "fivem_id" and not prefixed.startswith("fivem:"):
                    prefixed = f"fivem:{prefixed}"
                if prefixed not in out["all"]:
                    out["all"].append(prefixed)
                break

    return out


def _submission_identifiers(answers: dict) -> set[str]:
    ids: set[str] = set()
    for key in ("license", "fivem_license", "license2", "steam_hex", "steam", "fivem_id", "discord_id"):
        val = str((answers or {}).get(key) or "").strip()
        if not val:
            continue
        low = val.lower()
        if key == "discord_id":
            ids.add(val[8:] if low.startswith("discord:") else val)
            ids.add(val if low.startswith("discord:") else f"discord:{val}")
        elif key == "fivem_id":
            ids.add(val)
            ids.add(val if low.startswith("fivem:") else f"fivem:{val}")
        elif key in ("steam_hex", "steam") and not low.startswith("steam:") and low.startswith("110000"):
            ids.add(f"steam:{val}")
        else:
            ids.add(val)
    return {i.lower() for i in ids if i}


def _stamp_application_activity(player_ids: dict[str, Any], player_name: str, now_iso: str) -> None:
    player_values = {str(v).lower() for v in player_ids.get("all", []) if v}
    for val in (player_ids.get("discord_id"), player_ids.get("steam_hex"), player_ids.get("fivem_license"), player_ids.get("license2"), player_ids.get("fivem_id")):
        if val:
            player_values.add(str(val).lower())
            if str(val).startswith("discord:"):
                player_values.add(str(val).split(":", 1)[1].lower())

    if not player_values:
        return

    try:
        filters = []
        for val in player_values:
            clean = val.replace("'", "''")
            for key in ("license", "fivem_license", "license2", "steam_hex", "steam", "fivem_id", "discord_id"):
                filters.append(f"answers->>'{key}' ilike.%{clean}%")
        if not filters:
            return
        res = (
            supabase.table("application_form_submissions")
            .select("id")
            .eq("status", "approved")
            .or_(",".join(filters[:50]))
            .limit(50)
            .execute()
        )
        matched = [row["id"] for row in (res.data or []) if row.get("id")]
        if matched:
            patch = {"last_active_at": now_iso, "updated_at": now_iso}
            if player_name:
                patch["last_active_name"] = player_name
            supabase.table("application_form_submissions").update(patch).in_("id", matched).execute()
    except Exception as exc:
        log.warning("Could not stamp application activity: %s", exc)


def _stamp_whitelist_activity(players: List[Any] | None, now_iso: str) -> None:
    if not players:
        return
    # Throttle: only run the N+1 stamping pass once per _STAMP_INTERVAL_SECONDS.
    if not _stamp_due():
        return
    for player in players[:64]:
        if not isinstance(player, dict):
            continue
        ids = _player_identifiers(player)
        license_id = (ids.get("fivem_license") or ids.get("license") or ids.get("license2") or "").strip()
        steam_hex = (ids.get("steam_hex") or "").strip()
        fivem_id = (ids.get("fivem_id") or "").strip()
        discord_id = (ids.get("discord_id") or "").strip()
        player_name = (player.get("name") or "").strip()
        patch = {"last_played_at": now_iso}
        if player_name:
            patch["last_played_name"] = player_name

        conds = []
        if license_id: conds.append(f"fivem_license.eq.{license_id}")
        if steam_hex:  conds.append(f"steam_hex.eq.{steam_hex}")
        if fivem_id:   conds.append(f"fivem_id.eq.{fivem_id}")
        if discord_id: conds.append(f"discord_id.eq.{discord_id}")

        try:
            if conds:
                supabase.table("fivem_whitelist").update(patch).eq("status", "approved").or_(",".join(conds)).execute()
            _stamp_application_activity(ids, player_name, now_iso)
        except Exception as exc:
            log.warning("Could not stamp whitelist activity for player %s: %s", player_name or license_id or discord_id, exc)

# â”€â”€â”€ Email templates â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def _email_approved(name: str, char: str, note: str | None) -> tuple[str, str]:
    subject = "ðŸŽ® Your AIFAZI RP Whitelist Application â€” APPROVED"
    html = f"""
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d1117;color:#e6edf3;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#00FF88,#00D4FF);padding:3px"></div>
  <div style="padding:32px">
    <h1 style="color:#00FF88;font-size:24px;margin:0 0 8px">âœ… Whitelist Approved!</h1>
    <p style="color:#8b949e;margin:0 0 24px">Your application to AIFAZI RP has been reviewed.</p>
    <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;margin-bottom:24px">
      <div style="font-size:12px;color:#8b949e;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Character</div>
      <div style="font-size:18px;font-weight:700;color:#00FF88">{_e(char)}</div>
      <div style="font-size:13px;color:#8b949e;margin-top:4px">Applied by {_e(name)}</div>
    </div>
    {f'<div style="background:#161b22;border-left:3px solid #00D4FF;padding:12px 16px;border-radius:4px;margin-bottom:24px"><div style="font-size:11px;color:#8b949e;margin-bottom:4px">NOTE FROM ADMIN</div><div style="color:#e6edf3">{_e(note)}</div></div>' if note else ''}
    <p style="color:#e6edf3;line-height:1.7">You can now join the server. Connect to <strong style="color:#00FF88">aifazi.net</strong> via FiveM and start your roleplay journey!</p>
    <div style="background:#0d1117;border:1px solid #00FF8830;border-radius:8px;padding:16px;margin-top:24px;text-align:center">
      <div style="font-size:11px;color:#8b949e;margin-bottom:8px;font-family:monospace;letter-spacing:2px">CONNECT NOW</div>
      <div style="font-size:18px;font-weight:700;color:#00FF88;font-family:monospace">connect fivem://connect/127.0.0.1:30120</div>
    </div>
  </div>
  <div style="background:#161b22;padding:16px;text-align:center;font-size:11px;color:#8b949e">
    AIFAZI RP Â· aifazi.net Â· This email was sent because you applied for whitelist.
  </div>
</div>"""
    return subject, html

def _email_denied(name: str, char: str, note: str | None) -> tuple[str, str]:
    subject = "Your AIFAZI RP Whitelist Application â€” Decision"
    html = f"""
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d1117;color:#e6edf3;border-radius:12px;overflow:hidden">
  <div style="background:linear-gradient(135deg,#ff4757,#ff6b81);padding:3px"></div>
  <div style="padding:32px">
    <h1 style="color:#ff4757;font-size:24px;margin:0 0 8px">âŒ Application Not Approved</h1>
    <p style="color:#8b949e;margin:0 0 24px">Thank you for applying to AIFAZI RP, {_e(name)}.</p>
    <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px;margin-bottom:24px">
      <div style="font-size:12px;color:#8b949e;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Character</div>
      <div style="font-size:18px;font-weight:700;color:#ff4757">{_e(char)}</div>
    </div>
    {f'<div style="background:#161b22;border-left:3px solid #ff4757;padding:12px 16px;border-radius:4px;margin-bottom:24px"><div style="font-size:11px;color:#8b949e;margin-bottom:4px">REASON</div><div style="color:#e6edf3">{_e(note)}</div></div>' if note else '<div style="background:#161b22;border-left:3px solid #ff4757;padding:12px 16px;border-radius:4px;margin-bottom:24px"><div style="color:#e6edf3">No specific reason provided.</div></div>'}
    <p style="color:#e6edf3;line-height:1.7">You are welcome to reapply after improving your character backstory. Visit <a href="https://aifazi.net/whitelist" style="color:#00D4FF">aifazi.net/whitelist</a> to submit a new application.</p>
  </div>
  <div style="background:#161b22;padding:16px;text-align:center;font-size:11px;color:#8b949e">
    AIFAZI RP Â· aifazi.net
  </div>
</div>"""
    return subject, html

def _email_reset(name: str, char: str) -> tuple[str, str]:
    subject = "Your AIFAZI RP Application â€” Reset to Pending"
    html = f"""
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d1117;color:#e6edf3;border-radius:12px;overflow:hidden">
  <div style="background:#facc15;padding:3px"></div>
  <div style="padding:32px">
    <h1 style="color:#facc15;font-size:24px;margin:0 0 8px">â³ Application Reset</h1>
    <p style="color:#8b949e;margin:0 0 24px">Hi {_e(name)}, your application for <strong style="color:#facc15">{_e(char)}</strong> has been reset to pending for re-review. No action is needed â€” our team will review it shortly.</p>
  </div>
  <div style="background:#161b22;padding:16px;text-align:center;font-size:11px;color:#8b949e">AIFAZI RP Â· aifazi.net</div>
</div>"""
    return subject, html

def _email_applied(name: str, char: str) -> tuple[str, str]:
    subject = "Your AIFAZI RP Whitelist Application Was Received"
    html = f"""
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d1117;color:#e6edf3;border-radius:12px;overflow:hidden">
  <div style="background:#00D4FF;padding:3px"></div>
  <div style="padding:32px">
    <h1 style="color:#00D4FF;font-size:24px;margin:0 0 8px">Application Received</h1>
    <p style="color:#8b949e;margin:0 0 24px">Hi {_e(name)}, your whitelist application is now waiting for staff review.</p>
    <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px">
      <div style="font-size:12px;color:#8b949e;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Character</div>
      <div style="font-size:18px;font-weight:700;color:#00D4FF">{_e(char)}</div>
    </div>
  </div>
  <div style="background:#161b22;padding:16px;text-align:center;font-size:11px;color:#8b949e">AIFAZI RP Â· aifazi.net</div>
</div>"""
    return subject, html

def _email_priority(name: str, char: str, tier: str, level: int, expires_at: str | None) -> tuple[str, str]:
    expiry = expires_at or "Permanent"
    subject = "Your AIFAZI RP Queue Priority Was Updated"
    html = f"""
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d1117;color:#e6edf3;border-radius:12px;overflow:hidden">
  <div style="background:#facc15;padding:3px"></div>
  <div style="padding:32px">
    <h1 style="color:#facc15;font-size:24px;margin:0 0 8px">Queue Priority Updated</h1>
    <p style="color:#8b949e;margin:0 0 24px">Hi {_e(name)}, your queue priority for <strong style="color:#e6edf3">{_e(char)}</strong> has been updated.</p>
    <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px">
      <div style="font-size:12px;color:#8b949e;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Priority</div>
      <div style="font-size:18px;font-weight:700;color:#facc15">{_e(tier)} Â· {_e(level)}</div>
      <div style="font-size:13px;color:#8b949e;margin-top:6px">Expires: {_e(expiry)}</div>
    </div>
  </div>
  <div style="background:#161b22;padding:16px;text-align:center;font-size:11px;color:#8b949e">AIFAZI RP Â· aifazi.net</div>
</div>"""
    return subject, html

def _email_banned(name: str, char: str, reason: str | None, expires_at: str | None) -> tuple[str, str]:
    expiry = expires_at or "Permanent"
    subject = "AIFAZI RP Server Ban Notice"
    html = f"""
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d1117;color:#e6edf3;border-radius:12px;overflow:hidden">
  <div style="background:#ff4757;padding:3px"></div>
  <div style="padding:32px">
    <h1 style="color:#ff4757;font-size:24px;margin:0 0 8px">Server Ban Applied</h1>
    <p style="color:#8b949e;margin:0 0 24px">Hi {_e(name)}, a ban has been applied to your AIFAZI RP access.</p>
    <div style="background:#161b22;border-left:3px solid #ff4757;padding:12px 16px;border-radius:4px;margin-bottom:18px">
      <div style="font-size:11px;color:#8b949e;margin-bottom:4px">CHARACTER</div>
      <div style="color:#e6edf3">{_e(char)}</div>
    </div>
    <div style="background:#161b22;border-left:3px solid #ff4757;padding:12px 16px;border-radius:4px">
      <div style="font-size:11px;color:#8b949e;margin-bottom:4px">REASON</div>
      <div style="color:#e6edf3">{_e(reason or 'No reason provided.')}</div>
      <div style="font-size:12px;color:#8b949e;margin-top:10px">Expires: {_e(expiry)}</div>
    </div>
  </div>
  <div style="background:#161b22;padding:16px;text-align:center;font-size:11px;color:#8b949e">AIFAZI RP Â· aifazi.net</div>
</div>"""
    return subject, html

def _email_unbanned(name: str, char: str) -> tuple[str, str]:
    subject = "AIFAZI RP Server Ban Lifted"
    html = f"""
<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0d1117;color:#e6edf3;border-radius:12px;overflow:hidden">
  <div style="background:#00FF88;padding:3px"></div>
  <div style="padding:32px">
    <h1 style="color:#00FF88;font-size:24px;margin:0 0 8px">Ban Lifted</h1>
    <p style="color:#8b949e;margin:0">Hi {_e(name)}, the server ban for <strong style="color:#e6edf3">{_e(char)}</strong> has been lifted and is queued for server sync.</p>
  </div>
  <div style="background:#161b22;padding:16px;text-align:center;font-size:11px;color:#8b949e">AIFAZI RP Â· aifazi.net</div>
</div>"""
    return subject, html

async def _send_whitelist_email(app: dict, status: str, note: str | None = None, extra: Optional[dict] = None) -> None:
    """
    Send email to the player.
    Priority: email stored on the application row > discord_users > forum_users.
    """
    extra = extra or {}
    discord_id = app.get("discord_id", "")

    # 1. Use email stored directly on the application (added in v5.2)
    to_email = (app.get("email") or "").strip()

    # 2. Fall back to discord_users table
    if not to_email or "@" not in to_email:
        try:
            eu = supabase.table("discord_users").select("email").eq("discord_id", discord_id).execute()
            to_email = ((eu.data or [{}])[0].get("email") or "").strip()
        except Exception:
            to_email = ""

    # 3. Fall back to forum_users table
    if not to_email or "@" not in to_email:
        try:
            fu = supabase.table("users").select("email").eq("discord_id", discord_id).execute()
            to_email = ((fu.data or [{}])[0].get("email") or "").strip()
        except Exception:
            to_email = ""

    if not to_email or "@" not in to_email:
        log.info("No email found for discord_id=%s â€” skipping notification", discord_id)
        return

    name = app.get("discord_name", "Player")
    char = app.get("character_name", "your character")
    purpose = f"fivem_{status}"
    if status == "applied":
        fallback_subject, fallback_html = _email_applied(name, char)
    elif status == "approved":
        fallback_subject, fallback_html = _email_approved(name, char, note)
    elif status == "denied":
        fallback_subject, fallback_html = _email_denied(name, char, note)
    elif status == "priority":
        fallback_subject, fallback_html = _email_priority(
            name,
            char,
            extra.get("tier") or "None",
            int(extra.get("level") or 0),
            extra.get("expires_at"),
        )
    elif status == "banned":
        fallback_subject, fallback_html = _email_banned(name, char, note, extra.get("expires_at"))
    elif status == "unbanned":
        fallback_subject, fallback_html = _email_unbanned(name, char)
    else:
        purpose = "fivem_reset"
        fallback_subject, fallback_html = _email_reset(name, char)

    subject, html = render_template(purpose, {
        "site_name": "aifazi.net",
        "name": name,
        "character_name": char,
        "note": note or "",
        "tier": extra.get("tier") or "None",
        "level": int(extra.get("level") or 0),
        "expires_at": extra.get("expires_at") or "",
        "status_url": f"{FRONTEND_URL}/profile?tab=fivem",
    })

    await queue_email(to_email, subject or fallback_subject, html or fallback_html, "", purpose)
    log.info("Whitelist email queued to %s status=%s", to_email, status)

# â”€â”€â”€ Discord Bot Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
_DISCORD_TOKEN    = os.getenv("DISCORD_BOT_TOKEN", "")
_DISCORD_GUILD    = os.getenv("DISCORD_GUILD_ID", "")
_DISCORD_WL_ROLE  = os.getenv("DISCORD_WHITELIST_ROLE_ID", "")

async def _discord_assign_whitelist_role(discord_id: str) -> tuple[bool, str]:
    """
    Assign the Whitelisted role to a Discord member via Bot API.
    Returns (success, message).
    Silently skips if env vars not configured.
    """
    if not all([_DISCORD_TOKEN, _DISCORD_GUILD, _DISCORD_WL_ROLE]):
        return False, "Discord bot not configured (missing env vars)"

    url = f"https://discord.com/api/v10/guilds/{_DISCORD_GUILD}/members/{discord_id}/roles/{_DISCORD_WL_ROLE}"
    headers = {
        "Authorization": f"Bot {_DISCORD_TOKEN}",
        "Content-Type":  "application/json",
        "X-Audit-Log-Reason": "Whitelisted via aifazi.net admin panel",
    }
    async with httpx.AsyncClient(timeout=8) as client:
        r = await client.put(url, headers=headers)

    if r.status_code == 204:
        return True, f"Discord role assigned to {discord_id}"
    if r.status_code == 404:
        return False, f"Member {discord_id} not found in Discord server"
    return False, f"Discord API error {r.status_code}: {r.text[:200]}"

async def _discord_remove_whitelist_role(discord_id: str) -> tuple[bool, str]:
    """Remove the Whitelisted role (used on deny/ban)."""
    if not all([_DISCORD_TOKEN, _DISCORD_GUILD, _DISCORD_WL_ROLE]):
        return False, "Discord bot not configured"

    url = f"https://discord.com/api/v10/guilds/{_DISCORD_GUILD}/members/{discord_id}/roles/{_DISCORD_WL_ROLE}"
    headers = {"Authorization": f"Bot {_DISCORD_TOKEN}"}
    async with httpx.AsyncClient(timeout=8) as client:
        r = await client.delete(url, headers=headers)

    if r.status_code == 204:
        return True, f"Discord role removed from {discord_id}"
    return False, f"Discord API {r.status_code}: {r.text[:200]}"

# â”€â”€â”€ Thresholds â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ONLINE_THRESHOLD_S   = int(os.getenv("FIVEM_STATUS_ONLINE_THRESHOLD", "900"))
DEGRADED_THRESHOLD_S = int(os.getenv("FIVEM_STATUS_DEGRADED_THRESHOLD", "1800"))

def _compute_status(updated_at_str):
    if not updated_at_str:
        return "offline", float("inf")
    try:
        updated = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - updated).total_seconds()
    except Exception:
        return "offline", float("inf")
    if age < ONLINE_THRESHOLD_S:    return "online",   age
    if age < DEGRADED_THRESHOLD_S:  return "degraded", age
    return "offline", age

def _check_token(request: Request):
    secret = os.getenv("FIVEM_SERVER_SECRET", "")
    token  = request.headers.get("X-FiveM-Token", "")
    if not secret:
        raise HTTPException(503, "FiveM server token is not configured")
    if not token or not hmac.compare_digest(token, secret):
        raise HTTPException(403, "Invalid server token")

def _uptime_str(s):
    if not s or s <= 0: return "0m"
    d, r = divmod(int(s), 86400); h, r = divmod(r, 3600); m, _ = divmod(r, 60)
    if d: return f"{d}d {h}h"
    if h: return f"{h}h {m}m"
    return f"{m}m"

def _last_seen_str(age):
    if age == float("inf"): return "Never"
    if age < 60:    return "Just now"
    if age < 3600:  return f"{int(age//60)} min ago"
    if age < 86400: return f"{int(age//3600)}h ago"
    return f"{int(age//86400)}d ago"

# _now() and _push_realtime() imported from utils.fivem_shared

# â”€â”€â”€ Pydantic models â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class WhitelistApply(BaseModel):
    discord_id: Optional[str] = None; discord_name: Optional[str] = None; steam_hex: Optional[str] = None
    fivem_id: Optional[str] = None; character_name: str; character_backstory: str
    age: int; rp_experience: str; why_join: str; rules_accepted: bool
    email: Optional[str] = None   # collected on the apply form so we can email results
    extra_answers: Optional[dict] = None

class WhitelistReview(BaseModel):
    status: str; reviewer_note: Optional[str] = None
    priority_tier: Optional[str] = None
    priority_level: Optional[int] = None
    priority_expires_at: Optional[str] = None

class WhitelistManualAdd(BaseModel):
    discord_id: str; discord_name: str; character_name: str
    steam_hex: Optional[str] = None; fivem_license: Optional[str] = None; fivem_id: Optional[str] = None
    reviewer_note: Optional[str] = None
    priority_tier: Optional[str] = None
    priority_level: Optional[int] = None
    priority_expires_at: Optional[str] = None

class WhitelistPriorityUpdate(BaseModel):
    priority_tier: Optional[str] = None
    priority_level: Optional[int] = None
    priority_expires_at: Optional[str] = None

class BanCreate(BaseModel):
    # identifiers can be a comma-separated string OR a list (from frontend player picker)
    identifier:  Optional[str] = None          # single steam hex / fivem id
    identifiers: Optional[list[str]] = None    # multiple ids (all player identifiers)
    net_id:      Optional[int] = None          # server netId (if player is online)
    player_name: str
    reason:      str
    duration:    str = "permanent"
    expires_at:  Optional[str] = None          # ISO datetime (kept for DB compat)

class BanUpdate(BaseModel):
    reason: Optional[str] = None; expires_at: Optional[str] = None; active: Optional[bool] = None

class BanSyncAck(BaseModel):
    ban_id: str
    ok: bool = True
    message: Optional[str] = None

class StatusUpdate(BaseModel):
    players_online: int
    max_players: int
    server_name: Optional[str] = None
    server_version: Optional[str] = None
    uptime_seconds: int = 0
    resource_count: int = 0
    force_offline: bool = False
    # FIX: accept 'players' list sent by Lua heartbeat (was silently ignored)
    players: Optional[List[Any]] = None

class DevOverride(BaseModel):
    override: Optional[Literal["force_online", "maintenance"]] = None

class MarkSynced(BaseModel):
    license: Optional[str] = None   # kept for Lua compat
    app_id:  Optional[str] = None
    success: bool = True
    error:   Optional[str] = None

class ApplicationActionSyncBody(BaseModel):
    submission_id: str
    status: Literal["synced", "failed", "skipped"] = "synced"
    message: Optional[str] = None

class ServerSyncRefresh(BaseModel):
    app_id: Optional[str] = None
    reason: Optional[str] = None

class TxAdminEvent(BaseModel):
    event: str; data: dict = {}; ts: Optional[int] = None

# _active_priority imported from utils.fivem_shared

def _priority_update_fields(priority_tier: Optional[str], priority_level: Optional[int], priority_expires_at: Optional[str]) -> dict:
    if priority_level is None and priority_tier is None and priority_expires_at is None:
        return {}

    level = max(0, int(priority_level or 0))
    return {
        "priority_tier": (priority_tier or "").strip() or None if level > 0 else None,
        "priority_level": level,
        "priority_expires_at": priority_expires_at or None if level > 0 else None,
    }

def _identifier_update_fields(identifier: Optional[str], existing: Optional[dict] = None) -> dict:
    ident = (identifier or "").strip()
    if not ident:
        return {}

    existing = existing or {}
    updates: dict = {}
    if ident.startswith("license:"):
        if not existing.get("fivem_license"):
            updates["fivem_license"] = ident
    elif ident.startswith("steam:"):
        if not existing.get("steam_hex"):
            updates["steam_hex"] = ident
    elif ident.startswith("fivem:"):
        if not existing.get("fivem_id"):
            updates["fivem_id"] = ident
    return updates

def _normalize_identifier_list(values: Any) -> list[str]:
    if not values:
        return []
    if isinstance(values, str):
        value = values.strip()
        return [value] if value else []
    if not isinstance(values, list):
        return []
    out: list[str] = []
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text and text not in out:
            out.append(text)
    return out

def _first_identifier(ids: list[str], prefixes: tuple[str, ...]) -> Optional[str]:
    for ident in ids:
        low = ident.lower()
        if any(low.startswith(prefix) for prefix in prefixes):
            return ident
    return None

def _primary_ban_identifier(ids: list[str]) -> Optional[str]:
    return (
        _first_identifier(ids, ("license:", "license2:"))
        or _first_identifier(ids, ("steam:",))
        or _first_identifier(ids, ("discord:",))
        or _first_identifier(ids, ("fivem:",))
        or (ids[0] if ids else None)
    )

def _find_whitelist_by_identifiers(ids: list[str]) -> Optional[dict]:
    filters: list[str] = []
    for ident in ids:
        value = (ident or "").strip()
        if not value:
            continue
        low = value.lower()
        if low.startswith(("license:", "license2:")):
            filters.append(f"fivem_license.eq.{value}")
        elif low.startswith("steam:"):
            filters.append(f"steam_hex.eq.{value}")
        elif low.startswith("fivem:"):
            filters.append(f"fivem_id.eq.{value}")
            filters.append(f"fivem_id.eq.{value.split(':', 1)[1]}")
        elif low.startswith("discord:"):
            filters.append(f"discord_id.eq.{value.split(':', 1)[1]}")
        else:
            filters.append(f"discord_id.eq.{value}")
            filters.append(f"fivem_id.eq.{value}")

    if not filters:
        return None

    try:
        res = (
            supabase.table("fivem_whitelist")
            .select("*")
            .eq("status", "approved")
            .or_(",".join(filters))
            .order("approved_at", desc=True)
            .limit(1)
            .execute()
        )
        return (res.data or [None])[0]
    except Exception as exc:
        log.warning("Could not match whitelist app for ban identifiers: %s", exc)
        return None

def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)

def _duration_seconds(duration: Optional[str]) -> Optional[int]:
    text = (duration or "permanent").strip().lower()
    if text in {"", "permanent", "perm", "never", "custom"}:
        return None
    mapping = {
        "2 hours": 2 * 60 * 60,
        "12 hours": 12 * 60 * 60,
        "1 day": 24 * 60 * 60,
        "2 days": 2 * 24 * 60 * 60,
        "1 week": 7 * 24 * 60 * 60,
        "2 weeks": 14 * 24 * 60 * 60,
        "1 month": 30 * 24 * 60 * 60,
    }
    return mapping.get(text)

def _ban_expires_at(duration: Optional[str], expires_at: Optional[str]) -> Optional[str]:
    parsed = _parse_datetime(expires_at)
    if parsed:
        return parsed.isoformat()
    seconds = _duration_seconds(duration)
    if seconds is None:
        return None
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()

def _ban_expire_epoch(expires_at: Optional[str]) -> int:
    try:
        parsed = _parse_datetime(expires_at)
    except ValueError:
        parsed = None
    if not parsed:
        return 2147483647
    return max(int(parsed.timestamp()), int(datetime.now(timezone.utc).timestamp()) + 60)

# â”€â”€â”€ Internal: push one approval to txAdmin + update DB row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async def _sync_to_txadmin(app: dict, approved_by: str, source: str) -> dict:
    """
    Push a whitelist approval to txAdmin (direct HTTPS via txadmin_service).
    FIX: tries all available identifier forms before giving up.
    """
    # Build candidates in order of preference
    candidates: list[str] = []
    steam = (app.get("steam_hex") or "").strip()
    license_id = (app.get("fivem_license") or "").strip()
    fivem = (app.get("fivem_id") or "").strip()
    if license_id:
        candidates.append(license_id)
    if steam:
        candidates.append(steam)
        if not steam.startswith("license:") and not steam.startswith("steam:"):
            candidates.append("license:" + steam)
    if fivem:
        candidates.append(fivem)
        if not fivem.startswith("fivem:"):
            candidates.append("fivem:" + fivem)

    txadmin_ok   = False
    txadmin_note = "no_identifier"

    for ident in candidates:
        ok, msg = await txa.add_whitelist_approval(ident)
        if ok:
            txadmin_ok   = True
            txadmin_note = msg
            log.info("txAdmin whitelist add OK: %s (%s)", ident, msg)
            break
        else:
            log.warning("txAdmin identifier %s failed: %s â€” trying next", ident, msg)
            txadmin_note = msg

    if not candidates:
        log.warning("No identifier for app %s â€” skipping txAdmin push", app.get("id"))

    upd: dict = {
        "txadmin_synced": txadmin_ok,
        "sync_source":    source,
        "approved_at":    _now(),
        "reviewed_by":    approved_by,
        "reviewed_at":    _now(),
        "status":         "approved",
    }
    if not txadmin_ok and txadmin_note:
        upd["reviewer_note"] = (app.get("reviewer_note") or "") + f" [txAdmin sync error: {txadmin_note}]"

    supabase.table("fivem_whitelist").update(upd).eq("id", app["id"]).execute()

    # Push realtime event so admin panel updates instantly
    await _push_realtime("whitelist_synced", {
        "app_id":       app["id"],
        "player_name":  app.get("discord_name"),
        "txadmin_ok":   txadmin_ok,
        "source":       source,
        "approved_by":  approved_by,
    })
    return upd

# â”€â”€â”€ Whitelist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.get("/whitelist/my-application")
async def my_whitelist_application(user: dict = Depends(get_current_user)):
    """
    Return the logged-in forum user's latest whitelist application.
    Used by /whitelist to block duplicate submissions before the form renders.
    """
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(401, "Authentication required")

    user_res = (
        supabase.table("users")
        .select("discord_id")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not user_res.data:
        raise HTTPException(404, "User not found")

    discord_id = user_res.data[0].get("discord_id")
    if not discord_id:
        raise HTTPException(404, "No linked Discord account")

    try:
        app_res = (
            supabase.table("fivem_whitelist")
            .select(WL_PUBLIC_FIELDS_WITH_PLAY)
            .eq("discord_id", discord_id)
            .order("applied_at", desc=True)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        if "last_played" not in str(exc):
            raise
        app_res = (
            supabase.table("fivem_whitelist")
            .select(WL_PUBLIC_FIELDS)
            .eq("discord_id", discord_id)
            .order("applied_at", desc=True)
            .limit(1)
            .execute()
        )
    if not app_res.data:
        raise HTTPException(404, "No whitelist application found")

    return _effective_whitelist_status(app_res.data[0])

@router.post("/whitelist/apply")
async def apply_whitelist(body: WhitelistApply, user: dict = Depends(get_current_user)):
    if not body.rules_accepted:
        raise HTTPException(400, "You must accept the server rules.")
    user_id = user.get("id") or user.get("forum_user_id")
    if not user_id:
        raise HTTPException(401, "Authentication required")
    forum_res = (
        supabase.table("users")
        .select("id,username,email,discord_id,discord_username,steam_id")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not forum_res.data:
        raise HTTPException(404, "User not found")
    forum_user = forum_res.data[0]
    discord_id = (forum_user.get("discord_id") or "").strip()
    if not discord_id:
        raise HTTPException(403, "Link Discord before submitting a whitelist application.")
    discord_name = (forum_user.get("discord_username") or forum_user.get("username") or user.get("username") or "").strip()
    email = (forum_user.get("email") or user.get("email") or "").strip() or None
    steam_hex = (forum_user.get("steam_id") or body.steam_hex or "").strip() or None
    existing = (supabase.table("fivem_whitelist").select("id,status")
                .eq("discord_id", discord_id)
                .order("applied_at", desc=True).limit(1).execute())
    if existing.data:
        st = existing.data[0]["status"]
        if st == "approved": raise HTTPException(400, "You are already whitelisted.")
        raise HTTPException(400, "You already submitted a whitelist application. Please open a ticket if you need to change anything.")
    res = supabase.table("fivem_whitelist").insert({
        "discord_id": discord_id, "discord_name": discord_name,
        "steam_hex": steam_hex,   "fivem_id": body.fivem_id,
        "character_name": body.character_name,
        "character_backstory": body.character_backstory,
        "age": body.age, "rp_experience": body.rp_experience,
        "why_join": body.why_join, "status": "pending",
        "email": email,
        "extra_answers": body.extra_answers or {},
        "applied_at": _now(), "txadmin_synced": False,
        "sync_source": "website",
    }).execute()
    app = (res.data or [{}])[0]
    await _send_whitelist_email(app, "applied")
    return {"message": "Application submitted!", "id": app.get("id")}

@router.get("/whitelist/check/{identifier}")
async def check_whitelist(identifier: str):
    q = supabase.table("fivem_whitelist").select("status,steam_hex,fivem_id,fivem_license,character_name,priority_tier,priority_level,priority_expires_at").eq("status", "approved")
    if identifier.startswith("license:"):             q = q.eq("fivem_license", identifier)
    elif identifier.startswith("steam:"):             q = q.eq("steam_hex", identifier)
    elif identifier.startswith("fivem:"):             q = q.eq("fivem_id", identifier)
    else:                                              q = q.eq("discord_id", identifier)
    res = q.execute()
    if not res.data: return {"whitelisted": False}
    app = res.data[0]
    # Do NOT echo the matched row's other identifiers back to an unauthenticated
    # caller — that lets anyone enumerate steam_hex/fivem_license/fivem_id by
    # probing identifiers. The caller already knows the identifier it queried.
    return {
        "whitelisted": True,
        "status": app.get("status"),
        "character_name": app.get("character_name"),
        "priority": _active_priority(app),
    }

@router.get("/whitelist/search")
async def search_whitelist(
    q: str = "",
    status: Optional[str] = None,
    limit: int = 50,
    _: dict = Depends(require_staff),
):
    """
    Search whitelist applications by name, discord ID, fivem ID, steam hex, or character name.
    email column is optional â€” gracefully excluded if the column doesn't exist yet.
    """
    query = supabase.table("fivem_whitelist").select("*", count="exact")
    if status:
        query = query.eq("status", status)

    if q and q.strip():
        t = q.strip()
        # Try with email first; fall back without it if column missing
        try:
            res = query.or_(
                f"discord_name.ilike.%{t}%,"
                f"discord_id.ilike.%{t}%,"
                f"character_name.ilike.%{t}%,"
                f"fivem_id.ilike.%{t}%,"
                f"fivem_license.ilike.%{t}%,"
                f"steam_hex.ilike.%{t}%,"
                f"email.ilike.%{t}%"
            ).order("applied_at", desc=True).limit(limit).execute()
            return {"applications": res.data or [], "total": res.count or 0, "query": q}
        except Exception as e:
            if "email" in str(e).lower():
                # email column not migrated yet â€” search without it
                log.warning("email column missing in fivem_whitelist â€” run migration. Searching without it.")
                query2 = supabase.table("fivem_whitelist").select("*", count="exact")
                if status:
                    query2 = query2.eq("status", status)
                res2 = query2.or_(
                    f"discord_name.ilike.%{t}%,"
                    f"discord_id.ilike.%{t}%,"
                    f"character_name.ilike.%{t}%,"
                    f"fivem_id.ilike.%{t}%,"
                    f"fivem_license.ilike.%{t}%,"
                    f"steam_hex.ilike.%{t}%"
                ).order("applied_at", desc=True).limit(limit).execute()
                return {"applications": res2.data or [], "total": res2.count or 0, "query": q}
            raise

    res = query.order("applied_at", desc=True).limit(limit).execute()
    return {"applications": res.data or [], "total": res.count or 0, "query": q}


@router.get("/whitelist")
async def list_whitelist(
    status: Optional[str] = None, limit: int = 50, offset: int = 0,
    since_seconds: Optional[int] = None, _: dict = Depends(require_staff)
):
    q = supabase.table("fivem_whitelist").select("*", count="exact")
    if status: q = q.eq("status", status)
    if since_seconds:
        since_iso = (datetime.now(timezone.utc) - timedelta(seconds=since_seconds)).isoformat()
        q = q.gte("reviewed_at", since_iso)
    res = q.order("applied_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"applications": res.data or [], "total": res.count or 0}

@router.get("/whitelist/history")
async def whitelist_history(limit: int = 100, _: dict = Depends(require_staff)):
    """Full approval history with source label and txAdmin sync status."""
    res = (supabase.table("fivem_whitelist")
           .select("id,discord_name,character_name,status,reviewed_by,reviewed_at,"
                   "approved_at,sync_source,txadmin_synced,steam_hex,fivem_license,fivem_id,"
                   "priority_tier,priority_level,priority_expires_at")
           .eq("status", "approved")
           .order("approved_at", desc=True)
           .limit(limit)
           .execute())
    rows = res.data or []

    SOURCE_LABELS = {
        "website_approved":  ("ðŸŒ Approved on website",          "#00D4FF"),
        "website_manual":    ("âœï¸ Manual add (website)",          "#a78bfa"),
        "txadmin":           ("ðŸŽ® Approved in txAdmin panel",     "#facc15"),
        "txadmin_join":      ("ðŸšª Auto-approved on join",         "#00FF88"),
        "txadmin_removed":   ("âŒ Removed in txAdmin",            "#ff4757"),
        "website":           ("ðŸŒ Website",                       "#00D4FF"),
        "pre_v4_migration":  ("ðŸ“¦ Pre-v4 migration",              "#6b7280"),
    }
    for r in rows:
        src = r.get("sync_source") or "website"
        label, color = SOURCE_LABELS.get(src, (f"ðŸ“‹ {src}", "#6b7280"))
        r["source_label"] = label
        r["source_color"] = color

    return {"history": rows, "total": len(rows)}

@router.get("/whitelist/pending-sync")
async def pending_sync(request: Request):
    """
    Static route must be declared before /whitelist/{app_id}; Lua expects a bare
    JSON array of approved rows waiting for server sync.
    """
    _check_token(request)
    res = (supabase.table("fivem_whitelist")
           .select("id,discord_name,steam_hex,fivem_id,fivem_license,approved_at")
           .eq("status", "approved").eq("txadmin_synced", False)
           .order("reviewed_at", desc=False).limit(20).execute())
    rows = res.data or []
    out = []
    for r in rows:
        steam = (r.get("steam_hex") or "").strip()
        license_id = (r.get("fivem_license") or "").strip()
        fivem = (r.get("fivem_id") or "").strip()
        lic = license_id or steam or fivem
        if not lic:
            continue
        r["license"] = lic
        out.append(r)
    return out

def _pending_count(table: str, filters: dict[str, Any], in_filters: Optional[dict[str, list[Any]]] = None) -> int:
    q = supabase.table(table).select("id", count="exact")
    for key, val in filters.items():
        q = q.eq(key, val)
    for key, vals in (in_filters or {}).items():
        q = q.in_(key, vals)
    res = q.limit(1).execute()
    return int(res.count or 0)

@router.post("/sync/refresh")
async def refresh_server_sync(
    body: ServerSyncRefresh | None = None,
    user: dict = Depends(require_staff),
):
    """
    Manual admin refresh for the FiveM server sync queue.
    Whitelist rows are pushed to txAdmin immediately; ban/unban/form actions stay
    queued for the FiveM resource and are returned as pending counts.
    """
    body = body or ServerSyncRefresh()
    username = user.get("username", "admin")

    q = (
        supabase.table("fivem_whitelist")
        .select("*")
        .eq("status", "approved")
        .eq("txadmin_synced", False)
        .order("reviewed_at", desc=False)
        .limit(20)
    )
    if body.app_id:
        q = q.eq("id", body.app_id)

    rows = q.execute().data or []
    synced = 0
    failed = 0
    for app in rows:
        result = await _sync_to_txadmin(app, username, "website")
        if result.get("txadmin_synced"):
            synced += 1
        else:
            failed += 1

    pending = {
        "whitelist": _pending_count("fivem_whitelist", {"status": "approved", "txadmin_synced": False}),
        "bans": _pending_count("fivem_bans", {"active": True, "txadmin_synced": False}),
        "unbans": _pending_count("fivem_bans", {"active": False, "txadmin_synced": False, "source": "qbx_unban_pending"}),
        "application_actions": _pending_count(
            "application_form_submissions",
            {"status": "approved"},
            {"action_status": ["pending", "failed"]},
        ),
    }

    await _push_realtime("server_sync_refresh", {
        "requested_by": username,
        "reason": body.reason or "manual",
        "synced": synced,
        "failed": failed,
        "pending": pending,
    })

    return {
        "ok": True,
        "message": "Server sync refreshed.",
        "attempted": len(rows),
        "synced": synced,
        "failed": failed,
        "pending": pending,
    }

@router.get("/whitelist/{app_id}")
async def get_whitelist_app(app_id: str, _: dict = Depends(require_staff)):
    res = supabase.table("fivem_whitelist").select("*").eq("id", app_id).execute()
    if not res.data: raise HTTPException(404, "Application not found")
    return res.data[0]

@router.patch("/whitelist/{app_id}/priority")
async def update_whitelist_priority(
    app_id: str,
    body: WhitelistPriorityUpdate,
    user: dict = Depends(require_staff),
):
    app_res = supabase.table("fivem_whitelist").select("*").eq("id", app_id).execute()
    if not app_res.data:
        raise HTTPException(404, "Application not found")
    if app_res.data[0].get("status") != "approved":
        raise HTTPException(400, "Priority can only be assigned to approved whitelist players")

    updates = {
        **_priority_update_fields(body.priority_tier, body.priority_level, body.priority_expires_at),
        "reviewed_by": user.get("username", "admin"),
        "reviewed_at": _now(),
    }
    res = supabase.table("fivem_whitelist").update(updates).eq("id", app_id).execute()
    updated_app = (res.data or [app_res.data[0]])[0]
    await _send_whitelist_email(updated_app, "priority", None, {
        "tier": updated_app.get("priority_tier") or "None",
        "level": updated_app.get("priority_level") or 0,
        "expires_at": updated_app.get("priority_expires_at"),
    })
    return {"message": "Priority updated.", "app": updated_app}

@router.patch("/whitelist/{app_id}")
async def review_whitelist(
    app_id: str, body: WhitelistReview,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_staff)
):
    if body.status not in ("approved", "denied", "pending"):
        raise HTTPException(400, "Invalid status")

    app_res = supabase.table("fivem_whitelist").select("*").eq("id", app_id).execute()
    if not app_res.data: raise HTTPException(404, "Application not found")
    app      = app_res.data[0]
    username = user.get("username", "admin")
    discord_id = app.get("discord_id", "")
    current_status = app.get("status", "pending")

    # Guard: reject no-op transitions with a clear message
    if body.status == current_status:
        status_labels = {"approved": "already approved", "denied": "already denied", "pending": "already pending"}
        raise HTTPException(409, f"Player is {status_labels.get(current_status, current_status)} â€” no change made.")

    if body.status == "approved":
        priority_updates = _priority_update_fields(
            body.priority_tier,
            body.priority_level,
            body.priority_expires_at,
        )
        supabase.table("fivem_whitelist").update({
            "status":         "approved",
            "reviewer_note":  body.reviewer_note,
            "reviewed_by":    username,
            "reviewed_at":    _now(),
            "approved_at":    _now(),
            "sync_source":    "website",
            "txadmin_synced": False,
            **priority_updates,
        }).eq("id", app_id).execute()

        # Re-fetch the updated app for background tasks
        updated_app = supabase.table("fivem_whitelist").select("*").eq("id", app_id).execute()
        app_updated = (updated_app.data or [app])[0]

        # 1. Assign Discord Whitelisted role
        if discord_id:
            background_tasks.add_task(_discord_assign_whitelist_role, discord_id)

        # 2. Sync approval in background.
        background_tasks.add_task(_sync_to_txadmin, app_updated, username, "website")

        # 3. Send approval email
        await _send_whitelist_email(app, "approved", body.reviewer_note)

        return {
            "message":  "Approved â€” syncing to server + sending email in background.",
            "app_id":   app_id,
            "syncing":  True,
        }

    else:
        priority_updates = {}
        if body.status != "pending":
            priority_updates = {
                "priority_tier": None,
                "priority_level": 0,
                "priority_expires_at": None,
            }
        supabase.table("fivem_whitelist").update({
            "status":        body.status,
            "reviewer_note": body.reviewer_note,
            "reviewed_by":   username,
            "reviewed_at":   _now(),
            **priority_updates,
        }).eq("id", app_id).execute()

        # Remove Discord role on deny
        if body.status == "denied" and discord_id:
            background_tasks.add_task(_discord_remove_whitelist_role, discord_id)

        # Send email notification (approved/denied/pending)
        await _send_whitelist_email(app, body.status, body.reviewer_note)

        return {"message": f"Application {body.status}. Email notification sent."}

@router.get("/discord/member/{discord_id}")
async def get_discord_member(discord_id: str, _: dict = Depends(require_staff)):
    """
    Look up a Discord member's presence and roles in the configured guild.
    Returns: { in_server, username, avatar, roles: [{id, name, color}] }
    """
    if not all([_DISCORD_TOKEN, _DISCORD_GUILD]):
        raise HTTPException(503, "Discord bot not configured")

    headers = {"Authorization": f"Bot {_DISCORD_TOKEN}"}

    async with httpx.AsyncClient(timeout=8) as client:
        # Get member info
        member_r = await client.get(
            f"https://discord.com/api/v10/guilds/{_DISCORD_GUILD}/members/{discord_id}",
            headers=headers,
        )
        if member_r.status_code == 404:
            return {"in_server": False}
        if member_r.status_code != 200:
            raise HTTPException(502, f"Discord API {member_r.status_code}")

        member = member_r.json()

        # Get guild roles to resolve role names & colors
        roles_r = await client.get(
            f"https://discord.com/api/v10/guilds/{_DISCORD_GUILD}/roles",
            headers=headers,
        )
        guild_roles = {r["id"]: r for r in (roles_r.json() if roles_r.status_code == 200 else [])}

    member_role_ids = member.get("roles", [])
    resolved_roles = [
        {
            "id":    rid,
            "name":  guild_roles[rid]["name"],
            "color": f"#{guild_roles[rid]['color']:06x}" if guild_roles[rid]["color"] else "#888",
        }
        for rid in member_role_ids
        if rid in guild_roles and guild_roles[rid]["name"] != "@everyone"
    ]

    user = member.get("user", {})
    avatar_hash = member.get("avatar") or user.get("avatar")
    avatar_id   = user.get("id", discord_id)
    avatar_url  = f"https://cdn.discordapp.com/avatars/{avatar_id}/{avatar_hash}.webp?size=64" if avatar_hash else None

    return {
        "in_server":   True,
        "username":    user.get("username", "Unknown"),
        "display_name": member.get("nick") or user.get("global_name") or user.get("username"),
        "avatar":      avatar_url,
        "roles":       resolved_roles,
    }


@router.delete("/whitelist/{app_id}")
async def delete_whitelist_app(app_id: str, _: dict = Depends(require_admin)):
    supabase.table("fivem_whitelist").delete().eq("id", app_id).execute()
    return {"message": "Application deleted."}

@router.post("/whitelist/manual")
async def manual_add_whitelist(
    body: WhitelistManualAdd,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_staff)
):
    existing = (supabase.table("fivem_whitelist").select("id,status")
                .eq("discord_id", body.discord_id).eq("status", "approved").execute())
    if existing.data:
        raise HTTPException(400, "Player is already whitelisted.")

    identifier_filters = []
    if body.fivem_license:
        identifier_filters.append(f"fivem_license.eq.{body.fivem_license}")
    if body.steam_hex:
        identifier_filters.append(f"steam_hex.eq.{body.steam_hex}")
    if body.fivem_id:
        identifier_filters.append(f"fivem_id.eq.{body.fivem_id}")
    if identifier_filters:
        id_existing = (supabase.table("fivem_whitelist")
                       .select("id,status,discord_id")
                       .eq("status", "approved")
                       .or_(",".join(identifier_filters))
                       .limit(1)
                       .execute())
        if id_existing.data:
            raise HTTPException(400, "That player identifier is already whitelisted.")

    username = user.get("username", "admin")
    priority_updates = _priority_update_fields(
        body.priority_tier,
        body.priority_level,
        body.priority_expires_at,
    )
    res = supabase.table("fivem_whitelist").insert({
        "discord_id":         body.discord_id,
        "discord_name":       body.discord_name,
        "steam_hex":          body.steam_hex,
        "fivem_license":      body.fivem_license,
        "fivem_id":           body.fivem_id,
        "character_name":     body.character_name,
        "character_backstory":"Manually added by admin.",
        "age": 0, "rp_experience": "N/A",
        "why_join":       "Manually added by admin.",
        "status":         "approved",
        "reviewer_note":  body.reviewer_note or "Manually added.",
        "reviewed_by":    username,
        "reviewed_at":    _now(),
        "applied_at":     _now(),
        "approved_at":    _now(),
        "sync_source":    "website_manual",
        "txadmin_synced": False,
        **priority_updates,
    }).execute()
    app = (res.data or [{}])[0]

    async def _push():
        await _sync_to_txadmin(app, username, "website_manual")

    background_tasks.add_task(_push)
    await _send_whitelist_email(app, "approved", body.reviewer_note or "Manually added by staff.")
    return {"message": "Player manually whitelisted â€” syncing to server in background.", "app": app}

# â”€â”€â”€ Fallback Lua polling endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.post("/whitelist/mark-synced")
async def mark_synced(body: MarkSynced, request: Request):
    """Lua calls this after successfully adding a player to txAdmin."""
    _check_token(request)
    upd = {"txadmin_synced": True, "sync_source": "txadmin", "approved_at": _now()}
    if body.app_id:
        supabase.table("fivem_whitelist").update(upd).eq("id", body.app_id).execute()
    elif body.license:
        supabase.table("fivem_whitelist").update(upd).or_(
            f"steam_hex.eq.{body.license},fivem_id.eq.{body.license}"
        ).execute()
    else:
        raise HTTPException(400, "Provide app_id or license")
    return {"ok": True}



def _answer_identifiers(answers: dict) -> list[str]:
    ids: list[str] = []
    for key in ("license", "fivem_license", "license2", "steam_hex", "steam", "fivem_id", "discord_id"):
        val = str((answers or {}).get(key) or "").strip()
        if not val:
            continue
        low = val.lower()
        if key == "discord_id" and not low.startswith("discord:"):
            val = f"discord:{val}"
        elif key == "fivem_id" and not low.startswith("fivem:"):
            val = f"fivem:{val}"
        elif key in ("steam_hex", "steam") and low.startswith("110000"):
            val = f"steam:{val}"
        ids.append(val)
    return list(dict.fromkeys(ids))

@router.get("/application-actions/pending")
async def pending_application_actions(request: Request):
    _check_token(request)
    res = (
        supabase.table("application_form_submissions")
        .select("id,form_slug,form_title,user_id,username,email,answers,status,approved_action,action_status,action_attempts,updated_at")
        .eq("status", "approved")
        .in_("action_status", ["pending", "failed"])
        .order("updated_at", desc=False)
        .limit(25)
        .execute()
    )
    out = []
    for row in res.data or []:
        answers = row.get("answers") or {}
        action = row.get("approved_action") if isinstance(row.get("approved_action"), dict) else {}
        out.append({
            "submission_id": row.get("id"),
            "form_slug": row.get("form_slug"),
            "form_title": row.get("form_title"),
            "username": row.get("username"),
            "email": row.get("email"),
            "answers": answers,
            "approved_action": action,
            "identifiers": _answer_identifiers(answers),
            "attempts": int(row.get("action_attempts") or 0),
        })
    return out

@router.post("/application-actions/mark-synced")
async def mark_application_action_synced(body: ApplicationActionSyncBody, request: Request):
    _check_token(request)
    current = supabase.table("application_form_submissions").select("action_attempts").eq("id", body.submission_id).limit(1).execute()
    attempts = int((current.data or [{}])[0].get("action_attempts") or 0) + 1
    patch = {
        "action_status": body.status,
        "action_attempts": attempts,
        "action_sync_error": body.message if body.status == "failed" else None,
        "updated_at": _now(),
    }
    if body.status in ("synced", "skipped"):
        patch["action_synced_at"] = _now()
    res = supabase.table("application_form_submissions").update(patch).eq("id", body.submission_id).execute()
    if not res.data:
        raise HTTPException(404, "Submission not found")
    return {"ok": True, "submission": res.data[0]}

# â”€â”€â”€ txAdmin â†’ Website  (Lua forwards txAdmin:events:* here) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.post("/txadmin-event")
async def receive_txadmin_event(
    body: TxAdminEvent,
    background_tasks: BackgroundTasks,
    request: Request
):
    """
    Receives txAdmin native events forwarded by the Lua resource.
    Updates fivem_whitelist immediately and pushes to fivem_realtime_events
    so the admin panel sees the change without polling.

    Handles:
      whitelistPreApproval  â€” admin approved/removed via txAdmin panel
      playerWhitelisted     â€” player passed whitelist check on join
      whitelistPlayer       â€” alias for playerWhitelisted (older txAdmin)
      whitelistRequest      â€” player was rejected and request was logged
    """
    _check_token(request)
    event = body.event
    data  = body.data

    if event == "whitelistPreApproval":
        action     = data.get("action", "")       # "added" | "removed"
        identifier = data.get("identifier", "")   # "license:abcâ€¦"
        admin_name = data.get("adminName", "txAdmin")
        discord_id = data.get("discord_id") or data.get("discordId") or data.get("discord")

        if action == "added" and identifier:
            # Try to find existing application by identifier first.
            matched = (supabase.table("fivem_whitelist").select("id,status,discord_name")
                       .or_(f"steam_hex.eq.{identifier},fivem_license.eq.{identifier},fivem_id.eq.{identifier}")
                       .limit(1).execute())

            matched_app = (matched.data or [None])[0]

            if not matched_app and discord_id:
                by_discord = (supabase.table("fivem_whitelist")
                              .select("id,status,discord_name,steam_hex,fivem_license,fivem_id")
                              .eq("discord_id", discord_id)
                              .order("applied_at", desc=True)
                              .limit(1)
                              .execute())
                matched_app = (by_discord.data or [None])[0]

            if not matched_app:
                # Website approvals usually get pushed to txAdmin before we
                # know the player's license. If txAdmin immediately echoes the
                # license-only approval back, merge it into the single recent
                # website-approved row instead of creating an Unknown duplicate.
                recent = (supabase.table("fivem_whitelist")
                          .select("id,status,discord_name,steam_hex,fivem_license,fivem_id,approved_at")
                          .eq("status", "approved")
                          .eq("txadmin_synced", False)
                          .order("approved_at", desc=True)
                          .limit(3)
                          .execute())
                recent_candidates = []
                for row in recent.data or []:
                    has_id = row.get("steam_hex") or row.get("fivem_license") or row.get("fivem_id")
                    if has_id:
                        continue
                    try:
                        approved_at = datetime.fromisoformat(str(row.get("approved_at")).replace("Z", "+00:00"))
                        if datetime.now(timezone.utc) - approved_at <= timedelta(minutes=10):
                            recent_candidates.append(row)
                    except Exception:
                        continue
                if len(recent_candidates) == 1:
                    matched_app = recent_candidates[0]

            if matched_app:
                app = matched_app
                upd: dict = {
                    "txadmin_synced": True,
                    "sync_source":    "txadmin",
                    "approved_at":    _now(),
                    **_identifier_update_fields(identifier, app),
                }
                if app.get("status") != "approved":
                    upd.update({
                        "status":       "approved",
                        "reviewed_by":  admin_name,
                        "reviewed_at":  _now(),
                    })
                supabase.table("fivem_whitelist").update(upd).eq("id", app["id"]).execute()
                log.info("txAdminâ†’website: approved %s by %s", identifier, admin_name)

                background_tasks.add_task(_push_realtime, "whitelist_txadmin_approved", {
                    "app_id":      app["id"],
                    "player_name": app.get("discord_name"),
                    "identifier":  identifier,
                    "approved_by": admin_name,
                    "source":      "txadmin",
                })
            else:
                # No existing application â€” auto-create an approved entry
                identifier_updates = _identifier_update_fields(identifier)
                ins = supabase.table("fivem_whitelist").insert({
                    "discord_id":         discord_id or identifier,
                    "discord_name":       f"txAdmin:{identifier[:20]}",
                    "character_name":     "Unknown (txAdmin approved)",
                    "character_backstory":"Auto-created from txAdmin approval.",
                    "age": 0, "rp_experience": "N/A",
                    "why_join":       "Approved directly in txAdmin panel.",
                    "status":         "approved",
                    "applied_at":     _now(),
                    "approved_at":    _now(),
                    "reviewed_at":    _now(),
                    "reviewed_by":    admin_name,
                    "sync_source":    "txadmin",
                    "txadmin_synced": True,
                    **identifier_updates,
                }).execute()
                new_id = (ins.data or [{}])[0].get("id", "new")
                log.info("txAdminâ†’website: auto-created approved entry for %s", identifier)
                background_tasks.add_task(_push_realtime, "whitelist_txadmin_approved", {
                    "app_id": new_id, "identifier": identifier, "approved_by": admin_name,
                    "source": "txadmin_auto",
                })

        elif action == "removed" and identifier:
            supabase.table("fivem_whitelist").update({
                "txadmin_synced": False,
                "sync_source":    "txadmin",
            }).or_(f"steam_hex.eq.{identifier},fivem_license.eq.{identifier},fivem_id.eq.{identifier}").execute()
            background_tasks.add_task(_push_realtime, "whitelist_txadmin_removed", {
                "identifier": identifier, "removed_by": data.get("adminName"),
            })

    elif event in ("playerWhitelisted", "whitelistPlayer"):
        # Player joined successfully through txAdmin whitelist gate
        identifier = data.get("license") or data.get("identifier", "")
        if identifier:
            (supabase.table("fivem_whitelist")
             .update({"txadmin_synced": True, "sync_source": "txadmin"})
             .or_(f"steam_hex.eq.{identifier},fivem_license.eq.{identifier},fivem_id.eq.{identifier}")
             .eq("status", "approved").execute())
            background_tasks.add_task(_push_realtime, "player_joined_whitelist", {
                "identifier": identifier,
            })

    elif event == "whitelistRequest":
        # Player rejected â€” just log it for visibility
        log.info("txAdmin whitelist request: %s", data)

    # â”€â”€ BAN SYNC: txAdmin â†’ Website â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    elif event == "playerBanned":
        # txAdmin banned a player â€” create/update the ban record on website
        identifier  = data.get("license") or data.get("identifier", "")
        player_name = data.get("name") or data.get("playerName", "Unknown")
        reason      = data.get("reason", "Banned via txAdmin")
        admin_name  = data.get("adminName", "txAdmin")
        expires_at  = data.get("expiration")  # ISO string or null

        if identifier:
            # Check if ban already exists
            action_id = data.get("actionId") or data.get("action_id")
            existing = supabase.table("fivem_bans").select("id") \
                .eq("identifier", identifier).eq("active", True).execute()
            if not existing.data:
                supabase.table("fivem_bans").insert({
                    "identifier":  identifier,
                    "player_name": player_name,
                    "reason":      reason,
                    "banned_by":   admin_name,
                    "banned_at":   _now(),
                    "active":      True,
                    "expires_at":  expires_at,
                    "source":      "txadmin",
                    "txadmin_synced": True,
                    "txadmin_action_id": str(action_id) if action_id else None,
                }).execute()
                log.info("txAdminâ†’website: ban synced for %s by %s", identifier, admin_name)
                background_tasks.add_task(_push_realtime, "player_banned_txadmin", {
                    "identifier": identifier, "player_name": player_name,
                    "reason": reason, "banned_by": admin_name,
                })
            elif action_id:
                supabase.table("fivem_bans").update({
                    "txadmin_synced": True,
                    "txadmin_action_id": str(action_id),
                }).eq("id", existing.data[0]["id"]).execute()

    elif event == "playerUnbanned":
        # txAdmin unbanned a player â€” lift the ban on website
        identifier = data.get("license") or data.get("identifier", "")
        admin_name = data.get("adminName", "txAdmin")
        if identifier:
            action_id = data.get("actionId") or data.get("action_id")
            updates: dict = {
                "active":       False,
                "unbanned_by":  admin_name,
                "unbanned_at":  _now(),
                "source":       "txadmin",
                "txadmin_synced": True,
            }
            if action_id:
                updates["txadmin_action_id"] = str(action_id)
            supabase.table("fivem_bans").update(updates).eq("identifier", identifier).eq("active", True).execute()
            log.info("txAdminâ†’website: unban synced for %s by %s", identifier, admin_name)
            background_tasks.add_task(_push_realtime, "player_unbanned_txadmin", {
                "identifier": identifier, "unbanned_by": admin_name,
            })

    return {"ok": True, "event": event}

# â”€â”€â”€ Bans â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.get("/bans")
async def list_bans(active: Optional[bool] = None, limit: int = 50, offset: int = 0,
                    _: dict = Depends(require_staff)):
    q = supabase.table("fivem_bans").select("*", count="exact")
    if active is not None: q = q.eq("active", active)
    res = q.order("banned_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"bans": res.data or [], "total": res.count or 0}

@router.get("/bans/pending-sync")
async def pending_ban_sync(request: Request, limit: int = 25):
    _check_token(request)
    res = (supabase.table("fivem_bans").select("*")
           .eq("active", True)
           .eq("txadmin_synced", False)
           .order("banned_at", desc=False)
           .limit(limit)
           .execute())
    rows: list[dict] = []
    for ban in res.data or []:
        ids = _normalize_identifier_list(ban.get("all_ids"))
        ident = (ban.get("identifier") or "").strip()
        if ident and ident not in ids:
            ids.insert(0, ident)
        license_id = _first_identifier(ids, ("license:", "license2:"))
        discord_id = _first_identifier(ids, ("discord:",))
        rows.append({
            "id": ban.get("id"),
            "identifier": ident or _primary_ban_identifier(ids),
            "identifiers": ids,
            "license": license_id,
            "discord": discord_id,
            "player_name": ban.get("player_name") or "Unknown",
            "reason": ban.get("reason") or "Banned",
            "duration": _ban_duration_txadmin(ban),
            "banned_by": ban.get("banned_by") or "website",
            "expires_at": ban.get("expires_at"),
            "expire": _ban_expire_epoch(ban.get("expires_at")),
        })
    return rows

@router.get("/bans/pending-unban")
async def pending_unban_sync(request: Request, limit: int = 25):
    _check_token(request)
    res = (supabase.table("fivem_bans").select("*")
           .eq("active", False)
           .eq("txadmin_synced", False)
           .in_("source", ("qbx_unban_pending", "txadmin_unban_pending", "txadmin_revoke_failed"))
           .order("unbanned_at", desc=False)
           .limit(limit)
           .execute())
    rows: list[dict] = []
    for ban in res.data or []:
        ids = _normalize_identifier_list(ban.get("all_ids"))
        ident = (ban.get("identifier") or "").strip()
        if ident and ident not in ids:
            ids.insert(0, ident)
        rows.append({
            "id": ban.get("id"),
            "identifier": ident or _primary_ban_identifier(ids),
            "identifiers": ids,
            "license": _first_identifier(ids, ("license:", "license2:")),
            "discord": _first_identifier(ids, ("discord:",)),
        })
    return rows

@router.post("/bans/mark-synced")
async def mark_ban_synced(body: BanSyncAck, request: Request):
    _check_token(request)
    ban_res = supabase.table("fivem_bans").select("id,active,source").eq("id", body.ban_id).execute()
    if not ban_res.data:
        raise HTTPException(404, "Ban not found")
    ban = ban_res.data[0]
    active = bool(ban.get("active"))
    updates = {
        "txadmin_synced": body.ok,
        "source": "qbx_core" if body.ok and active else "qbx_core_unbanned" if body.ok else ban.get("source") or "qbx_sync_failed",
    }
    supabase.table("fivem_bans").update(updates).eq("id", body.ban_id).execute()
    return {"ok": True, "synced": body.ok}


# ── Ban application via txAdmin (website → game server) ───────────────────────
def _ban_duration_txadmin(ban: dict) -> str:
    dur = (ban.get("duration") or "").strip().lower()
    return dur if dur in {"permanent", "2 hours", "12 hours", "1 day", "2 days", "1 week", "2 weeks", "1 month"} else "permanent"


def _resolve_net_id(ids: list[str]) -> Optional[int]:
    """Find the current netId of an online player from the latest fivem_players snapshot."""
    try:
        res = supabase.table("fivem_players").select("players").eq("id", "main").execute()
        if not res.data:
            return None
        for p in res.data[0].get("players") or []:
            if not isinstance(p, dict):
                continue
            pids = _player_identifiers(p)
            known = {str(x).lower() for x in pids.get("all", [])}
            for ident in ids:
                if str(ident or "").lower() in known:
                    return p.get("server_id")
    except Exception as exc:
        log.warning("Could not resolve netId for ban: %s", exc)
    return None


async def _push_ban_to_txadmin(ban_id: str) -> dict:
    """Apply a website ban through txAdmin; marks the row synced on success."""
    try:
        res = supabase.table("fivem_bans").select("*").eq("id", ban_id).execute()
        ban = (res.data or [None])[0]
        if not ban or not ban.get("active"):
            return {"ok": False, "skipped": True}
        ids = _normalize_identifier_list(ban.get("all_ids"))
        ident = (ban.get("identifier") or "").strip()
        if ident and ident not in ids:
            ids.insert(0, ident)
        reason = ban.get("reason") or "Banned via aifazi.net"
        duration = _ban_duration_txadmin(ban)
        action_id: Optional[str] = None
        net_id = _resolve_net_id(ids)
        if net_id:
            ok, result = await txa.ban_online_player(int(net_id), reason, duration)
            action_id = result if ok else None
        else:
            ok, result = await txa.ban_by_identifiers(ids, ban.get("player_name") or "Unknown", reason, duration)
            action_id = result if ok else None
        if ok:
            supabase.table("fivem_bans").update({
                "txadmin_synced": True,
                "source": "txadmin",
                "txadmin_action_id": action_id,
            }).eq("id", ban_id).execute()
            await _push_realtime("player_banned_synced", {
                "ban_id": ban_id,
                "identifier": ident or (ids[0] if ids else None),
            })
            return {"ok": True}
        supabase.table("fivem_bans").update({
            "txadmin_synced": False,
            "source": "txadmin_failed",
            "txadmin_action_id": None,
        }).eq("id", ban_id).execute()
        await _push_realtime("player_ban_sync_failed", {
            "ban_id": ban_id,
            "error": str(action_id)[:200],
        })
        return {"ok": False, "error": action_id}
    except Exception as exc:
        log.warning("txAdmin ban push failed for %s: %s", ban_id, exc)
        return {"ok": False, "error": str(exc)}


async def _push_unban_to_txadmin(ban_id: str) -> dict:
    """Revoke a txAdmin ban by its stored actionId; marks the row synced on success."""
    try:
        res = supabase.table("fivem_bans").select("*").eq("id", ban_id).execute()
        ban = (res.data or [None])[0]
        if not ban or ban.get("active"):
            return {"ok": False, "skipped": True}
        action_id = (ban.get("txadmin_action_id") or "").strip()
        if not action_id:
            supabase.table("fivem_bans").update({
                "txadmin_synced": False,
                "source": "txadmin_revoke_failed",
            }).eq("id", ban_id).execute()
            return {"ok": False, "error": "no_action_id"}
        ok, msg = await txa.revoke_ban(action_id)
        if ok:
            supabase.table("fivem_bans").update({
                "txadmin_synced": True,
                "source": "txadmin_revoked",
            }).eq("id", ban_id).execute()
            await _push_realtime("player_unbanned_synced", {"ban_id": ban_id})
            return {"ok": True}
        supabase.table("fivem_bans").update({
            "txadmin_synced": False,
            "source": "txadmin_revoke_failed",
        }).eq("id", ban_id).execute()
        await _push_realtime("player_unban_sync_failed", {
            "ban_id": ban_id,
            "error": str(msg)[:200],
        })
        return {"ok": False, "error": msg}
    except Exception as exc:
        log.warning("txAdmin unban push failed for %s: %s", ban_id, exc)
        return {"ok": False, "error": str(exc)}


@router.post("/bans")
async def create_ban(
    body: BanCreate,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_staff)
):
    """
    Create a website ban and queue it for the FiveM/qbx_core resource to sync.
    """
    username = user.get("username", "admin")

    ids = _normalize_identifier_list(body.identifiers)
    if body.identifier and body.identifier.strip() not in ids:
        ids.append(body.identifier.strip())
    if not ids:
        raise HTTPException(400, "At least one identifier is required")

    primary_id = _primary_ban_identifier(ids)
    if not primary_id:
        raise HTTPException(400, "At least one identifier is required")

    try:
        expires_at = _ban_expires_at(body.duration, body.expires_at)
    except ValueError:
        raise HTTPException(400, "Invalid ban expiry time")
    if (body.duration or "").strip().lower() == "custom" and not expires_at:
        raise HTTPException(400, "Custom duration requires an expiry time")
    parsed_expiry = _parse_datetime(expires_at)
    if parsed_expiry and parsed_expiry <= datetime.now(timezone.utc):
        raise HTTPException(400, "Ban expiry must be in the future")

    for ident in ids:
        existing = (supabase.table("fivem_bans").select("id")
                    .eq("identifier", ident).eq("active", True).execute())
        if existing.data:
            raise HTTPException(409, "Player already has an active ban")

    ban_row = {
        "identifier":  primary_id,
        "all_ids":     ids,
        "player_name": body.player_name,
        "reason":      body.reason,
        "duration":    body.duration,
        "expires_at":  expires_at,
        "banned_by":   username,
        "banned_at":   _now(),
        "active":      True,
        "source":      "website",
        "txadmin_synced": False,
        "txadmin_action_id": None,
    }
    res = supabase.table("fivem_bans").insert(ban_row).execute()
    ban = (res.data or [{}])[0]
    ban_id = ban.get("id")

    background_tasks.add_task(_push_ban_to_txadmin, ban_id)

    await _push_realtime("player_banned_website", {
        "ban_id":      ban_id,
        "identifier":  primary_id,
        "player_name": body.player_name,
        "reason":      body.reason,
        "duration":    body.duration,
        "banned_by":   username,
        "core_sync":   False,
    })

    matched_app = _find_whitelist_by_identifiers(ids)
    if matched_app:
        await _send_whitelist_email(matched_app, "banned", body.reason, {
            "expires_at": expires_at,
            "duration": body.duration,
        })

    return {"message": "Player banned â€” queued for server sync.", "ban": ban}


@router.patch("/bans/{ban_id}")
async def update_ban(ban_id: str, body: BanUpdate, _: dict = Depends(require_staff)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates: raise HTTPException(400, "No fields to update")
    res = supabase.table("fivem_bans").update(updates).eq("id", ban_id).execute()
    return {"message": "Ban updated.", "ban": (res.data or [{}])[0]}

@router.delete("/bans/{ban_id}")
async def delete_ban(ban_id: str, _: dict = Depends(require_admin)):
    supabase.table("fivem_bans").delete().eq("id", ban_id).execute()
    return {"message": "Ban removed."}

@router.post("/bans/{ban_id}/unban")
async def unban_player(
    ban_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_staff)
):
    """
    Lift a ban on the website and revoke it via txAdmin in the background.
    """
    ban_res = supabase.table("fivem_bans").select("*").eq("id", ban_id).execute()
    if not ban_res.data: raise HTTPException(404, "Ban not found")
    ban = ban_res.data[0]
    username = user.get("username", "admin")

    # Update DB immediately
    supabase.table("fivem_bans").update({
        "active":       False,
        "unbanned_by":  username,
        "unbanned_at":  _now(),
        "source":       "txadmin_unban_pending",
        "txadmin_synced": False,
    }).eq("id", ban_id).execute()

    background_tasks.add_task(_push_unban_to_txadmin, ban_id)

    await _push_realtime("player_unbanned_website", {
        "ban_id":     ban_id,
        "identifier": ban.get("identifier"),
        "unbanned_by": username,
        "core_sync": False,
    })

    ids = _normalize_identifier_list(ban.get("all_ids"))
    ident = (ban.get("identifier") or "").strip()
    if ident and ident not in ids:
        ids.insert(0, ident)
    matched_app = _find_whitelist_by_identifiers(ids)
    if matched_app:
        await _send_whitelist_email(matched_app, "unbanned")

    return {"message": "Player unbanned â€” queued for server sync.", "ban": ban}

@router.get("/bans/check/{identifier}")
async def check_ban(identifier: str):
    now = _now()
    res = (supabase.table("fivem_bans").select("*")
           .eq("identifier", identifier).eq("active", True)
           .or_(f"expires_at.is.null,expires_at.gt.{now}").execute())
    if not res.data: return {"banned": False}
    ban = res.data[0]
    return {"banned": True, "reason": ban["reason"],
            "expires_at": ban.get("expires_at"), "banned_by": ban["banned_by"]}

# â”€â”€â”€ Server Status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.post("/status")
async def update_server_status(body: StatusUpdate, request: Request):
    _check_token(request)
    now_iso      = _now()
    # FIX: force_offline shifts updated_at into the past so the threshold
    # triggers "offline" immediately on the public status page
    effective_ts = (
        (datetime.now(timezone.utc) - timedelta(seconds=DEGRADED_THRESHOLD_S + 60)).isoformat()
        if body.force_offline else now_iso
    )
    cur  = supabase.table("fivem_status").select("peak_players").eq("id", "main").execute()
    peak = max((cur.data[0].get("peak_players", 0) if cur.data else 0), body.players_online)

    supabase.table("fivem_status").upsert({
        "id": "main",
        "players_online":  body.players_online,
        "max_players":     body.max_players,
        "server_name":     body.server_name,
        "server_version":  body.server_version,
        "uptime_seconds":  body.uptime_seconds,
        "resource_count":  body.resource_count,
        "peak_players":    peak,
        "updated_at":      effective_ts,
    }).execute()

    # Persist to history (skip offline pings to keep graph clean)
    if not body.force_offline:
        supabase.table("server_status_history").insert({
            "recorded_at":    now_iso,
            "players_online": body.players_online,
            "max_players":    body.max_players,
            "uptime_seconds": body.uptime_seconds,
            "status":         "online",
        }).execute()

    # FIX: if the heartbeat includes a players list, upsert fivem_players too
    if body.players:
        supabase.table("fivem_players").upsert({
            "id":         "main",
            "players":    body.players,
            "updated_at": now_iso,
        }).execute()
        _stamp_whitelist_activity(body.players, now_iso)

    return {"ok": True}

@router.get("/status")
async def get_server_status():
    res = supabase.table("fivem_status").select("*").eq("id", "main").execute()
    if not res.data:
        return {
            "status": "offline", "players_online": 0, "max_players": 48,
            "last_seen": None, "last_seen_label": "No heartbeat received",
            "uptime_seconds": 0, "uptime_label": "0m", "resource_count": 0,
            "server_name": "AIFAZI RP", "peak_players": 0,
            "dev_override": None, "display_message": "No heartbeat received", "fake_data": False,
        }
    d  = res.data[0]
    ov = d.get("dev_override")
    uptime = d.get("uptime_seconds", 0)

    if ov == "maintenance":
        return {"status": "maintenance", "players_online": 0, "max_players": d.get("max_players", 48),
                "display_message": "Server is under maintenance",
                **{k: d.get(k) for k in ("server_name","peak_players","resource_count","updated_at")},
                "dev_override": "maintenance", "uptime_seconds": 0, "uptime_label": "0m",
                "last_seen": d.get("updated_at"), "last_seen_label": "Maintenance Mode", "fake_data": False}

    if ov == "force_online":
        return {"status": "online", "players_online": d.get("players_online", 0),
                "max_players": d.get("max_players", 48),
                "display_message": "Force Online override active", "dev_override": "force_online",
                "uptime_seconds": uptime, "uptime_label": _uptime_str(uptime),
                "server_name": d.get("server_name"), "peak_players": d.get("peak_players", 0),
                "resource_count": d.get("resource_count", 0),
                "last_seen": d.get("updated_at"), "last_seen_label": "Force Online (dev)", "fake_data": False}

    status, age = _compute_status(d.get("updated_at"))
    players = d.get("players_online", 0) if status != "offline" else 0
    if status == "online":     msg = f"Online â€” {players}/{d.get('max_players',48)} players"
    elif status == "degraded": msg = f"Starting upâ€¦ (last seen {_last_seen_str(age)})"
    else:                      msg = f"Offline (last seen {_last_seen_str(age)})"

    return {
        "status": status, "players_online": players, "max_players": d.get("max_players", 48),
        "last_seen": d.get("updated_at"), "last_seen_label": _last_seen_str(age),
        "uptime_seconds": uptime, "uptime_label": _uptime_str(uptime),
        "resource_count": d.get("resource_count", 0), "server_name": d.get("server_name", "AIFAZI RP"),
        "peak_players": d.get("peak_players", 0), "dev_override": None,
        "display_message": msg, "fake_data": False,
    }

@router.get("/status/overview")
async def get_public_status_overview(hours: int = 24):
    """Public, visitor-safe server overview: status summary + sanitized online
    player list (names/ping only — all identifiers stripped) + history series.
    Feed for the public /fivem/status page."""
    hours = max(1, min(24, int(hours or 24)))

    status_res = supabase.table("fivem_status").select("*").eq("id", "main").execute()
    if not status_res.data:
        status = {
            "status": "offline", "players_online": 0, "max_players": 48,
            "last_seen": None, "last_seen_label": "No heartbeat received",
            "uptime_seconds": 0, "uptime_label": "0m", "resource_count": 0,
            "server_name": "AIFAZI RP", "peak_players": 0, "dev_override": None,
            "display_message": "No heartbeat received",
        }
    else:
        d = status_res.data[0]
        ov = d.get("dev_override")
        uptime = d.get("uptime_seconds", 0)
        if ov == "maintenance":
            status = {"status": "maintenance", "players_online": 0, "max_players": d.get("max_players", 48),
                      "display_message": "Server is under maintenance", "server_name": d.get("server_name"),
                      "peak_players": d.get("peak_players", 0), "resource_count": d.get("resource_count", 0),
                      "uptime_seconds": 0, "uptime_label": "0m", "last_seen": d.get("updated_at"),
                      "last_seen_label": "Maintenance Mode", "dev_override": "maintenance"}
        elif ov == "force_online":
            status = {"status": "online", "players_online": d.get("players_online", 0), "max_players": d.get("max_players", 48),
                      "display_message": "Force Online override active", "dev_override": "force_online",
                      "uptime_seconds": uptime, "uptime_label": _uptime_str(uptime), "server_name": d.get("server_name"),
                      "peak_players": d.get("peak_players", 0), "resource_count": d.get("resource_count", 0),
                      "last_seen": d.get("updated_at"), "last_seen_label": "Force Online (dev)"}
        else:
            status_label, age = _compute_status(d.get("updated_at"))
            players = d.get("players_online", 0) if status_label != "offline" else 0
            if status_label == "online":     msg = f"Online — {players}/{d.get('max_players',48)} players"
            elif status_label == "degraded": msg = f"Starting up… (last seen {_last_seen_str(age)})"
            else:                            msg = f"Offline (last seen {_last_seen_str(age)})"
            status = {"status": status_label, "players_online": players, "max_players": d.get("max_players", 48),
                      "last_seen": d.get("updated_at"), "last_seen_label": _last_seen_str(age),
                      "uptime_seconds": uptime, "uptime_label": _uptime_str(uptime),
                      "resource_count": d.get("resource_count", 0), "server_name": d.get("server_name", "AIFAZI RP"),
                      "peak_players": d.get("peak_players", 0), "dev_override": None, "display_message": msg}

    # Sanitized player list — strip every identifier, keep only display fields.
    players: list[dict] = []
    players_res = supabase.table("fivem_players").select("*").eq("id", "main").execute()
    if players_res.data:
        p = players_res.data[0]
        try:
            recent = (datetime.now(timezone.utc) - datetime.fromisoformat(
                (p.get("updated_at") or "").replace("Z", "+00:00"))).total_seconds() < 120
        except Exception:
            recent = False
        if recent:
            for row in (p.get("players") or []):
                if not isinstance(row, dict):
                    continue
                players.append({
                    "name": row.get("name") or row.get("username") or "Unknown",
                    "ping": row.get("ping") or 0,
                    "server_id": row.get("server_id"),
                    "session_seconds": row.get("session_seconds") or 0,
                })

    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    hist_res = (supabase.table("server_status_history")
                .select("recorded_at,players_online,max_players,status")
                .gte("recorded_at", since).order("recorded_at", desc=False)
                .limit(1000).execute())

    return {"status": status, "players": players, "history": hist_res.data or [], "hours": hours}

@router.post("/status/refresh")
async def refresh_status_timestamp(user: dict = Depends(require_staff)):
    """
    Reload the current status for the admin panel without changing the heartbeat
    timestamp. FiveM itself must report online/offline so this endpoint cannot
    accidentally make a stopped server look online.
    """
    status = await get_server_status()
    await _push_realtime("server_status_refresh", {
        "requested_by": user.get("username", "admin"),
        "status": status.get("status"),
    })
    return {"ok": True, **status}

@router.patch("/dev-override")
async def set_dev_override(body: DevOverride, _: dict = Depends(require_admin)):
    supabase.table("fivem_status").update({"dev_override": body.override}).eq("id", "main").execute()
    return {"ok": True, "override": body.override}

@router.get("/history")
async def get_status_history(hours: int = 24, _: dict = Depends(require_staff)):
    since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    res = (supabase.table("server_status_history")
           .select("recorded_at,players_online,max_players,uptime_seconds,status")
           .gte("recorded_at", since).order("recorded_at", desc=False).execute())
    return {"history": res.data or [], "hours": hours}

# â”€â”€â”€ Players â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.post("/players")
async def update_players(request: Request, background_tasks: BackgroundTasks):
    """Accepts {players: [...]} from Lua. Also handles bare array for compat."""
    _check_token(request)
    import json as _json
    raw = await request.body()
    try:
        data = _json.loads(raw)
    except Exception:
        raise HTTPException(422, "Invalid JSON")

    players = data.get("players", data) if isinstance(data, dict) else data
    if not isinstance(players, list):
        raise HTTPException(422, "Expected {players: [...]} or bare array")

    supabase.table("fivem_players").upsert({
        "id": "main", "players": players, "updated_at": _now()
    }).execute()
    _stamp_whitelist_activity(players, _now())
    return {"ok": True, "count": len(players)}

@router.get("/players")
async def get_players(_: dict = Depends(require_staff)):
    res = supabase.table("fivem_players").select("*").eq("id", "main").execute()
    def _recent(ts, w=120):
        try:
            return (datetime.now(timezone.utc) -
                    datetime.fromisoformat(ts.replace("Z", "+00:00"))).total_seconds() < w
        except:
            return False
    if res.data:
        d = res.data[0]
        online = _recent(d.get("updated_at", ""))
        return {"players": d.get("players", []) if online else [], "updated_at": d.get("updated_at"), "online": online}
    return {"players": [], "updated_at": None, "online": False}

# â”€â”€â”€ Cron â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.post("/cron/cleanup")
async def cron_cleanup(request: Request):
    """
    Called by Vercel cron (see vercel.json). Cleans up old realtime events.
    Secured by CRON_SECRET env var matching the Authorization header.

    H6 â€” uses `hmac.compare_digest` instead of `!=` for constant-time comparison
    (avoids remote timing-oracle recovery of the cron secret).
    """
    cron_secret = os.getenv("CRON_SECRET", "")
    auth_header = request.headers.get("Authorization", "")
    if not cron_secret:
        raise HTTPException(503, "Cron secret is not configured")
    expected = f"Bearer {cron_secret}"
    if not hmac.compare_digest(auth_header, expected):
        raise HTTPException(403, "Invalid cron secret")

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    try:
        supabase.table("fivem_realtime_events").delete().lt("created_at", cutoff).execute()
        log.info("Cron: cleaned realtime events older than 1h")
    except Exception as e:
        log.warning("Cron cleanup failed: %s", e)

    return {"ok": True, "cutoff": cutoff}

# â”€â”€â”€ Stats tile â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.get("/stats")
async def fivem_stats(_: dict = Depends(require_staff)):
    pending  = supabase.table("fivem_whitelist").select("id", count="exact").eq("status", "pending").execute()
    approved = supabase.table("fivem_whitelist").select("id", count="exact").eq("status", "approved").execute()
    bans     = supabase.table("fivem_bans").select("id", count="exact").eq("active", True).execute()
    srv_res  = supabase.table("fivem_status").select("*").eq("id", "main").execute()
    srv  = srv_res.data[0] if srv_res.data else {}
    computed, age = _compute_status(srv.get("updated_at"))
    ov = srv.get("dev_override")
    if ov == "force_online": computed = "online"
    elif ov == "maintenance": computed = "maintenance"
    online = computed == "online"
    uptime = srv.get("uptime_seconds", 0)
    return {
        "pending_applications": pending.count or 0,
        "whitelisted_players":  approved.count or 0,
        "active_bans":          bans.count or 0,
        "players_online":       srv.get("players_online", 0) if online else 0,
        "max_players":          srv.get("max_players", 48),
        "status":               computed,
        "online":               online,
        "uptime_label":         _uptime_str(uptime),
        "resource_count":       srv.get("resource_count", 0),
        "peak_players":         srv.get("peak_players", 0),
        "dev_override":         ov,
        "last_seen_label":      _last_seen_str(age),
        "server_name":          srv.get("server_name", "AIFAZI RP"),
    }

# â”€â”€â”€ Player Records â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.get("/players/records")
async def list_player_records(
    q: str = "", limit: int = 50, offset: int = 0,
    _: dict = Depends(require_staff),
):
    query = supabase.table("player_records").select("*", count="exact")
    if q and q.strip():
        t = q.strip()
        query = query.or_(
            f"player_name.ilike.%{t}%,"
            f"license_key.ilike.%{t}%,"
            f"license_hex.ilike.%{t}%,"
            f"license2_hex.ilike.%{t}%,"
            f"discord_id.ilike.%{t}%,"
            f"steam_hex.ilike.%{t}%,"
            f"forum_username.ilike.%{t}%"
        )
    res = query.order("last_seen_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"records": res.data or [], "total": res.count or 0}


@router.get("/players/records/{license_key}")
async def get_player_record(license_key: str, _: dict = Depends(require_staff)):
    res = supabase.table("player_records").select("*").eq("license_key", license_key).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Player record not found")
    return res.data[0]


@router.get("/players/sessions")
async def list_player_sessions(
    license_key: str = "", limit: int = 50, offset: int = 0,
    _: dict = Depends(require_staff),
):
    query = supabase.table("player_sessions").select("*", count="exact")
    if license_key:
        query = query.eq("license_key", license_key)
    res = query.order("joined_at", desc=True).range(offset, offset + limit - 1).execute()
    return {"sessions": res.data or [], "total": res.count or 0}


# ── Player data sync (Lua → website) ──────────────────────────────────────────
class PlayerJoinBody(BaseModel):
    server_id: int
    player_name: str
    license: Optional[str] = None
    license2: Optional[str] = None
    steam_hex: Optional[str] = None
    fivem_id: Optional[str] = None
    discord_id: Optional[str] = None
    identifiers: list[str] = []


class PlayerLeaveBody(BaseModel):
    server_id: int
    player_name: Optional[str] = None
    license: Optional[str] = None
    license2: Optional[str] = None
    identifiers: list[str] = []
    disconnect_reason: Optional[str] = None


class PlayerHeartbeatBody(BaseModel):
    players: list[dict] = []


class WhitelistIdentifiersBody(BaseModel):
    discord_id: Optional[str] = None
    license: Optional[str] = None
    license2: Optional[str] = None
    steam_hex: Optional[str] = None
    fivem_id: Optional[str] = None
    identifiers: list[str] = []


def _player_ids_from_fields(
    license_: Optional[str], license2: Optional[str], steam_hex: Optional[str],
    fivem_id: Optional[str], discord_id: Optional[str], identifiers: list[str],
) -> dict:
    raw = [str(x or "").strip() for x in (identifiers or []) if str(x or "").strip()]
    ids = _player_identifiers({
        "identifiers": raw,
        "license": license_,
        "license2": license2,
        "steam_hex": steam_hex,
        "fivem_id": fivem_id,
        "discord": discord_id,
    })
    ids["license_key"] = (ids.get("license") or ids.get("license2") or ids.get("fivem_license") or "").strip() or None
    return ids


def _build_player_record_row(ids: dict, player_name: str, server_id: Any, now_iso: str) -> dict | None:
    license_key = ids.get("license_key")
    if not license_key:
        return None
    row: dict = {
        "license_key":    license_key,
        "player_name":    player_name or "Unknown",
        "last_seen_at":   now_iso,
        "last_server_id": server_id,
        "updated_at":     now_iso,
    }
    for field, val in (
        ("license_hex", ids.get("license")),
        ("license2_hex", ids.get("license2")),
        ("discord_id", ids.get("discord_id")),
        ("steam_hex", ids.get("steam_hex")),
        ("fivem_id", ids.get("fivem_id")),
    ):
        if val:
            row[field] = val
    return row


def _upsert_player_record(ids: dict, player_name: str, server_id: Any, now_iso: str) -> dict | None:
    row = _build_player_record_row(ids, player_name, server_id, now_iso)
    if not row:
        return None
    res = supabase.table("player_records").upsert(row, on_conflict="license_key").execute()
    return (res.data or [None])[0]


@router.post("/players/join")
async def record_player_join(body: PlayerJoinBody, request: Request):
    """Lua fires on successful join — creates/updates player record + opens a session."""
    _check_token(request)
    now_iso = _now()
    ids = _player_ids_from_fields(body.license, body.license2, body.steam_hex, body.fivem_id, body.discord_id, body.identifiers)
    if not ids.get("license_key"):
        return {"ok": False, "reason": "no_license"}
    record = _upsert_player_record(ids, body.player_name, body.server_id, now_iso)
    if not record:
        return {"ok": False, "reason": "no_record"}
    sess = supabase.table("player_sessions").insert({
        "player_id":   record["id"],
        "license_key": ids["license_key"],
        "player_name": body.player_name or "Unknown",
        "joined_at":   now_iso,
        "server_id":   body.server_id,
        "identifiers": ids.get("all") or [],
    }).execute()
    return {"ok": True, "record_id": record["id"], "session_id": (sess.data or [{}])[0].get("id")}


@router.post("/players/leave")
async def record_player_leave(body: PlayerLeaveBody, request: Request):
    """Lua fires on playerDropped — closes the open session and bumps totals."""
    _check_token(request)
    now_iso = _now()
    ids = _player_ids_from_fields(body.license, body.license2, body.steam_hex, None, None, body.identifiers)
    license_key = ids.get("license_key")
    if not license_key:
        return {"ok": False, "reason": "no_license"}
    res = (supabase.table("player_sessions")
           .select("id,player_id,joined_at")
           .eq("license_key", license_key)
           .is_("left_at", "null")
           .order("joined_at", desc=True).limit(1).execute())
    session = (res.data or [None])[0]
    closed = 0
    if session:
        joined = _parse_dt(session.get("joined_at")) or datetime.now(timezone.utc)
        duration = max(0, int((datetime.now(timezone.utc) - joined).total_seconds()))
        supabase.table("player_sessions").update({
            "left_at":           now_iso,
            "duration_seconds":  duration,
            "disconnect_reason": (body.disconnect_reason or "")[:200],
        }).eq("id", session["id"]).execute()
        closed = 1
        rec_res = (supabase.table("player_records")
                   .select("id,total_sessions,total_playtime_seconds")
                   .eq("id", session["player_id"]).limit(1).execute())
        rec = (rec_res.data or [None])[0]
        if rec:
            supabase.table("player_records").update({
                "total_sessions":         int(rec.get("total_sessions") or 0) + 1,
                "total_playtime_seconds": int(rec.get("total_playtime_seconds") or 0) + duration,
                "last_seen_at":           now_iso,
                "last_server_id":         body.server_id,
            }).eq("id", rec["id"]).execute()
    return {"ok": True, "closed": closed, "license_key": license_key}


@router.post("/players/heartbeat-sync")
async def heartbeat_sync_players(body: PlayerHeartbeatBody, request: Request):
    """Lua sends with each heartbeat — keeps player_records.last_seen fresh."""
    _check_token(request)
    now_iso = _now()
    synced = 0
    # Batch all player upserts into ONE round-trip (was 1 upsert per player).
    rows = []
    for p in body.players or []:
        if not isinstance(p, dict):
            continue
        ids = _player_identifiers(p)
        if not (ids.get("license") or ids.get("license2") or ids.get("fivem_license")):
            continue
        row = _build_player_record_row(ids, p.get("name") or "Unknown", p.get("server_id"), now_iso)
        if row:
            rows.append(row)
            synced += 1
    if rows:
        supabase.table("player_records").upsert(rows, on_conflict="license_key").execute()
    return {"ok": True, "synced": synced}


@router.post("/whitelist/update-identifiers")
async def update_whitelist_identifiers(body: WhitelistIdentifiersBody, request: Request):
    """Lua patches license/steam/fivem identifiers onto the approved whitelist row on connect."""
    _check_token(request)
    ids = _player_ids_from_fields(body.license, body.license2, body.steam_hex, body.fivem_id, body.discord_id, body.identifiers)
    filters: list[str] = []
    discord = (ids.get("discord_id") or "").strip()
    if discord:
        filters.append(f"discord_id.eq.{discord}")
    for field in ("fivem_license", "steam_hex", "fivem_id"):
        val = str(ids.get(field) or "").strip()
        if val:
            filters.append(f"{field}.eq.{val}")
    if not filters:
        return {"ok": False, "reason": "no_identifiers"}
    res = (supabase.table("fivem_whitelist")
           .select("id,fivem_license,steam_hex,fivem_id")
           .eq("status", "approved")
           .or_(",".join(dict.fromkeys(filters)))
           .order("approved_at", desc=True).limit(1).execute())
    row = (res.data or [None])[0]
    if not row:
        return {"ok": False, "reason": "no_match"}
    updates: dict = {}
    for field, value in (
        ("fivem_license", ids.get("license")),
        ("fivem_license", ids.get("license2")),
        ("fivem_license", ids.get("fivem_license")),
        ("steam_hex", ids.get("steam_hex")),
        ("fivem_id", ids.get("fivem_id")),
    ):
        val = str(value or "").strip()
        if val and not row.get(field):
            updates.setdefault(field, val)
    if updates:
        supabase.table("fivem_whitelist").update(updates).eq("id", row["id"]).execute()
    return {"ok": True, "updated": updates}


# â”€â”€â”€ Bulk whitelist approve â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class BulkWhitelistApproveBody(BaseModel):
    app_ids: list[str]
    reviewer_note: Optional[str] = None
    priority_tier: Optional[str] = None
    priority_level: Optional[int] = None
    priority_expires_at: Optional[str] = None


@router.post("/whitelist/bulk-approve")
async def bulk_approve_whitelist(
    body: BulkWhitelistApproveBody,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_staff),
):
    if not body.app_ids:
        raise HTTPException(400, "No application IDs provided")
    if len(body.app_ids) > 100:
        raise HTTPException(400, "Maximum 100 applications per bulk operation")

    username = user.get("username", "admin")
    priority_updates = _priority_update_fields(
        body.priority_tier, body.priority_level, body.priority_expires_at,
    )
    now_iso = _now()
    results = {"approved": 0, "errors": []}

    apps_res = (
        supabase.table("fivem_whitelist").select("*")
        .in_("id", body.app_ids)
        .execute()
    )
    existing = {a["id"]: a for a in (apps_res.data or []) if a.get("id")}

    for app_id in body.app_ids:
        try:
            app = existing.get(app_id)
            if not app:
                results["errors"].append({"id": app_id, "error": "not found"})
                continue
            if app["status"] == "approved":
                results["errors"].append({"id": app_id, "error": "already approved"})
                continue

            supabase.table("fivem_whitelist").update({
                "status": "approved",
                "reviewer_note": body.reviewer_note or app.get("reviewer_note"),
                "reviewed_by": username,
                "reviewed_at": now_iso,
                "approved_at": now_iso,
                "sync_source": "website",
                "txadmin_synced": False,
                **priority_updates,
            }).eq("id", app_id).execute()

            app_updated = app | {
                "status": "approved",
                "reviewed_by": username,
                "reviewed_at": now_iso,
                "approved_at": now_iso,
                **priority_updates,
            }

            if app.get("discord_id"):
                background_tasks.add_task(_discord_assign_whitelist_role, app["discord_id"])
            background_tasks.add_task(_sync_to_txadmin, app_updated, username, "website")
            results["approved"] += 1
        except Exception as exc:
            results["errors"].append({"id": app_id, "error": str(exc)[:200]})

    return {
        "message": f"Approved {results['approved']}/{len(body.app_ids)} applications.",
        **results,
    }


# â”€â”€â”€ txAdmin health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@router.get("/txadmin/status")
async def txadmin_status(_: dict = Depends(require_staff)):
    """Check whether the backend can reach txAdmin."""
    reachable = await txa.is_available()
    return {
        "url":        txa.TXADMIN_URL,
        "reachable":  reachable,
        "session_ok": txa._is_valid(),
        "configured": bool(txa.TXADMIN_USERNAME and txa.TXADMIN_PASSWORD),
    }


# â”€â”€â”€ Connect token gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
_CONNECT_TOKEN_EXP = 300  # 5 minutes
_CONNECT_COOLDOWN_S = 30
_STAFF_DIRECT_ROLES = {"admin", "moderator", "editor", "chat", "fivem", "staff"}


class ConnectTokenResponse(BaseModel):
    token: str
    expires_in: int
    username: str
    connect_url: str


class VerifyTokenRequest(BaseModel):
    token: str


class ConnectSessionRequest(BaseModel):
    player_name: Optional[str] = None
    fivem_license: Optional[str] = None
    license2: Optional[str] = None
    steam_hex: Optional[str] = None
    fivem_id: Optional[str] = None
    discord_id: Optional[str] = None
    identifiers: list[str] = []


def _jwt_secret() -> str:
    secret = os.environ.get("PASETO_SECRET") or os.environ.get("JWT_SECRET") or os.environ.get("INTERNAL_API_SECRET")
    if not secret:
        raise HTTPException(503, "PASETO_SECRET or INTERNAL_API_SECRET is required")
    return secret


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def _forum_user_for_connect(user: dict) -> dict:
    user_id = user.get("id") or user.get("forum_user_id")
    if not user_id:
        raise HTTPException(401, "Authentication required")
    res = (
        supabase.table("users")
        .select("id,username,role,discord_id,steam_id")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "User not found")
    return res.data[0]


def _connect_ban_filters(forum_user: dict, whitelist_row: dict | None = None) -> list[str]:
    filters: list[str] = []
    discord_id = (forum_user.get("discord_id") or "").strip()
    if discord_id:
        filters.append(f"identifier.eq.discord:{discord_id}")
        filters.append(f"identifier.eq.{discord_id}")
    steam_id = (forum_user.get("steam_id") or "").strip()
    if steam_id:
        filters.append(f"identifier.eq.{steam_id}")
    if whitelist_row:
        for key in ("fivem_license", "license_hex", "license2_hex", "steam_hex", "fivem_id"):
            value = (whitelist_row.get(key) or "").strip()
            if value:
                filters.append(f"identifier.eq.{value}")
    return filters


def _normalize_discord_id(value: str | None) -> str:
    raw = (value or "").strip()
    return raw.split(":", 1)[1] if raw.startswith("discord:") else raw


def _session_identifier_filters(body: ConnectSessionRequest) -> list[str]:
    filters: list[str] = []
    values = {
        "fivem_license": (body.fivem_license or "").strip(),
        "license2_hex": (body.license2 or "").strip(),
        "steam_hex": (body.steam_hex or "").strip(),
        "fivem_id": (body.fivem_id or "").strip(),
        "discord_id": _normalize_discord_id(body.discord_id),
    }
    for raw in body.identifiers or []:
        ident = str(raw or "").strip()
        low = ident.lower()
        if low.startswith("license:"):
            values["fivem_license"] = ident
        elif low.startswith("license2:"):
            values["license2_hex"] = ident
        elif low.startswith("steam:"):
            values["steam_hex"] = ident
        elif low.startswith("fivem:"):
            values["fivem_id"] = ident
        elif low.startswith("discord:"):
            values["discord_id"] = ident.split(":", 1)[1]

    if values["fivem_license"]:
        filters.append(f"fivem_license.eq.{values['fivem_license']}")
    if values["license2_hex"]:
        filters.append(f"license2_hex.eq.{values['license2_hex']}")
    if values["steam_hex"]:
        filters.append(f"steam_hex.eq.{values['steam_hex']}")
    if values["fivem_id"]:
        filters.append(f"fivem_id.eq.{values['fivem_id']}")
    if values["discord_id"]:
        filters.append(f"discord_id.eq.{values['discord_id']}")
    return filters


def _forum_user_matches_session(forum_user: dict, body: ConnectSessionRequest, whitelist_row: dict | None) -> bool:
    discord_id = _normalize_discord_id(body.discord_id)
    steam_hex = (body.steam_hex or "").strip()
    identifiers = {str(i or "").strip().lower() for i in (body.identifiers or []) if str(i or "").strip()}
    if discord_id and discord_id == (forum_user.get("discord_id") or "").strip():
        return True
    if steam_hex and steam_hex == (forum_user.get("steam_id") or "").strip():
        return True
    if (forum_user.get("steam_id") or "").strip().lower() in identifiers:
        return True
    if whitelist_row:
        for key in ("fivem_license", "license2_hex", "steam_hex", "fivem_id"):
            value = (whitelist_row.get(key) or "").strip()
            if value and value.lower() in identifiers:
                return True
    return False


def _direct_staff_user(body: ConnectSessionRequest) -> dict | None:
    discord_id = _normalize_discord_id(body.discord_id)
    steam_hex = (body.steam_hex or "").strip()
    identifiers = {str(i or "").strip() for i in (body.identifiers or []) if str(i or "").strip()}
    filters: list[str] = []
    if discord_id:
        filters.append(f"discord_id.eq.{discord_id}")
    if steam_hex:
        filters.append(f"steam_id.eq.{steam_hex}")
    for ident in identifiers:
        low = ident.lower()
        if low.startswith("discord:"):
            filters.append(f"discord_id.eq.{ident.split(':', 1)[1]}")
        elif low.startswith("steam:"):
            filters.append(f"steam_id.eq.{ident}")
    if not filters:
        return None
    res = (
        supabase.table("users")
        .select("id,username,role,discord_id,steam_id")
        .or_(",".join(dict.fromkeys(filters)))
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    user = res.data[0]
    return user if (user.get("role") or "").lower() in _STAFF_DIRECT_ROLES else None


@router.post("/connect/token")
async def generate_connect_token(user: dict = Depends(get_current_user)):
    """Generate a short-lived, single-use FiveM connect token."""
    forum_user = _forum_user_for_connect(user)
    role = forum_user.get("role") or user.get("role") or "member"
    username = forum_user.get("username") or user.get("username") or "player"
    discord_id = (forum_user.get("discord_id") or "").strip()

    whitelist_row = None
    if role not in ("admin", "moderator"):
        if not discord_id:
            raise HTTPException(403, "Link Discord before connecting to the FiveM server.")
        wl = (
            supabase.table("fivem_whitelist")
            .select("id,status,discord_id,fivem_license,license_hex,license2_hex,steam_hex,fivem_id")
            .eq("discord_id", discord_id)
            .order("applied_at", desc=True)
            .limit(1)
            .execute()
        )
        if not wl.data or wl.data[0].get("status") != "approved":
            raise HTTPException(403, "You are not whitelisted. Apply for whitelist access first.")
        whitelist_row = wl.data[0]

    ban_filters = _connect_ban_filters(forum_user, whitelist_row)
    if ban_filters:
        ban = (
            supabase.table("fivem_bans")
            .select("id")
            .eq("active", True)
            .or_(",".join(ban_filters))
            .limit(1)
            .execute()
        )
        if ban.data:
            raise HTTPException(403, "You are banned from the server.")

    recent = (
        supabase.table("fivem_connect_tokens")
        .select("created_at,expires_at,used")
        .eq("user_id", forum_user["id"])
        .eq("used", False)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if recent.data:
        created_at = _parse_dt(recent.data[0].get("created_at"))
        if created_at:
            age = (datetime.now(timezone.utc) - created_at).total_seconds()
            if age < _CONNECT_COOLDOWN_S:
                wait = max(1, int(_CONNECT_COOLDOWN_S - age))
                raise HTTPException(
                    429,
                    f"Connect session already created. Please wait {wait}s before trying again.",
                    headers={"Retry-After": str(wait)},
                )

    token_id = secrets.token_hex(12)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=_CONNECT_TOKEN_EXP)
    payload = {
        "sub": forum_user["id"],
        "username": username,
        "role": role,
        "purpose": "fivem_connect",
        "jti": token_id,
        "exp": expires_at,
    }
    token = jwt.encode(payload, _jwt_secret(), algorithm="HS256")

    supabase.table("fivem_connect_tokens").insert({
        "token_id": token_id,
        "user_id": forum_user["id"],
        "username": username,
        "used": False,
        "created_at": _now(),
        "expires_at": expires_at.isoformat(),
    }).execute()

    return ConnectTokenResponse(
        token=token,
        expires_in=_CONNECT_TOKEN_EXP,
        username=username,
        connect_url=os.environ.get("FIVEM_CONNECT_URL", "fivem://connect/127.0.0.1:30120"),
    )


@router.post("/connect/session-check")
async def check_connect_session(body: ConnectSessionRequest, request: Request):
    """Validate that the joining player started from the website connect page."""
    server_secret = request.headers.get("x-fivem-token", "") or request.headers.get("x-internal-token", "")
    expected = os.environ.get("FIVEM_SERVER_SECRET") or os.environ.get("INTERNAL_API_SECRET", "")
    if not expected or not hmac.compare_digest(server_secret, expected):
        raise HTTPException(401, "Invalid server credentials")

    whitelist_filters = _session_identifier_filters(body)
    whitelist_row = None
    if whitelist_filters:
        wl = (
            supabase.table("fivem_whitelist")
            .select("id,status,discord_id,character_name,fivem_license,license2_hex,steam_hex,fivem_id,priority_tier,priority_level,priority_expires_at")
            .eq("status", "approved")
            .or_(",".join(whitelist_filters))
            .order("applied_at", desc=True)
            .limit(1)
            .execute()
        )
        whitelist_row = (wl.data or [None])[0]

    recent_tokens = (
        supabase.table("fivem_connect_tokens")
        .select("token_id,user_id,username,expires_at,used,created_at")
        .eq("used", False)
        .gte("expires_at", _now())
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )

    for token_row in recent_tokens.data or []:
        user_id = token_row.get("user_id")
        if not user_id:
            continue
        user_res = (
            supabase.table("users")
            .select("id,username,role,discord_id,steam_id")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        if not user_res.data:
            continue
        forum_user = user_res.data[0]
        role = forum_user.get("role") or "member"

        matched_whitelist = whitelist_row
        if not matched_whitelist and forum_user.get("discord_id"):
            wl_by_user = (
                supabase.table("fivem_whitelist")
                .select("id,status,discord_id,character_name,fivem_license,license2_hex,steam_hex,fivem_id,priority_tier,priority_level,priority_expires_at")
                .eq("discord_id", forum_user["discord_id"])
                .eq("status", "approved")
                .order("applied_at", desc=True)
                .limit(1)
                .execute()
            )
            matched_whitelist = (wl_by_user.data or [None])[0]

        if not _forum_user_matches_session(forum_user, body, matched_whitelist):
            continue

        if role not in ("admin", "moderator") and not matched_whitelist:
            return {"allowed": False, "reason": "Your whitelist is not approved yet. Apply at fivem.aifazi.net/whitelist"}

        ban_filters = _connect_ban_filters(forum_user, matched_whitelist)
        if ban_filters:
            ban = (
                supabase.table("fivem_bans")
                .select("reason,expires_at,banned_by")
                .eq("active", True)
                .or_(",".join(ban_filters))
                .limit(1)
                .execute()
            )
            if ban.data:
                row = ban.data[0]
                return {"allowed": False, "reason": f"You are banned: {row.get('reason') or 'No reason provided'}"}

        # H17 — atomic single-use consumption: prepend `.eq("used", False)` so only ONE
            # of two racing connect attempts can flip the row (the second update
            # affects 0 rows and we detect that to refuse entry). Previous code
            # had no `used=False` predicate, allowing a token to be redeemed twice
            # in a parallel player double-click race.
            consume_res = (
                supabase.table("fivem_connect_tokens")
                .update({"used": True})
                .eq("token_id", token_row["token_id"])
                .eq("used", False)
                .execute()
            )
            consume_count = len(consume_res.data or [])
            if consume_count == 0:
                # Token was claimed between our check above and this UPDATE; another
                # concurrent request already granted entry on it. Reject this one
                # and keep scanning subsequent unused tokens (rare — only happens
                # on rapid double-connect).
                continue
        if matched_whitelist:
            updates = {"last_played_at": _now()}
            if body.player_name:
                updates["last_played_name"] = body.player_name
            for field, value in {
                "fivem_license": body.fivem_license,
                "license2_hex": body.license2,
                "steam_hex": body.steam_hex,
                "fivem_id": body.fivem_id,
            }.items():
                if value and not matched_whitelist.get(field):
                    updates[field] = value
            supabase.table("fivem_whitelist").update(updates).eq("id", matched_whitelist["id"]).execute()
        return {
            "allowed": True,
            "username": forum_user.get("username") or token_row.get("username"),
            "user_id": forum_user.get("id"),
            "role": role,
            "character_name": (matched_whitelist or {}).get("character_name", ""),
            "priority": _active_priority(matched_whitelist or {}),
        }

    staff_user = _direct_staff_user(body)
    if staff_user:
        ban_filters = _connect_ban_filters(staff_user, None)
        if ban_filters:
            ban = (
                supabase.table("fivem_bans")
                .select("reason")
                .eq("active", True)
                .or_(",".join(ban_filters))
                .limit(1)
                .execute()
            )
            if ban.data:
                return {"allowed": False, "reason": f"You are banned: {ban.data[0].get('reason') or 'No reason provided'}"}
        return {
            "allowed": True,
            "username": staff_user.get("username"),
            "user_id": staff_user.get("id"),
            "role": staff_user.get("role"),
            "direct_staff": True,
            "message": "Staff direct connect allowed",
        }

    return {
        "allowed": False,
        "reason": "Connect from fivem.aifazi.net/connect first. Direct IP/cfx joins are blocked.",
    }


@router.post("/connect/verify")
async def verify_connect_token(body: VerifyTokenRequest, request: Request):
    """Verify a connect token. Called by the FiveM Lua resource."""
    server_secret = request.headers.get("x-fivem-token", "") or request.headers.get("x-internal-token", "")
    expected = os.environ.get("FIVEM_SERVER_SECRET") or os.environ.get("INTERNAL_API_SECRET", "")
    if not expected or not hmac.compare_digest(server_secret, expected):
        raise HTTPException(401, "Invalid server credentials")

    try:
        payload = jwt.decode(body.token, _jwt_secret(), algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

    if payload.get("purpose") != "fivem_connect" or not payload.get("jti"):
        raise HTTPException(401, "Invalid token")

    token_row = (
        supabase.table("fivem_connect_tokens")
        .select("token_id,used,expires_at")
        .eq("token_id", payload["jti"])
        .limit(1)
        .execute()
    )
    if not token_row.data:
        raise HTTPException(401, "Token not found")
    row = token_row.data[0]
    if row.get("used"):
        raise HTTPException(401, "Token already used")
    if row.get("expires_at") and row["expires_at"] < _now():
        raise HTTPException(401, "Token expired")

    # H17 — atomic single-use consumption with the same `used=False` predicate.
    consume_res = (
        supabase.table("fivem_connect_tokens")
        .update({"used": True})
        .eq("token_id", payload["jti"])
        .eq("used", False)
        .execute()
    )
    if not (consume_res.data or []):
        raise HTTPException(401, "Token already used or revoked (race)")
    return {
        "approved": True,
        "username": payload.get("username"),
        "user_id": payload.get("sub"),
        "role": payload.get("role", "member"),
    }


@router.get("/connect/verify")
async def verify_connect_token_get(token: str, request: Request):
    """GET version for Lua HTTP requests."""
    return await verify_connect_token(VerifyTokenRequest(token=token), request)
