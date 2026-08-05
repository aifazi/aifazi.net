"""
routers/store_admin.py — Store management for staff (categories, products,
inventory, orders, invoices, quotes, sales stats). Mounted at /api/store/admin.
"""
from __future__ import annotations

import os
import logging
import random
import uuid as _uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from database import supabase
from permissions import require_any_permission
from routers.cdn_upload import upload_media
from routers.store_ledger import log_stock_change

log = logging.getLogger("store.admin")
router = APIRouter()

# Umbrella 'store' module always grants access; fine-grained store.<sub> modules
# let owners restrict staff to only their areas (Odoo-style).
MANAGE    = require_any_permission("store", action="manage")
ANALYTICS = require_any_permission("store", "store.analytics", action="view")
CATALOG   = require_any_permission("store", "store.products", action="manage")
CATEGORIES = require_any_permission("store", "store.categories", action="manage")
ORDERS    = require_any_permission("store", "store.orders", action="manage")
SETTINGS  = require_any_permission("store", "store.settings", action="manage")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _number(prefix: str) -> str:
    return f"{prefix}-{random.randint(100000, 999999)}"


def _product_payload(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "slug": row.get("slug"),
        "name": row.get("name"),
        "sku": row.get("sku") or "",
        "barcode": row.get("barcode") or "",
        "description": row.get("description") or "",
        "price_cents": int(row.get("price_cents") or 0),
        "price": (row.get("price_cents") or 0) / 100,
        "compare_at_cents": row.get("compare_at_cents"),
        "compare_at": (row.get("compare_at_cents") or 0) / 100 if row.get("compare_at_cents") else None,
        "image_url": row.get("image_url") or "",
        "type": row.get("type") or "physical",
        "digital_file_url": row.get("digital_file_url") or "",
        "download_limit": int(row.get("download_limit") or 5),
        "stock_qty": int(row.get("stock_qty") or 0),
        "low_stock_threshold": int(row.get("low_stock_threshold") or 0),
        "track_inventory": bool(row.get("track_inventory", True)),
        "active": bool(row.get("active", True)),
        "featured": bool(row.get("featured")),
        "category_id": row.get("category_id"),
        "category": row.get("category_slug") or "",
        "sort_order": int(row.get("sort_order") or 0),
        "low_stock": bool(row.get("track_inventory", True)) and int(row.get("stock_qty") or 0) <= int(row.get("low_stock_threshold") or 0),
        "created_at": row.get("created_at"),
    }


def _product_rows() -> list[dict]:
    res = (supabase.table("store_products")
           .select("*,store_categories(slug)")
           .order("sort_order")
           .execute())
    out = []
    for p in res.data or []:
        p = dict(p)
        cats = p.get("store_categories")
        if isinstance(cats, dict):
            p["category_slug"] = cats.get("slug")
        elif isinstance(cats, list) and cats:
            p["category_slug"] = cats[0].get("slug")
        out.append(p)
    return out


# ── Sales dashboard ────────────────────────────────────────────────────────────
@router.get("/sales")
async def sales_dashboard(_: dict = Depends(ANALYTICS)):
    orders = (supabase.table("store_orders")
              .select("id,status,total_cents,currency,created_at,user_id,order_number")
              .order("created_at", desc=True).limit(500).execute()).data or []
    paid = [o for o in orders if o.get("status") == "paid"]
    revenue = sum(int(o.get("total_cents") or 0) for o in paid)
    refunds = sum(int(t.get("amount_cents") or 0) for t in
                  (supabase.table("store_transactions").select("kind,amount_cents").eq("kind", "refund").execute().data or []))
    products = _product_rows()
    low_stock = [p for p in products if p["track_inventory"] and int(p["stock_qty"] or 0) <= int(p.get("low_stock_threshold") or 0)]

    # Top products by units sold (bounded — full-table fetch was unbounded)
    items = (supabase.table("store_order_items")
             .select("product_name,quantity,line_total_cents")
             .order("created_at", desc=True).limit(5000)
             .execute()).data or []
    sold: dict[str, int] = {}
    revenue_by: dict[str, int] = {}
    for it in items:
        name = it.get("product_name") or "Unknown"
        sold[name] = sold.get(name, 0) + int(it.get("quantity") or 0)
        revenue_by[name] = revenue_by.get(name, 0) + int(it.get("line_total_cents") or 0)
    top_products = [
        {"name": name, "units": qty, "revenue_cents": revenue_by.get(name, 0)}
        for name, qty in sorted(sold.items(), key=lambda kv: -kv[1])[:8]
    ]

    # Recent orders
    recent = []
    for o in orders[:10]:
        recent.append({
            "order_number": o.get("order_number"), "status": o.get("status"),
            "total_cents": int(o.get("total_cents") or 0),
            "total": (o.get("total_cents") or 0) / 100,
            "created_at": o.get("created_at"), "user_id": o.get("user_id"),
        })

    pending_quotes = (supabase.table("store_quotes").select("id").eq("status", "pending").execute().data or [])
    # Daily revenue for the last 30 days (all paid orders, grouped by date)
    by_day: dict[str, dict] = {}
    for o in orders:
        if o.get("status") != "paid":
            continue
        try:
            day = (o.get("created_at") or "")[:10]
        except Exception:
            continue
        if not day:
            continue
        entry = by_day.setdefault(day, {"revenue_cents": 0, "orders": 0})
        entry["revenue_cents"] += int(o.get("total_cents") or 0)
        entry["orders"] += 1
    revenue_by_day = [
        {"date": day, "revenue_cents": by_day[day]["revenue_cents"], "orders": by_day[day]["orders"]}
        for day in sorted(by_day)[-30:]
    ]
    return {
        "revenue_cents": revenue,
        "revenue": revenue / 100,
        "refund_cents": refunds,
        "net_revenue_cents": revenue - refunds,
        "orders_count": len(orders),
        "paid_orders_count": len(paid),
        "products_count": len(products),
        "low_stock_count": len(low_stock),
        "pending_quotes_count": len(pending_quotes),
        "low_stock": low_stock,
        "top_products": top_products,
        "recent_orders": recent,
        "revenue_by_day": revenue_by_day,
        "currency": "usd",
    }


# ── Categories ─────────────────────────────────────────────────────────────────
@router.get("/categories")
async def admin_categories(_: dict = Depends(CATEGORIES)):
    res = (supabase.table("store_categories").select("*").order("display_order").execute())
    return res.data or []


class CategoryBody(BaseModel):
    slug: str
    name: str
    icon: str = "🛒"
    description: str = ""
    scope: str = "all"
    display_order: int = 0
    active: bool = True


@router.post("/categories")
async def create_category(body: CategoryBody, _: dict = Depends(CATEGORIES)):
    try:
        res = supabase.table("store_categories").insert(body.dict()).execute()
    except Exception as exc:
        raise HTTPException(400, f"Category not created: {exc}")
    return res.data[0] if res.data else {"id": None}


@router.patch("/categories/{cat_id}")
async def update_category(cat_id: str, body: CategoryBody, _: dict = Depends(CATEGORIES)):
    res = supabase.table("store_categories").update(body.dict()).eq("id", cat_id).execute()
    if not res.data:
        raise HTTPException(404, "Category not found")
    return res.data[0]


@router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, _: dict = Depends(CATEGORIES)):
    res = supabase.table("store_categories").delete().eq("id", cat_id).execute()
    if not res.data:
        raise HTTPException(404, "Category not found")
    return {"ok": True}


# ── Products + inventory ───────────────────────────────────────────────────────
@router.get("/products")
async def admin_products(_: dict = Depends(CATALOG)):
    rows = _product_rows()
    # Attach active variant counts so the admin can see which products need variants managed
    pids = [p.get("id") for p in rows if p.get("id")]
    vcount: dict[str, int] = {}
    if pids:
        vs = (supabase.table("store_product_variants")
              .select("product_id").eq("active", True).in_("product_id", pids).execute().data or [])
        for v in vs:
            vcount[v.get("product_id")] = vcount.get(v.get("product_id"), 0) + 1
    out = []
    for p in rows:
        payload = _product_payload(p)
        payload["variant_count"] = vcount.get(p.get("id"), 0)
        out.append(payload)
    return out


class ProductBody(BaseModel):
    slug: str
    name: str
    category_id: str | None = None
    sku: str = ""
    barcode: str = ""
    description: str = ""
    price_cents: int = 0
    compare_at_cents: int | None = None
    image_url: str = ""
    type: str = "physical"
    digital_file_url: str = ""
    download_limit: int = 5
    stock_qty: int = 0
    low_stock_threshold: int = 5
    track_inventory: bool = True
    active: bool = True
    featured: bool = False
    sort_order: int = 0


@router.post("/products")
async def create_product(body: ProductBody, _: dict = Depends(CATALOG)):
    try:
        res = supabase.table("store_products").insert(body.dict()).execute()
    except Exception as exc:
        raise HTTPException(400, f"Product not created: {exc}")
    return _product_payload(res.data[0]) if res.data else {"id": None}


@router.patch("/products/{prod_id}")
async def update_product(prod_id: str, body: ProductBody, _: dict = Depends(CATALOG)):
    res = supabase.table("store_products").update({**body.dict(), "updated_at": _now()}).eq("id", prod_id).execute()
    if not res.data:
        raise HTTPException(404, "Product not found")
    return _product_payload(res.data[0])


class StockPatchBody(BaseModel):
    stock_qty: int
    low_stock_threshold: int | None = None


@router.patch("/products/{prod_id}/stock")
async def adjust_stock(prod_id: str, body: StockPatchBody, _: dict = Depends(CATALOG)):
    if body.stock_qty < 0:
        raise HTTPException(400, "Stock cannot be negative")
    old = supabase.table("store_products").select("stock_qty").eq("id", prod_id).limit(1).execute()
    old_qty = int((old.data[0] or {}).get("stock_qty") or 0) if old.data else 0
    patch = {"stock_qty": body.stock_qty, "updated_at": _now()}
    if body.low_stock_threshold is not None:
        patch["low_stock_threshold"] = body.low_stock_threshold
    res = supabase.table("store_products").update(patch).eq("id", prod_id).execute()
    if not res.data:
        raise HTTPException(404, "Product not found")
    if body.stock_qty != old_qty:
        # Location-aware: set the default location quant to match the new total
        from routers.store_inventory import default_location_id, set_quant
        loc = default_location_id()
        if loc:
            set_quant(prod_id, None, loc, body.stock_qty)
        log_stock_change(prod_id, body.stock_qty - old_qty, reason="adjustment",
                         ref_type="manual", ref_id=prod_id,
                         actor=_.get("username") or "staff", note="Manual stock adjustment")
    return _product_payload(res.data[0])


@router.delete("/products/{prod_id}")
async def delete_product(prod_id: str, _: dict = Depends(CATALOG)):
    res = supabase.table("store_products").delete().eq("id", prod_id).execute()
    if not res.data:
        raise HTTPException(404, "Product not found")
    return {"ok": True}


# ── Orders ─────────────────────────────────────────────────────────────────────
@router.get("/orders")
async def admin_orders(status: str | None = None, _: dict = Depends(ORDERS)):
    q = supabase.table("store_orders").select("*").order("created_at", desc=True).limit(200)
    if status:
        q = q.eq("status", status)
    res = q.execute()
    orders = res.data or []
    # Batch item fetch — ONE round-trip instead of one per order.
    item_rows = {}
    if orders:
        ids = [o["id"] for o in orders]
        items = (supabase.table("store_order_items")
                 .select("order_id,product_name,product_sku,unit_price_cents,quantity,line_total_cents")
                 .in_("order_id", ids).order("created_at").execute()).data or []
        for it in items:
            item_rows.setdefault(it.get("order_id"), []).append(it)
    out = []
    for o in orders:
        out.append({**o, "items": item_rows.get(o["id"]) or [], "total": (o.get("total_cents") or 0) / 100})
    return out


@router.get("/orders/{order_id}")
async def admin_order_detail(order_id: str, _: dict = Depends(ORDERS)):
    res = supabase.table("store_orders").select("*").eq("id", order_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Order not found")
    o = res.data[0]
    items = (supabase.table("store_order_items")
             .select("*").eq("order_id", o["id"]).order("created_at").execute())
    events = (supabase.table("store_order_events")
              .select("status,note,actor,created_at").eq("order_id", o["id"]).order("created_at").execute())
    downloads = (supabase.table("store_downloads")
                 .select("*").eq("order_id", o["id"]).order("created_at").execute())
    return {**o, "items": items.data or [], "events": events.data or [],
            "downloads": downloads.data or [], "total": (o.get("total_cents") or 0) / 100}


class OrderStatusBody(BaseModel):
    status: str
    note: str = ""
    tracking_number: str = ""
    carrier: str = ""
    tracking_url: str = ""


# Statuses staff may set directly. "paid" is only ever set by the Stripe webhook
# (fulfilment), and "refunded" must go through the refund endpoint (which reverses
# the payment at Stripe, records the refund, restocks items and voids the invoice).
ALLOWED_MANUAL_STATUSES = {"pending", "processing", "shipped", "delivered", "cancelled", "completed"}


@router.patch("/orders/{order_id}/status")
async def update_order_status(order_id: str, body: OrderStatusBody, staff: dict = Depends(ORDERS)):
    if body.status not in ALLOWED_MANUAL_STATUSES:
        raise HTTPException(400, f"Status '{body.status}' cannot be set directly. Use the refund action for refunds.")
    res = supabase.table("store_orders").select("status").eq("id", order_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Order not found")
    old = (res.data[0] or {}).get("status")
    patch: dict = {"status": body.status, "updated_at": _now()}
    if body.status in ("shipped", "delivered") and not res.data[0].get("shipped_at"):
        patch["shipped_at"] = _now()
    if body.status == "delivered":
        patch["delivered_at"] = _now()
    if body.tracking_number:
        patch["tracking_number"] = body.tracking_number
    if body.carrier:
        patch["carrier"] = body.carrier
    if body.tracking_url:
        patch["tracking_url"] = body.tracking_url
    updated = supabase.table("store_orders").update(patch).eq("id", order_id).execute()
    if not updated.data:
        raise HTTPException(404, "Order not found")
    actor = staff.get("username") or staff.get("id") or "staff"
    note = body.note or (f"Status changed from {old} to {body.status}" if old and old != body.status else "Status updated")
    try:
        supabase.table("store_order_events").insert({
            "order_id": order_id, "status": body.status, "note": note, "actor": actor,
        }).execute()
    except Exception as exc:
        log.warning("order event insert failed: %s", exc)
    return updated.data[0]


# ── Invoices ───────────────────────────────────────────────────────────────────
@router.get("/invoices")
async def admin_invoices(_: dict = Depends(ORDERS)):
    res = (supabase.table("store_invoices").select("*").order("created_at", desc=True).limit(200).execute())
    return [{**i, "total": (i.get("total_cents") or 0) / 100} for i in res.data or []]


class InvoiceBody(BaseModel):
    order_id: str | None = None
    user_id: str | None = None
    status: str = "draft"
    subtotal_cents: int = 0
    discount_cents: int = 0
    tax_cents: int = 0
    total_cents: int = 0
    customer_name: str = ""
    customer_email: str = ""
    due_at: str | None = None
    notes: str = ""


@router.post("/invoices")
async def create_invoice(body: InvoiceBody, _: dict = Depends(ORDERS)):
    try:
        res = supabase.table("store_invoices").insert({
            **body.dict(), "invoice_number": _number("INV"),
        }).execute()
    except Exception as exc:
        raise HTTPException(400, f"Invoice not created: {exc}")
    return res.data[0] if res.data else {"id": None}


class InvoicePatchBody(BaseModel):
    status: str | None = None
    paid_at: str | None = None
    due_at: str | None = None
    notes: str | None = None


@router.patch("/invoices/{invoice_id}")
async def update_invoice(invoice_id: str, body: InvoicePatchBody, _: dict = Depends(ORDERS)):
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if body.status == "paid" and not patch.get("paid_at"):
        patch["paid_at"] = _now()
    res = supabase.table("store_invoices").update({**patch, "updated_at": _now()}).eq("id", invoice_id).execute()
    if not res.data:
        raise HTTPException(404, "Invoice not found")
    return res.data[0]


@router.delete("/invoices/{invoice_id}")
async def delete_invoice(invoice_id: str, _: dict = Depends(ORDERS)):
    res = supabase.table("store_invoices").delete().eq("id", invoice_id).execute()
    if not res.data:
        raise HTTPException(404, "Invoice not found")
    return {"ok": True}


# ── Quotes ─────────────────────────────────────────────────────────────────────
@router.get("/quotes")
async def admin_quotes(_: dict = Depends(ORDERS)):
    res = (supabase.table("store_quotes").select("*").order("created_at", desc=True).limit(200).execute())
    return [{**q, "total": (q.get("total_cents") or 0) / 100} for q in res.data or []]


class QuoteBody(BaseModel):
    status: str | None = None
    items: list[dict] = []
    subtotal_cents: int = 0
    tax_cents: int = 0
    total_cents: int = 0
    customer_name: str = ""
    customer_email: str = ""
    notes: str = ""
    valid_until: str | None = None


@router.post("/quotes")
async def create_quote(body: QuoteBody, _: dict = Depends(ORDERS)):
    try:
        res = supabase.table("store_quotes").insert({
            "quote_number": _number("QT"),
            "status": body.status or "pending",
            "items": body.items or [],
            "subtotal_cents": body.subtotal_cents,
            "tax_cents": body.tax_cents,
            "total_cents": body.total_cents or body.subtotal_cents,
            "currency": "usd",
            "customer_name": body.customer_name,
            "customer_email": body.customer_email,
            "notes": body.notes,
            "valid_until": body.valid_until,
        }).execute()
    except Exception as exc:
        raise HTTPException(400, f"Quote not created: {exc}")
    return res.data[0] if res.data else {"id": None}


@router.patch("/quotes/{quote_id}")
async def update_quote(quote_id: str, body: QuoteBody, _: dict = Depends(ORDERS)):
    patch = {k: v for k, v in body.dict().items() if v is not None}
    patch["updated_at"] = _now()
    res = supabase.table("store_quotes").update(patch).eq("id", quote_id).execute()
    if not res.data:
        raise HTTPException(404, "Quote not found")
    return res.data[0]


@router.delete("/quotes/{quote_id}")
async def delete_quote(quote_id: str, _: dict = Depends(ORDERS)):
    res = supabase.table("store_quotes").delete().eq("id", quote_id).execute()
    if not res.data:
        raise HTTPException(404, "Quote not found")
    return {"ok": True}


# ── Plans (VIP subscription tiers) ─────────────────────────────────────────────
def _plan_payload(row: dict) -> dict:
    return {
        "id": row.get("id"),
        "slug": row.get("slug"),
        "name": row.get("name"),
        "level": int(row.get("level") or 0),
        "price_cents": int(row.get("price_cents") or 0),
        "price": (row.get("price_cents") or 0) / 100,
        "interval": row.get("interval") or "month",
        "headline": row.get("headline") or "",
        "description": row.get("description") or "",
        "perks": row.get("perks") or {},
        "features": row.get("features") or [],
        "category_id": row.get("category_id"),
        "category": row.get("category_slug") or "",
        "display_order": int(row.get("display_order") or 0),
        "active": bool(row.get("active", True)),
        "stripe_product_id": row.get("stripe_product_id") or "",
        "stripe_price_id": row.get("stripe_price_id") or "",
        "created_at": row.get("created_at"),
    }


@router.get("/plans")
async def admin_plans(_: dict = Depends(SETTINGS)):
    res = (supabase.table("store_plans")
           .select("*,store_categories(slug)").order("display_order").execute())
    out = []
    for p in res.data or []:
        p = dict(p)
        cats = p.get("store_categories")
        if isinstance(cats, dict):
            p["category_slug"] = cats.get("slug")
        elif isinstance(cats, list) and cats:
            p["category_slug"] = cats[0].get("slug")
        out.append(p)
    return [_plan_payload(p) for p in out]


class PlanBody(BaseModel):
    slug: str
    name: str
    level: int = 1
    price_cents: int = 0
    interval: str = "month"
    headline: str = ""
    description: str = ""
    perks: dict = {}
    features: list = []
    category_id: str | None = None
    display_order: int = 0
    active: bool = True


@router.post("/plans")
async def create_plan(body: PlanBody, _: dict = Depends(SETTINGS)):
    try:
        res = supabase.table("store_plans").insert(body.dict()).execute()
    except Exception as exc:
        raise HTTPException(400, f"Plan not created: {exc}")
    return _plan_payload(res.data[0]) if res.data else {"id": None}


@router.patch("/plans/{plan_id}")
async def update_plan(plan_id: str, body: PlanBody, _: dict = Depends(SETTINGS)):
    res = supabase.table("store_plans").update({**body.dict(), "updated_at": _now()}).eq("id", plan_id).execute()
    if not res.data:
        raise HTTPException(404, "Plan not found")
    return _plan_payload(res.data[0])


@router.delete("/plans/{plan_id}")
async def delete_plan(plan_id: str, _: dict = Depends(SETTINGS)):
    res = supabase.table("store_plans").delete().eq("id", plan_id).execute()
    if not res.data:
        raise HTTPException(404, "Plan not found")
    return {"ok": True}


# ── Subscriptions (user_subscriptions) ─────────────────────────────────────────
@router.get("/subscriptions")
async def admin_subscriptions(_: dict = Depends(SETTINGS)):
    res = (supabase.table("user_subscriptions")
           .select("*").order("updated_at", desc=True).limit(200).execute())
    out = []
    for s in res.data or []:
        u = (supabase.table("users").select("username,email")
             .eq("id", s.get("user_id")).limit(1).execute()).data or [{}]
        out.append({**s, "username": (u[0] or {}).get("username"), "email": (u[0] or {}).get("email")})
    return out


class SubscriptionPatchBody(BaseModel):
    status: str | None = None
    plan_slug: str | None = None
    plan_name: str | None = None
    plan_level: int | None = None
    perks: dict | None = None
    cancel_at_period_end: bool | None = None
    current_period_end: str | None = None
    sync_status: str | None = None
    sync_error: str | None = None


@router.patch("/subscriptions/{sub_id}")
async def update_subscription(sub_id: str, body: SubscriptionPatchBody, _: dict = Depends(SETTINGS)):
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if not patch:
        raise HTTPException(400, "Nothing to update")
    patch["updated_at"] = _now()
    res = supabase.table("user_subscriptions").update(patch).eq("id", sub_id).execute()
    if not res.data:
        raise HTTPException(404, "Subscription not found")
    return res.data[0]


@router.post("/subscriptions/{sub_id}/sync")
async def resync_subscription(sub_id: str, _: dict = Depends(SETTINGS)):
    res = (supabase.table("user_subscriptions")
           .update({"sync_status": "pending", "sync_attempts": 0, "sync_error": None, "updated_at": _now()})
           .eq("id", sub_id).execute())
    if not res.data:
        raise HTTPException(404, "Subscription not found")
    return {"ok": True, "sync_status": "pending"}


# ── Store file upload (digital product files) ──────────────────────────────────
@router.post("/files/upload")
async def upload_store_file(file: UploadFile = File(...), _: dict = Depends(CATALOG)):
    content = await file.read()
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(413, "File exceeds 100 MB limit")
    filename = (file.filename or "file").replace("\\", "/").rsplit("/", 1)[-1]
    filename = filename.replace("..", "").strip()[:80] or "file"
    # Digital product files are stored via the active CDN provider (R2),
    # grouped under the 'store' folder for easy management in R2.
    try:
        url, storage_path, provider = await upload_media(
            content, filename, file.content_type or "application/octet-stream",
            folder="store",
        )
    except Exception as exc:
        raise HTTPException(500, f"Upload failed: {str(exc)[:200]}")
    return {"storage_path": storage_path, "url": url, "filename": filename, "provider": provider}
