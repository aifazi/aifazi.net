"""Whitelist email templates and send helper — extracted from routers/fivem.py."""
from __future__ import annotations

import logging
import os
from html import escape as _fivem_html_escape
from typing import Any

from database import supabase
from utils.email import render_template
from utils.email_queue import queue_email

log = logging.getLogger("fivem_emails")

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://aifazi.net").rstrip("/")
FRONTEND_HOST = FRONTEND_URL.replace("https://", "").replace("http://", "")


def _e(value) -> str:
    """HTML-escape a value for email bodies."""
    return _fivem_html_escape(str(value if value is not None else ""))


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
    <p style="color:#e6edf3;line-height:1.7">You are welcome to reapply after improving your character backstory. Visit <a href="{FRONTEND_URL}/whitelist" style="color:#00D4FF">{FRONTEND_HOST}/whitelist</a> to submit a new application.</p>
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

async def _send_whitelist_email(app: dict, status: str, note: str | None = None, extra: dict | None = None) -> None:
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
