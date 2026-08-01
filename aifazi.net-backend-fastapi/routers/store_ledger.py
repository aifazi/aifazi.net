"""routers/store_ledger.py - Shared stock-movement audit trail.

Every inventory change across the store (manual adjustments, sales, refunds,
restocks) records a row in store_stock_ledger so admins can trace how stock
levels reached their current value.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from database import supabase

log = logging.getLogger("store.ledger")


def log_stock_change(product_id: str | None, change_qty: int, reason: str = "adjustment",
                     actor: str = "system", ref_type: str | None = None, ref_id: str | None = None,
                     variant_id: str | None = None, note: str = "") -> None:
    """Insert a stock ledger row. Fail-soft: never let a stock write break an order."""
    if change_qty == 0:
        return
    try:
        supabase.table("store_stock_ledger").insert({
            "product_id": product_id,
            "variant_id": variant_id,
            "change_qty": change_qty,
            "reason": reason,
            "ref_type": ref_type,
            "ref_id": ref_id,
            "actor": actor or "system",
            "note": note or "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as exc:  # pragma: no cover - defensive
        log.warning("stock ledger insert failed (%s): %s", reason, exc)
