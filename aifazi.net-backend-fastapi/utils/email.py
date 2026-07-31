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


def render_template(purpose: str, variables: dict) -> tuple[str, str]:
    """
    Fetch template by purpose and render {{variable}} placeholders.
    Returns (subject, html). Falls back to ('', '') if not found.
    """
    try:
        res = supabase.table("mail_templates").select("subject,html").eq("purpose", purpose).eq("active", True).execute()
        if not res.data:
            return "", ""
        tpl = res.data[0]
        subject = tpl.get("subject", "")
        html    = tpl.get("html", "")
        for k, v in variables.items():
            subject = subject.replace(f"{{{{{k}}}}}", str(v))
            html    = html.replace(f"{{{{{k}}}}}", str(v))
        return subject, html
    except Exception as e:
        logger.error("render_template failed for purpose=%s: %s", purpose, e)
        return "", ""


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
