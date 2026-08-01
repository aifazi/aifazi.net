"""
routers/store_catalog_admin.py - Product catalog modules (variants, stock
ledger, low-stock). Mounted at /api/store/admin. Permission-gated per module:
store.products covers catalog + inventory work.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import supabase
from permissions import require_any_permission
from routers.store_ledger import log_stock_change

log = logging.getLogger("store.catalog")
router = APIRouter()

PRODUCTS = require_any_permission("store", "store.products", action="manage")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _variant_payload(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "product_id": row.get("product_id"),
        "name": row.get("name"),
        "sku": row.get("sku") or "",
        "price_cents": int(row.get("price_cents") or 0),
        "price": (row.get("price_cents") or 0) / 100,
        "stock_qty": int(row.get("stock_qty") or 0),
        "track_inventory": bool(row.get("track_inventory", True)),
        "attributes": row.get("attributes") or {},
        "image_url": row.get("image_url") or "",
        "active": bool(row.get("active", True)),
        "sort_order": int(row.get("sort_order") or 0),
        "created_at": row.get("created_at"),
    }


# Variants ------------------------------------------------------------------
@router.get("/variants")
async def list_variants(product_id: str | None = None, _: dict = Depends(PRODUCTS)):
    q = supabase.table("store_product_variants").select("*").order("sort_order")
    if product_id:
        q = q.eq("product_id", product_id)
    return [_variant_payload(v) for v in (q.execute().data or [])]


class VariantBody(BaseModel):
    product_id: str
    name: str
    sku: str = ""
    price_cents: int = 0
    stock_qty: int = 0
    track_inventory: bool = True
    attributes: dict = {}
    image_url: str = ""
    active: bool = True
    sort_order: int = 0


@router.post("/variants")
async def create_variant(body: VariantBody, _: dict = Depends(PRODUCTS)):
    try:
        res = supabase.table("store_product_variants").insert(body.dict()).execute()
    except Exception as exc:
        raise HTTPException(400, f"Variant not created: {exc}")
    v = res.data[0] if res.data else {"id": None}
    return _variant_payload(v) if res.data else v


@router.patch("/variants/{variant_id}")
async def update_variant(variant_id: str, body: VariantBody, _: dict = Depends(PRODUCTS)):
    patch = {**body.dict(), "updated_at": _now()}
    old = supabase.table("store_product_variants").select("stock_qty,active").eq("id", variant_id).limit(1).execute()
    res = supabase.table("store_product_variants").update(patch).eq("id", variant_id).execute()
    if not res.data:
        raise HTTPException(404, "Variant not found")
    if old.data:
        old_qty = int((old.data[0] or {}).get("stock_qty") or 0)
        new_qty = int(body.stock_qty)
        if new_qty != old_qty:
            log_stock_change(None, new_qty - old_qty, reason="adjustment",
                             ref_type="variant", ref_id=variant_id,
                             variant_id=variant_id, note="Manual variant stock set")
    return _variant_payload(res.data[0])


class VariantStockPatchBody(BaseModel):
    stock_qty: int
    low_stock_threshold: int | None = None


@router.patch("/variants/{variant_id}/stock")
async def adjust_variant_stock(variant_id: str, body: VariantStockPatchBody, _: dict = Depends(PRODUCTS)):
    if body.stock_qty < 0:
        raise HTTPException(400, "Stock cannot be negative")
    old = supabase.table("store_product_variants").select("stock_qty").eq("id", variant_id).limit(1).execute()
    if not old.data:
        raise HTTPException(404, "Variant not found")
    old_qty = int((old.data[0] or {}).get("stock_qty") or 0)
    res = supabase.table("store_product_variants").update(
        {"stock_qty": body.stock_qty, "updated_at": _now()}).eq("id", variant_id).execute()
    log_stock_change(None, body.stock_qty - old_qty, reason="adjustment",
                     ref_type="variant", ref_id=variant_id,
                     variant_id=variant_id, note="Manual variant stock adjustment")
    return _variant_payload(res.data[0])


@router.delete("/variants/{variant_id}")
async def delete_variant(variant_id: str, _: dict = Depends(PRODUCTS)):
    res = supabase.table("store_product_variants").delete().eq("id", variant_id).execute()
    if not res.data:
        raise HTTPException(404, "Variant not found")
    return {"ok": True}


# Stock ledger --------------------------------------------------------------
@router.get("/stock-ledger")
async def stock_ledger(product_id: str | None = None, limit: int = 300, _: dict = Depends(PRODUCTS)):
    q = supabase.table("store_stock_ledger").select("*").order("created_at", desc=True).limit(min(max(limit, 1), 1000))
    if product_id:
        q = q.eq("product_id", product_id)
    rows = q.execute().data or []
    # Resolve product names for display
    ids = sorted({r.get("product_id") for r in rows if r.get("product_id")})
    names: dict[str, str] = {}
    if ids:
        pres = supabase.table("store_products").select("id,name").in_("id", ids).execute().data or []
        names = {p["id"]: p.get("name", "") for p in pres}
    out = []
    for r in rows:
        out.append({
            "id": r.get("id"),
            "product_id": r.get("product_id"),
            "variant_id": r.get("variant_id"),
            "product_name": names.get(r.get("product_id")) or "",
            "change_qty": int(r.get("change_qty") or 0),
            "reason": r.get("reason"),
            "ref_type": r.get("ref_type"),
            "ref_id": r.get("ref_id"),
            "actor": r.get("actor"),
            "note": r.get("note"),
            "created_at": r.get("created_at"),
        })
    return out


@router.get("/low-stock")
async def low_stock(_: dict = Depends(PRODUCTS)):
    prods = supabase.table("store_products").select("id,name,sku,stock_qty,low_stock_threshold,track_inventory").execute().data or []
    low = []
    for p in prods:
        if p.get("track_inventory", True) and int(p.get("stock_qty") or 0) <= int(p.get("low_stock_threshold") or 0):
            low.append({**p, "kind": "product"})
    variants = supabase.table("store_product_variants").select("id,product_id,name,sku,stock_qty,track_inventory").execute().data or []
    for v in variants:
        if v.get("track_inventory", True) and int(v.get("stock_qty") or 0) <= 5:
            low.append({**v, "kind": "variant", "low_stock_threshold": 5})
    return sorted(low, key=lambda x: int(x.get("stock_qty") or 0))
