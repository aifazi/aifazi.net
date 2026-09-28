"""OAuth redirect regression: raw tokens must never be in query strings.

Mobile deep links use URL fragments (#token=), web uses HttpOnly cookies.
Query (?token=) would leak via proxy/server logs and Referer.
"""
from __future__ import annotations

import os
import pathlib
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ROUTERS = pathlib.Path(__file__).resolve().parent.parent / "routers"


def _src(name: str) -> str:
    return (ROUTERS / name).read_text(encoding="utf-8", errors="ignore")


def test_discord_mobile_uses_fragment_not_query():
    src = _src("discord_auth.py")
    assert "aifazi://auth/discord#token=" in src
    assert "aifazi://auth/discord?token=" not in src


def test_no_oauth_callback_embeds_query_token():
    # Email verify/reset ?token= links are one-time short-TTL and allowed;
    # OAuth access/refresh tokens must not be in queries.
    for name in ("authentik_oidc.py", "github_auth.py", "steam_auth.py", "discord_auth.py", "auth.py"):
        src = _src(name)
        for line in src.splitlines():
            low = line.lower()
            if "?token=" in low and ("verify" in low or "reset" in low or "confirm" in low or "newsletter" in low):
                continue
            if "?token=" in low and ("token=" in low) and ("redirect" in low or "aifazi://" in low or "front" in low):
                raise AssertionError(f"{name} embeds ?token= in a redirect: {line.strip()[:160]}")


def test_discord_cookie_uses_domain_and_prod_secure():
    src = _src("discord_auth.py")
    assert "COOKIE_DOMAIN" in src
    assert "secure=_IS_PROD" in src or "secure=is_prod" in src


def test_backup_and_email_settings_do_not_call_exec_sql():
    for name, fn in (("backup.py", "_discover_tables"), ("email_settings.py", "_ensure_email_config_table")):
        src = _src(name)
        # db_console.py remains the only allowed exec_sql caller (plus audit migrate, admin-gated).
        assert 'rpc("exec_sql"' not in src and "rpc('exec_sql'" not in src, f"{name} still calls exec_sql"
        assert fn in src
