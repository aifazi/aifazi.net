"""
routers/fonts.py — Admin font library for theme customization.

Uploaded font files are stored in the active CDN provider (Cloudflare R2 by
default) under the `fonts/` folder via the shared upload_media() helper, and
each file is registered in the `fonts` table. The admin frontend mirrors the
slim {id, family, url, format, weight, style} list into site_config.settings
(`uploadedFonts`) so the SSR + client renderers can emit @font-face rules for
visitors — see core/themeCustom.js buildThemeCustomCss().

Mounted at /api/admin/fonts. All endpoints require staff.
"""
from __future__ import annotations

import logging
import os
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from database import supabase
from dependencies import require_staff
from routers.cdn_upload import delete_media, upload_media
from routers.upload import scan_for_malware

log = logging.getLogger("fonts")
router = APIRouter()

FONT_MAX_BYTES = 25 * 1024 * 1024  # 25 MB — font files can be large

# Extension → canonical MIME + CSS format string for @font-face src().
# ttf ("true") shares magic bytes with otf in some fonts, so we sniff then
# fall back to the extension to disambiguate otf vs ttf.
_FONT_TYPES = {
    ".ttf":  ("font/ttf",  "truetype", (b"\x00\x01\x00\x00", b"true")),
    ".otf":  ("font/otf",  "opentype", (b"OTTO",)),
    ".woff": ("font/woff", "woff",     (b"wOFF",)),
    ".woff2":("font/woff2","woff2",    (b"wOF2",)),
}

_FAMILY_SAFE = re.compile(r"[^A-Za-z0-9 _-]+")


def _css_escape(value: str) -> str:
    """Escape single quotes/backslashes so a family name can't break out of the
    generated @font-face / CSS var string."""
    return value.replace("\\", "\\\\").replace("'", "\\'")


def _family_from_filename(filename: str) -> str:
    base = (filename or "font").rsplit("/", 1)[-1]
    base = os.path.splitext(base)[0]
    base = _FAMILY_SAFE.sub("", base).strip()
    words = [w for w in re.split(r"[_\-\s]+", base) if w]
    name = " ".join(w[:1].upper() + w[1:] for w in words)
    return (name or "UploadedFont")[:60]


def _sniff_font(content: bytes, ext: str) -> tuple[str, str, bool]:
    """Return (mime, css_format, ok) for a font payload using magic bytes.

    otf magic "OTTO" is unambiguous; ttf is the sfnt container. We require the
    magic to match one of the known signatures so a non-font payload can't
    smuggle through as a .ttf just by extension.
    """
    if ext not in _FONT_TYPES:
        return "", "", False
    if content.startswith(b"wOF2"):
        return "font/woff2", "woff2", True
    if content.startswith(b"wOFF"):
        return "font/woff", "woff", True
    if content.startswith(b"OTTO"):
        return "font/otf", "opentype", True
    if content.startswith((b"\x00\x01\x00\x00", b"true")) and ext == ".ttf":
        return "font/ttf", "truetype", True
    return "", "", False


@router.post("/upload")
async def upload_font(
    file: UploadFile = File(...),
    family: str = Form(""),
    weight: str = Form("400"),
    style: str = Form("normal"),
    _: dict = Depends(require_staff),
):
    content = await file.read()
    if len(content) > FONT_MAX_BYTES:
        raise HTTPException(413, f"Font exceeds {FONT_MAX_BYTES // 1024 // 1024} MB limit")
    if not content:
        raise HTTPException(400, "Empty file")

    filename = (file.filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    ext = os.path.splitext(filename)[1].lower()
    if ext not in _FONT_TYPES:
        raise HTTPException(415, "Only .ttf, .otf, .woff and .woff2 files are supported")

    mime, css_format, ok = _sniff_font(content, ext)
    if not ok:
        raise HTTPException(415, "File does not match the declared font type")

    # Malware scan (fail-open)
    scan_for_malware(content, filename or "font")

    if weight not in ("100", "200", "300", "400", "500", "600", "700", "800", "900"):
        weight = "400"
    if style not in ("normal", "italic"):
        style = "normal"

    family_name = _css_escape((family or "").strip() or _family_from_filename(filename))

    try:
        file_url, storage_path, provider = await upload_media(
            content, filename, mime, folder="fonts"
        )
    except Exception as exc:
        raise HTTPException(500, f"Upload failed: {str(exc)[:200]}")

    try:
        row = supabase.table("fonts").insert({
            "family":        family_name,
            "weight":        weight,
            "style":         style,
            "format":        css_format,
            "file_url":      file_url,
            "storage_path":  storage_path,
            "provider":      provider,
            "original_name": filename,
            "file_size":     len(content),
        }).execute()
        rec = row.data[0] if row.data else {}
    except Exception as exc:
        log.error("fonts insert failed: %s", exc)
        raise HTTPException(500, f"Font record failed: {exc}")

    return {
        "id":           rec.get("id"),
        "family":       family_name,
        "weight":       weight,
        "style":        style,
        "format":       css_format,
        "url":          file_url,
        "original_name": filename,
        "file_size":    len(content),
    }


@router.get("")
async def list_fonts(_: dict = Depends(require_staff)):
    res = (supabase.table("fonts")
           .select("id,family,weight,style,format,file_url,original_name,file_size,created_at")
           .order("created_at", desc=True).execute())
    return res.data or []


@router.delete("/{font_id}")
async def delete_font(font_id: str, _: dict = Depends(require_staff)):
    res = (supabase.table("fonts")
           .select("id,storage_path,provider").eq("id", font_id).limit(1).execute())
    if not res.data:
        raise HTTPException(404, "Font not found")
    font = res.data[0]
    await delete_media(font.get("provider") or "r2", font.get("storage_path") or "")
    supabase.table("fonts").delete().eq("id", font_id).execute()
    return {"ok": True}