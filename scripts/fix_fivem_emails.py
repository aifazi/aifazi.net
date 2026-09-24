from pathlib import Path

# Fix fivem_emails.py header imports and drop Discord config
p = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-backend-fastapi\utils\fivem_emails.py")
text = p.read_text(encoding="utf-8")
# strip Discord config tail
idx = text.find("_DISCORD_TOKEN")
if idx != -1:
    text = text[:idx].rstrip() + "\n"
header = '''"""Whitelist email templates and send helper — extracted from routers/fivem.py."""
from __future__ import annotations

import logging
from html import escape as _fivem_html_escape
from typing import Any

from database import supabase
from utils.email_queue import queue_email

log = logging.getLogger("fivem_emails")


def _e(value) -> str:
    """HTML-escape a value for email bodies."""
    return _fivem_html_escape(str(value if value is not None else ""))


'''
# drop old header (through first def)
first_def = text.find("def _email_approved")
if first_def == -1:
    raise SystemExit("no _email_approved")
text = header + text[first_def:]
p.write_text(text, encoding="utf-8")
print("fixed fivem_emails.py", p.stat().st_size)

# Restore Discord bot config in fivem.py after the fivem_emails import block
fp = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-backend-fastapi\routers\fivem.py")
ftext = fp.read_text(encoding="utf-8")
if "_DISCORD_TOKEN" not in ftext.split("from utils.fivem_emails")[0] and "DISCORD_BOT_TOKEN" not in ftext:
    # insert after import block
    marker = ")\n\nfrom utils.fivem_emails"
    # find end of import from fivem_emails
    m = "from utils.fivem_emails import (  # noqa: F401\n    _email_approved, _email_denied, _email_reset, _email_applied,\n    _email_priority, _email_banned, _email_unbanned, _send_whitelist_email,\n)\n"
    if m not in ftext:
        raise SystemExit("import marker not found")
    discord = (
        m
        + "\n"
        + "# Discord Bot Config (role sync)\n"
        + '_DISCORD_TOKEN    = os.getenv("DISCORD_BOT_TOKEN", "")\n'
        + '_DISCORD_GUILD    = os.getenv("DISCORD_GUILD_ID", "")\n'
        + '_DISCORD_WL_ROLE  = os.getenv("DISCORD_WHITELIST_ROLE_ID", "")\n'
    )
    ftext = ftext.replace(m, discord, 1)
    fp.write_text(ftext, encoding="utf-8")
    print("restored Discord config in fivem.py")
else:
    print("Discord config already present or skipped")

# Ensure fivem.py still defines os import (it does)
print("fivem.py lines", len(fp.read_text(encoding='utf-8').splitlines()))
