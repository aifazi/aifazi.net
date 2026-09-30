"""infra_diagrams.py — CRUD for /hybrid-infra builder diagram documents.

Reads of published docs are public. All writes (and draft reads) require
an admin session (require_admin). The built-in Plan A seed lives in the
frontend (data/hybrid-infra.ts) and is never stored — slug 'plan-a' is
rejected here so nothing can squat it.
"""
from __future__ import annotations

import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import supabase
from dependencies import decode_token, require_admin

router = APIRouter()
log = logging.getLogger("infra.diagrams")

RESERVED_SLUGS = {"plan-a"}
MAX_NODES = 200
MAX_FLOWS = 200


class DiagramIn(BaseModel):
    slug: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=120)
    published: bool = False
    nodes: list = Field(default_factory=list, max_length=MAX_NODES)
    flows: list = Field(default_factory=list, max_length=MAX_FLOWS)
    categoryColors: dict | None = None


def _slugify(raw: str) -> str:
    slug = re.sub(r"[^a-z0-9-]+", "-", raw.lower()).strip("-")[:64]
    return slug or "diagram"


def _validate_palette(colors: dict | None) -> dict | None:
    """Category palette overrides: {id: '#rrggbb'} with tight caps."""
    if colors is None:
        return None
    if not isinstance(colors, dict):
        raise HTTPException(400, "categoryColors must be an object")
    if len(colors) > 32:
        raise HTTPException(400, "Too many category colors")
    clean: dict = {}
    for key, value in colors.items():
        if not isinstance(key, str) or not re.fullmatch(r"[a-z0-9-]{1,32}", key):
            raise HTTPException(400, "Invalid category color key")
        if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
            raise HTTPException(400, "Category color must be #rrggbb")
        clean[key] = value
    return clean or None


def _validate_doc(nodes: list, flows: list) -> tuple[list, list]:
    """Length/shape caps mirroring the frontend sanitizeDoc (fail closed)."""
    if not isinstance(nodes, list) or not isinstance(flows, list):
        raise HTTPException(400, "nodes and flows must be arrays")
    if len(nodes) > MAX_NODES or len(flows) > MAX_FLOWS:
        raise HTTPException(400, "Diagram too large")
    clean_nodes = []
    for n in nodes:
        if not isinstance(n, dict):
            raise HTTPException(400, "Invalid node entry")
        for key in ("id", "name", "category", "layer"):
            if not isinstance(n.get(key), str) or not n.get(key):
                raise HTTPException(400, "Node missing id/name/category/layer")
        for key, cap in (("name", 80), ("role", 80), ("desc", 2000), ("notes", 2000)):
            if key in n and n[key] is not None and len(str(n[key])) > cap:
                raise HTTPException(400, f"Node field too long: {key}")
        if "accent" in n and n["accent"] not in (None, ""):
            if not isinstance(n["accent"], str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", n["accent"]):
                raise HTTPException(400, "Node accent must be #rrggbb")
        if "pulse" in n and n["pulse"] not in (None, True, False):
            raise HTTPException(400, "Node pulse must be boolean")
        if not isinstance(n.get("workloads", []), list) or len(n.get("workloads", [])) > 12:
            raise HTTPException(400, "Invalid node workloads")
        if not isinstance(n.get("deps", []), list) or len(n.get("deps", [])) > 24:
            raise HTTPException(400, "Invalid node deps")
        clean_nodes.append(n)
    ids = {n["id"] for n in clean_nodes}
    clean_flows = []
    for f in flows:
        if not isinstance(f, dict):
            raise HTTPException(400, "Invalid flow entry")
        if f.get("from") not in ids or f.get("to") not in ids or f.get("from") == f.get("to"):
            raise HTTPException(400, "Flow references unknown node")
        clean_flows.append(f)
    return clean_nodes, clean_flows


def _row_to_doc(row: dict, include_body: bool = True) -> dict:
    doc = row.get("doc") or {}
    out = {
        "id": row["id"],
        "slug": row["slug"],
        "title": row["title"],
        "updatedAt": row.get("updated_at"),
        "published": bool(row.get("published")),
    }
    if include_body:
        out["nodes"] = doc.get("nodes", [])
        out["flows"] = doc.get("flows", [])
        if isinstance(doc.get("categoryColors"), dict) and doc["categoryColors"]:
            out["categoryColors"] = doc["categoryColors"]
    else:
        nodes = doc.get("nodes", [])
        flows = doc.get("flows", [])
        out["nodeCount"] = len(nodes) if isinstance(nodes, list) else 0
        out["flowCount"] = len(flows) if isinstance(flows, list) else 0
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


@router.get("/diagrams")
def list_diagrams():
    """Public: published diagram metas (newest first)."""
    try:
        res = (
            supabase.table("infra_diagrams")
            .select("id,slug,title,updated_at,published,doc")
            .eq("published", True)
            .order("updated_at", desc=True)
            .limit(100)
            .execute()
        )
    except Exception as exc:
        log.error("infra list failed: %s", exc)
        raise HTTPException(500, "Could not list diagrams")
    return {"diagrams": [_row_to_doc(r, include_body=False) for r in (res.data or [])]}


@router.get("/diagrams/admin/all")
def list_all_diagrams(admin: dict = Depends(require_admin)):
    """Admin: every diagram including drafts."""
    try:
        res = (
            supabase.table("infra_diagrams")
            .select("id,slug,title,updated_at,published,doc")
            .order("updated_at", desc=True)
            .limit(200)
            .execute()
        )
    except Exception as exc:
        log.error("infra admin list failed: %s", exc)
        raise HTTPException(500, "Could not list diagrams")
    return {"diagrams": [_row_to_doc(r, include_body=False) for r in (res.data or [])]}


@router.get("/diagrams/{slug}")
def get_diagram(slug: str, request: Request):
    """Public if published; admins may preview drafts."""
    try:
        res = (
            supabase.table("infra_diagrams")
            .select("id,slug,title,updated_at,published,doc")
            .eq("slug", slug[:64])
            .limit(1)
            .execute()
        )
    except Exception as exc:
        log.error("infra get failed: %s", exc)
        raise HTTPException(500, "Could not load diagram")
    rows = res.data or []
    if not rows:
        raise HTTPException(404, "Diagram not found")
    row = rows[0]
    if not row.get("published") and _optional_admin(request) is None:
        raise HTTPException(404, "Diagram not found")
    return {"diagram": _row_to_doc(row, include_body=True)}


@router.post("/diagrams")
def create_diagram(body: DiagramIn, admin: dict = Depends(require_admin)):
    slug = _slugify(body.slug)
    if slug in RESERVED_SLUGS:
        raise HTTPException(400, "Slug is reserved")
    nodes, flows = _validate_doc(body.nodes, body.flows)
    palette = _validate_palette(body.categoryColors)
    try:
        existing = (
            supabase.table("infra_diagrams").select("id").eq("slug", slug).limit(1).execute()
        )
        if (existing.data or []):
            raise HTTPException(409, "Slug already exists")
        res = (
            supabase.table("infra_diagrams")
            .insert({
                "slug": slug,
                "title": body.title.strip(),
                "published": body.published,
                "doc": {"nodes": nodes, "flows": flows, **({"categoryColors": palette} if palette else {})},
            })
            .execute()
        )
    except HTTPException:
        raise
    except Exception as exc:
        log.error("infra create failed: %s", exc)
        raise HTTPException(500, "Could not create diagram")
    rows = res.data or []
    if not rows:
        raise HTTPException(500, "Could not create diagram")
    return {"diagram": _row_to_doc(rows[0], include_body=True)}


@router.put("/diagrams/{doc_id}")
def update_diagram(doc_id: str, body: DiagramIn, admin: dict = Depends(require_admin)):
    slug = _slugify(body.slug)
    if slug in RESERVED_SLUGS:
        raise HTTPException(400, "Slug is reserved")
    nodes, flows = _validate_doc(body.nodes, body.flows)
    palette = _validate_palette(body.categoryColors)
    try:
        res = (
            supabase.table("infra_diagrams")
            .update({
                "slug": slug,
                "title": body.title.strip(),
                "published": body.published,
                "doc": {"nodes": nodes, "flows": flows, **({"categoryColors": palette} if palette else {})},
            })
            .eq("id", doc_id[:64])
            .execute()
        )
    except Exception as exc:
        log.error("infra update failed: %s", exc)
        raise HTTPException(500, "Could not update diagram")
    rows = res.data or []
    if not rows:
        raise HTTPException(404, "Diagram not found")
    return {"diagram": _row_to_doc(rows[0], include_body=True)}


@router.delete("/diagrams/{doc_id}")
def delete_diagram(doc_id: str, admin: dict = Depends(require_admin)):
    try:
        res = supabase.table("infra_diagrams").delete().eq("id", doc_id[:64]).execute()
    except Exception as exc:
        log.error("infra delete failed: %s", exc)
        raise HTTPException(500, "Could not delete diagram")
    if not (res.data or []):
        raise HTTPException(404, "Diagram not found")
    return {"deleted": True}
