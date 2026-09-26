from pathlib import Path

src = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\pages-src\admin\ThemeLibrary.jsx")
lines = src.read_text(encoding="utf-8").splitlines(True)
print("original lines", len(lines))

# Find markers
def find_line(pred, start=0):
    for i in range(start, len(lines)):
        if pred(lines[i]):
            return i
    raise SystemExit("marker not found")

anim = find_line(lambda l: l.startswith("const ANIMATIONS = ["))
color_row = find_line(lambda l: l.startswith("function ColorRow"))
color_labels = find_line(lambda l: l.startswith("const COLOR_LABELS = {"))
neon = find_line(lambda l: l.startswith("const NEON_SWATCHES = ["))
color_edit = find_line(lambda l: l.startswith("function ColorEdit"))
prev_bg = find_line(lambda l: l.startswith("const PREVIEW_BG_PATTERNS = {"))
custom_preview = find_line(lambda l: l.startswith("function CustomizePreviewModal"))

print("markers", anim, color_row, color_labels, neon, color_edit, prev_bg, custom_preview)

data1 = "".join(lines[anim:color_row])  # ANIMATIONS through DEFAULT_CUSTOM
data2 = "".join(lines[color_labels:color_edit])  # COLOR_LABELS + NEON_SWATCHES
data3 = "".join(lines[prev_bg:custom_preview])  # PREVIEW_BG_*

out = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\pages-src\admin\themeLibraryData.js")
out.write_text(
    "/**\n"
    " * themeLibraryData.js — pure data extracted from ThemeLibrary.jsx (god-file split).\n"
    " * Presentation components stay in ThemeLibrary.jsx.\n"
    " */\n"
    "\n"
    + data1
    + "\n"
    + data2
    + "\n"
    + data3
    + "\nexport {\n"
    "  ANIMATIONS, LIGHT_THEME_IDS, THEME_DEFS, NEW_THEME_ADDED_AT, NEW_THEME_TTL_MS,\n"
    "  NEW_THEME_IDS, STYLE_TEMPLATES, ANIM_CATEGORIES, ANIMATION_PATTERNS, GRID_PATTERNS,\n"
    "  DEFAULT_CUSTOM, COLOR_LABELS, NEON_SWATCHES, PREVIEW_BG_PATTERNS, PREVIEW_BG_SIZES,\n"
    "}\n",
    encoding="utf-8",
)
print("wrote", out, out.stat().st_size)

import_block = (
    "import {\n"
    "  ANIMATIONS, LIGHT_THEME_IDS, THEME_DEFS, NEW_THEME_ADDED_AT, NEW_THEME_TTL_MS,\n"
    "  NEW_THEME_IDS, STYLE_TEMPLATES, ANIM_CATEGORIES, ANIMATION_PATTERNS, GRID_PATTERNS,\n"
    "  DEFAULT_CUSTOM, COLOR_LABELS, NEON_SWATCHES, PREVIEW_BG_PATTERNS, PREVIEW_BG_SIZES,\n"
    "} from './themeLibraryData'\n"
)

new_lines = lines[:anim] + [import_block, "\n"] + lines[color_row:color_labels] + lines[color_edit:prev_bg] + lines[custom_preview:]
src.write_text("".join(new_lines), encoding="utf-8")
print("ThemeLibrary.jsx now", len(new_lines), "lines")
