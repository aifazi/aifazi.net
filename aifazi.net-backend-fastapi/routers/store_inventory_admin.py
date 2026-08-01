"""
routers/store_inventory_admin.py - Odoo-style inventory management.
Mounted at /api/store/admin. Permission-gated via store.products.

Endpoints:
  Locations CRUD
  GET  /inventory/stock           - on-hand per product/variant/location
  GET  /inventory/lookup/{code}   - resolve a scanned barcode to product/variant
  POST /inventory/receive         - add qty into a location (receipt)
  POST /inventory/issue           - remove qty from a location (delivery)
  POST /inventory/transfer        - move qty between locations
  POST /inventory/count           - set actual on-hand (cycle count / adjustment)
  GET  /inventory/movements       - ledger filtered by product/location
  PATCH /products/{id}/barcode    - assign a barcode to a product
  PATCH /variants/{id}/barcode    - assign a barcode to a variant
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import supabase
from permissions import require_any_permission
from routers.store_inventory import (
    default_location_id, get_quant, set_quant, change_quant, move_quant,
)
from routers.store_ledger import log_stock_change as _ledger_log

log = logging.getLogger("store.inventory.admin")
router = APIRouter()

CATALOG = require_any_permission("store", "store.products", action="manage")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# Locations ------------------------------------------------------------------
@router.get("/inventory/locations")
async def list_locations(_: dict = Depends(CATALOG)):
    res = supabase.table("store_locations").select("*").order("sort_order").order("name").execute()
    return res.data or []


class LocationBody(BaseModel):
    name: str
    code: str = ""
    parent_id: str | None = None
    is_default: bool = False
    active: bool = True
    sort_order: int = 0


@router.post("/inventory/locations")
async def create_location(body: LocationBody, _: dict = Depends(CATALOG)):
    if not body.name.strip():
        raise HTTPException(400, "Name is required")
    try:
        res = supabase.table("store_locations").insert(body.dict()).execute()
    except Exception as exc:
        raise HTTPException(400, f"Location not created: {exc}")
    return res.data[0] if res.data else {"id": None}


@router.patch("/inventory/locations/{loc_id}")
async def update_location(loc_id: str, body: LocationBody, _: dict = Depends(CATALOG)):
    patch = {**body.dict(), "updated_at": _now()}
    res = supabase.table("store_locations").update(patch).eq("id", loc_id).execute()
    if not res.data:
        raise HTTPException(404, "Location not found")
    return res.data[0]


@router.delete("/inventory/locations/{loc_id}")
async def delete_location(loc_id: str, _: dict = Depends(CATALOG)):
    loc = supabase.table("store_locations").select("is_default").eq("id", loc_id).limit(1).execute()
    if loc.data and loc.data[0].get("is_default"):
        raise HTTPException(400, "Cannot delete the default location")
    res = supabase.table("store_locations").delete().eq("id", loc_id).execute()
    if not res.data:
        raise HTTPException(404, "Location not found")
    return {"ok": True}


# Stock overview ---------------------------------------------------------------
def _product_names(pids: list) -> dict:
    if not pids:
        return {}
    pres = (supabase.table("store_products").select("id,name,sku,barcode")
            .in_("id", list(set(pids))).execute()).data or []
    return {p["id"]: p for p in pres}


def _variant_names(vids: list) -> dict:
    if not vids:
        return {}
    vres = (supabase.table("store_product_variants").select("id,name,sku,barcode")
            .in_("id", list(set(vids))).execute()).data or []
    return {v["id"]: v for v in vres}


@router.get("/inventory/stock")
async def inventory_stock(location_id: str | None = None, product_id: str | None = None,
                          search: str = "", _: dict = Depends(CATALOG)):
    q = supabase.table("store_stock_quant").select("*")
    if location_id:
        q = q.eq("location_id", location_id)
    if product_id:
        q = q.eq("product_id", product_id)
    rows = q.limit(2000).execute().data or []
    if not rows:
        return []
    prods = _product_names([r.get("product_id") for r in rows])
    variants = _variant_names([r.get("variant_id") for r in rows if r.get("variant_id")])
    locs = {}
    lres = (supabase.table("store_locations").select("id,name,code")
            .in_("id", list(set(r.get("location_id") for r in rows if r.get("location_id")))).execute().data or [])
    locs = {l["id"]: l for l in lres}

    out = []
    for r in rows:
        p = prods.get(r.get("product_id")) or {}
        v = variants.get(r.get("variant_id")) or {}
        name = v.get("name") or p.get("name") or "—"
        sku = v.get("sku") or p.get("sku") or ""
        barcode = v.get("barcode") or p.get("barcode") or ""
        if search:
            s = search.lower()
            if s not in name.lower() and s not in sku.lower() and s not in barcode.lower():
                continue
        out.append({
            "id": r.get("id"),
            "product_id": r.get("product_id"),
            "variant_id": r.get("variant_id"),
            "location_id": r.get("location_id"),
            "location_name": (locs.get(r.get("location_id")) or {}).get("name") or "",
            "quantity": int(r.get("quantity") or 0),
            "product_name": name,
            "sku": sku,
            "barcode": barcode,
            "updated_at": r.get("updated_at"),
        })
    return out


@router.get("/inventory/lookup/{code}")
async def lookup_barcode(code: str, _: dict = Depends(CATALOG)):
    """Resolve a scanned barcode (or SKU) to a product or variant."""
    c = code.strip()
    if not c:
        raise HTTPException(400, "Code is required")
    variant = (supabase.table("store_product_variants")
               .select("*,store_products(name,sku,image_url,price_cents)")
               .or_(f"barcode.eq.{c},sku.eq.{c}").limit(1).execute()).data or [{}]
    if variant[0].get("id"):
        v = variant[0]
        prod = (v.get("store_products") or {}) if isinstance(v.get("store_products"), dict) else {}
        loc = default_location_id()
        return {
            "kind": "variant",
            "id": v.get("id"),
            "name": v.get("name"),
            "sku": v.get("sku") or "",
            "barcode": v.get("barcode") or "",
            "price_cents": int(v.get("price_cents") or prod.get("price_cents") or 0),
            "stock": int(v.get("stock_qty") or 0),
            "product_id": v.get("product_id"),
            "product_name": prod.get("name") or "",
            "locations": _location_stock(v.get("product_id"), v.get("id")),
        }
    product = (supabase.table("store_products")
               .or_(f"barcode.eq.{c},sku.eq.{c}").limit(1).execute()).data or [{}]
    if product[0].get("id"):
        p = product[0]
        return {
            "kind": "product",
            "id": p.get("id"),
            "name": p.get("name"),
            "sku": p.get("sku") or "",
            "barcode": p.get("barcode") or "",
            "price_cents": int(p.get("price_cents") or 0),
            "stock": int(p.get("stock_qty") or 0),
            "product_id": p.get("id"),
            "product_name": p.get("name") or "",
            "locations": _location_stock(p.get("id"), None),
        }
    raise HTTPException(404, "No product or variant matches that barcode / SKU")


def _location_stock(product_id: str, variant_id: str | None) -> list:
    rows = (supabase.table("store_stock_quant")
            .select("location_id,quantity").eq("product_id", product_id)
            .execute()).data or []
    locs = {}
    if rows:
        lres = (supabase.table("store_locations").select("id,name,code")
                .in_("id", list(set(r["location_id"] for r in rows))).execute().data or [])
        locs = {l["id"]: l for l in lres}
    if variant_id is None:
        rows = [r for r in rows if not r.get("variant_id")]
    else:
        rows = [r for r in rows if r.get("variant_id") == variant_id]
    return [{
        "location_id": r["location_id"],
        "location_name": (locs.get(r["location_id"]) or {}).get("name") or "",
        "quantity": int(r.get("quantity") or 0),
    } for r in rows]


# Operations ------------------------------------------------------------------
class ReceiveBody(BaseModel):
    product_id: str
    variant_id: str | None = None
    location_id: str | None = None
    quantity: int = 1
    note: str = ""


@router.post("/inventory/receive")
async def receive(body: ReceiveBody, _: dict = Depends(CATALOG)):
    if body.quantity <= 0:
        raise HTTPException(400, "Quantity must be positive")
    loc = body.location_id or default_location_id()
    if not loc:
        raise HTTPException(400, "No default location")
    change_quant(body.product_id, body.variant_id, loc, body.quantity, reason="receipt",
                 actor=_.get("username") or "staff", ref_type="receipt",
                 note=body.note or "Goods receipt")
    return {"ok": True, "location_id": loc, "quantity": body.quantity,
            "new_stock": get_quant(body.product_id, body.variant_id, loc)}


class IssueBody(BaseModel):
    product_id: str
    variant_id: str | None = None
    location_id: str | None = None
    quantity: int = 1
    note: str = ""


@router.post("/inventory/issue")
async def issue(body: IssueBody, _: dict = Depends(CATALOG)):
    if body.quantity <= 0:
        raise HTTPException(400, "Quantity must be positive")
    loc = body.location_id or default_location_id()
    if not loc:
        raise HTTPException(400, "No default location")
    avail = get_quant(body.product_id, body.variant_id, loc)
    if body.quantity > avail:
        raise HTTPException(400, f"Only {avail} available at this location")
    change_quant(body.product_id, body.variant_id, loc, -body.quantity, reason="delivery",
                 actor=_.get("username") or "staff", ref_type="delivery",
                 note=body.note or "Goods issue")
    return {"ok": True, "location_id": loc, "quantity": body.quantity,
            "new_stock": get_quant(body.product_id, body.variant_id, loc)}


class TransferBody(BaseModel):
    product_id: str
    variant_id: str | None = None
    from_location_id: str
    to_location_id: str
    quantity: int = 1
    note: str = ""


@router.post("/inventory/transfer")
async def transfer(body: TransferBody, _: dict = Depends(CATALOG)):
    if body.quantity <= 0:
        raise HTTPException(400, "Quantity must be positive")
    if body.from_location_id == body.to_location_id:
        raise HTTPException(400, "Source and destination are the same")
    moved = move_quant(body.product_id, body.variant_id, body.from_location_id,
                       body.to_location_id, body.quantity,
                       actor=_.get("username") or "staff", ref_type="transfer",
                       note=body.note or "Internal transfer")
    if moved == 0:
        raise HTTPException(400, "Nothing to transfer (no stock at source)")
    return {"ok": True, "moved": moved, "from": body.from_location_id, "to": body.to_location_id}


class CountBody(BaseModel):
    product_id: str
    variant_id: str | None = None
    location_id: str | None = None
    quantity: int = 0
    note: str = ""


@router.post("/inventory/count")
async def cycle_count(body: CountBody, _: dict = Depends(CATALOG)):
    if body.quantity < 0:
        raise HTTPException(400, "Quantity cannot be negative")
    loc = body.location_id or default_location_id()
    if not loc:
        raise HTTPException(400, "No default location")
    before = get_quant(body.product_id, body.variant_id, loc)
    set_quant(body.product_id, body.variant_id, loc, body.quantity)
    _ledger_log(body.product_id, body.quantity - before, reason="count",
                actor=_.get("username") or "staff", ref_type="count",
                variant_id=body.variant_id,
                note=body.note or f"Cycle count ({loc[:8]})")
    return {"ok": True, "before": before, "after": body.quantity}


# Movements / ledger ------------------------------------------------------------
@router.get("/inventory/movements")
async def movements(product_id: str | None = None, location_id: str | None = None,
                    limit: int = 300, _: dict = Depends(CATALOG)):
    q = supabase.table("store_stock_ledger").select("*").order("created_at", desc=True).limit(min(max(limit, 1), 1000))
    if product_id:
        q = q.eq("product_id", product_id)
    rows = q.execute().data or []
    if location_id:
        rows = [r for r in rows if r.get("from_location_id") == location_id or r.get("to_location_id") == location_id]
    pids = list({r.get("product_id") for r in rows if r.get("product_id")})
    prods = _product_names(pids) if pids else {}
    lid = list({x for r in rows for x in (r.get("from_location_id"), r.get("to_location_id")) if x})
    lres = (supabase.table("store_locations").select("id,name")
            .in_("id", lid).execute()).data or [] if lid else []
    locs = {l["id"]: l["name"] for l in lres}
    return [{
        "id": r.get("id"),
        "product_id": r.get("product_id"),
        "variant_id": r.get("variant_id"),
        "product_name": (prods.get(r.get("product_id")) or {}).get("name") or "—",
        "change_qty": int(r.get("change_qty") or 0),
        "reason": r.get("reason"),
        "ref_type": r.get("ref_type"),
        "ref_id": r.get("ref_id"),
        "actor": r.get("actor"),
        "from_location": locs.get(r.get("from_location_id")) or "",
        "to_location": locs.get(r.get("to_location_id")) or "",
        "note": r.get("note"),
        "created_at": r.get("created_at"),
    } for r in rows]


# Barcode assignment ------------------------------------------------------------
class BarcodeBody(BaseModel):
    barcode: str = ""


@router.patch("/products/{prod_id}/barcode")
async def set_product_barcode(prod_id: str, body: BarcodeBody, _: dict = Depends(CATALOG)):
    code = body.barcode.strip()
    if code:
        clash = supabase.table("store_products").select("id").eq("barcode", code).neq("id", prod_id).limit(1).execute()
        if clash.data:
            raise HTTPException(400, "That barcode is already used by another product")
    res = supabase.table("store_products").update({"barcode": code or None, "updated_at": _now()}).eq("id", prod_id).execute()
    if not res.data:
        raise HTTPException(404, "Product not found")
    return {"ok": True, "barcode": code}


@router.patch("/variants/{variant_id}/barcode")
async def set_variant_barcode(variant_id: str, body: BarcodeBody, _: dict = Depends(CATALOG)):
    code = body.barcode.strip()
    if code:
        clash = (supabase.table("store_product_variants").select("id")
                 .eq("barcode", code).neq("id", variant_id).limit(1).execute())
        if clash.data:
            raise HTTPException(400, "That barcode is already used by another variant")
    res = supabase.table("store_product_variants").update({"barcode": code or None, "updated_at": _now()}).eq("id", variant_id).execute()
    if not res.data:
        raise HTTPException(404, "Variant not found")
    return {"ok": True, "barcode": code}
