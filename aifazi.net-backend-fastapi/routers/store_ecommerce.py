"""
routers/store_ecommerce.py — One-time product store (customer-facing).
Mounted at /api/store in main.py alongside store.py (subscriptions).

Public:
  GET  /api/store/products               — active products (filters)
  GET  /api/store/products/{slug}        — single product
Authenticated (JWT):
  GET    /api/store/cart                 — caller's cart
  POST   /api/store/cart                 — add item
  PATCH  /api/store/cart/{item_id}       — update qty
  DELETE /api/store/cart/{item_id}       — remove item
  POST   /api/store/cart/clear           — empty cart
    POST   /api/store/checkout/cart        — Stripe Checkout (payment mode) for cart
  GET    /api/store/orders               — caller's orders (with items, downloads)
  GET    /api/store/orders/{order_no}    — order detail (items + status timeline + downloads)
  GET    /api/store/invoices             — caller's invoices
  GET    /api/store/invoices/{no}        — invoice detail
  POST   /api/store/quotes               — request a quote
  GET    /api/store/quotes               — caller's quotes
  GET    /api/store/downloads            — caller's digital downloads
  GET    /api/store/downloads/{token}    — token-gated file download (public redirect)
  POST   /api/store/stripe/webhook       — checkout.session.completed for product orders
"""
from __future__ import annotations

import os
import secrets
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from postgrest.exceptions import APIError

from database import supabase
from dependencies import get_current_user
from routers.store_ledger import log_stock_change
from routers.store_inventory import consume_stock, restock

log = logging.getLogger("store.ecommerce")
router = APIRouter()

STRIPE_SECRET_KEY   = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
FRONTEND_URL        = os.getenv("FRONTEND_URL", "https://aifazi.net")
SUPABASE_URL        = os.getenv("SUPABASE_URL", "")
STORE_FILES_BUCKET  = os.getenv("STORE_FILES_BUCKET", "store-files")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# Lazily import stripe so cold starts that never touch payments don't pay for it.
def _stripe_module():
    import stripe
    return stripe


def _stripe_client():
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Stripe is not configured. Set STRIPE_SECRET_KEY.")
    _stripe = _stripe_module()
    _stripe.api_key = STRIPE_SECRET_KEY
    return _stripe


def _user_id(user: dict) -> str:
    uid = user.get("id") or user.get("sub") or user.get("forum_user_id")
    if not uid:
        raise HTTPException(401, "Login required")
    return str(uid)


def _user_email(user: dict) -> str:
    email = (user.get("email") or "").strip()
    if email:
        return email
    try:
        u = supabase.table("users").select("email").eq("id", _user_id(user)).limit(1).execute()
        return ((u.data or [{}])[0].get("email") or "").strip()
    except Exception:
        return ""


def _number(prefix: str) -> str:
    """Human-friendly order number with enough entropy to prevent enumeration.

    Uses 9 random digits (~30 bits) from a CSPRNG — the old 6-digit numbers
    (~900k combos) let anyone enumerate orders and steal digital downloads.
    """
    n = secrets.randbelow(1_000_000_000)
    return f"{prefix}-{n:09d}"


def _product_payload(row: dict, variants=None, deal=None, rating=None) -> dict:
    payload = {
        "id": row.get("id"),
        "slug": row.get("slug"),
        "name": row.get("name"),
        "sku": row.get("sku") or "",
        "description": row.get("description") or "",
        "price_cents": int(row.get("price_cents") or 0),
        "price": (row.get("price_cents") or 0) / 100,
        "compare_at_cents": row.get("compare_at_cents"),
        "compare_at": (row.get("compare_at_cents") or 0) / 100 if row.get("compare_at_cents") else None,
        "on_sale": bool(row.get("compare_at_cents") and row.get("compare_at_cents") > (row.get("price_cents") or 0)),
        "image_url": row.get("image_url") or "",
        "type": row.get("type") or "physical",
        "in_stock": not row.get("track_inventory", True) or int(row.get("stock_qty") or 0) > 0,
        "stock_qty": int(row.get("stock_qty") or 0),
        "track_inventory": bool(row.get("track_inventory", True)),
        "featured": bool(row.get("featured")),
        "category_id": row.get("category_id"),
        "category": row.get("category_slug") or "",
        "sort_order": int(row.get("sort_order") or 0),
        "created_at": row.get("created_at"),
        "variants": variants or [],
        "rating": rating or {"rating": None, "count": 0},
    }
    if deal:
        deal_price = max(0, round(payload["price_cents"] * (100 - int(deal.get("discount_percent") or 0)) / 100))
        payload["deal"] = {
            "id": deal.get("id"),
            "name": deal.get("name"),
            "subtitle": deal.get("subtitle") or "",
            "discount_percent": int(deal.get("discount_percent") or 0),
            "starts_at": deal.get("starts_at"),
            "ends_at": deal.get("ends_at"),
        }
        payload["deal_price_cents"] = deal_price
        payload["deal_price"] = deal_price / 100
    else:
        payload["deal"] = None
    return payload


def _variants_for(product_id: str) -> list[dict]:
    res = (supabase.table("store_product_variants").select("*")
           .eq("product_id", product_id).eq("active", True).order("sort_order").execute()).data or []
    out = []
    for v in res:
        out.append({
            "id": v.get("id"),
            "product_id": v.get("product_id"),
            "name": v.get("name"),
            "sku": v.get("sku") or "",
            "price_cents": int(v.get("price_cents") or 0),
            "price": (v.get("price_cents") or 0) / 100,
            "stock_qty": int(v.get("stock_qty") or 0),
            "track_inventory": bool(v.get("track_inventory", True)),
            "attributes": v.get("attributes") or {},
            "image_url": v.get("image_url") or "",
            "in_stock": not v.get("track_inventory", True) or int(v.get("stock_qty") or 0) > 0,
            "sort_order": int(v.get("sort_order") or 0),
        })
    return out


def _rating_for(product_id: str) -> dict:
    res = (supabase.table("store_reviews")
           .select("rating").eq("product_id", product_id).eq("status", "approved").execute().data or [])
    if not res:
        return {"rating": None, "count": 0}
    avg = round(sum(int(r.get("rating") or 0) for r in res) / len(res), 1)
    return {"rating": avg, "count": len(res)}


def _active_deal_for(product_id: str) -> dict | None:
    now = _now()
    res = (supabase.table("store_deals")
           .select("*").eq("product_id", product_id).eq("active", True).execute().data or [])
    for d in res:
        if d.get("starts_at") and d["starts_at"] > now:
            continue
        if d.get("ends_at") and d["ends_at"] < now:
            continue
        return d
    return None


def _resolve_coupon(code: str, subtotal_cents: int, product_ids: list[str], user_id: str | None = None) -> dict | None:
    """Validate a coupon code and compute the discount. Returns None if invalid."""
    if not code:
        return None
    res = supabase.table("store_coupons").select("*").ilike("code", code.strip()).limit(1).execute()
    if not res.data:
        return None
    c = res.data[0]
    now = _now()
    if not c.get("active"):
        return None
    if c.get("starts_at") and c["starts_at"] > now:
        return None
    if c.get("expires_at") and c["expires_at"] < now:
        return None
    if int(c.get("max_uses") or 0) > 0 and int(c.get("used_count") or 0) >= int(c["max_uses"]):
        return None
    # per_user_limit was never enforced before — count the user's fulfilled
    # (paid) orders that used this coupon.
    per_user = int(c.get("per_user_limit") or 0)
    if per_user > 0 and user_id:
        cnt = (supabase.table("store_orders")
               .select("id", count="exact")
               .eq("coupon_id", c["id"])
               .eq("user_id", user_id)
               .in_("status", ["paid", "processing", "shipped", "delivered", "completed"])
               .execute())
        if (cnt.count or 0) >= per_user:
            return None
    if subtotal_cents < int(c.get("min_subtotal_cents") or 0):
        return None
    restricted = [p for p in (c.get("product_ids") or []) if p]
    if restricted and not all(pid in restricted for pid in product_ids):
        return None
    ctype = c.get("type") or "fixed"
    if ctype == "fixed":
        discount = min(int(c.get("value_cents") or 0), subtotal_cents)
    elif ctype == "percent":
        discount = round(subtotal_cents * int(c.get("value_percent") or 0) / 100)
    else:
        discount = 0
    return {"id": c.get("id"), "code": c.get("code"), "type": ctype,
            "discount_cents": min(discount, subtotal_cents)}


def _product_rows(include_inactive: bool = False) -> list[dict]:
    q = (supabase.table("store_products")
         .select("*,store_categories(slug)")
         .order("sort_order"))
    if not include_inactive:
        q = q.eq("active", True)
    res = q.execute()
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


# ── Public catalog ─────────────────────────────────────────────────────────────
@router.get("/products")
async def list_products(category: str | None = None, featured: bool | None = None):
    rows = _product_rows()
    if category:
        rows = [r for r in rows if (r.get("category_slug") or "") == category]
    if featured is not None:
        rows = [r for r in rows if bool(r.get("featured")) == featured]

    pids = [r.get("id") for r in rows if r.get("id")]
    variants: dict[str, list[dict]] = {}
    deals: dict[str, dict] = {}
    ratings: dict[str, dict] = {}
    if pids:
        vs = (supabase.table("store_product_variants").select("*")
              .eq("active", True).in_("product_id", pids).order("sort_order").execute().data or [])
        for v in vs:
            variants.setdefault(v.get("product_id"), []).append(v)
        now = _now()
        ds = (supabase.table("store_deals").select("*")
              .eq("active", True).in_("product_id", pids).execute().data or [])
        for d in ds:
            if d.get("product_id") in deals:
                continue
            if d.get("starts_at") and d["starts_at"] > now:
                continue
            if d.get("ends_at") and d["ends_at"] < now:
                continue
            deals[d.get("product_id")] = d
        rs = (supabase.table("store_reviews").select("product_id,rating")
              .eq("status", "approved").in_("product_id", pids).execute().data or [])
        cnt: dict[str, int] = {}
        tot: dict[str, int] = {}
        for r in rs:
            pid = r.get("product_id")
            if not pid:
                continue
            cnt[pid] = cnt.get(pid, 0) + 1
            tot[pid] = tot.get(pid, 0) + int(r.get("rating") or 0)
        ratings = {pid: {"rating": round(tot[pid] / cnt[pid], 1), "count": cnt[pid]} for pid in cnt}

    out = []
    for r in rows:
        pid = r.get("id")
        # transform raw variant rows
        transformed = []
        for v in variants.get(pid, []):
            transformed.append({
                "id": v.get("id"), "product_id": v.get("product_id"), "name": v.get("name"),
                "sku": v.get("sku") or "", "price_cents": int(v.get("price_cents") or 0),
                "price": (v.get("price_cents") or 0) / 100, "stock_qty": int(v.get("stock_qty") or 0),
                "track_inventory": bool(v.get("track_inventory", True)),
                "attributes": v.get("attributes") or {}, "image_url": v.get("image_url") or "",
                "in_stock": not v.get("track_inventory", True) or int(v.get("stock_qty") or 0) > 0,
                "sort_order": int(v.get("sort_order") or 0),
            })
        out.append(_product_payload(r, variants=transformed, deal=deals.get(pid), rating=ratings.get(pid)))
    return out


@router.get("/products/{slug}")
async def get_product(slug: str):
    res = (supabase.table("store_products")
           .select("*,store_categories(slug)")
           .eq("slug", slug).eq("active", True).limit(1).execute())
    if not res.data:
        raise HTTPException(404, "Product not found")
    p = res.data[0]
    cats = p.get("store_categories")
    if isinstance(cats, list) and cats:
        p["category_slug"] = cats[0].get("slug")
    elif isinstance(cats, dict):
        p["category_slug"] = cats.get("slug")
    pid = p.get("id")
    return _product_payload(p, variants=_variants_for(pid), deal=_active_deal_for(pid), rating=_rating_for(pid))


# ── Reviews (customer-facing) ──────────────────────────────────────────────────
@router.get("/products/{slug}/reviews")
async def product_reviews(slug: str):
    res = supabase.table("store_products").select("id").eq("slug", slug).eq("active", True).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Product not found")
    pid = res.data[0]["id"]
    rows = (supabase.table("store_reviews").select("*")
            .eq("product_id", pid).eq("status", "approved")
            .order("created_at", desc=True).limit(50).execute()).data or []
    uids = sorted({r.get("user_id") for r in rows if r.get("user_id")})
    names: dict[str, dict] = {}
    if uids:
        users = supabase.table("users").select("id,username,profile_avatar").in_("id", uids).execute().data or []
        names = {u["id"]: u for u in users}
    out = []
    for r in rows:
        out.append({
            "id": r.get("id"),
            "rating": int(r.get("rating") or 0),
            "title": r.get("title") or "",
            "body": r.get("body") or "",
            "helpful_count": int(r.get("helpful_count") or 0),
            "username": (names.get(r.get("user_id")) or {}).get("username") or "Anonymous",
            "avatar": (names.get(r.get("user_id")) or {}).get("profile_avatar"),
            "created_at": r.get("created_at"),
        })
    return out


class ReviewBody(BaseModel):
    rating: int = 5
    title: str = ""
    body: str = ""


@router.post("/products/{slug}/reviews")
async def submit_review(slug: str, body: ReviewBody, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    if not (1 <= body.rating <= 5):
        raise HTTPException(400, "Rating must be 1-5")
    res = supabase.table("store_products").select("id").eq("slug", slug).eq("active", True).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Product not found")
    pid = res.data[0]["id"]
    bought = (supabase.table("store_orders").select("id").eq("user_id", uid).eq("status", "paid").execute()).data or []
    order_ids = [o["id"] for o in bought]
    if order_ids:
        own = (supabase.table("store_order_items").select("id")
               .in_("order_id", order_ids).eq("product_id", pid).limit(1).execute()).data or []
        if not own:
            raise HTTPException(403, "Only verified buyers can review this product")
    else:
        raise HTTPException(403, "Only verified buyers can review this product")
    try:
        res2 = supabase.table("store_reviews").insert({
            "product_id": pid, "user_id": uid,
            "rating": body.rating, "title": body.title, "body": body.body,
            "status": "pending",
        }).execute()
    except Exception as exc:
        raise HTTPException(400, f"Review not submitted: {exc}")
    return res2.data[0] if res2.data else {"id": None}


# ── Coupon validation (customer-facing) ───────────────────────────────────────
@router.get("/coupons/validate")
def validate_coupon(code: str, user: dict = Depends(get_current_user)):
    cart = get_cart(user)
    coupon = _resolve_coupon(code, cart["subtotal_cents"], [i["product"]["id"] for i in cart["items"]], user_id=_user_id(user))
    if not coupon:
        raise HTTPException(404, "Invalid or expired coupon code")
    return {
        **coupon,
        "subtotal_cents": cart["subtotal_cents"],
        "total_after_cents": cart["subtotal_cents"] - coupon["discount_cents"],
    }


# ── Cart ───────────────────────────────────────────────────────────────────────
@router.get("/cart")
def get_cart(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    rows = (supabase.table("store_cart_items")
            .select("*,product_id,store_products(*)")
            .eq("user_id", uid)
            .order("created_at")
            .execute())
    items = []
    subtotal = 0
    for r in rows.data or []:
        prod = r.get("store_products")
        if isinstance(prod, list):
            prod = prod[0] if prod else None
        if not prod or not prod.get("active", True):
            continue
        qty = int(r.get("quantity") or 1)
        variant = None
        vid = r.get("variant_id")
        if vid:
            vres = supabase.table("store_product_variants").select("*").eq("id", vid).eq("active", True).limit(1).execute()
            if vres.data:
                v = vres.data[0]
                variant = {
                    "id": v.get("id"), "name": v.get("name"), "sku": v.get("sku") or "",
                    "price_cents": int(v.get("price_cents") or 0),
                    "attributes": v.get("attributes") or {}, "image_url": v.get("image_url") or "",
                    "in_stock": not v.get("track_inventory", True) or int(v.get("stock_qty") or 0) > 0,
                }
        if variant and variant.get("price_cents"):
            price = variant["price_cents"]
        else:
            price = int(prod.get("price_cents") or 0)
        # Apply an active flash deal so the price shown in the cart equals the
        # price actually charged at checkout (deals were displayed but never
        # applied — customers saw a deal price and were charged full price).
        deal = _active_deal_for(prod.get("id") or "")
        if deal:
            price = max(0, round(price * (100 - int(deal.get("discount_percent") or 0)) / 100))
        items.append({
            "id": r.get("id"),
            "variant_id": vid,
            "product": _product_payload(dict(prod)),
            "variant": variant,
            "quantity": qty,
            "unit_price_cents": price,
            "unit_price": price / 100,
            "line_total_cents": price * qty,
            "line_total": (price * qty) / 100,
        })
        subtotal += price * qty
    return {"items": items, "subtotal_cents": subtotal, "subtotal": subtotal / 100, "count": sum(i["quantity"] for i in items)}


class CartItemBody(BaseModel):
    product_id: str
    quantity: int = 1
    variant_id: str | None = None


@router.post("/cart")
def add_to_cart(body: CartItemBody, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    if body.quantity < 1:
        raise HTTPException(400, "Quantity must be at least 1")
    prod = supabase.table("store_products").select("id,active,track_inventory,stock_qty").eq("id", body.product_id).limit(1).execute()
    if not prod.data:
        raise HTTPException(404, "Product not found")
    p = prod.data[0]
    if not p.get("active", True):
        raise HTTPException(404, "Product not found")

    variant = None
    if body.variant_id:
        vres = (supabase.table("store_product_variants")
                .select("id,product_id,track_inventory,stock_qty,active")
                .eq("id", body.variant_id).limit(1).execute())
        if not vres.data or vres.data[0].get("product_id") != body.product_id:
            raise HTTPException(404, "Variant not found")
        variant = vres.data[0]
        if not variant.get("active", True):
            raise HTTPException(404, "Variant not found")
        if variant.get("track_inventory", True) and body.quantity > int(variant.get("stock_qty") or 0):
            raise HTTPException(400, f"Only {variant.get('stock_qty')} of this option in stock")
    elif p.get("track_inventory", True) and body.quantity > int(p.get("stock_qty") or 0):
        raise HTTPException(400, f"Only {p.get('stock_qty')} in stock")

    existing = (supabase.table("store_cart_items")
                .select("id,quantity,variant_id").eq("user_id", uid).eq("product_id", body.product_id)
                .execute().data or [])
    row = next((e for e in existing if (e.get("variant_id") or None) == (body.variant_id or None)), None)
    if row:
        new_qty = int(row.get("quantity") or 1) + body.quantity
        supabase.table("store_cart_items").update({"quantity": new_qty, "updated_at": _now()}).eq("id", row["id"]).execute()
    else:
        supabase.table("store_cart_items").insert({
            "user_id": uid, "product_id": body.product_id, "quantity": body.quantity,
            "variant_id": body.variant_id,
        }).execute()
    return get_cart(user)


class CartPatchBody(BaseModel):
    quantity: int


@router.patch("/cart/{item_id}")
def update_cart_item(item_id: str, body: CartPatchBody, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    if body.quantity < 1:
        raise HTTPException(400, "Quantity must be at least 1")
    res = (supabase.table("store_cart_items")
           .select("id,product_id,variant_id").eq("id", item_id).eq("user_id", uid).limit(1).execute())
    if not res.data:
        raise HTTPException(404, "Cart item not found")
    row = res.data[0]
    if row.get("variant_id"):
        prod = supabase.table("store_product_variants").select("id,track_inventory,stock_qty").eq("id", row["variant_id"]).limit(1).execute()
        v = (prod.data or [{}])[0]
        if v.get("track_inventory", True) and body.quantity > int(v.get("stock_qty") or 0):
            raise HTTPException(400, f"Only {v.get('stock_qty')} of this option in stock")
    else:
        prod = supabase.table("store_products").select("id,track_inventory,stock_qty").eq("id", row["product_id"]).limit(1).execute()
        p = (prod.data or [{}])[0]
        if p.get("track_inventory", True) and body.quantity > int(p.get("stock_qty") or 0):
            raise HTTPException(400, f"Only {p.get('stock_qty')} in stock")
    supabase.table("store_cart_items").update({"quantity": body.quantity, "updated_at": _now()}).eq("id", item_id).execute()
    return get_cart(user)


@router.delete("/cart/{item_id}")
def remove_cart_item(item_id: str, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    res = (supabase.table("store_cart_items")
           .select("id").eq("id", item_id).eq("user_id", uid).limit(1).execute())
    if not res.data:
        raise HTTPException(404, "Cart item not found")
    supabase.table("store_cart_items").delete().eq("id", item_id).execute()
    return {"ok": True}


@router.post("/cart/clear")
def clear_cart(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    supabase.table("store_cart_items").delete().eq("user_id", uid).execute()
    return {"ok": True}


# ── Checkout (one-time products) ───────────────────────────────────────────────
class CheckoutBody(BaseModel):
    success_url: str = ""
    cancel_url: str = ""
    customer_name: str = ""
    customer_email: str = ""
    shipping_address: dict = {}
    billing_address: dict = {}
    notes: str = ""
    coupon_code: str = ""


@router.post("/checkout/cart")
def create_checkout(body: CheckoutBody, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    cart = get_cart(user)
    if cart["count"] == 0:
        raise HTTPException(400, "Cart is empty")
    st = _stripe_client()

    # Coupon discount FIRST, so the Stripe line items can be priced to match
    # order.total_cents (the webhook reconciliation compares session.amount_total
    # to total_cents; charging full prices would make every coupon order fail).
    coupon = _resolve_coupon(body.coupon_code, cart["subtotal_cents"], [i["product"]["id"] for i in cart["items"]], user_id=uid)
    discount = coupon["discount_cents"] if coupon else 0
    subtotal = cart["subtotal_cents"]

    # Validate stock + build line items (variant-aware amounts), distributing the
    # discount proportionally across items so Stripe charges exactly `total`.
    line_items = []
    remaining_discount = discount
    charged_total = 0
    for i, item in enumerate(cart["items"]):
        prod = item["product"]
        if prod["track_inventory"] and item["quantity"] > prod["stock_qty"]:
            raise HTTPException(400, f"Only {prod['stock_qty']} of {prod['name']} in stock")
        qty = item["quantity"]
        unit = item["unit_price_cents"]
        line_total = unit * qty
        discounted_unit = unit
        if remaining_discount > 0:
            share = round(line_total * discount / subtotal) if subtotal else 0
            if i == len(cart["items"]) - 1:
                share = remaining_discount  # last item absorbs rounding remainder
            share = max(0, min(share, line_total, remaining_discount))
            discounted_unit = max(0, round((line_total - share) / qty))
            remaining_discount -= share
        price_id = _ensure_one_time_price(prod, amount_cents=discounted_unit, variant_id=item.get("variant_id"))
        line_items.append({"price": price_id, "quantity": qty})
        charged_total += discounted_unit * qty

    # total_cents MUST equal the sum of the actual Stripe line items. Per-unit
    # rounding (discounted_unit * qty) can drift a cent from (line_total - share),
    # so the webhook reconciliation (charged vs recorded) failed and left paid
    # coupon orders stuck at 'pending' forever.
    total = charged_total
    actual_discount = max(0, subtotal - total)

    email = body.customer_email or _user_email(user)

    order_no = _number("AFA")
    order = supabase.table("store_orders").insert({
        "order_number": order_no,
        "user_id": uid,
        "status": "pending",
        "subtotal_cents": cart["subtotal_cents"],
        "discount_cents": actual_discount,
        "tax_cents": 0,
        "shipping_cents": 0,
        "total_cents": total,
        "currency": "usd",
        "coupon_id": (coupon or {}).get("id"),
        "coupon_code": (coupon or {}).get("code"),
        "coupon_discount_cents": actual_discount,
        "customer_name": body.customer_name or user.get("username") or "",
        "customer_email": email,
        "shipping_address": body.shipping_address or {},
        "billing_address": body.billing_address or {},
        "notes": body.notes or "",
    }).execute()
    order_row = order.data[0] if order.data else {"id": None, "order_number": order_no}

    try:
        supabase.table("store_order_events").insert({
            "order_id": order_row["id"], "status": "pending", "note": "Order placed", "actor": uid,
        }).execute()
    except Exception:
        pass

    for item in cart["items"]:
        prod = item["product"]
        qty = item["quantity"]
        supabase.table("store_order_items").insert({
            "order_id": order_row["id"],
            "product_id": prod["id"],
            "variant_id": item.get("variant_id"),
            "variant_name": (item.get("variant") or {}).get("name") or "",
            "product_name": prod["name"],
            "product_sku": prod["sku"],
            "unit_price_cents": item["unit_price_cents"],
            "quantity": qty,
            "line_total_cents": item["unit_price_cents"] * qty,
        }).execute()

    success_url = body.success_url or f"{FRONTEND_URL}/store/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url  = body.cancel_url  or f"{FRONTEND_URL}/store"

    try:
        session = st.checkout.Session.create(
            mode="payment",
            client_reference_id=uid,
            customer_email=email or None,
            line_items=line_items,
            metadata={"order_id": order_row["id"], "order_number": order_row["order_number"], "kind": "product_order"},
            success_url=success_url,
            cancel_url=cancel_url,
            # Discounts go through the in-app coupon system (store_coupons), so
            # Stripe's checkout promo-code box stays disabled: allowing it lets
            # customers pay less than the recorded order total.
            allow_promotion_codes=False,
        )
    except Exception as exc:
        log.error("product checkout create failed: %s", exc)
        supabase.table("store_orders").update({"status": "cancelled"}).eq("id", order_row["id"]).execute()
        raise HTTPException(502, f"Stripe checkout failed: {exc}")

    supabase.table("store_orders").update({"payment_intent_id": session.to_dict().get("payment_intent")}).eq("id", order_row["id"]).execute()
    return {"url": session.url, "session_id": session.id, "order_number": order_row["order_number"]}


def _ensure_one_time_price(product: dict, amount_cents: int | None = None, variant_id: str | None = None) -> str:
    """Idempotently create/lookup a one-time Stripe Price for a product.

    The lookup key bakes in the amount so price edits create fresh prices, and
    includes a short variant id so different options keep separate prices.
    """
    amount = amount_cents if amount_cents is not None else int(product.get("price_cents") or 0)
    lookup = f"aifazi-prod-{product['slug']}-{amount}"
    if variant_id:
        lookup += f"-v{variant_id[:8]}"
    existing = _stripe_client().Price.list(lookup_keys=[lookup], limit=1)
    if existing.data:
        return existing.data[0].id
    prod_id = product.get("id")
    # Product lookup by metadata — page through ALL Stripe products, not just the
    # first 100, or past-100 products get a duplicate created on every checkout.
    stripe_prod = None
    for candidate in _stripe_client().Product.list(limit=100).auto_paging_iter():
        meta = candidate.to_dict().get("metadata") or {}
        if meta.get("store_product_id") == prod_id:
            stripe_prod = candidate
            break
    if not stripe_prod:
        stripe_prod = _stripe_client().Product.create(
            name=product.get("name") or product.get("slug"),
            metadata={"store_product_id": prod_id, "store_slug": product["slug"]},
        )
    price = _stripe_client().Price.create(
        currency="usd",
        unit_amount=amount,
        product=stripe_prod.id,
        metadata={"store_product_id": prod_id},
        lookup_key=lookup,
    )
    return price.id


# ── Orders ─────────────────────────────────────────────────────────────────────
@router.get("/orders")
async def my_orders(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    res = (supabase.table("store_orders")
           .select("*")
           .eq("user_id", uid)
           .order("created_at", desc=True)
           .limit(100)
           .execute())
    orders = res.data or []
    # Batch items + downloads — TWO round-trips total instead of 2 per order.
    item_rows = {}
    dl_rows = {}
    if orders:
        ids = [o["id"] for o in orders]
        items = (supabase.table("store_order_items")
                 .select("order_id,product_name,product_sku,unit_price_cents,quantity,line_total_cents")
                 .in_("order_id", ids).order("created_at").execute()).data or []
        for it in items:
            item_rows.setdefault(it.get("order_id"), []).append(it)
        downloads = (supabase.table("store_downloads")
                     .select("order_id,id,product_name,filename,token,downloads_allowed,downloads_used")
                     .in_("order_id", ids).execute()).data or []
        for d in downloads:
            dl_rows.setdefault(d.get("order_id"), []).append(d)
    out = []
    for o in orders:
        out.append({
            **o,
            "items": item_rows.get(o["id"]) or [],
            "total": (o.get("total_cents") or 0) / 100,
            "downloads": dl_rows.get(o["id"]) or [],
        })
    return out


@router.get("/orders/{order_no}")
async def order_detail(order_no: str, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    res = (supabase.table("store_orders").select("*").eq("order_number", order_no).eq("user_id", uid).limit(1).execute())
    if not res.data:
        raise HTTPException(404, "Order not found")
    o = res.data[0]
    items = (supabase.table("store_order_items")
             .select("*").eq("order_id", o["id"]).order("created_at").execute())
    events = (supabase.table("store_order_events")
              .select("status,note,actor,created_at").eq("order_id", o["id"]).order("created_at").execute())
    downloads = (supabase.table("store_downloads")
                 .select("id,product_name,filename,token,downloads_allowed,downloads_used,created_at")
                 .eq("order_id", o["id"]).order("created_at").execute())
    return {
        **o,
        "items": items.data or [],
        "events": events.data or [],
        "downloads": downloads.data or [],
        "total": (o.get("total_cents") or 0) / 100,
    }


# ── Public order tracking (no auth) ────────────────────────────────────────────
@router.get("/track/{order_no}")
async def track_order(order_no: str):
    res = (supabase.table("store_orders").select("id,order_number,status,total_cents,created_at,carrier,tracking_number,tracking_url").eq("order_number", order_no).limit(1).execute())
    if not res.data:
        raise HTTPException(404, "Order not found")
    o = res.data[0]
    items = (supabase.table("store_order_items")
             .select("product_name,quantity,line_total_cents").eq("order_id", o["id"]).order("created_at").execute())
    events = (supabase.table("store_order_events")
              .select("status,note,created_at").eq("order_id", o["id"]).order("created_at").execute())
    # NOTE: download tokens are intentionally NOT returned here. They are only
    # exposed to the owning user via the authenticated /orders/{order_no} and
    # /downloads endpoints. Returning them on a public, unauthenticated endpoint
    # (with guessable order numbers) let anyone steal paid digital goods.
    return {
        "order_number": o.get("order_number"),
        "status": o.get("status"),
        "total_cents": o.get("total_cents"),
        "created_at": o.get("created_at"),
        "carrier": o.get("carrier"),
        "tracking_number": o.get("tracking_number"),
        "tracking_url": o.get("tracking_url"),
        "items": items.data or [],
        "events": events.data or [],
    }


# ── Digital downloads ──────────────────────────────────────────────────────────
def _download_token() -> str:
    return secrets.token_urlsafe(24)


def _download_filename(url: str) -> str:
    if not url:
        return ""
    base = url.replace("\\", "/").rsplit("/", 1)[-1] or ""
    return base.split("?")[0].split("#")[0] or "download"


@router.get("/downloads")
async def my_downloads(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    orders = (supabase.table("store_orders")
              .select("id,order_number,status").eq("user_id", uid).execute()).data or []
    order_ids = [o["id"] for o in orders]
    if not order_ids:
        return []
    rows = (supabase.table("store_downloads")
            .select("*").in_("order_id", order_ids).order("created_at", desc=True).execute()).data or []
    by_id = {o["id"]: o for o in orders}
    return [{
        "id": d.get("id"),
        "token": d.get("token"),
        "product_name": d.get("product_name"),
        "filename": d.get("filename") or d.get("product_name"),
        "downloads_allowed": int(d.get("downloads_allowed") or 5),
        "downloads_used": int(d.get("downloads_used") or 0),
        "order_number": (by_id.get(d.get("order_id")) or {}).get("order_number"),
        "order_status": (by_id.get(d.get("order_id")) or {}).get("status"),
        "created_at": d.get("created_at"),
    } for d in rows]


@router.get("/downloads/{token}")
async def download_content(token: str):
    """Token-gated download. The token itself is the credential (generated on
    payment), so no auth is required — mirroring a signed delivery link."""
    res = supabase.table("store_downloads").select("*").eq("token", token).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Download not found")
    d = res.data[0]
    used = int(d.get("downloads_used") or 0)
    allowed = int(d.get("downloads_allowed") or 5)
    if used >= allowed:
        raise HTTPException(403, "Download limit reached")
    supabase.table("store_downloads").update({"downloads_used": used + 1}).eq("id", d["id"]).execute()
    file_url = d.get("file_url") or ""
    if not file_url:
        raise HTTPException(404, "File is not available")
    if not file_url.startswith(("http://", "https://")):
        file_url = f"{SUPABASE_URL}/storage/v1/object/public/{STORE_FILES_BUCKET}/{file_url.lstrip('/')}"
    return RedirectResponse(file_url)


# ── Invoices ───────────────────────────────────────────────────────────────────
@router.get("/invoices")
async def my_invoices(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    res = (supabase.table("store_invoices")
           .select("*")
           .eq("user_id", uid)
           .order("created_at", desc=True)
           .limit(100)
           .execute())
    out = []
    for inv in res.data or []:
        out.append({**inv, "total": (inv.get("total_cents") or 0) / 100})
    return out


@router.get("/invoices/{invoice_no}")
async def invoice_detail(invoice_no: str, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    res = (supabase.table("store_invoices").select("*").eq("invoice_number", invoice_no).eq("user_id", uid).limit(1).execute())
    if not res.data:
        raise HTTPException(404, "Invoice not found")
    inv = res.data[0]
    items = []
    if inv.get("order_id"):
        items = (supabase.table("store_order_items")
                 .select("product_name,product_sku,unit_price_cents,quantity,line_total_cents")
                 .eq("order_id", inv["order_id"]).order("created_at").execute()).data or []
    return {**inv, "items": items, "total": (inv.get("total_cents") or 0) / 100}


# ── Quotes ─────────────────────────────────────────────────────────────────────
class QuoteBody(BaseModel):
    items: list[dict] = []      # [{product_id, quantity}]
    customer_name: str = ""
    customer_email: str = ""
    notes: str = ""


@router.post("/quotes")
async def request_quote(body: QuoteBody, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    if not body.items:
        raise HTTPException(400, "Add at least one item")
    lines = []
    subtotal = 0
    for it in body.items:
        pid = it.get("product_id")
        qty = max(1, int(it.get("quantity") or 1))
        res = supabase.table("store_products").select("id,name,sku,price_cents").eq("id", pid).limit(1).execute()
        if not res.data:
            raise HTTPException(404, f"Product not found: {pid}")
        p = res.data[0]
        lines.append({"product_id": pid, "name": p.get("name"), "sku": p.get("sku"),
                      "qty": qty, "price_cents": p.get("price_cents")})
        subtotal += int(p.get("price_cents") or 0) * qty
    quote = supabase.table("store_quotes").insert({
        "quote_number": _number("QT"),
        "user_id": uid,
        "status": "pending",
        "items": lines,
        "subtotal_cents": subtotal,
        "tax_cents": 0,
        "total_cents": subtotal,
        "currency": "usd",
        "customer_name": body.customer_name or user.get("username") or "",
        "customer_email": body.customer_email or _user_email(user),
        "notes": body.notes or "",
        "valid_until": (datetime.now(timezone.utc) + timedelta(days=14)).isoformat(),
    }).execute()
    q = quote.data[0]
    return {**q, "total": (q.get("total_cents") or 0) / 100}


@router.get("/quotes")
async def my_quotes(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    res = (supabase.table("store_quotes")
           .select("*")
           .eq("user_id", uid)
           .order("created_at", desc=True)
           .limit(100)
           .execute())
    return [{**q, "total": (q.get("total_cents") or 0) / 100} for q in res.data or []]


# ── Stripe webhook for product orders ──────────────────────────────────────────
@router.post("/stripe/webhook")
async def product_order_webhook(request: Request):
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(503, "Stripe webhook secret is not configured")
    payload = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    try:
        event = _stripe_module().Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET).to_dict()
    except Exception as exc:
        raise HTTPException(400, f"Webhook signature verification failed: {exc}")

    if event.get("type") == "checkout.session.completed":
        session = event.get("data", {}).get("object", {})
        meta = session.get("metadata") or {}
        if meta.get("kind") == "product_order" and meta.get("order_id"):
            order_id = meta["order_id"]
            await asyncio.to_thread(_mark_order_paid, order_id, session.get("payment_intent"),
                                    paid_amount_cents=int(session.get("amount_total") or 0))
    elif event.get("type") == "payment_intent.succeeded":
        pi = event.get("data", {}).get("object", {})
        res = supabase.table("store_orders").select("id").eq("payment_intent_id", pi.get("id")).limit(1).execute()
        if res.data:
            charges = (pi.get("charges") or {}).get("data") or []
            outcome = (charges[0].get("outcome") or {}) if charges else {}
            pm = (charges[0].get("payment_method_details") or {}).get("type") if charges else None
            await asyncio.to_thread(_mark_order_paid, res.data[0]["id"], pi.get("id"),
                                    payment_method=pm,
                                    risk_level=outcome.get("risk_level"),
                                    risk_score=outcome.get("risk_score"),
                                    paid_amount_cents=int(pi.get("amount") or 0))

    return {"received": True}


def _mark_order_paid(order_id: str, payment_intent_id: str | None,
                     payment_method: str | None = None,
                     risk_level: str | None = None,
                     risk_score: int | None = None,
                     paid_amount_cents: int | None = None) -> None:
    """Fulfil a paid order. Pure synchronous work (many Supabase round-trips) —
    callers should run it via ``asyncio.to_thread`` so webhook handlers don't
    block the event loop on DB I/O."""
    now = _now()
    try:
        res = supabase.table("store_orders").select(
            "id,status,total_cents,subtotal_cents,discount_cents,tax_cents,currency,user_id,order_number,customer_name,customer_email,billing_address,coupon_id"
        ).eq("id", order_id).limit(1).execute()
    except APIError:
        return
    if not res.data:
        return
    order = res.data[0]
    if order.get("status") == "paid":
        return
    # Amount reconciliation: never fulfil an order for materially less than it
    # recorded. With allow_promotion_codes disabled the charged amount should
    # equal total_cents; a small (±5¢) tolerance absorbs per-unit price rounding
    # on multi-quantity coupon orders, while a genuine undercharge (price bug or
    # attacker-influenced charge) is still caught.
    if paid_amount_cents is not None and abs(int(paid_amount_cents) - int(order.get("total_cents") or 0)) > 5:
        log.warning("order %s paid amount mismatch: charged=%s recorded=%s — NOT fulfilling",
                    order.get("order_number"), paid_amount_cents, order.get("total_cents"))
        try:
            supabase.table("store_order_events").insert({
                "order_id": order_id, "status": "paid",
                "note": f"Payment amount mismatch (charged {paid_amount_cents} vs recorded {order.get('total_cents')}) — held for review",
                "actor": "webhook",
            }).execute()
        except Exception:
            pass
        return
    patch: dict = {
        "status": "paid", "paid_at": now, "payment_intent_id": payment_intent_id,
        "updated_at": now,
    }
    if payment_method:
        patch["payment_method"] = payment_method
    if risk_level:
        patch["radar_risk_level"] = risk_level
    if risk_score is not None:
        patch["radar_risk_score"] = risk_score
    # Atomic claim: checkout.session.completed AND payment_intent.succeeded both
    # fire, so this must be idempotent. Only the caller that flips pending->paid
    # proceeds with downloads/inventory/transactions; the loser returns early.
    claimed = supabase.table("store_orders").update(patch).eq("id", order_id).neq("status", "paid").execute()
    if not claimed.data:
        log.info("order %s already paid (concurrent webhook) — skipping fulfilment", order_id)
        return

    # Status timeline
    try:
        supabase.table("store_order_events").insert({
            "order_id": order_id, "status": "paid", "note": "Payment received", "actor": "webhook",
        }).execute()
    except Exception:
        pass

    # Decrement inventory (product or variant) + create digital downloads
    items = (supabase.table("store_order_items")
             .select("id,product_id,variant_id,variant_name,product_name,quantity").eq("order_id", order_id).execute()).data or []
    product_ids = [it["product_id"] for it in items if it.get("product_id")]
    prods: dict[str, dict] = {}
    if product_ids:
        pres = (supabase.table("store_products")
                .select("id,type,track_inventory,stock_qty,digital_file_url,download_limit")
                .in_("id", product_ids).execute()).data or []
        prods = {p["id"]: p for p in pres}
    variant_ids = [it["variant_id"] for it in items if it.get("variant_id")]
    variants: dict[str, dict] = {}
    if variant_ids:
        vres = (supabase.table("store_product_variants")
                .select("id,product_id,track_inventory,stock_qty")
                .in_("id", variant_ids).execute()).data or []
        variants = {v["id"]: v for v in vres}
    for it in items:
        qty = int(it.get("quantity") or 1)
        pid = it.get("product_id")
        vid = it.get("variant_id")
        if vid and vid in variants:
            v = variants[vid]
            if v.get("track_inventory", True):
                consume_stock(pid, vid, qty, actor="webhook", ref_type="order", ref_id=order_id,
                              note=f"Sale of {it.get('variant_name') or it.get('product_name')}")
        elif pid:
            prod = prods.get(pid)
            if prod and prod.get("track_inventory", True):
                consume_stock(pid, None, qty, actor="webhook", ref_type="order", ref_id=order_id,
                              note=f"Sale of {it.get('product_name')}")
        if pid and prods.get(pid) and prods[pid].get("type") == "digital" and prods[pid].get("digital_file_url"):
            try:
                supabase.table("store_downloads").insert({
                    "order_id": order_id,
                    "order_item_id": it.get("id"),
                    "product_id": pid,
                    "product_name": it.get("product_name") or prods[pid].get("name") or "Digital item",
                    "token": _download_token(),
                    "file_url": prods[pid].get("digital_file_url"),
                    "filename": _download_filename(prods[pid].get("digital_file_url")),
                    "downloads_allowed": int(prods[pid].get("download_limit") or 5),
                }).execute()
            except Exception as exc:
                log.warning("digital download insert failed for %s: %s", pid, exc)

    # Increment coupon usage — atomic RPC respects max_uses (read-then-write
    # here let concurrent orders overshoot the limit).
    if order.get("coupon_id"):
        try:
            supabase.rpc("increment_coupon_usage", {"p_coupon_id": order["coupon_id"]}).execute()
        except Exception as exc:
            log.warning("coupon usage increment failed: %s", exc)

    # Record transaction (idempotency: the atomic status flip above guarantees
    # this runs once; the payment-intent guard is belt-and-suspenders).
    tx: dict = {
        "order_id": order_id,
        "user_id": order.get("user_id"),
        "kind": "sale",
        "amount_cents": int(order.get("total_cents") or 0),
        "currency": order.get("currency") or "usd",
        "stripe_payment_intent_id": payment_intent_id,
    }
    if payment_method:
        tx["payment_method"] = payment_method
    if risk_level:
        tx["risk_level"] = risk_level
    if risk_score is not None:
        tx["risk_score"] = risk_score
    try:
        supabase.table("store_transactions").insert(tx).execute()
    except Exception as exc:
        log.warning("transaction insert failed (possible duplicate): %s", exc)

    # Auto-create invoice for paid order
    existing = supabase.table("store_invoices").select("id").eq("order_id", order_id).limit(1).execute()
    if not existing.data:
        supabase.table("store_invoices").insert({
            "invoice_number": _number("INV"),
            "order_id": order_id,
            "user_id": order.get("user_id"),
            "status": "paid",
            "subtotal_cents": int(order.get("subtotal_cents") or 0),
            "discount_cents": int(order.get("discount_cents") or 0),
            "tax_cents": int(order.get("tax_cents") or 0),
            "total_cents": int(order.get("total_cents") or 0),
            "currency": order.get("currency") or "usd",
            "customer_name": order.get("customer_name"),
            "customer_email": order.get("customer_email"),
            "billing_address": order.get("billing_address") or {},
            "paid_at": now,
        }).execute()
    log.info("product order %s marked paid", order.get("order_number"))
