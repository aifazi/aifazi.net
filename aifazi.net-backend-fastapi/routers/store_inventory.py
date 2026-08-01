"""routers/store_inventory.py - Shared inventory helpers (Odoo-style).

Locations + per-location quants are the source of truth. The aggregate
store_products.stock_qty / store_product_variants.stock_qty columns are kept
in sync from the quant rows so the existing checkout/validation code keeps
working unchanged. Every change writes a row into store_stock_ledger.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from database import supabase
from routers.store_ledger import log_stock_change

log = logging.getLogger("store.inventory")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def default_location_id() -> str | None:
    """Return the default location id (creates 'Main Store' on first use)."""
    try:
        res = supabase.table("store_locations").select("id").eq("is_default", True).limit(1).execute()
        if res.data:
            return res.data[0]["id"]
        ins = supabase.table("store_locations").insert(
            {"name": "Main Store", "code": "MAIN", "is_default": True}).execute()
        return (ins.data or [{}])[0].get("id")
    except Exception as exc:
        log.warning("default_location_id failed: %s", exc)
        return None


def get_quant(product_id: str | None, variant_id: str | None, location_id: str) -> int:
    if not product_id or not location_id:
        return 0
    try:
        q = supabase.table("store_stock_quant").select("quantity")
        if variant_id:
            q = q.eq("variant_id", variant_id)
        else:
            q = q.is_("variant_id", "null")
        res = q.eq("product_id", product_id).eq("location_id", location_id).limit(1).execute()
        return int((res.data[0] or {}).get("quantity") or 0) if res.data else 0
    except Exception as exc:
        log.warning("get_quant failed: %s", exc)
        return 0


def set_quant(product_id: str | None, variant_id: str | None, location_id: str, quantity: int) -> None:
    """Set the absolute on-hand at a location. Fail-soft."""
    if not product_id or not location_id or quantity < 0:
        return
    try:
        row = {
            "product_id": product_id,
            "variant_id": variant_id,
            "location_id": location_id,
            "quantity": quantity,
            "updated_at": _now(),
        }
        supabase.table("store_stock_quant").upsert(row, on_conflict="product_id,variant_id,location_id").execute()
        if variant_id:
            _sync_variant_total(variant_id)
        else:
            _sync_product_total(product_id)
    except Exception as exc:
        log.warning("set_quant failed: %s", exc)


def change_quant(product_id: str | None, variant_id: str | None, location_id: str, delta: int,
                 reason: str = "adjustment", actor: str = "system",
                 ref_type: str | None = None, ref_id: str | None = None, note: str = "") -> None:
    """Add delta to on-hand at a location. delta < 0 clamps at 0. Writes ledger."""
    if not product_id or not location_id or delta == 0:
        return
    cur = get_quant(product_id, variant_id, location_id)
    new = max(0, cur + delta)
    set_quant(product_id, variant_id, location_id, new)
    log_stock_change(product_id, delta, reason=reason, actor=actor, ref_type=ref_type,
                     ref_id=ref_id, variant_id=variant_id, note=note)


def move_quant(product_id: str | None, variant_id: str | None, from_location_id: str,
               to_location_id: str, quantity: int, actor: str = "system",
               ref_type: str | None = None, ref_id: str | None = None, note: str = "") -> int:
    """Transfer quantity between locations. Returns the actual moved qty."""
    if not product_id or not from_location_id or not to_location_id or quantity <= 0:
        return 0
    if from_location_id == to_location_id:
        return 0
    avail = get_quant(product_id, variant_id, from_location_id)
    qty = min(quantity, avail)
    if qty <= 0:
        return 0
    change_quant(product_id, variant_id, from_location_id, -qty, reason="transfer_out",
                 actor=actor, ref_type=ref_type, ref_id=ref_id,
                 note=f"{note} → {to_location_id}".strip())
    change_quant(product_id, variant_id, to_location_id, qty, reason="transfer_in",
                 actor=actor, ref_type=ref_type, ref_id=ref_id,
                 note=f"{note} ← {from_location_id}".strip())
    return qty


def _sync_product_total(product_id: str) -> None:
    """Recompute store_products.stock_qty = sum of product-level quants."""
    try:
        rows = (supabase.table("store_stock_quant")
                .select("quantity").eq("product_id", product_id).is_("variant_id", "null").execute()).data or []
        total = sum(int(r.get("quantity") or 0) for r in rows)
        supabase.table("store_products").update({"stock_qty": total, "updated_at": _now()}).eq("id", product_id).execute()
    except Exception as exc:
        log.warning("_sync_product_total failed: %s", exc)


def _sync_variant_total(variant_id: str) -> None:
    try:
        rows = (supabase.table("store_stock_quant")
                .select("quantity").eq("variant_id", variant_id).execute()).data or []
        total = sum(int(r.get("quantity") or 0) for r in rows)
        supabase.table("store_product_variants").update({"stock_qty": total, "updated_at": _now()}).eq("id", variant_id).execute()
    except Exception as exc:
        log.warning("_sync_variant_total failed: %s", exc)


def consume_stock(product_id: str | None, variant_id: str | None, quantity: int,
                  actor: str = "webhook", ref_type: str = "order", ref_id: str | None = None,
                  note: str = "") -> None:
    """Decrement aggregate stock (used by sales). Prefers the default location."""
    if not product_id or quantity <= 0:
        return
    loc = default_location_id()
    if not loc:
        return
    change_quant(product_id, variant_id, loc, -quantity, reason="sale", actor=actor,
                 ref_type=ref_type, ref_id=ref_id, note=note or "Sale")


def restock(product_id: str | None, variant_id: str | None, quantity: int,
            actor: str = "system", ref_type: str = "order", ref_id: str | None = None,
            note: str = "") -> None:
    """Increment aggregate stock (used by refunds/restocks)."""
    if not product_id or quantity <= 0:
        return
    loc = default_location_id()
    if not loc:
        return
    change_quant(product_id, variant_id, loc, quantity, reason="refund", actor=actor,
                 ref_type=ref_type, ref_id=ref_id, note=note or "Restock")
