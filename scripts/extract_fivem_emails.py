from pathlib import Path

src = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-backend-fastapi\routers\fivem.py")
lines = src.read_text(encoding="utf-8").splitlines(True)
print("original lines", len(lines))

start = end = None
for i, l in enumerate(lines):
    if l.startswith("def _email_approved"):
        start = i
    if start is not None and l.startswith("async def _discord_assign_whitelist_role"):
        end = i
        break
if start is None or end is None:
    raise SystemExit(f"markers not found start={start} end={end}")
print("email block", start + 1, "to", end)

block = "".join(lines[start:end])
# inspect what send imports
for name in ("log.", "send_", "email", "supabase", "FRONTEND"):
    pass

header = '''"""Whitelist email templates and send helper — extracted from routers/fivem.py."""
from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("fivem_emails")

'''

out = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-backend-fastapi\utils\fivem_emails.py")
# The send function may close over log/email helpers from fivem.py — we'll fix imports after reading the block.
out.write_text(header + block, encoding="utf-8")
print("wrote", out, "bytes", out.stat().st_size)
print("--- block head ---")
print(block[:500])
print("--- block tail ---")
print(block[-500:])

repl = (
    "from utils.fivem_emails import (  # noqa: F401\n"
    "    _email_approved, _email_denied, _email_reset, _email_applied,\n"
    "    _email_priority, _email_banned, _email_unbanned, _send_whitelist_email,\n"
    ")\n"
    "\n"
)
lines2 = lines[:start] + [repl] + lines[end:]
src.write_text("".join(lines2), encoding="utf-8")
print("fivem.py now", len(lines2), "lines")
