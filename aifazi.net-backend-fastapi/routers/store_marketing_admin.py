"""
routers/store_marketing_admin.py - Marketing modules (coupons, flash deals).
Mounted at /api/store/admin. Permission gated per module.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import supabase
from permissions import require_any_permission

log = logging.getLogger("store.marketing")
router = APIRouter()

COUPONS = require_any_permission("store", "store.coupons", action="view")
DEALS = require_any_permission("store", "store.deals", action="view")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _coupon_payload(c: dict) -> dict:
    return {
        "id": c.get("id"),
        "code": c.get("code"),
        "description": c.get("description") or "",
        "type": c.get("type") or "fixed",
        "value_cents": int(c.get("value_cents") or 0),
        "value_percent": int(c.get("value_percent") or 0),
        "min_subtotal_cents": int(c.get("min_subtotal_cents") or 0),
        "max_uses": int(c.get("max_uses") or 0),
        "per_user_limit": int(c.get("per_user_limit") or 0),
        "used_count": int(c.get("used_count") or 0),
        "product_ids": c.get("product_ids") or [],
        "category_id": c.get("category_id"),
        "active": bool(c.get("active", True)),
        "starts_at": c.get("starts_at"),
        "expires_at": c.get("expires_at"),
        "created_at": c.get("created_at"),
    }


@router.get("/coupons")
async def list_coupons(_: dict = Depends(COUPONS)):
    res = (supabase.table("store_coupons").select("*").order("created_at", desc=True).execute())
    return [_coupon_payload(c) for c in (res.data or [])]


class CouponBody(BaseModel):
    code: str
    description: str = ""
    type: str = "fixed"
    value_cents: int = 0
    value_percent: int = 0
    min_subtotal_cents: int = 0
    max_uses: int = 0
    per_user_limit: int = 0
    product_ids: list = []
    category_id: str | None = None
    active: bool = True
    starts_at: str | None = None
    expires_at: str | None = None


@router.post("/coupons")
async def create_coupon(body: CouponBody, _: dict = Depends(COUPONS)):
    code = body.code.strip().upper()
    if not code:
        raise HTTPException(400, "Code is required")
    if body.type == "percent" and not (0 <= body.value_percent <= 100):
        raise HTTPException(400, "Percent must be 0-100")
    try:
        res = supabase.table("store_coupons").insert({**body.dict(), "code": code}).execute()
    except Exception as exc:
        raise HTTPException(400, f"Coupon not created: {exc}")
    return _coupon_payload(res.data[0]) if res.data else {"id": None}


class CouponPatchBody(BaseModel):
    code: str | None = None
    description: str | None = None
    type: str | None = None
    value_cents: int | None = None
    value_percent: int | None = None
    min_subtotal_cents: int | None = None
    max_uses: int | None = None
    per_user_limit: int | None = None
    product_ids: list | None = None
    category_id: str | None = None
    active: bool | None = None
    starts_at: str | None = None
    expires_at: str | None = None


@router.patch("/coupons/{coupon_id}")
async def update_coupon(coupon_id: str, body: CouponPatchBody, _: dict = Depends(COUPONS)):
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if patch.get("code") is not None:
        patch["code"] = str(patch["code"]).strip().upper()
    if patch.get("type") == "percent" and not (0 <= (patch.get("value_percent") or 0) <= 100):
        raise HTTPException(400, "Percent must be 0-100")
    if not patch:
        raise HTTPException(400, "Nothing to update")
    patch["updated_at"] = _now()
    res = supabase.table("store_coupons").update(patch).eq("id", coupon_id).execute()
    if not res.data:
        raise HTTPException(404, "Coupon not found")
    return _coupon_payload(res.data[0])


@router.delete("/coupons/{coupon_id}")
async def delete_coupon(coupon_id: str, _: dict = Depends(COUPONS)):
    res = supabase.table("store_coupons").delete().eq("id", coupon_id).execute()
    if not res.data:
        raise HTTPException(404, "Coupon not found")
    return {"ok": True}


# Flash deals ---------------------------------------------------------------
def _deal_payload(d: dict) -> dict:
    return {
        "id": d.get("id"),
        "product_id": d.get("product_id"),
        "name": d.get("name"),
        "subtitle": d.get("subtitle") or "",
        "discount_percent": int(d.get("discount_percent") or 0),
        "starts_at": d.get("starts_at"),
        "ends_at": d.get("ends_at"),
        "active": bool(d.get("active", True)),
        "created_at": d.get("created_at"),
    }


@router.get("/deals")
async def list_deals(_: dict = Depends(DEALS)):
    res = (supabase.table("store_deals").select("*").order("created_at", desc=True).execute())
    out = []
    for d in res.data or []:
        p = (supabase.table("store_products").select("id,name,slug,price_cents,image_url")
             .eq("id", d.get("product_id")).limit(1).execute()).data or [{}]
        out.append({**_deal_payload(d), "product_name": (p[0] or {}).get("name"),
                    "product_slug": (p[0] or {}).get("slug"), "product_price_cents": (p[0] or {}).get("price_cents")})
    return out


class DealBody(BaseModel):
    product_id: str
    name: str
    subtitle: str = ""
    discount_percent: int = 0
    starts_at: str | None = None
    ends_at: str | None = None
    active: bool = True


@router.post("/deals")
async def create_deal(body: DealBody, _: dict = Depends(DEALS)):
    if not (0 <= body.discount_percent <= 100):
        raise HTTPException(400, "Discount must be 0-100")
    try:
        res = supabase.table("store_deals").insert(body.dict()).execute()
    except Exception as exc:
        raise HTTPException(400, f"Deal not created: {exc}")
    return _deal_payload(res.data[0]) if res.data else {"id": None}


@router.patch("/deals/{deal_id}")
async def update_deal(deal_id: str, body: DealBody, _: dict = Depends(DEALS)):
    patch = {**body.dict(), "updated_at": _now()}
    if not (0 <= patch["discount_percent"] <= 100):
        raise HTTPException(400, "Discount must be 0-100")
    res = supabase.table("store_deals").update(patch).eq("id", deal_id).execute()
    if not res.data:
        raise HTTPException(404, "Deal not found")
    return _deal_payload(res.data[0])


@router.delete("/deals/{deal_id}")
async def delete_deal(deal_id: str, _: dict = Depends(DEALS)):
    res = supabase.table("store_deals").delete().eq("id", deal_id).execute()
    if not res.data:
        raise HTTPException(404, "Deal not found")
    return {"ok": True}
