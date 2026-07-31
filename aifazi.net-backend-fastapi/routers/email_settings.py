"""routers/email_settings.py
Stores all email config in a single JSONB 'settings' column.

Migration (run once in Supabase SQL editor):
    ALTER TABLE email_config
        ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';
    INSERT INTO email_config (key, settings)
        VALUES ('global', '{}')
        ON CONFLICT (key) DO NOTHING;
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from database import supabase
from dependencies import require_staff
import httpx, socket, logging
router = APIRouter()
logger = logging.getLogger(__name__)

_EMAIL_CONFIG_MIGRATION_SQL = """
CREATE TABLE IF NOT EXISTS email_config (
    key         TEXT PRIMARY KEY,
    settings    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO email_config (key, settings)
    VALUES ('global', '{}')
    ON CONFLICT (key) DO NOTHING;
"""

def _ensure_email_config_table():
    """Idempotent: create the email_config table + global row if missing."""
    try:
        supabase.rpc("exec_sql", {"sql_text": _EMAIL_CONFIG_MIGRATION_SQL}).execute()
        return True
    except Exception as rpc_exc:
        logger.warning("email_settings: exec_sql RPC unavailable (%s) — trying probe", rpc_exc)
    try:
        supabase.table("email_config").select("key").limit(1).execute()
        return True
    except Exception as probe_exc:
        logger.error("email_settings: email_config table still missing (%s)", probe_exc)
        return False

def _get_row():
    try:
        res = supabase.table("email_config").select("settings").eq("key", "global").execute()
        return res.data[0] if res.data else None
    except Exception as exc:
        logger.error("email_settings: read failed (%s) — attempting table repair", exc)
        if not _ensure_email_config_table():
            raise
        res = supabase.table("email_config").select("settings").eq("key", "global").execute()
        return res.data[0] if res.data else None

def _get_settings() -> dict:
    """Return the settings dict (handles nested JSONB 'settings' column)."""
    row = _get_row()
    if row is None:
        return {}
    return row.get("settings") or {}

@router.get("")
async def get(_: dict = Depends(require_staff)):
    row = _get_row()
    if row is None:
        supabase.table("email_config").insert({"key": "global", "settings": {}}).execute()
        return {}
    return row.get("settings") or {}

@router.put("")
async def update(body: dict, _: dict = Depends(require_staff)):
    body.pop("id", None); body.pop("key", None); body.pop("settings", None)
    row = _get_row()
    if row is None:
        res = supabase.table("email_config").insert({"key": "global", "settings": body}).execute()
    else:
        merged = {**(row.get("settings") or {}), **body}
        res = supabase.table("email_config").update({"settings": merged}).eq("key", "global").execute()
    if not res.data:
        raise HTTPException(500, "Failed to save email settings")
    return res.data[0].get("settings") or {}

# ── Test outgoing connection ───────────────────────────────────────────────────
@router.post("/test-outgoing")
async def test_outgoing(body: dict, _: dict = Depends(require_staff)):
    provider = body.get("outgoingProvider", body.get("outgoing_provider", "brevo"))

    if provider == "brevo":
        api_key = body.get("brevoApiKey", "").strip()
        if not api_key:
            raise HTTPException(400, "Brevo API key is required.")
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    "https://api.brevo.com/v3/account",
                    headers={"api-key": api_key},
                )
            if r.status_code == 200:
                data = r.json()
                plan = data.get("plan", [{}])
                plan_name = plan[0].get("type", "Free") if plan else "Free"
                email = data.get("email", "")
                return {"message": f"Brevo connected. Account: {email} | Plan: {plan_name}"}
            elif r.status_code == 401:
                raise HTTPException(400, "Invalid Brevo API key. Make sure you're using an API key (not SMTP credentials).")
            else:
                raise HTTPException(400, f"Brevo API returned HTTP {r.status_code}.")
        except httpx.RequestError as e:
            raise HTTPException(502, f"Could not reach Brevo API: {e}")

    if provider == "resend":
        api_key = body.get("resendApiKey", "").strip()
        if not api_key:
            raise HTTPException(400, "Resend API key is required.")
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    "https://api.resend.com/domains",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
            if r.status_code == 200:
                domains = r.json().get("data", [])
                domain_names = [d.get("name") for d in domains] if domains else []
                msg = f"Resend connected."
                if domain_names:
                    msg += f" Domains: {', '.join(domain_names)}"
                return {"message": msg}
            elif r.status_code == 401:
                raise HTTPException(400, "Invalid Resend API key.")
            else:
                raise HTTPException(400, f"Resend API returned HTTP {r.status_code}.")
        except httpx.RequestError as e:
            raise HTTPException(502, f"Could not reach Resend API: {e}")

    if provider == "smtp":
        host = body.get("smtpHost", "").strip()
        port = int(body.get("smtpPort", 587))
        if not host:
            raise HTTPException(400, "SMTP host is required.")
        # Check if port is reachable (cloud hosts block SMTP)
        try:
            sock = socket.create_connection((host, port), timeout=6)
            sock.close()
            return {"message": f"SMTP port {port} on {host} is reachable."}
        except (socket.timeout, ConnectionRefusedError, OSError):
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=400, content={
                "error": "SMTP connection failed. Cloud hosts (Render, Railway, Vercel) block outbound SMTP ports 587 & 465. "
                         "Switch to Brevo or Resend — both use HTTPS and are never blocked.",
                "smtpBlocked": True,
            })

    raise HTTPException(400, f"Unknown provider: {provider}")


# ── Send test email ────────────────────────────────────────────────────────────
class SendTestBody(BaseModel):
    to: EmailStr

@router.post("/send-test")
async def send_test(body: SendTestBody, _: dict = Depends(require_staff)):
    from utils.email import send_email, render_template
    try:
        subject, html = render_template("mail_test", {
            "site_name": "aifazi.net",
            "email": str(body.to),
        })
        result = await send_email(
            to=str(body.to),
            subject=subject or "Test Email from aifazi.net Admin",
            html=html or "<h2>Test Email</h2><p>Your email configuration is working correctly.</p>",
            text="Test Email — Your email configuration is working correctly.",
            purpose="mail_test",
        )
        if not result.get("ok"):
            raise HTTPException(502, f"Failed to send test email: {result.get('error', 'unknown error')}")
        return {"message": f"Test email sent to {body.to}", "provider": result.get("provider")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to send test email: {str(e)}")

# ── Test incoming connection ───────────────────────────────────────────────────
@router.post("/test-incoming")
async def test_incoming(body: dict, _: dict = Depends(require_staff)):
    if not body.get("incomingEnabled"):
        raise HTTPException(400, "Incoming mail is disabled. Enable it first.")
    host     = body.get("incomingHost", "").strip()
    port     = int(body.get("incomingPort", 993))
    username = body.get("incomingUsername", "").strip()
    password = body.get("incomingPassword", "").strip()
    protocol = body.get("incomingProtocol", "imap")
    encrypt  = body.get("incomingEncryption", "ssl")

    if not all([host, username, password]):
        raise HTTPException(400, "Host, username and password are required.")

    try:
        import asyncio, ssl as _ssl
        ctx = _ssl.create_default_context() if encrypt in ("ssl", "starttls") else None

        if protocol == "imap":
            import imaplib
            def _check():
                if encrypt == "ssl":
                    m = imaplib.IMAP4_SSL(host, port, ssl_context=ctx)
                else:
                    m = imaplib.IMAP4(host, port)
                    if encrypt == "starttls":
                        m.starttls(ssl_context=ctx)
                m.login(username, password)
                status, data = m.select("INBOX")
                count = data[0].decode() if data and data[0] else "?"
                m.logout()
                return count
            count = await asyncio.to_thread(_check)
            return {"message": f"IMAP connected. INBOX has {count} message(s)."}

        elif protocol == "pop3":
            import poplib
            def _check():
                if encrypt == "ssl":
                    m = poplib.POP3_SSL(host, port, context=ctx)
                else:
                    m = poplib.POP3(host, port)
                    if encrypt == "starttls":
                        m.stls(context=ctx)
                m.user(username)
                m.pass_(password)
                count = len(m.list()[1])
                m.quit()
                return count
            count = await asyncio.to_thread(_check)
            return {"message": f"POP3 connected. {count} message(s) available."}

    except Exception as e:
        raise HTTPException(400, f"Incoming connection failed: {str(e)}")
