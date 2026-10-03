"""infra_diagrams.py — CRUD for /hybrid-infra builder diagram documents.

Reads of published docs are public. All writes (and draft reads) require
an admin session (require_admin). The built-in Plan A seed lives in the
frontend (data/hybrid-infra.ts) and is never stored — slug 'plan-a' is
rejected here so nothing can squat it.
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import re
import uuid as uuid_mod
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field, field_validator

from database import supabase
from dependencies import _enrich_user, decode_token, require_admin
from utils import audit

router = APIRouter()
log = logging.getLogger("infra.diagrams")

RESERVED_SLUGS = {
    "plan-a",
    "cloud-infra",
    "multi-site",
    "dr-site",
    "hybrid-join",
}
MAX_NODES = 200
MAX_FLOWS = 200
MAX_DOC_BYTES = 500 * 1024
MAX_REVISIONS = 20
MAX_DECORATIONS = 100
# Frontend theoretical max: 100 decos x (200-char text + 12 x 160-char lines)
# ≈ 215 KB — the cap must never reject what sanitizeDoc can produce.
MAX_DECOR_BYTES = 256 * 1024
# Palette names for annotation colors — mirrors DECOR_TOKENS in hybrid-infra.ts.
DECOR_TOKENS = {"ink", "sub", "muted", "cyan", "green", "purple", "amber", "red", "blue"}


class DiagramIn(BaseModel):
    # Empty slug is allowed: create derives it from the title (the frontend
    # sends '' for seeds whose slug would collide with a builtin).
    slug: str = Field(default="", max_length=64)
    title: str = Field(min_length=1, max_length=120)
    published: bool = False
    nodes: list = Field(default_factory=list, max_length=MAX_NODES)
    flows: list = Field(default_factory=list, max_length=MAX_FLOWS)
    # Editable annotations (boxes/labels) — omit/None when absent.
    decorations: list | None = Field(default=None, max_length=MAX_DECORATIONS)
    categoryColors: dict | None = None
    customCategories: dict | None = None
    # Optimistic concurrency (B8): last-updated stamp the client believes in.
    # On mismatch the PUT 409s instead of clobbering a concurrent save.
    expectedUpdatedAt: str | None = Field(default=None, max_length=64)

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, v: str) -> str:
        # B10: min_length=1 alone accepts " " — the slug then collapses to
        # "diagram" and the second create 409s with a confusing message.
        if not v.strip():
            raise ValueError("title must not be blank")
        return v


BUILTIN_CATEGORIES = {
    "network",
    "compute",
    "storage",
    "identity",
    "security",
    "backup",
    "endpoint",
    "power",
}


def _slugify(raw: str) -> str:
    slug = re.sub(r"[^a-z0-9-]+", "-", raw.lower()).strip("-")[:64]
    return slug or "diagram"


PUBLIC_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300"


def _etag_for(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()
    return '"' + hashlib.sha256(raw).hexdigest()[:32] + '"'


def _cached_response(payload: dict, request: Request, cacheable: bool) -> Response:
    """B13: published reads are stable → ETag + short public cache; drafts no-store.
    If-None-Match matching yields a bodyless 304."""
    etag = _etag_for(payload)
    headers = {
        "ETag": etag,
        "Cache-Control": PUBLIC_CACHE_CONTROL if cacheable else "no-store",
    }
    if etag in (request.headers.get("if-none-match") or ""):
        return Response(status_code=304, headers=headers)
    return JSONResponse(payload, headers=headers)


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


def _validate_custom_categories(custom: dict | None) -> dict | None:
    """Doc-defined categories: {id: {label, color}} with tight caps."""
    if custom is None:
        return None
    if not isinstance(custom, dict):
        raise HTTPException(400, "customCategories must be an object")
    if len(custom) > 16:
        raise HTTPException(400, "Too many custom categories")
    clean: dict = {}
    for key, value in custom.items():
        if not isinstance(key, str) or not re.fullmatch(r"[a-z0-9-]{1,32}", key):
            raise HTTPException(400, "Invalid custom category key")
        if key in BUILTIN_CATEGORIES:
            raise HTTPException(400, "Custom category shadows a built-in id")
        if not isinstance(value, dict):
            raise HTTPException(400, "Invalid custom category entry")
        label = value.get("label")
        color = value.get("color")
        if not isinstance(label, str) or not label.strip() or len(label) > 40:
            raise HTTPException(400, "Custom category label invalid")
        if not isinstance(color, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            raise HTTPException(400, "Custom category color must be #rrggbb")
        clean[key] = {"label": label.strip()[:40], "color": color}
    return clean or None


def _decor_num(v, label: str) -> float | int:
    """Finite-number check (bool is an int subclass — excluded)."""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise HTTPException(400, f"Annotation {label} must be a finite number")
    try:
        finite = math.isfinite(v)
    except OverflowError:
        finite = False
    if not finite:
        raise HTTPException(400, f"Annotation {label} must be a finite number")
    return v


def _decor_color(v, label: str) -> str | None:
    """Palette token name or #rgb/#rrggbb/#rrggbbaa hex (empty → None)."""
    if v is None or v == "":
        return None
    if not isinstance(v, str) or len(v) > 16:
        raise HTTPException(400, f"Annotation {label} must be a color")
    if v in DECOR_TOKENS:
        return v
    # Same vocabulary as the frontend isDecorColor: #rgb/#rgba/#rrggbb/#rrggbbaa.
    if re.fullmatch(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})", v):
        return v
    raise HTTPException(400, f"Annotation {label} must be a palette name or hex color")


def _validate_decorations(decorations: list | None) -> list | None:
    """Editable annotations: whitelist-rebuild each entry (fail closed) with
    caps mirroring the frontend sanitizeDoc (100 decos, 12 lines, 8 connects)."""
    if decorations is None:
        return None
    if not isinstance(decorations, list):
        raise HTTPException(400, "decorations must be an array")
    if len(decorations) > MAX_DECORATIONS:
        raise HTTPException(400, "Too many annotations")
    if not decorations:
        return None
    clean: list = []
    seen: set = set()
    for d in decorations:
        if not isinstance(d, dict):
            raise HTTPException(400, "Invalid annotation entry")
        kind = d.get("kind")
        if kind not in ("box", "label"):
            raise HTTPException(400, "Annotation kind must be box or label")
        did = d.get("id")
        if not isinstance(did, str) or not did or len(did) > 64:
            raise HTTPException(400, "Annotation missing/invalid id")
        if did in seen:
            raise HTTPException(400, "Duplicate annotation id")
        seen.add(did)
        z = d.get("z", "front")
        if z not in ("back", "panel", "front"):
            raise HTTPException(400, "Annotation layer must be back, panel or front")
        out: dict = {"id": did, "kind": kind, "z": z}
        if kind == "box":
            for key in ("x", "y", "w", "h"):
                if d.get(key) is None:
                    raise HTTPException(400, f"Annotation box missing {key}")
            for key in ("x", "y", "w", "h", "r"):
                if d.get(key) is not None:
                    out[key] = _decor_num(d[key], key)
            for key in ("fill", "stroke"):
                c = _decor_color(d.get(key), key)
                if c is not None:
                    out[key] = c
            lines = d.get("lines")
            if lines is not None:
                if not isinstance(lines, list) or len(lines) > 12:
                    raise HTTPException(400, "Invalid annotation lines")
                clean_lines = []
                for line in lines:
                    if not isinstance(line, dict):
                        raise HTTPException(400, "Invalid annotation line")
                    text = line.get("text")
                    if not isinstance(text, str) or len(text) > 160:
                        raise HTTPException(400, "Annotation line text too long")
                    entry: dict = {"text": text}
                    for key in ("dx", "dy", "size"):
                        if line.get(key) is not None:
                            entry[key] = _decor_num(line[key], f"line {key}")
                    lc = _decor_color(line.get("color"), "line color")
                    if lc is not None:
                        entry["color"] = lc
                    lw = line.get("weight")
                    if lw is not None:
                        if not isinstance(lw, str) or not re.fullmatch(r"[1-9]00", lw):
                            raise HTTPException(400, "Annotation line weight invalid")
                        entry["weight"] = lw
                    clean_lines.append(entry)
                out["lines"] = clean_lines
            connects = d.get("connects")
            if connects is not None:
                if not isinstance(connects, list) or len(connects) > 8:
                    raise HTTPException(400, "Invalid annotation connects")
                if any(not isinstance(c, str) or not c or len(c) > 64 for c in connects):
                    raise HTTPException(400, "Annotation connect must be a node id")
                out["connects"] = connects
        else:
            text = d.get("text")
            if not isinstance(text, str) or not text or len(text) > 200:
                raise HTTPException(400, "Annotation text missing/too long")
            out["text"] = text
            # Free labels need absolute coordinates; anchored ones get them
            # from the anchor node instead (mirrors the frontend sanitizeDoc).
            if not isinstance(d.get("anchor"), dict) and (d.get("x") is None or d.get("y") is None):
                raise HTTPException(400, "Annotation label missing x/y")
            for key in ("x", "y", "w", "h", "size"):
                if d.get(key) is not None:
                    out[key] = _decor_num(d[key], key)
            weight = d.get("weight", "500")
            if not isinstance(weight, str) or not re.fullmatch(r"[1-9]00", weight):
                raise HTTPException(400, "Annotation weight invalid")
            out["weight"] = weight
            align = d.get("align", "left")
            if align not in ("left", "center"):
                raise HTTPException(400, "Annotation align invalid")
            out["align"] = align
            c = _decor_color(d.get("color"), "color")
            if c is not None:
                out["color"] = c
            anchor = d.get("anchor")
            if anchor is not None:
                if not isinstance(anchor, dict):
                    raise HTTPException(400, "Invalid annotation anchor")
                aid = anchor.get("id")
                if not isinstance(aid, str) or not aid or len(aid) > 64:
                    raise HTTPException(400, "Annotation anchor must reference a node id")
                out["anchor"] = {
                    "id": aid,
                    "dx": _decor_num(anchor.get("dx", 0), "anchor dx"),
                    "dy": _decor_num(anchor.get("dy", 0), "anchor dy"),
                }
        clean.append(out)
    try:
        if len(json.dumps(clean, allow_nan=False).encode()) > MAX_DECOR_BYTES:
            raise HTTPException(400, "Annotations too large")
    except (TypeError, ValueError):
        raise HTTPException(400, "Annotations not serializable")
    return clean


def _validate_doc(nodes: list, flows: list) -> tuple[list, list]:
    """Length/shape caps mirroring the frontend sanitizeDoc (fail closed)."""
    if not isinstance(nodes, list) or not isinstance(flows, list):
        raise HTTPException(400, "nodes and flows must be arrays")
    if len(nodes) > MAX_NODES or len(flows) > MAX_FLOWS:
        raise HTTPException(400, "Diagram too large")
    if not nodes:
        raise HTTPException(400, "Diagram has no nodes")
    try:
        # allow_nan=False: NaN/Infinity tokens parse on the way in but are
        # rejected by PostgREST later (→ 500); fail them here as a 400 (B4).
        if len(json.dumps({"nodes": nodes, "flows": flows}, allow_nan=False).encode()) > MAX_DOC_BYTES:
            raise HTTPException(400, "Diagram body too large")
    except (TypeError, ValueError):
        raise HTTPException(400, "Diagram body not serializable")
    clean_nodes = []
    for n in nodes:
        if not isinstance(n, dict):
            raise HTTPException(400, "Invalid node entry")
        for key, cap in (("id", 64), ("category", 32), ("layer", 32)):
            if not isinstance(n.get(key), str) or not n.get(key) or len(n[key]) > cap:
                raise HTTPException(400, f"Node missing/invalid: {key}")
        if not isinstance(n.get("name"), str) or not n.get("name"):
            raise HTTPException(400, "Node missing id/name/category/layer")
        for key in ("x", "y", "w", "h", "rackU", "rackH"):
            if key in n and n[key] is not None:
                v = n[key]
                # bool is an int subclass — exclude it explicitly.
                if isinstance(v, bool) or not isinstance(v, (int, float)):
                    raise HTTPException(400, f"Node {key} must be a finite number")
                try:
                    finite = math.isfinite(v)
                except OverflowError:
                    # Huge JSON ints (1e999…) can't convert to float.
                    finite = False
                if not finite:
                    raise HTTPException(400, f"Node {key} must be a finite number")
        for key, cap in (("name", 80), ("role", 80), ("desc", 2000), ("notes", 2000)):
            if key in n and n[key] is not None and len(str(n[key])) > cap:
                raise HTTPException(400, f"Node field too long: {key}")
        if "accent" in n and n["accent"] not in (None, ""):
            if not isinstance(n["accent"], str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", n["accent"]):
                raise HTTPException(400, "Node accent must be #rrggbb")
        if "pulse" in n and n["pulse"] not in (None, True, False):
            raise HTTPException(400, "Node pulse must be boolean")
        if n.get("gid") is not None:
            if not isinstance(n["gid"], str) or not n["gid"] or len(n["gid"]) > 40:
                raise HTTPException(400, "Node gid must be a short string")
        workloads = n.get("workloads", [])
        if not isinstance(workloads, list) or len(workloads) > 12:
            raise HTTPException(400, "Invalid node workloads")
        # A5-9: the frontend sanitizeDoc silently drops non-string entries and
        # truncates each to 60 chars on next load — reject them here instead of
        # storing data that would be lost on the round-trip.
        for w in workloads:
            if not isinstance(w, str) or not w or len(w) > 60:
                raise HTTPException(400, "Node workloads must be non-empty strings (<=60)")
        deps = n.get("deps", [])
        if not isinstance(deps, list) or len(deps) > 24:
            raise HTTPException(400, "Invalid node deps")
        # A5-9: deps must be strings — sanitizeDoc drops anything else on load.
        # No length cap: sanitizeDoc keeps any string, so long legacy refs
        # (e.g. from JSON import) must not fail to save.
        for d in deps:
            if not isinstance(d, str) or not d:
                raise HTTPException(400, "Node deps must be non-empty strings")
        clean_nodes.append(n)
    ids = {n["id"] for n in clean_nodes}
    if len(ids) != len(clean_nodes):
        raise HTTPException(400, "Duplicate node id")
    clean_flows = []
    for f in flows:
        if not isinstance(f, dict):
            raise HTTPException(400, "Invalid flow entry")
        # Type-check before set membership: an unhashable endpoint (list/
        # dict) would raise TypeError → 500 instead of 400 (B3).
        if not isinstance(f.get("from"), str) or not isinstance(f.get("to"), str):
            raise HTTPException(400, "Flow endpoints must be node ids")
        if f.get("from") not in ids or f.get("to") not in ids or f.get("from") == f.get("to"):
            raise HTTPException(400, "Flow references unknown node")
        if f.get("label") not in (None, ""):
            if not isinstance(f["label"], str) or len(f["label"]) > 40:
                raise HTTPException(400, "Flow label too long")
        if f.get("color") not in (None, ""):
            if not isinstance(f["color"], str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", f["color"]):
                raise HTTPException(400, "Flow color must be #rrggbb")
        if "dashed" in f and f["dashed"] not in (None, True, False):
            raise HTTPException(400, "Flow dashed must be boolean")
        clean_flows.append(f)
    return clean_nodes, clean_flows


def _require_uuid(value: str) -> None:
    """404 (not a 500 from PostgREST) when a path id isn't a uuid (B2)."""
    try:
        uuid_mod.UUID(value)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(404, "Diagram not found")


def _client_ip(request: Request) -> str:
    try:
        return (request.client.host if request.client else "") or ""
    except Exception:
        return ""


def _audit(request: Request, admin: dict | None, action: str, target: str,
           details: dict | None = None) -> None:
    """Attribute diagram writes to the acting admin (B9). audit.record never raises."""
    actor = "admin"
    if isinstance(admin, dict):
        actor = admin.get("username") or admin.get("id") or "admin"
    audit.record(actor, action, target, details or {}, _client_ip(request))


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
        if isinstance(doc.get("decorations"), list) and doc["decorations"]:
            out["decorations"] = doc["decorations"]
        if isinstance(doc.get("categoryColors"), dict) and doc["categoryColors"]:
            out["categoryColors"] = doc["categoryColors"]
        if isinstance(doc.get("customCategories"), dict) and doc["customCategories"]:
            out["customCategories"] = doc["customCategories"]
    else:
        # Prefer the stored counts (B1: list queries no longer select `doc`);
        # fall back to the body for legacy rows/tests that only carry `doc`.
        nodes = doc.get("nodes", [])
        flows = doc.get("flows", [])
        nc = row.get("node_count")
        fc = row.get("flow_count")
        out["nodeCount"] = nc if isinstance(nc, int) else (len(nodes) if isinstance(nodes, list) else 0)
        out["flowCount"] = fc if isinstance(fc, int) else (len(flows) if isinstance(flows, list) else 0)
    return out


def _optional_admin(request: Request) -> dict | None:
    """Best-effort admin check for draft preview (never raises).

    Goes through `_enrich_user` so the role comes from the user directory
    (fresh within the 60s cache) — previously the raw JWT role claim was
    trusted, letting a demoted admin preview drafts for up to the token
    lifetime (~24h).
    """
    token = ""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:].strip()
    elif request.cookies.get("auth_token"):
        token = request.cookies.get("auth_token") or ""
    if not token:
        return None
    try:
        return require_admin(_enrich_user(decode_token(token)))
    except Exception:
        return None


def _prune_revisions(diagram_id: str) -> None:
    # N8: tiebreak on id so equal created_at stamps (microsecond ties) still
    # prune deterministically under concurrency.
    res = supabase.table("infra_diagram_revisions").select("id").eq(
        "diagram_id", diagram_id
    ).order("created_at", desc=True).order("id", desc=True).range(
        MAX_REVISIONS, MAX_REVISIONS + 199
    ).execute()
    stale = [r["id"] for r in (res.data or [])]
    if stale:
        supabase.table("infra_diagram_revisions").delete().in_("id", stale).execute()


def _snapshot_revision(row: dict) -> bool:
    """Persist the PRE-update state so the save is rollback-able.

    Best-effort: a revision failure must never fail the save itself. Returns
    False when the snapshot failed so callers can surface it (N7).
    """
    try:
        supabase.table("infra_diagram_revisions").insert({
            "diagram_id": row["id"],
            "title": row.get("title") or "",
            "published": bool(row.get("published")),
            "doc": row.get("doc") or {"nodes": [], "flows": []},
        }).execute()
        _prune_revisions(str(row["id"]))
        return True
    except Exception as e:
        log.warning("diagram revision snapshot failed for %s: %s", row.get("id"), e)
        return False


@router.get("/diagrams")
def list_diagrams(request: Request, offset: int = Query(0, ge=0, le=10000)):
    """Public: published diagram metas (newest first, 100 per page)."""
    try:
        res = (
            supabase.table("infra_diagrams")
            # B1: meta-only select — counts are stored columns, never the body.
            .select("id,slug,title,updated_at,published,node_count,flow_count")
            .eq("published", True)
            .order("updated_at", desc=True)
            .range(offset, offset + 99)
            .execute()
        )
    except Exception as exc:
        log.error("infra list failed: %s", exc)
        raise HTTPException(500, "Could not list diagrams")
    payload = {"diagrams": [_row_to_doc(r, include_body=False) for r in (res.data or [])], "offset": offset}
    return _cached_response(payload, request, cacheable=True)


@router.get("/diagrams/admin/all")
def list_all_diagrams(offset: int = Query(0, ge=0, le=10000), admin: dict = Depends(require_admin)):
    """Admin: every diagram including drafts (200 per page)."""
    try:
        res = (
            supabase.table("infra_diagrams")
            .select("id,slug,title,updated_at,published,node_count,flow_count")
            .order("updated_at", desc=True)
            .range(offset, offset + 199)
            .execute()
        )
    except Exception as exc:
        log.error("infra admin list failed: %s", exc)
        raise HTTPException(500, "Could not list diagrams")
    return {"diagrams": [_row_to_doc(r, include_body=False) for r in (res.data or [])], "offset": offset}


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
    return _cached_response(
        {"diagram": _row_to_doc(row, include_body=True)},
        request,
        cacheable=bool(row.get("published")),
    )


@router.post("/diagrams")
def create_diagram(body: DiagramIn, request: Request, admin: dict = Depends(require_admin)):
    slug = _slugify(body.slug or body.title)
    if slug in RESERVED_SLUGS:
        raise HTTPException(400, "Slug is reserved")
    nodes, flows = _validate_doc(body.nodes, body.flows)
    decorations = _validate_decorations(body.decorations)
    palette = _validate_palette(body.categoryColors)
    custom = _validate_custom_categories(body.customCategories)
    now = datetime.now(timezone.utc).isoformat()
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
                "created_at": now,
                "updated_at": now,
                # B1: counts live as columns so list queries never fetch `doc`.
                "node_count": len(nodes),
                "flow_count": len(flows),
                "doc": {
                    "nodes": nodes,
                    "flows": flows,
                    **({"decorations": decorations} if decorations else {}),
                    **({"categoryColors": palette} if palette else {}),
                    **({"customCategories": custom} if custom else {}),
                },
            })
            .execute()
        )
    except HTTPException:
        raise
    except APIError as exc:
        # TOCTOU: a concurrent create can win the unique index race. B14:
        # classify by the Postgres SQLSTATE, not message substrings.
        if exc.code == "23505":
            raise HTTPException(409, "Slug already exists")
        log.error("infra create failed: %s", exc)
        raise HTTPException(500, "Could not create diagram")
    except Exception as exc:
        log.error("infra create failed: %s", exc)
        raise HTTPException(500, "Could not create diagram")
    rows = res.data or []
    if not rows:
        raise HTTPException(500, "Could not create diagram")
    _audit(request, admin, "infra.create", slug, {"published": body.published})
    return {"diagram": _row_to_doc(rows[0], include_body=True)}


@router.put("/diagrams/{doc_id}")
def update_diagram(doc_id: str, body: DiagramIn, request: Request, admin: dict = Depends(require_admin)):
    """Replace a diagram (full-document PUT).

    Concurrency: the UPDATE is conditional on the updated_at we just read
    (B8/N5) — a concurrent writer gets a 409 instead of a silent clobber,
    and the loser never snapshots the same pre-state. The snapshot runs
    AFTER the claim succeeds and reports failure via `snapshotFailed` (N7).
    """
    _require_uuid(doc_id)
    slug = _slugify(body.slug or body.title)
    if slug in RESERVED_SLUGS:
        raise HTTPException(400, "Slug is reserved")
    nodes, flows = _validate_doc(body.nodes, body.flows)
    decorations = _validate_decorations(body.decorations)
    palette = _validate_palette(body.categoryColors)
    custom = _validate_custom_categories(body.customCategories)
    prev = supabase.table("infra_diagrams").select("*").eq("id", doc_id[:64]).limit(1).execute()
    old = (prev.data or [None])[0]
    if not old:
        raise HTTPException(404, "Diagram not found")
    # Legacy rows may lack a stamp — then there is nothing to gate against.
    if (body.expectedUpdatedAt is not None and old.get("updated_at")
            and body.expectedUpdatedAt != old["updated_at"]):
        raise HTTPException(409, "Diagram was modified by someone else — reload and retry")
    try:
        query = (
            supabase.table("infra_diagrams")
            .update({
                "slug": slug,
                "title": body.title.strip(),
                "published": body.published,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "node_count": len(nodes),
                "flow_count": len(flows),
                "doc": {
                    "nodes": nodes,
                    "flows": flows,
                    **({"decorations": decorations} if decorations else {}),
                    **({"categoryColors": palette} if palette else {}),
                    **({"customCategories": custom} if custom else {}),
                },
            })
            .eq("id", doc_id[:64])
        )
        if old.get("updated_at"):
            query = query.eq("updated_at", old["updated_at"])
        res = query.execute()
    except APIError as exc:
        # B14: SQLSTATE match — a concurrent rename can win the unique race.
        if exc.code == "23505":
            raise HTTPException(409, "Slug already exists")
        log.error("infra update failed: %s", exc)
        raise HTTPException(500, "Could not update diagram")
    except Exception as exc:
        log.error("infra update failed: %s", exc)
        raise HTTPException(500, "Could not update diagram")
    rows = res.data or []
    if not rows:
        # Conditional filter missed: either the row is gone (404) or it moved
        # on since our read (409 conflict — another writer won the race).
        cur = (
            supabase.table("infra_diagrams").select("id").eq("id", doc_id[:64]).limit(1).execute()
        )
        if not (cur.data or []):
            raise HTTPException(404, "Diagram not found")
        raise HTTPException(409, "Diagram was modified by someone else — reload and retry")
    snap_ok = _snapshot_revision(old)
    if bool(old.get("published")) != body.published:
        action = "infra.publish" if body.published else "infra.unpublish"
    else:
        action = "infra.update"
    _audit(request, admin, action, slug, {
        "title": body.title.strip(),
        "published": body.published,
    })
    return {
        "diagram": _row_to_doc(rows[0], include_body=True),
        **({} if snap_ok else {"snapshotFailed": True}),
    }


@router.delete("/diagrams/{doc_id}")
def delete_diagram(doc_id: str, request: Request, admin: dict = Depends(require_admin)):
    _require_uuid(doc_id)
    try:
        res = supabase.table("infra_diagrams").delete().eq("id", doc_id[:64]).execute()
    except Exception as exc:
        log.error("infra delete failed: %s", exc)
        raise HTTPException(500, "Could not delete diagram")
    if not (res.data or []):
        raise HTTPException(404, "Diagram not found")
    _audit(request, admin, "infra.delete", doc_id[:64])
    return {"deleted": True}


@router.get("/diagrams/{doc_id}/revisions")
def list_revisions(doc_id: str, offset: int = Query(0, ge=0, le=10000),
                   admin: dict = Depends(require_admin)):
    """Admin: revision history (metas only, newest first, 50 per page)."""
    _require_uuid(doc_id)
    res = supabase.table("infra_diagram_revisions").select(
        "id,created_at,title,published"
    ).eq("diagram_id", doc_id[:64]).order("created_at", desc=True).range(
        offset, offset + 49
    ).execute()
    out = [{
        "id": r["id"],
        "createdAt": r.get("created_at"),
        "title": r.get("title") or "",
        "published": bool(r.get("published")),
    } for r in (res.data or [])]
    return {"revisions": out, "offset": offset}


@router.get("/diagrams/{doc_id}/revisions/{revision_id}")
def get_revision(doc_id: str, revision_id: str, admin: dict = Depends(require_admin)):
    """Admin: one full revision (doc body) for inspection before restore."""
    _require_uuid(doc_id)
    _require_uuid(revision_id)
    res = supabase.table("infra_diagram_revisions").select("*").eq(
        "diagram_id", doc_id[:64]
    ).eq("id", revision_id[:64]).limit(1).execute()
    row = (res.data or [None])[0]
    if not row:
        raise HTTPException(404, "Revision not found")
    doc = row.get("doc") or {}
    return {"revision": {
        "id": row["id"],
        "createdAt": row.get("created_at"),
        "title": row.get("title") or "",
        "published": bool(row.get("published")),
        "nodes": doc.get("nodes", []),
        "flows": doc.get("flows", []),
        "decorations": doc.get("decorations") or None,
        "categoryColors": doc.get("categoryColors") or None,
        "customCategories": doc.get("customCategories") or None,
    }}


@router.post("/diagrams/{doc_id}/revisions/{revision_id}/restore")
def restore_revision(doc_id: str, revision_id: str, request: Request,
                     admin: dict = Depends(require_admin)):
    """Admin: roll the diagram back to a revision.

    The current state is snapshotted first (so a restore is itself
    undoable). The slug is intentionally NOT restored — it belongs to the
    live row and an old slug may now belong to a different diagram (409).
    """
    _require_uuid(doc_id)
    _require_uuid(revision_id)
    prev = supabase.table("infra_diagrams").select("*").eq("id", doc_id[:64]).limit(1).execute()
    old = (prev.data or [None])[0]
    if not old:
        raise HTTPException(404, "Diagram not found")
    res = supabase.table("infra_diagram_revisions").select("*").eq(
        "diagram_id", doc_id[:64]
    ).eq("id", revision_id[:64]).limit(1).execute()
    rev = (res.data or [None])[0]
    if not rev:
        raise HTTPException(404, "Revision not found")
    doc = rev.get("doc") or {}
    nodes, flows = _validate_doc(doc.get("nodes") or [], doc.get("flows") or [])
    # Re-validate palette/categories: restore is the one path that bypasses
    # the create/update validators (B5). 400 on anything the editors would
    # refuse (non-hex colors, built-in shadowing, oversized labels).
    palette = _validate_palette(doc.get("categoryColors"))
    custom = _validate_custom_categories(doc.get("customCategories"))
    decorations = _validate_decorations(doc.get("decorations"))
    try:
        query = (
            supabase.table("infra_diagrams")
            .update({
                "title": (rev.get("title") or old.get("title") or "Untitled diagram").strip()[:120],
                "published": bool(rev.get("published")),
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "node_count": len(nodes),
                "flow_count": len(flows),
                "doc": {
                    "nodes": nodes,
                    "flows": flows,
                    **({"decorations": decorations} if decorations else {}),
                    **({"categoryColors": palette} if palette else {}),
                    **({"customCategories": custom} if custom else {}),
                },
            })
            .eq("id", doc_id[:64])
        )
        if old.get("updated_at"):
            query = query.eq("updated_at", old["updated_at"])
        updated = query.execute()
    except Exception as exc:
        log.error("infra restore failed: %s", exc)
        raise HTTPException(500, "Could not restore revision")
    rows = updated.data or []
    if not rows:
        # Conditional filter missed: vanished (404) or a concurrent write
        # landed first (409) — see update_diagram.
        cur = (
            supabase.table("infra_diagrams").select("id").eq("id", doc_id[:64]).limit(1).execute()
        )
        if not (cur.data or []):
            raise HTTPException(404, "Diagram not found")
        raise HTTPException(409, "Diagram was modified by someone else — reload and retry")
    snap_ok = _snapshot_revision(old)
    _audit(request, admin, "infra.restore", old.get("slug") or doc_id[:64], {
        "revision_id": revision_id[:64],
        "published": bool(rev.get("published")),
    })
    return {
        "diagram": _row_to_doc(rows[0], include_body=True),
        **({} if snap_ok else {"snapshotFailed": True}),
    }
