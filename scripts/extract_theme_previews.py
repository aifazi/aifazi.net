from pathlib import Path

src = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\pages-src\admin\ThemeLibrary.jsx")
out = Path(r"E:\aifazi Neon city\aifazi.net\aifazi.net-frontend-next\pages-src\admin\themeLibraryPreviews.jsx")
lines = src.read_text(encoding="utf-8").splitlines(True)

# Find markers
start = next(i for i, l in enumerate(lines) if l.startswith("// ── Framework preview tokens"))
end = next(i for i, l in enumerate(lines) if l.startswith("function ThemePackageCard"))
block = "".join(lines[start:end])

header = """'use client'
import { useState } from 'react'

"""
footer = """
export {
  FwMenuPreview, FwNotifyPreview, FwDialogPreview,
  FwInputPreview, FwSurfacePreview, FwLoadingPreview, FwAnimPreview,
}
"""
out.write_text(header + block + footer, encoding="utf-8")
print("wrote previews", out.stat().st_size)

import_block = (
    "import {\n"
    "  FwMenuPreview, FwNotifyPreview, FwDialogPreview,\n"
    "  FwInputPreview, FwSurfacePreview, FwLoadingPreview, FwAnimPreview,\n"
    "} from './themeLibraryPreviews'\n"
)
new_lines = lines[:start] + [import_block, "\n"] + lines[end:]
src.write_text("".join(new_lines), encoding="utf-8")
print("ThemeLibrary.jsx now", len(new_lines), "lines")
