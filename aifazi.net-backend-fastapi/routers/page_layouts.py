"""page_layouts.py — CRUD for Odoo-style PageBlocks page documents.

Reads of published layouts are public. All writes (and draft reads) require
an admin session (require_admin). Block bodies are validated for shape and
size (fail closed); block *types* are allowlisted only by the frontend
registry — unknown types render as nothing, so a rogue type is inert.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import supabase
from dependencies import decode_token, require_admin

router = APIRouter()
log = logging.getLogger("pages.layouts")

MAX_BLOCKS = 100
MAX_BODY_BYTES = 500 * 1024
MAX_DEPTH = 2
_SLUG_RE = re.compile(r"^[a-z0-9-]+$")
_TYPE_RE = re.compile(r"^[a-z0-9-]{1,64}$")


class LayoutIn(BaseModel):
    slug: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=120)
    published: bool = False
    blocks: list = Field(default_factory=list, max_length=MAX_BLOCKS)


def _slugify(raw: str) -> str:
    slug = re.sub(r"[^a-z0-9-]+", "-", raw.lower()).strip("-")[:64]
    return slug or "page"


def _validate_block(block: object, depth: int, seen: set[str]) -> None:
    """Recursive shape/size validation. Raises 400 on anything unexpected."""
    if not isinstance(block, dict):
        raise HTTPException(400, "Invalid block entry")
    bid = block.get("id")
    btype = block.get("type")
    props = block.get("props", {})
    if not isinstance(bid, str) or not bid or len(bid) > 64:
        raise HTTPException(400, "Block missing id")
    if bid in seen:
        raise HTTPException(400, "Duplicate block id")
    seen.add(bid)
    if not isinstance(btype, str) or not _TYPE_RE.match(btype):
        raise HTTPException(400, "Invalid block type")
    if not isinstance(props, dict) or len(props) > 50:
        raise HTTPException(400, "Invalid block props")
    for k, v in props.items():
        if not isinstance(k, str) or len(k) > 64:
            raise HTTPException(400, "Invalid prop key")
        if isinstance(v, str) and len(v) > 5000:
            raise HTTPException(400, "Prop value too long")
        if isinstance(v, (dict, list)):
            raise HTTPException(400, "Nested prop values not allowed (keep props flat)")
    children = block.get("children", [])
    if children:
        if depth >= MAX_DEPTH:
            raise HTTPException(400, "Block nesting too deep")
        if not isinstance(children, list) or len(children) > 12:
            raise HTTPException(400, "Invalid block children")
        for child in children:
            _validate_block(child, depth + 1, seen)


def _validate_layout(blocks: list) -> list:
    if not isinstance(blocks, list):
        raise HTTPException(400, "blocks must be an array")
    if len(blocks) > MAX_BLOCKS:
        raise HTTPException(400, "Layout too large")
    try:
        if len(json.dumps(blocks).encode()) > MAX_BODY_BYTES:
            raise HTTPException(400, "Layout body too large")
    except (TypeError, ValueError):
        raise HTTPException(400, "Layout body not serializable")
    seen: set[str] = set()
    for block in blocks:
        _validate_block(block, 0, seen)
    return blocks


def _row_to_layout(row: dict, include_body: bool = True) -> dict:
    out = {
        "id": row["id"],
        "slug": row["slug"],
        "title": row["title"],
        "updatedAt": row.get("updated_at"),
        "published": bool(row.get("published")),
    }
    if include_body:
        out["blocks"] = row.get("blocks", []) or []
    else:
        blocks = row.get("blocks", []) or []
        out["blockCount"] = len(blocks) if isinstance(blocks, list) else 0
    return out


def _optional_admin(request: Request) -> dict | None:
    """Best-effort admin check for draft preview (never raises)."""
    token = ""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    elif request.cookies.get("auth_token"):
        token = request.cookies.get("auth_token") or ""
    if not token:
        return None
    try:
        return require_admin(decode_token(token))
    except Exception:
        return None


@router.get("/layouts")
def list_layouts():
    """Public: published layout metas (newest first)."""
    res = supabase.table("page_layouts").select(
        "id,slug,title,updated_at,published,blocks"
    ).eq("published", True).order("updated_at", desc=True).limit(100).execute()
    return {"layouts": [_row_to_layout(r, include_body=False) for r in (res.data or [])]}


@router.get("/layouts/admin/all")
def admin_list_all(_: dict = Depends(require_admin)):
    """Staff: every layout incl. drafts (metas only)."""
    res = supabase.table("page_layouts").select(
        "id,slug,title,updated_at,published,blocks"
    ).order("updated_at", desc=True).limit(200).execute()
    return {"layouts": [_row_to_layout(r, include_body=False) for r in (res.data or [])]}


@router.get("/layouts/{slug}")
def get_layout(slug: str, request: Request):
    """Public if published; drafts 404 unless the caller is admin (no oracle)."""
    slug = _slugify(slug)
    res = supabase.table("page_layouts").select("*").eq("slug", slug).limit(1).execute()
    row = (res.data or [None])[0]
    if not row:
        raise HTTPException(404, "Layout not found")
    if not row.get("published") and _optional_admin(request) is None:
        raise HTTPException(404, "Layout not found")
    return {"layout": _row_to_layout(row, include_body=True)}


@router.post("/layouts")
def create_layout(body: LayoutIn, _: dict = Depends(require_admin)):
    """Staff: create a layout (starts unpublished unless published=true)."""
    slug = _slugify(body.slug)
    blocks = _validate_layout(body.blocks)
    now = datetime.now(timezone.utc).isoformat()
    try:
        res = supabase.table("page_layouts").insert({
            "slug": slug,
            "title": body.title.strip(),
            "published": body.published,
            "blocks": blocks,
            "created_at": now,
            "updated_at": now,
        }).execute()
    except Exception as e:
        msg = str(e).lower()
        if "unique" in msg or "duplicate" in msg or "23505" in msg:
            raise HTTPException(409, "Slug already exists")
        raise
    row = (res.data or [None])[0]
    if not row:
        raise HTTPException(500, "Create failed")
    return {"layout": _row_to_layout(row, include_body=True)}


@router.put("/layouts/{layout_id}")
def update_layout(layout_id: str, body: LayoutIn, _: dict = Depends(require_admin)):
    """Staff: replace a layout (full-document PUT)."""
    slug = _slugify(body.slug)
    blocks = _validate_layout(body.blocks)
    try:
        res = supabase.table("page_layouts").update({
            "slug": slug,
            "title": body.title.strip(),
            "published": body.published,
            "blocks": blocks,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", layout_id[:64]).execute()
    except Exception as e:
        msg = str(e).lower()
        if "unique" in msg or "duplicate" in msg or "23505" in msg:
            raise HTTPException(409, "Slug already exists")
        raise
    row = (res.data or [None])[0]
    if not row:
        raise HTTPException(404, "Layout not found")
    return {"layout": _row_to_layout(row, include_body=True)}


@router.delete("/layouts/{layout_id}")
def delete_layout(layout_id: str, _: dict = Depends(require_admin)):
    """Staff: delete a layout (404 when the id does not exist)."""
    res = supabase.table("page_layouts").delete().eq("id", layout_id[:64]).execute()
    if not (res.data or []):
        raise HTTPException(404, "Layout not found")
    return {"ok": True}
