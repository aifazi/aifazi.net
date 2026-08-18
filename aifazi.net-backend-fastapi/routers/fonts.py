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

import ipaddress
import logging
import os
import re
import socket
import uuid
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

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
_WEIGHTS = ("100", "200", "300", "400", "500", "600", "700", "800", "900")


def _host_is_private(hostname: str) -> bool:
    """True when a host resolves to a non-public IP (SSRF guard)."""
    if not hostname:
        return True
    try:
        infos = socket.getaddrinfo(hostname, None)
    except Exception:
        return True  # unresolvable — refuse rather than guess
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_multicast or ip.is_reserved or ip.is_unspecified):
            return True
    return False


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


def _insert_font_record(
    family_name: str,
    weight: str,
    style: str,
    css_format: str,
    file_url: str,
    storage_path: str,
    provider: str,
    filename: str,
    size: int,
) -> dict:
    if weight not in _WEIGHTS:
        weight = "400"
    if style not in ("normal", "italic"):
        style = "normal"
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
            "file_size":     size,
        }).execute()
        rec = row.data[0] if row.data else {}
    except Exception as exc:
        log.error("fonts insert failed: %s", exc)
        raise HTTPException(500, f"Font record failed: {exc}")
    return {
        "id":            rec.get("id"),
        "family":        family_name,
        "weight":        weight,
        "style":         style,
        "format":        css_format,
        "url":           file_url,
        "original_name": filename,
        "file_size":     size,
    }


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

    family_name = _css_escape((family or "").strip() or _family_from_filename(filename))

    try:
        file_url, storage_path, provider = await upload_media(
            content, filename, mime, folder="fonts"
        )
    except Exception as exc:
        raise HTTPException(500, f"Upload failed: {str(exc)[:200]}")

    return _insert_font_record(
        family_name, weight, style, css_format,
        file_url, storage_path, provider, filename, len(content),
    )


class FontFromUrlBody(BaseModel):
    url: str
    family: str = ""
    weight: str = "400"
    style: str = "normal"


@router.post("/from-url")
async def import_font_from_url(
    body: FontFromUrlBody,
    _: dict = Depends(require_staff),
):
    """Download a font file from an external URL and import it into the library.

    Works with direct .woff2/.ttf/.otf/.woff URLs from any CDN, including
    Google Fonts' gstatic file URLs. The payload is streamed (25 MB cap),
    magic-byte sniffed, malware scanned, then stored in R2 like an upload.
    """
    url = (body.url or "").strip()
    if not url:
        raise HTTPException(400, "url is required")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(400, "Only http(s) URLs are supported")
    if _host_is_private(parsed.hostname):
        raise HTTPException(400, "URL host is not publicly reachable")

    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client, \
                client.stream("GET", url) as resp:
                if resp.status_code != 200:
                    raise HTTPException(502, f"Could not download font (HTTP {resp.status_code})")
                content = b""
                async for chunk in resp.aiter_bytes():
                    content += chunk
                    if len(content) > FONT_MAX_BYTES:
                        raise HTTPException(413, f"Font exceeds {FONT_MAX_BYTES // 1024 // 1024} MB limit")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Could not download font: {str(exc)[:150]}")

    if not content:
        raise HTTPException(400, "Empty font file")

    filename = (parsed.path.rsplit("/", 1)[-1] or f"font_{uuid.uuid4().hex}").replace("..", "").strip()[:80]
    ext = os.path.splitext(filename)[1].lower()
    if ext not in _FONT_TYPES:
        raise HTTPException(415, "URL must point to a .ttf, .otf, .woff or .woff2 file")

    mime, css_format, ok = _sniff_font(content, ext)
    if not ok:
        raise HTTPException(415, "Downloaded file does not match the declared font type")

    scan_for_malware(content, filename or "font")

    family_name = _css_escape((body.family or "").strip() or _family_from_filename(filename))

    try:
        file_url, storage_path, provider = await upload_media(
            content, filename, mime, folder="fonts"
        )
    except Exception as exc:
        raise HTTPException(500, f"Upload failed: {str(exc)[:200]}")

    return _insert_font_record(
        family_name, body.weight, body.style, css_format,
        file_url, storage_path, provider, filename, len(content),
    )


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