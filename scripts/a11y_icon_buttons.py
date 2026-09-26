from pathlib import Path
import re

root = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next")

# Find <button ...>TEXT</button> where TEXT is icon-only (emoji, symbol, ≤3 chars)
# and the tag has no aria-label/title. Add aria-label from a symbol map or generic.

ICON_LABELS = {
    "×": "Close",
    "✕": "Close",
    "x": "Close",
    "X": "Close",
    "↺": "Reset",
    "↻": "Refresh",
    "⟳": "Refresh",
    "+": "Add",
    "−": "Remove",
    "-": "Remove",
    "⋯": "More actions",
    "…": "More actions",
    "⋮": "More actions",
    "🗑": "Delete",
    "🗑️": "Delete",
    "✓": "Confirm",
    "✔": "Confirm",
    "→": "Next",
    "←": "Previous",
    "‹": "Previous",
    "›": "Next",
    "▲": "Expand",
    "▼": "Collapse",
    "▲": "Expand",
    "▼": "Collapse",
    "⚙": "Settings",
    "⚙️": "Settings",
    "✎": "Edit",
    "✏️": "Edit",
    "🔍": "Search",
    "⌕": "Search",
    "☰": "Menu",
    "⚡": "Actions",
    "★": "Favorite",
    "☆": "Unfavorite",
    "❤": "Like",
    "💬": "Comments",
    "📌": "Pin",
    "🔒": "Lock",
    "🔓": "Unlock",
    "👁": "Preview",
    "👁️": "Preview",
    "📋": "Copy",
    "⬇": "Download",
    "⬆": "Upload",
    "🔄": "Refresh",
    "⟳": "Refresh",
}

pair_re = re.compile(
    r"(<button\b)([^>]*)(>)(\s*)([^<]{0,6})(\s*)(</button>)",
    re.S,
)

def strip_tags(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s).strip()

changed = 0
files = 0
for p in list(root.rglob("*.jsx")) + list(root.rglob("*.tsx")):
    s = str(p)
    if "node_modules" in s or ".next" in s:
        continue
    t = p.read_text(encoding="utf-8", errors="ignore")
    orig = t

    def repl(m):
        global changed
        open_a, attrs, close_a, ws1, text, ws2, close_b = m.groups()
        if "aria-label" in attrs or "title=" in attrs:
            return m.group(0)
        inner = text.strip()
        if not inner or len(inner) > 6:
            return m.group(0)
        # skip if looks like real word text
        if re.search(r"[A-Za-z]{3,}", inner):
            return m.group(0)
        label = ICON_LABELS.get(inner)
        if not label:
            # generic for emoji/symbol-only
            if re.fullmatch(r"[\W_]+", inner) or any(ord(c) > 0x2000 for c in inner):
                label = "Action"
            else:
                return m.group(0)
        changed += 1
        return f'{open_a}{attrs} aria-label="{label}"{close_a}{ws1}{text}{ws2}{close_b}'

    t2 = pair_re.sub(repl, t)
    if t2 != orig:
        p.write_text(t2, encoding="utf-8")
        files += 1

print("files", files, "aria-labels", changed)
