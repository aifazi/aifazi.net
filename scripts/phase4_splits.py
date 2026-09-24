"""Phase 4 splits: auth token helpers, fivem id/ban helpers, theme CSS extract."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(r"E:\aifazi Neon city\aifazi.net")


def extract_functions(src: Path, names: list[str], out: Path, header: str, imports: str) -> None:
    text = src.read_text(encoding="utf-8")
    lines = text.splitlines(True)
    blocks = []
    for name in names:
        # find def or async def name
        pat = re.compile(rf"^(async def {re.escape(name)}\(|def {re.escape(name)}\()")
        start = None
        for i, l in enumerate(lines):
            if pat.match(l):
                start = i
                break
        if start is None:
            raise SystemExit(f"{name} not found in {src}")
        # end at next top-level def/class/decorator/assignment at col 0 that's not nested
        end = len(lines)
        for j in range(start + 1, len(lines)):
            l = lines[j]
            if l.startswith(("def ", "async def ", "class ", "@")):
                end = j
                break
            if l.startswith(("SECRET", "ADMIN_", "COOKIE_", "router", "bearer", "log", "supabase")) and not l.startswith((" ", "\t")):
                # module-level after function — stop if clearly next section
                if j > start + 3 and l[0] not in " \t":
                    # only stop on blank-line-then-decl patterns handled above
                    pass
        # include trailing blank lines before next def
        while end > start + 1 and lines[end - 1].strip() == "":
            end -= 1
        blocks.append("".join(lines[start:end]))
        # remove from source later by markers
    out.write_text(header + "\n" + imports + "\n\n" + "\n\n".join(blocks) + "\n", encoding="utf-8")
    print("wrote", out, out.stat().st_size)


def remove_functions(src: Path, names: list[str], replacement: str) -> None:
    lines = src.read_text(encoding="utf-8").splitlines(True)
    for name in names:
        pat = re.compile(rf"^(async def {re.escape(name)}\(|def {re.escape(name)}\()")
        start = None
        for i, l in enumerate(lines):
            if pat.match(l):
                start = i
                break
        if start is None:
            raise SystemExit(f"{name} not found for removal in {src}")
        end = len(lines)
        for j in range(start + 1, len(lines)):
            l = lines[j]
            if l.startswith(("def ", "async def ", "class ", "@")):
                end = j
                break
        while end > start + 1 and lines[end - 1].strip() == "":
            end -= 1
        lines = lines[:start] + lines[end:]
    # insert replacement near top after imports — after last top-level import-ish block
    text = "".join(lines)
    # put after first blank after imports
    idx = text.find("\n\n")
    if idx == -1:
        text = replacement + "\n" + text
    else:
        # find a better spot: after `from utils` / `from database` block — use after first def header area
        m = re.search(r"\n\n(def |async def |class |# )", text)
        if m:
            text = text[: m.start()] + "\n\n" + replacement + text[m.start() :]
        else:
            text = replacement + "\n" + text
    src.write_text(text, encoding="utf-8")
    print("removed from", src, names)


# ── 1. auth tokens ────────────────────────────────────────────────────────────
auth_src = ROOT / "aifazi.net-backend-fastapi/routers/auth.py"
auth_out = ROOT / "aifazi.net-backend-fastapi/utils/auth_tokens.py"
AUTH_NAMES = [
    "make_token",
    "make_refresh_token",
    "make_admin_gate_token",
    "make_forum_token",
    "make_forum_2fa_token",
    "_set_auth_cookies",
    "_set_admin_gate_cookie",
]
# These use SECRET, COOKIE_DOMAIN, Response — import carefully
extract_functions(
    auth_src,
    AUTH_NAMES,
    auth_out,
    '"""Auth token minting + cookie helpers — extracted from routers/auth.py."""\nfrom __future__ import annotations',
    "import os\nfrom datetime import datetime, timedelta, timezone\nfrom fastapi import Response\n\nfrom jwt_compat import jwt\n\n"
    'SECRET = os.environ.get("PASETO_SECRET", "")\n'
    'COOKIE_DOMAIN = os.getenv("COOKIE_DOMAIN", "")\n'
    'ADMIN_GATE_SECRET = os.getenv("ADMIN_GATE_SECRET", "")\n',
)
# re-export in auth.py
remove_functions(
    auth_src,
    AUTH_NAMES,
    "from utils.auth_tokens import (  # noqa: F401\n"
    "    make_token, make_refresh_token, make_admin_gate_token,\n"
    "    make_forum_token, make_forum_2fa_token, _set_auth_cookies, _set_admin_gate_cookie,\n"
    ")\n",
)

# ── 2. fivem ids + bans ───────────────────────────────────────────────────────
fivem_src = ROOT / "aifazi.net-backend-fastapi/routers/fivem.py"
ID_NAMES = [
    "_player_identifiers",
    "_submission_identifiers",
    "_identifier_update_fields",
    "_normalize_identifier_list",
    "_first_identifier",
    "_primary_ban_identifier",
    "_find_whitelist_by_identifiers",
    "_answer_identifiers",
    "_player_ids_from_fields",
]
BAN_NAMES = [
    "_parse_datetime",
    "_duration_seconds",
    "_ban_expires_at",
    "_ban_expire_epoch",
    "_ban_duration_txadmin",
    "_resolve_net_id",
]
ids_out = ROOT / "aifazi.net-backend-fastapi/utils/fivem_ids.py"
extract_functions(
    fivem_src,
    ID_NAMES,
    ids_out,
    '"""FiveM player/application identifier helpers — extracted from routers/fivem.py."""\nfrom __future__ import annotations',
    "from datetime import datetime, timezone\nfrom typing import Any\n\nfrom database import supabase\n",
)
remove_functions(
    fivem_src,
    ID_NAMES,
    "from utils.fivem_ids import (  # noqa: F401\n"
    "    _player_identifiers, _submission_identifiers, _identifier_update_fields,\n"
    "    _normalize_identifier_list, _first_identifier, _primary_ban_identifier,\n"
    "    _find_whitelist_by_identifiers, _answer_identifiers, _player_ids_from_fields,\n"
    ")\n",
)

ban_out = ROOT / "aifazi.net-backend-fastapi/utils/fivem_bans.py"
extract_functions(
    fivem_src,
    BAN_NAMES,
    ban_out,
    '"""FiveM ban expiry / duration helpers — extracted from routers/fivem.py."""\nfrom __future__ import annotations',
    "from datetime import datetime, timezone\nfrom typing import Any\n",
)
remove_functions(
    fivem_src,
    BAN_NAMES,
    "from utils.fivem_bans import (  # noqa: F401\n"
    "    _parse_datetime, _duration_seconds, _ban_expires_at, _ban_expire_epoch,\n"
    "    _ban_duration_txadmin, _resolve_net_id,\n"
    ")\n",
)

print("fivem.py lines now", len(fivem_src.read_text(encoding="utf-8").splitlines()))
print("auth.py lines now", len(auth_src.read_text(encoding="utf-8").splitlines()))

# ── 3. theme CSS extract ──────────────────────────────────────────────────────
css = ROOT / "aifazi.net-frontend-next/app/globals.css"
css_text = css.read_text(encoding="utf-8")
marker = "THEME DESIGN SYSTEM"
idx = css_text.find(marker)
if idx == -1:
    raise SystemExit("theme design system marker not found")
# walk back to comment start
start = css_text.rfind("/*", 0, idx)
# extract from start to end of file? That would include late component styles mixed in.
# Better: extract [data-theme= blocks only
lines = css_text.splitlines(True)
theme_lines = []
other = []
in_theme = False
brace = 0
for i, l in enumerate(lines):
    if re.match(r"^\[data-theme=", l) or (in_theme and brace > 0):
        if not in_theme:
            in_theme = True
            brace = 0
        theme_lines.append(l)
        brace += l.count("{") - l.count("}")
        if in_theme and brace <= 0 and "{" in "".join(theme_lines[-5:]):
            in_theme = False
        continue
    # also capture consecutive [data-theme= after a blank
    other.append(l)

# Simpler approach: split on lines starting with [data-theme=
theme_blocks = []
rest = []
buf = []
mode = "rest"
depth = 0
for l in lines:
    if mode == "rest":
        if l.lstrip().startswith("[data-theme="):
            mode = "theme"
            depth = 0
            buf = [l]
            depth += l.count("{") - l.count("}")
        else:
            rest.append(l)
    else:
        buf.append(l)
        depth += l.count("{") - l.count("}")
        if depth <= 0:
            theme_blocks.append("".join(buf))
            buf = []
            mode = "rest"
if buf:
    theme_blocks.append("".join(buf))

themes_css = (
    "/* theme-library.css — per-theme design tokens & personality (extracted from globals.css).\n"
    "   Imported at the end of globals.css so theme overrides win the cascade. */\n\n"
    + "\n".join(theme_blocks)
)
themes_path = ROOT / "aifazi.net-frontend-next/app/theme-library.css"
themes_path.write_text(themes_css, encoding="utf-8")
print("theme blocks", len(theme_blocks), "css bytes", themes_path.stat().st_size)

# keep a short comment + @import at end of globals (and leave blocks removed)
# Rebuild globals without theme blocks but preserve order: actually safer to
# leave globals intact AND also ship theme-library for future use? That duplicates.
# We'll replace the extracted blocks with a comment pointing at the import.
new_rest = rest
# append import at end
footer = "\n/* Per-theme design system lives in theme-library.css */\n@import './theme-library.css';\n"
css.write_text("".join(new_rest) + footer, encoding="utf-8")
print("globals.css lines now", len(css.read_text(encoding="utf-8").splitlines()), "(was", len(lines), ")")
print("done")
