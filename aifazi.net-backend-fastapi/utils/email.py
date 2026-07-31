"""
utils/email.py — Email sender with queue logging and template support.
Every send attempt is recorded in mail_queue with status sent/failed.
Templates are fetched from mail_templates by purpose key.
"""
import httpx, logging, re, os
from datetime import datetime, timezone
from database import supabase

logger = logging.getLogger(__name__)


def _c(cfg: dict, *keys: str, default: str = "") -> str:
    for k in keys:
        if cfg.get(k):
            return cfg[k]
    return default


async def _get_config() -> dict:
    res = supabase.table("email_config").select("settings").eq("key", "global").execute()
    if res.data and res.data[0].get("settings"):
        return res.data[0]["settings"]
    res2 = supabase.table("email_config").select("*").eq("key", "global").execute()
    return res2.data[0] if res2.data else {}


def _queue_insert(to: str, subject: str, html: str, purpose: str, provider: str,
                  text: str = "", recipient_name: str = "") -> str | None:
    """Insert a pending queue row, return its id."""
    try:
        res = supabase.table("mail_queue").insert({
            "to_email": to, "subject": subject, "html": html, "text": text,
            "status": "pending", "purpose": purpose, "provider": provider,
            "recipient_name": recipient_name,
        }).execute()
        return res.data[0]["id"] if res.data else None
    except Exception as e:
        logger.error("mail_queue insert failed: %s", e)
        return None


def _queue_update(queue_id: str, status: str, error_msg: str = "",
                  provider_msg_id: str = ""):
    try:
        payload = {"status": status, "error_msg": error_msg,
                   "updated_at": datetime.now(timezone.utc).isoformat()}
        if status in ("sent", "delivered"):
            payload["sent_at"] = datetime.now(timezone.utc).isoformat()
        if provider_msg_id:
            payload["provider_msg_id"] = provider_msg_id
        supabase.table("mail_queue").update(payload).eq("id", queue_id).execute()
    except Exception as e:
        logger.error("mail_queue update failed: %s", e)


# ── Theme-aware email rendering ───────────────────────────────────────────────
# Palettes mirror the frontend (app/globals.css + ThemeLibrary THEME_DEFS) so
# outgoing emails automatically match whichever site theme is active.

EMAIL_THEMES: dict[str, dict] = {
    "cyber-dark":   {"bg":"#060a0f","bg2":"#0b1118","bg3":"#111a24","primary":"#00ff88","secondary":"#00d4ff","orange":"#ff6b35","text":"#c8d8e8","muted":"#6b8296","border":"rgba(0,212,255,0.15)"},
    "cyber-light":  {"bg":"#c8d4e0","bg2":"#bcc9d8","bg3":"#b0bece","primary":"#006e38","secondary":"#005d8f","orange":"#b84416","text":"#0a1520","muted":"#4a6478","border":"rgba(0,93,143,0.28)"},
    "light":        {"bg":"#c8d4e0","bg2":"#bcc9d8","bg3":"#b0bece","primary":"#006e38","secondary":"#005d8f","orange":"#b84416","text":"#0a1520","muted":"#4a6478","border":"rgba(0,93,143,0.28)"},
    "midnight":     {"bg":"#08051a","bg2":"#0e0a24","bg3":"#16102e","primary":"#a855f7","secondary":"#ec4899","orange":"#f97316","text":"#e2d9f3","muted":"#6b5a8a","border":"rgba(168,85,247,0.18)"},
    "midnight-light":{"bg":"#f8f4ff","bg2":"#f0e8ff","bg3":"#e6d8ff","primary":"#7c3aed","secondary":"#be185d","orange":"#ea580c","text":"#1a0a30","muted":"#7c5c96","border":"rgba(124,58,237,0.2)"},
    "crimson":      {"bg":"#0f0608","bg2":"#1a0b0e","bg3":"#241014","primary":"#ef4444","secondary":"#f97316","orange":"#fb923c","text":"#f0d0d4","muted":"#8a6068","border":"rgba(239,68,68,0.18)"},
    "crimson-light":{"bg":"#fff5f5","bg2":"#ffecec","bg3":"#ffdede","primary":"#dc2626","secondary":"#ea580c","orange":"#fb923c","text":"#1a0606","muted":"#8a5050","border":"rgba(220,38,38,0.2)"},
    "ocean":        {"bg":"#020d1a","bg2":"#061525","bg3":"#0b1f33","primary":"#3b82f6","secondary":"#06b6d4","orange":"#f59e0b","text":"#c0d8f0","muted":"#4a6880","border":"rgba(59,130,246,0.18)"},
    "ocean-light":  {"bg":"#f0f8ff","bg2":"#e4f0ff","bg3":"#d4e8ff","primary":"#1d4ed8","secondary":"#0891b2","orange":"#f59e0b","text":"#0a1a2e","muted":"#4a6884","border":"rgba(29,78,216,0.2)"},
    "amber":        {"bg":"#0f0a02","bg2":"#1a1405","bg3":"#241c08","primary":"#f59e0b","secondary":"#f97316","orange":"#fb923c","text":"#fef3c7","muted":"#927040","border":"rgba(245,158,11,0.18)"},
    "amber-light":  {"bg":"#fffbf0","bg2":"#fff3d6","bg3":"#ffe8b4","primary":"#b45309","secondary":"#c2410c","orange":"#ea580c","text":"#1a0f00","muted":"#927040","border":"rgba(180,83,9,0.2)"},
    "rose":         {"bg":"#0f0609","bg2":"#1a0c12","bg3":"#24121a","primary":"#f472b6","secondary":"#fb7185","orange":"#f97316","text":"#fde8f0","muted":"#8a6070","border":"rgba(244,114,182,0.18)"},
    "rose-light":   {"bg":"#fff5f8","bg2":"#ffe8f0","bg3":"#ffd8e8","primary":"#be185d","secondary":"#e11d48","orange":"#f97316","text":"#1a060e","muted":"#8a5070","border":"rgba(190,24,93,0.2)"},
    "forest":       {"bg":"#020b04","bg2":"#051508","bg3":"#091f0d","primary":"#4ade80","secondary":"#a3e635","orange":"#fb923c","text":"#d1fae5","muted":"#4a7858","border":"rgba(74,222,128,0.15)"},
    "forest-light": {"bg":"#f0fff5","bg2":"#e0f8eb","bg3":"#d0f0e0","primary":"#15803d","secondary":"#4d7c0f","orange":"#b45309","text":"#0a1a0e","muted":"#4a7858","border":"rgba(21,128,61,0.2)"},
    "glass-dark":   {"bg":"#04080f","bg2":"#10141f","bg3":"#141d2c","primary":"#00e5ff","secondary":"#7b61ff","orange":"#ff6b35","text":"#d0e8ff","muted":"#5a7898","border":"rgba(0,229,255,0.22)"},
    "glass-light":  {"bg":"#f8fbff","bg2":"#eef4fc","bg3":"#e2ecfa","primary":"#0284c7","secondary":"#6d28d9","orange":"#ea580c","text":"#0a1a2e","muted":"#4a6888","border":"rgba(2,132,199,0.22)"},
    "brutalist":    {"bg":"#f2f0ec","bg2":"#e8e5df","bg3":"#dedad2","primary":"#e8000d","secondary":"#000000","orange":"#ff6b00","text":"#000000","muted":"#555555","border":"#000000"},
    "brutalist-dark":{"bg":"#111111","bg2":"#1a1a1a","bg3":"#222222","primary":"#e8000d","secondary":"#ffffff","orange":"#ff6600","text":"#ffffff","muted":"#888888","border":"#444444"},
    "synthwave":    {"bg":"#0d0618","bg2":"#130828","bg3":"#180a30","primary":"#ff2d8b","secondary":"#00f0ff","orange":"#ff6b35","text":"#f0d8ff","muted":"#7858a0","border":"rgba(255,45,139,0.28)"},
    "synthwave-light":{"bg":"#fdf4ff","bg2":"#f8e8ff","bg3":"#f0d8ff","primary":"#9d174d","secondary":"#0e7490","orange":"#b45309","text":"#1a0628","muted":"#7858a0","border":"rgba(157,23,77,0.2)"},
    "paper":        {"bg":"#f5f0e8","bg2":"#ede8df","bg3":"#e4ddd3","primary":"#c41a1a","secondary":"#1a3a6c","orange":"#c87400","text":"#1a1a1a","muted":"#6b6060","border":"rgba(0,0,0,0.18)"},
    "paper-dark":   {"bg":"#1a1610","bg2":"#231e16","bg3":"#2e2820","primary":"#c41a1a","secondary":"#4a80cc","orange":"#c2410c","text":"#f5f0e8","muted":"#9a9080","border":"rgba(245,240,232,0.15)"},
    "neumorph":     {"bg":"#e0e5ec","bg2":"#e8edf4","bg3":"#d6dbe4","primary":"#6c63ff","secondary":"#4ecdc4","orange":"#f7b731","text":"#2d3748","muted":"#718096","border":"rgba(108,99,255,0.15)"},
    "neumorph-dark":{"bg":"#1e2028","bg2":"#252830","bg3":"#1a1c24","primary":"#7c73ff","secondary":"#5edfda","orange":"#fb923c","text":"#c0c8e0","muted":"#606888","border":"rgba(124,115,255,0.2)"},
    "terminal":     {"bg":"#0a0a0a","bg2":"#0f0f0f","bg3":"#141414","primary":"#33ff33","secondary":"#ffcc00","orange":"#ff6600","text":"#33ff33","muted":"#228822","border":"rgba(51,255,51,0.25)"},
    "terminal-light":{"bg":"#f5fff5","bg2":"#ecffec","bg3":"#e0ffe0","primary":"#166534","secondary":"#854d0e","orange":"#b45309","text":"#0a1a0a","muted":"#3a7040","border":"rgba(22,101,52,0.25)"},
    "macos":        {"bg":"#f5f5f7","bg2":"#ffffff","bg3":"#ebebed","primary":"#0071e3","secondary":"#34aadc","orange":"#ff9500","text":"#1d1d1f","muted":"#86868b","border":"rgba(0,0,0,0.12)"},
    "macos-dark":   {"bg":"#1c1c1e","bg2":"#2c2c2e","bg3":"#3a3a3c","primary":"#0a84ff","secondary":"#5ac8fa","orange":"#ff9f0a","text":"#f5f5f7","muted":"#98989d","border":"rgba(255,255,255,0.15)"},
    "neon-noir":    {"bg":"#0a0a0e","bg2":"#10101a","bg3":"#16161f","primary":"#ff6b35","secondary":"#cc44ff","orange":"#ff6b35","text":"#d8d0e0","muted":"#6a5a7a","border":"rgba(204,68,255,0.2)"},
    "neon-noir-light":{"bg":"#fff8f5","bg2":"#ffefea","bg3":"#ffe4dc","primary":"#ea580c","secondary":"#7e22ce","orange":"#c2410c","text":"#1a0a06","muted":"#8a6060","border":"rgba(234,88,12,0.2)"},
    "pastel":       {"bg":"#fdf4ff","bg2":"#fff0fb","bg3":"#f5e8ff","primary":"#c084fc","secondary":"#f9a8d4","orange":"#fbbf24","text":"#3d1f5c","muted":"#9d6db8","border":"rgba(192,132,252,0.3)"},
    "pastel-dark":  {"bg":"#1a0d28","bg2":"#28184a","bg3":"#34206a","primary":"#d8a4ff","secondary":"#ffb8e0","orange":"#ffb347","text":"#f8e8ff","muted":"#a878d0","border":"rgba(216,164,255,0.2)"},
    "win95":        {"bg":"#008080","bg2":"#c0c0c0","bg3":"#d4d0c8","primary":"#000080","secondary":"#ffffff","orange":"#804000","text":"#000000","muted":"#444444","border":"#808080"},
    "win95-dark":   {"bg":"#000080","bg2":"#1c1c8a","bg3":"#191970","primary":"#00ffff","secondary":"#ffff00","orange":"#ff8800","text":"#ffffff","muted":"#9090cc","border":"rgba(0,255,255,0.4)"},
    "aurora":       {"bg":"#050d1a","bg2":"#08142a","bg3":"#0c1c38","primary":"#64ffda","secondary":"#ff6fd8","orange":"#f59e0b","text":"#cce8ff","muted":"#5a8099","border":"rgba(100,255,218,0.2)"},
    "aurora-light": {"bg":"#f0fffc","bg2":"#e0f8f5","bg3":"#d0f0ec","primary":"#0f766e","secondary":"#a21caf","orange":"#b45309","text":"#0a1a18","muted":"#4a8880","border":"rgba(15,118,110,0.2)"},
}

def _theme_for_email() -> dict:
    """Return the active site theme palette (falls back to cyber-dark)."""
    theme_id = "cyber-dark"
    try:
        res = supabase.table("site_config").select("settings").eq("key", "global").execute()
        if res.data and res.data[0].get("settings"):
            theme_id = res.data[0]["settings"].get("globalTheme") or "cyber-dark"
    except Exception:
        pass
    return EMAIL_THEMES.get(theme_id, EMAIL_THEMES["cyber-dark"])

def _button_text_color(primary: str) -> str:
    """Pick dark/light button label for contrast on a given accent color."""
    h = primary.strip("#")
    if len(h) != 6:
        return "#062a1a"
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return "#062a1a" if lum > 0.5 else "#ffffff"

def _email_shell(palette: dict, title: str, body_html: str,
                 button_label: str = "", button_url: str = "",
                 footnote: str = "", site_name: str = "aifazi.net",
                 icon: str = "") -> str:
    """Render a complete, modern, theme-matched email document."""
    btn = ""
    if button_label and button_url:
        btn = (f'<div style="text-align:center;margin:28px 0 8px">'
               f'<a href="{button_url}" style="display:inline-block;background:{palette["primary"]};'
               f'color:{_button_text_color(palette["primary"])};font-family:Inter,Segoe UI,sans-serif;'
               f'font-size:14px;font-weight:700;letter-spacing:1.5px;text-decoration:none;'
               f'padding:14px 34px;border-radius:8px;">{button_label}</a></div>'
               f'<p style="color:{palette["muted"]};font-size:11px;text-align:center;margin:12px 0 0;">'
               f'If the button doesn\'t work, open the link directly from your browser.</p>')
    body = (f'<div style="background:{palette["bg"]};padding:32px 16px;font-family:Inter,Segoe UI,sans-serif;">'
            f'<div style="max-width:600px;margin:0 auto;background:{palette["bg2"]};'
            f'border:1px solid {palette["border"]};border-radius:14px;overflow:hidden;">'
            f'<div style="height:6px;background:linear-gradient(90deg,{palette["primary"]},{palette["secondary"]});"></div>'
            f'<div style="padding:36px 38px;">'
            f'<div style="text-align:center;margin-bottom:24px;">'
            f'<span style="font-family:Outfit,Inter,sans-serif;font-size:13px;font-weight:800;'
            f'letter-spacing:4px;color:{palette["primary"]};">{site_name.upper()}</span>'
            f'</div>'
            f'<h1 style="color:{palette["text"]};font-family:Outfit,Inter,sans-serif;font-size:24px;'
            f'font-weight:700;margin:0 0 18px;text-align:center;">{icon} {title}</h1>'
            f'{body_html}'
            f'{btn}'
            f'</div>'
            f'<div style="padding:16px 38px;background:{palette["bg3"]};border-top:1px solid {palette["border"]};'
            f'text-align:center;">'
            f'<span style="color:{palette["muted"]};font-size:11px;line-height:1.7;">'
            f'{footnote or f"You are receiving this email because you have an account at {site_name}."}'
            f'</span></div></div></div>')
    return body

# Variable aliases — tolerate old/admin-typed placeholders so {{name}}, {{link}},
# {{verify_url}}, {{reset_url}} etc. all resolve even when the caller uses a
# different (or overlapping) key.
_VAR_ALIASES = {
    "name":       ["username", "name", "recipient_name"],
    "link":       ["activation_link", "reset_link", "verify_url", "reset_url",
                   "chat_url", "track_url", "login_url", "status_url", "post_url"],
    "verify_url": ["activation_link", "verify_url", "reset_link", "reset_url"],
    "reset_url":  ["reset_link", "reset_url", "activation_link"],
    "message":    ["message", "reply_message", "description", "body"],
}

def _render_html(html: str, context: dict) -> str:
    for k, v in context.items():
        html = html.replace(f"{{{{{k}}}}}", str(v))
    return html

def render_template(purpose: str, variables: dict) -> tuple[str, str]:
    """
    Fetch template by purpose and render {{variable}} placeholders with the
    active site theme's palette injected ({{theme_bg}}, {{theme_primary}} ...).
    Returns (subject, html). Falls back to a built-in themed default so an
    email is ALWAYS produced, even if the DB row is missing/broken.
    """
    palette = _theme_for_email()
    context = dict(variables or {})
    context.setdefault("site_name", "aifazi.net")
    for alias, sources in _VAR_ALIASES.items():
        if alias not in context:
            for s in sources:
                if context.get(s):
                    context[alias] = context[s]
                    break
    for key in ("bg", "bg2", "bg3", "primary", "secondary", "orange", "text", "muted", "border"):
        context[f"theme_{key}"] = palette[key]
    context["theme_button_text"] = _button_text_color(palette["primary"])

    subject = ""
    html = ""
    try:
        res = supabase.table("mail_templates").select("subject,html").eq("purpose", purpose).eq("active", True).execute()
        if res.data:
            tpl = res.data[0]
            subject = tpl.get("subject", "")
            html = tpl.get("html", "")
            subject = _render_html(subject, context)
            html = _render_html(html, context)
            return subject, html
    except Exception as e:
        logger.error("render_template db fetch failed for purpose=%s: %s", purpose, e)

    subject, html = _default_template(purpose, context, palette)
    return _render_html(subject, context), _render_html(html, context)


def _reviewer_note_html(p: dict, note: str) -> str:
    if not note:
        return ""
    return (f'<div style="color:{p["muted"]};margin-top:6px;">'
            f'Note: {note}</div>')


def _default_template(purpose: str, v: dict, p: dict) -> tuple[str, str]:
    """Built-in theme-matched templates used when no DB row exists."""
    body_text = ""
    body = f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0 0 16px;">Hi {v.get("username") or v.get("name") or "there"},</p>'
    subject = f"[{v.get('site_name', 'aifazi.net')}] Notification"

    if purpose == "account_activation":
        subject = f"Verify your email — {v.get('site_name', 'aifazi.net')}"
        body = (f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0 0 16px;">'
                f'Hi {v.get("username") or "there"}, welcome to <strong>{v.get("site_name", "aifazi.net")}</strong>. '
                f'Please confirm your email address to activate your account.</p>')
        return subject, _email_shell(p, "Verify your email", body, "VERIFY EMAIL", v.get("activation_link") or v.get("link") or "#", f"This link expires in {v.get('expires_in', '24 hours')}. If you didn't create this account, you can safely ignore this email.", icon="✅")

    if purpose == "password_reset":
        subject = f"Reset your password — {v.get('site_name', 'aifazi.net')}"
        body = (f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0 0 16px;">'
                f'Hi {v.get("username") or "there"}, we received a request to reset your password for '
                f'<strong>{v.get("site_name", "aifazi.net")}</strong>. Click below to choose a new one.</p>')
        return subject, _email_shell(p, "Reset your password", body, "RESET PASSWORD", v.get("reset_link") or v.get("link") or "#", f"This link expires in {v.get('expires_in', '1 hour')}. If you didn't request this, you can safely ignore this email.", icon="🔑")

    if purpose == "discord_welcome":
        subject = f"Welcome to {v.get('site_name', 'aifazi.net')} 🎉"
        body = (f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0 0 16px;">'
                f'Your Discord account <strong>{v.get("discord_username", "")}</strong> is linked and your account '
                f'<strong>{v.get("username", "")}</strong> is ready. Head to your profile to continue.</p>')
        return subject, _email_shell(p, "You're all set!", body, "GO TO PROFILE", v.get("profile_url") or v.get("frontend_url") or "#", icon="🎮")

    if purpose == "contact_confirm":
        subject = f"Thanks for contacting {v.get('site_name', 'aifazi.net')}"
        body = (f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0 0 16px;">'
                f'Hi {v.get("name") or "there"}, we received your message:</p>'
                f'<blockquote style="margin:0 0 16px;padding:14px 18px;background:{p["bg3"]};border-left:3px solid {p["primary"]};color:{p["text"]};font-size:13px;line-height:1.7;">{v.get("message", "")}</blockquote>'
                f'<p style="color:{p["muted"]};font-size:13px;">We\'ll get back to you as soon as possible.</p>')
        return subject, _email_shell(p, "Message received", body, icon="📩")

    if purpose == "contact_reply":
        subject = f"Re: {v.get('subject', '')} — {v.get('site_name', 'aifazi.net')}"
        body = (f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0 0 16px;">Hi {v.get("name") or "there"},</p>'
                f'<blockquote style="margin:0 0 16px;padding:14px 18px;background:{p["bg3"]};border-left:3px solid {p["primary"]};color:{p["text"]};font-size:13px;line-height:1.7;">{v.get("reply_message", "")}</blockquote>'
                f'<p style="color:{p["muted"]};font-size:13px;">— The {v.get("site_name", "aifazi.net")} team</p>')
        return subject, _email_shell(p, "A reply from our team", body, icon="💬")

    if purpose == "chat_message":
        subject = f"New message in {v.get('room_name', 'chat')} — {v.get('site_name', 'aifazi.net')}"
        body = (f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0 0 16px;">'
                f'<strong>{v.get("sender_name", "")}</strong> sent a message in <strong>{v.get("room_name", "")}</strong>:</p>'
                f'<blockquote style="margin:0 0 16px;padding:14px 18px;background:{p["bg3"]};border-left:3px solid {p["primary"]};color:{p["text"]};font-size:13px;line-height:1.7;">{v.get("message_preview", "")}</blockquote>')
        return subject, _email_shell(p, "New chat message", body, "OPEN CHAT", v.get("chat_url") or "#", icon="💬")

    if purpose == "chat_invite":
        subject = f"You've been invited to {v.get('room_name', 'a room')} — {v.get('site_name', 'aifazi.net')}"
        body = (f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0 0 16px;">'
                f'Hi {v.get("username") or "there"}, <strong>{v.get("sender_name", "")}</strong> invited you to join '
                f'<strong>{v.get("room_name", "")}</strong>.</p>')
        return subject, _email_shell(p, "You're invited", body, "JOIN THE CHAT", v.get("chat_url") or "#", icon="➕")

    if purpose == "mail_test":
        subject = f"Test email — {v.get('site_name', 'aifazi.net')}"
        body = (f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0 0 16px;">'
                f'This is a test email to <strong>{v.get("email", "")}</strong>. Your email provider is configured and working correctly. 🎉</p>')
        return subject, _email_shell(p, "Mail test", body, icon="🧪")

    if purpose == "helpdesk_account_created":
        subject = f"Your support account is ready — {v.get('site_name', 'aifazi.net')}"
        body = (f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0 0 16px;">'
                f'Hi {v.get("username") or "there"}, we created an account so you can track your support ticket. '
                f'Please verify your email to get started.</p>')
        return subject, _email_shell(p, "Verify your support account", body, "VERIFY EMAIL", v.get("verify_url") or "#", f"Your username: {v.get('username', '')}", icon="🎫")

    if purpose == "ticket_confirmation":
        subject = f"[{v.get('site_name', 'aifazi.net')}] Ticket #{v.get('ticket_id', '')} received"
        body = (f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0 0 16px;">'
                f'Hi {v.get("name") or "there"}, your support request has been logged and our team will get back to you shortly.</p>'
                f'<div style="background:{p["bg3"]};border:1px solid {p["border"]};border-radius:8px;padding:16px 18px;margin:0 0 16px;font-size:13px;">'
                f'<div style="color:{p["muted"]};font-size:11px;letter-spacing:2px;margin-bottom:8px;">TICKET DETAILS</div>'
                f'<div style="color:{p["text"]};margin:2px 0;"><strong>#</strong>{v.get("ticket_id", "")} — {v.get("subject", "")}</div>'
                f'<div style="color:{p["text"]};margin:2px 0;">Category: {v.get("category", "")} · Priority: {v.get("priority", "")}</div>'
                f'<div style="color:{p["muted"]};margin:6px 0 0;">{v.get("description", "")}</div></div>')
        return subject, _email_shell(p, "Ticket received", body, "TRACK YOUR TICKET", v.get("track_url") or "#", icon="🎫")

    if purpose == "ticket_reply":
        subject = f"[{v.get('site_name', 'aifazi.net')}] New reply on ticket #{v.get('ticket_id', '')}"
        body = (f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0 0 16px;">'
                f'<strong>{v.get("staff_name", "Staff")}</strong> replied to <strong>#{v.get("ticket_id", "")}</strong> — {v.get("subject", "")}:</p>'
                f'<blockquote style="margin:0 0 16px;padding:14px 18px;background:{p["bg3"]};border-left:3px solid {p["primary"]};color:{p["text"]};font-size:13px;line-height:1.7;">{v.get("reply_message", "")}</blockquote>')
        return subject, _email_shell(p, "New reply on your ticket", body, "VIEW TICKET", v.get("track_url") or "#", icon="↩️")

    if purpose == "newsletter_broadcast":
        subject = v.get("subject") or f"News from {v.get('site_name', 'aifazi.net')}"
        body = f'<div style="color:{p["text"]};font-size:14px;line-height:1.8;">{v.get("body", "")}</div>'
        return subject, _email_shell(p, "Latest update", body, footnote=f'You are receiving this because you subscribed. <a href="{v.get("unsubscribe_link", "#")}" style="color:{p["secondary"]};">Unsubscribe</a>.', icon="📬")

    if purpose == "newsletter_post":
        subject = f"New post: {v.get('post_title', '')} — {v.get('site_name', 'aifazi.net')}"
        body = (f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0 0 16px;">{v.get("excerpt", "")}</p>')
        return subject, _email_shell(p, v.get("post_title", "New post"), body, "READ THE POST", v.get("post_url") or "#", footnote=f'You are receiving this because you subscribed. <a href="{v.get("unsubscribe_link", "#")}" style="color:{p["secondary"]};">Unsubscribe</a>.', icon="📰")

    if purpose == "password_reset_admin":
        subject = f"Password reset requested — {v.get('site_name', 'aifazi.net')}"
        body = (f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0 0 16px;">'
                f'Hi {v.get("username") or "there"}, an administrator started a password reset for your account. '
                f'Open the login page and use <strong>Forgot Password</strong> to complete it.</p>')
        return subject, _email_shell(p, "Password reset requested", body, "OPEN LOGIN", v.get("login_url") or "#", icon="🔑")

    if purpose == "admin_user_message":
        subject = v.get("subject") or f"Message from {v.get('site_name', 'aifazi.net')}"
        body = f'<div style="color:{p["text"]};font-size:14px;line-height:1.8;">{v.get("message", "")}</div>'
        return subject, _email_shell(p, v.get("subject") or "Message from the team", body, icon="📨")

    if purpose.startswith("fivem_"):
        status_map = {
            "fivem_applied":  ("Application received", "we've received your whitelist application and it's now pending staff review.", "🎮"),
            "fivem_approved": ("Whitelist approved", "your whitelist application has been approved. Welcome to the server!", "✅"),
            "fivem_denied":   ("Application update", "after careful review your whitelist application was not approved.", "ℹ️"),
            "fivem_priority": ("Priority updated", "your queue priority has been updated.", "⭐"),
            "fivem_banned":   ("Ban notification", "you have been banned from the server.", "🚫"),
            "fivem_unbanned": ("Ban lifted", "your ban has been lifted. You're welcome to rejoin.", "🎉"),
            "fivem_reset":    ("Application reset", "your whitelist application has been reset.", "🔄"),
        }
        title, blurb, icon = status_map.get(purpose, ("Status update", "there's an update on your whitelist application.", "📋"))
        extra = f'<p style="color:{p["muted"]};font-size:13px;line-height:1.7;">{v.get("note", "")}</p>' if v.get("note") else ""
        body = (f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0 0 16px;">Hi {v.get("name") or "there"}, {blurb}</p>'
                f'<p style="color:{p["text"]};font-size:13px;line-height:1.7;margin:0 0 16px;">Character: <strong>{v.get("character_name", "")}</strong></p>{extra}')
        return subject, _email_shell(p, title, body, "CHECK STATUS", v.get("status_url") or "#", icon=icon)

    if purpose.startswith("application_"):
        status_map = {
            "application_submitted": ("Application received", "your application has been submitted and is awaiting staff review.", "📝"),
            "application_approved":  ("Application approved", "congratulations — your application has been approved!", "✅"),
            "application_denied":    ("Application update", "after careful review your application was not approved.", "ℹ️"),
            "application_reset":     ("Application reset", "your application has been moved back to pending.", "🔄"),
            "application_archived":  ("Application archived", "your application has been archived.", "🗄️"),
        }
        title, blurb, icon = status_map.get(purpose, ("Application update", "there's an update on your application.", "📋"))
        body = (f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0 0 16px;">Hi {v.get("username") or v.get("name") or "there"}, {blurb}</p>'
                f'<div style="background:{p["bg3"]};border:1px solid {p["border"]};border-radius:8px;padding:14px 18px;margin:0 0 16px;font-size:13px;color:{p["text"]};">'
                f'<div style="color:{p["muted"]};font-size:11px;letter-spacing:2px;margin-bottom:6px;">{v.get("form_title", "APPLICATION")}</div>'
                f'<div>Status: {v.get("status", "")} · #{v.get("submission_id", "")}</div>'
                f'{_reviewer_note_html(p, v.get("reviewer_note", ""))}'
                f'</div>{v.get("answers_table", "")}')
        return subject, _email_shell(p, title, body, icon=icon)

    subject = f"[{v.get('site_name', 'aifazi.net')}] {purpose.replace('_', ' ').title()}"
    body = f'<p style="color:{p["text"]};font-size:14px;line-height:1.75;margin:0;">Hi {v.get("username") or v.get("name") or "there"}, you have an update from {v.get("site_name", "aifazi.net")}.</p>'
    return subject, _email_shell(p, "Update from the team", body, icon="📬")


async def send_email(
    to: str,
    subject: str,
    html: str,
    text: str = "",
    purpose: str = "other",
    recipient_name: str = "",
    queue_id: str | None = None,
) -> dict:
    """Send one email immediately and record the outcome in mail_queue.

    If ``queue_id`` is provided, that existing mail_queue row is updated
    (used by queue_email to avoid double-inserting). Otherwise a new
    ``pending`` row is created first so the attempt is always durable.

    Returns ``{"ok": True, "msg_id": ..., "provider": ...}`` on success or
    ``{"ok": False, "error": "<reason>"}`` on failure. Never raises — the
    caller can decide whether to surface the error (test endpoints) or not.
    """
    cfg = {}
    provider = "unknown"
    queue_id_final = queue_id
    try:
        cfg      = await _get_config()
        provider = _c(cfg, "outgoingProvider", "outgoing_provider", default="smtp")
    except Exception as e:
        logger.error("Failed to get email config: %s", e, exc_info=True)
        cfg = {}
        provider = "smtp"

    try:
        if not queue_id_final:
            queue_id_final = _queue_insert(to, subject, html, purpose, provider,
                                           text=text, recipient_name=recipient_name)
        if not queue_id_final:
            logger.error("Failed to create mail_queue entry for %s", to)
            return {"ok": False, "error": "Failed to create mail_queue entry"}

        _queue_update(queue_id_final, "sending")
        logger.info("Sending email to %s via %s (purpose=%s)", to, provider, purpose)

        msg_id = None
        if not cfg.get("smtpHost") and not cfg.get("smtp_host") and not cfg.get("brevoApiKey") and not cfg.get("brevo_api_key") and not cfg.get("resendApiKey") and not cfg.get("resend_api_key"):
            raise ValueError("No email provider configured — set SMTP, Brevo, or Resend credentials in email_config")

        if provider == "brevo":
            msg_id = await _send_brevo(cfg, to, subject, html, text)
        elif provider == "resend":
            msg_id = await _send_resend(cfg, to, subject, html, text)
        else:
            await _send_smtp(cfg, to, subject, html, text)

        logger.info("Email sent to %s", to)
        _queue_update(queue_id_final, "sent", provider_msg_id=msg_id or "")
        return {"ok": True, "msg_id": msg_id or "", "provider": provider}

    except Exception as e:
        logger.error("Failed to send email to %s: %s", to, e, exc_info=True)
        if queue_id_final:
            retries = supabase.table("mail_queue").select("retry_count").eq("id", queue_id_final).execute()
            rc = (retries.data[0].get("retry_count", 0) if retries.data else 0) or 0
            supabase.table("mail_queue").update({
                "status": "failed", "error_msg": str(e), "retry_count": rc + 1,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", queue_id_final).execute()
        # Do NOT re-raise — background tasks should never crash the worker
        return {"ok": False, "error": str(e)}


async def _send_brevo(cfg, to, subject, html, text):
    api_key    = _c(cfg, "brevoApiKey",    "brevo_api_key")
    from_email = _c(cfg, "brevoFromEmail", "brevo_from_email")
    from_name  = _c(cfg, "brevoFromName",  "brevo_from_name", default="aifazi.net")
    if not api_key:
        raise ValueError("Brevo API key not configured")
    if not from_email:
        raise ValueError("Brevo From Email not configured")
    plain = text or re.sub(r'<[^>]+>', ' ', html).strip() or subject
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": api_key, "Content-Type": "application/json"},
            json={"sender": {"name": from_name, "email": from_email},
                  "to": [{"email": to}], "subject": subject,
                  "htmlContent": html, "textContent": plain},
        )
    if r.status_code not in (200, 201):
        raise RuntimeError(f"Brevo {r.status_code}: {r.text}")
    data = r.json()
    return data.get("messageId", "")


async def _send_resend(cfg, to, subject, html, text):
    api_key    = _c(cfg, "resendApiKey",    "resend_api_key")
    from_email = _c(cfg, "resendFromEmail", "resend_from_email")
    from_name  = _c(cfg, "resendFromName",  "resend_from_name", default="aifazi.net")
    if not api_key:
        raise ValueError("Resend API key not configured")
    if not from_email:
        raise ValueError("Resend From Email not configured")
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"from": f"{from_name} <{from_email}>", "to": [to],
                  "subject": subject, "html": html, "text": text or ""},
        )
    if r.status_code not in (200, 201):
        raise RuntimeError(f"Resend {r.status_code}: {r.text}")
    data = r.json()
    return data.get("id", "")


async def _send_smtp(cfg, to, subject, html, text):
    import aiosmtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    host       = _c(cfg, "smtpHost",       "smtp_host")
    port       = int(_c(cfg, "smtpPort",   "smtp_port",      default="587"))
    username   = _c(cfg, "smtpUsername",   "smtp_username")
    password   = _c(cfg, "smtpPassword",   "smtp_password")
    from_email = _c(cfg, "smtpFromEmail",  "smtp_from_email")
    from_name  = _c(cfg, "smtpFromName",   "smtp_from_name",  default="aifazi.net")
    encryption = _c(cfg, "smtpEncryption", "smtp_encryption", default="starttls")
    if not host:
        raise ValueError("SMTP host not configured")
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"{from_name} <{from_email}>"
    msg["To"]      = to
    if text:
        msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))
    await aiosmtplib.send(msg, hostname=host, port=port,
        username=username, password=password,
        use_tls=encryption in ("tls", "ssl"),
        start_tls=(encryption == "starttls"))
