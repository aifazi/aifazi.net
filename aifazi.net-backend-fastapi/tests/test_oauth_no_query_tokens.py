"""OAuth redirect regression: raw tokens must never be in URLs.

H2/C6 — mobile deep links carry one-time exchange codes (#code=) that the
app exchanges server-side (POST /api/auth/mobile/exchange); web uses HttpOnly
cookies. Query (?token=) leaks via proxy/server logs and Referer; fragment
tokens leak via OS intent logs / history, which is why mobile moved to codes.
"""
from __future__ import annotations

import os
import pathlib
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ROUTERS = pathlib.Path(__file__).resolve().parent.parent / "routers"


def _src(name: str) -> str:
    return (ROUTERS / name).read_text(encoding="utf-8", errors="ignore")


def test_discord_mobile_deep_link_carries_no_token():
    # H2/C6 — the mobile deep link carries a one-time exchange code, not a token.
    src = _src("discord_auth.py")
    assert "aifazi://auth/discord#token=" not in src
    assert "aifazi://auth/discord?token=" not in src
    assert "issue_code" in src and "mobile_fragment" in src


def test_no_oauth_mobile_branch_embeds_fragment_token():
    # H2/C6 — no mobile deep-link redirect embeds a raw #token= fragment.
    # (The web last-resort fragment fallbacks in github_auth are cookie-first
    # and never reached when the flow is mobile: the mobile branch now returns
    # a one-time code before any web token is minted.)
    for name in ("authentik_oidc.py", "github_auth.py", "steam_auth.py", "discord_auth.py", "auth_discord.py"):
        src = _src(name)
        for line in src.splitlines():
            if "#token=" in line and ("MOBILE" in line or "aifazi://" in line or "mobile" in line.lower() and "m_login" in line):
                raise AssertionError(f"{name} mobile branch embeds #token=: {line.strip()[:160]}")


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
