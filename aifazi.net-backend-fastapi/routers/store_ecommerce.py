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
  GET    /api/store/orders               — caller's orders (with items)
  GET    /api/store/orders/{order_no}    — order detail
  GET    /api/store/invoices             — caller's invoices
  GET    /api/store/invoices/{no}        — invoice detail
  POST   /api/store/quotes               — request a quote
  GET    /api/store/quotes               — caller's quotes
  POST   /api/store/stripe/webhook       — checkout.session.completed for product orders
"""
from __future__ import annotations

import os
import logging
import random
import string
from datetime import datetime, timedelta, timezone

import stripe as _stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from postgrest.exceptions import APIError

from database import supabase
from dependencies import get_current_user

log = logging.getLogger("store.ecommerce")
router = APIRouter()

STRIPE_SECRET_KEY   = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
FRONTEND_URL        = os.getenv("FRONTEND_URL", "https://aifazi.net")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stripe_client():
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Stripe is not configured. Set STRIPE_SECRET_KEY.")
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
    """Human-friendly sequential-ish number e.g. AFA-102934."""
    n = random.randint(100000, 999999)
    return f"{prefix}-{n}"


def _product_payload(row: dict) -> dict:
    return {
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
    }


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
    return [_product_payload(r) for r in rows]


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
    return _product_payload(p)


# ── Cart ───────────────────────────────────────────────────────────────────────
@router.get("/cart")
async def get_cart(user: dict = Depends(get_current_user)):
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
        price = int(prod.get("price_cents") or 0)
        items.append({
            "id": r.get("id"),
            "product": _product_payload(dict(prod)),
            "quantity": qty,
            "line_total_cents": price * qty,
            "line_total": (price * qty) / 100,
        })
        subtotal += price * qty
    return {"items": items, "subtotal_cents": subtotal, "subtotal": subtotal / 100, "count": sum(i["quantity"] for i in items)}


class CartItemBody(BaseModel):
    product_id: str
    quantity: int = 1


@router.post("/cart")
async def add_to_cart(body: CartItemBody, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    if body.quantity < 1:
        raise HTTPException(400, "Quantity must be at least 1")
    prod = supabase.table("store_products").select("id,active,track_inventory,stock_qty").eq("id", body.product_id).limit(1).execute()
    if not prod.data:
        raise HTTPException(404, "Product not found")
    p = prod.data[0]
    if not p.get("active", True):
        raise HTTPException(404, "Product not found")
    existing = (supabase.table("store_cart_items")
                .select("id,quantity").eq("user_id", uid).eq("product_id", body.product_id).limit(1).execute())
    if existing.data:
        new_qty = int(existing.data[0].get("quantity") or 1) + body.quantity
        supabase.table("store_cart_items").update({"quantity": new_qty, "updated_at": _now()}).eq("id", existing.data[0]["id"]).execute()
    else:
        supabase.table("store_cart_items").insert({
            "user_id": uid, "product_id": body.product_id, "quantity": body.quantity,
        }).execute()
    return await get_cart(user)


class CartPatchBody(BaseModel):
    quantity: int


@router.patch("/cart/{item_id}")
async def update_cart_item(item_id: str, body: CartPatchBody, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    if body.quantity < 1:
        raise HTTPException(400, "Quantity must be at least 1")
    res = (supabase.table("store_cart_items")
           .select("id,product_id").eq("id", item_id).eq("user_id", uid).limit(1).execute())
    if not res.data:
        raise HTTPException(404, "Cart item not found")
    prod = supabase.table("store_products").select("id,track_inventory,stock_qty").eq("id", res.data[0]["product_id"]).limit(1).execute()
    p = (prod.data or [{}])[0]
    if p.get("track_inventory", True) and body.quantity > int(p.get("stock_qty") or 0):
        raise HTTPException(400, f"Only {p.get('stock_qty')} in stock")
    supabase.table("store_cart_items").update({"quantity": body.quantity, "updated_at": _now()}).eq("id", item_id).execute()
    return await get_cart(user)


@router.delete("/cart/{item_id}")
async def remove_cart_item(item_id: str, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    res = (supabase.table("store_cart_items")
           .select("id").eq("id", item_id).eq("user_id", uid).limit(1).execute())
    if not res.data:
        raise HTTPException(404, "Cart item not found")
    supabase.table("store_cart_items").delete().eq("id", item_id).execute()
    return {"ok": True}


@router.post("/cart/clear")
async def clear_cart(user: dict = Depends(get_current_user)):
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


@router.post("/checkout/cart")
async def create_checkout(body: CheckoutBody, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    cart = await get_cart(user)
    if cart["count"] == 0:
        raise HTTPException(400, "Cart is empty")
    st = _stripe_client()

    # Validate stock + build line items
    line_items = []
    for item in cart["items"]:
        prod = item["product"]
        if prod["track_inventory"] and item["quantity"] > prod["stock_qty"]:
            raise HTTPException(400, f"Only {prod['stock_qty']} of {prod['name']} in stock")
        # Idempotent Stripe price for one-time payment
        price_id = _ensure_one_time_price(prod)
        line_items.append({"price": price_id, "quantity": item["quantity"]})

    email = body.customer_email or _user_email(user)
    order_no = _number("AFA")

    # Create order row first (pending)
    total = cart["subtotal_cents"]
    order = supabase.table("store_orders").insert({
        "order_number": order_no,
        "user_id": uid,
        "status": "pending",
        "subtotal_cents": cart["subtotal_cents"],
        "discount_cents": 0,
        "tax_cents": 0,
        "shipping_cents": 0,
        "total_cents": total,
        "currency": "usd",
        "customer_name": body.customer_name or user.get("username") or "",
        "customer_email": email,
        "shipping_address": body.shipping_address or {},
        "billing_address": body.billing_address or {},
        "notes": body.notes or "",
    }).execute()
    order_row = order.data[0] if order.data else {"id": None, "order_number": order_no}

    for item in cart["items"]:
        prod = item["product"]
        qty = item["quantity"]
        supabase.table("store_order_items").insert({
            "order_id": order_row["id"],
            "product_id": prod["id"],
            "product_name": prod["name"],
            "product_sku": prod["sku"],
            "unit_price_cents": prod["price_cents"],
            "quantity": qty,
            "line_total_cents": prod["price_cents"] * qty,
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
            allow_promotion_codes=True,
        )
    except Exception as exc:
        log.error("product checkout create failed: %s", exc)
        supabase.table("store_orders").update({"status": "cancelled"}).eq("id", order_row["id"]).execute()
        raise HTTPException(502, f"Stripe checkout failed: {exc}")

    supabase.table("store_orders").update({"payment_intent_id": session.get("payment_intent")}).eq("id", order_row["id"]).execute()
    return {"url": session.url, "session_id": session.id, "order_number": order_row["order_number"]}


def _ensure_one_time_price(product: dict) -> str:
    """Idempotently create/lookup a one-time Stripe Price for a product."""
    lookup = f"aifazi-prod-{product['slug']}"
    existing = _stripe_client().Price.list(lookup_keys=[lookup], limit=1)
    if existing.data:
        return existing.data[0].id
    prod_id = product.get("id")
    # Product lookup by metadata
    prod_list = _stripe_client().Product.list(limit=100)
    stripe_prod = None
    for candidate in prod_list.data:
        if candidate.get("metadata", {}).get("store_product_id") == prod_id:
            stripe_prod = candidate
            break
    if not stripe_prod:
        stripe_prod = _stripe_client().Product.create(
            name=product.get("name") or product.get("slug"),
            metadata={"store_product_id": prod_id, "store_slug": product["slug"]},
        )
    price = _stripe_client().Price.create(
        currency="usd",
        unit_amount=int(product.get("price_cents") or 0),
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
    out = []
    for o in res.data or []:
        items = (supabase.table("store_order_items")
                 .select("product_name,product_sku,unit_price_cents,quantity,line_total_cents")
                 .eq("order_id", o["id"]).order("created_at").execute())
        out.append({
            **o,
            "items": items.data or [],
            "total": (o.get("total_cents") or 0) / 100,
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
    return {**o, "items": items.data or [], "total": (o.get("total_cents") or 0) / 100}


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
        event = _stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET).to_dict()
    except Exception as exc:
        raise HTTPException(400, f"Webhook signature verification failed: {exc}")

    if event.get("type") == "checkout.session.completed":
        session = event.get("data", {}).get("object", {})
        meta = session.get("metadata") or {}
        if meta.get("kind") == "product_order" and meta.get("order_id"):
            order_id = meta["order_id"]
            await _mark_order_paid(order_id, session.get("payment_intent"))
    elif event.get("type") == "payment_intent.succeeded":
        pi = event.get("data", {}).get("object", {})
        res = supabase.table("store_orders").select("id").eq("payment_intent_id", pi.get("id")).limit(1).execute()
        if res.data:
            await _mark_order_paid(res.data[0]["id"], pi.get("id"))

    return {"received": True}


async def _mark_order_paid(order_id: str, payment_intent_id: str | None) -> None:
    now = _now()
    try:
        res = supabase.table("store_orders").select(
            "id,status,total_cents,subtotal_cents,discount_cents,tax_cents,currency,user_id,order_number,customer_name,customer_email,billing_address"
        ).eq("id", order_id).limit(1).execute()
    except APIError:
        return
    if not res.data:
        return
    order = res.data[0]
    if order.get("status") == "paid":
        return
    supabase.table("store_orders").update({
        "status": "paid", "paid_at": now, "payment_intent_id": payment_intent_id,
        "updated_at": now,
    }).eq("id", order_id).execute()

    # Decrement inventory
    items = (supabase.table("store_order_items")
             .select("product_id,quantity").eq("order_id", order_id).execute()).data or []
    for it in items:
        if not it.get("product_id"):
            continue
        prod = supabase.table("store_products").select("id,track_inventory,stock_qty").eq("id", it["product_id"]).limit(1).execute()
        if prod.data and prod.data[0].get("track_inventory", True):
            new_stock = max(0, int(prod.data[0].get("stock_qty") or 0) - int(it.get("quantity") or 1))
            supabase.table("store_products").update({"stock_qty": new_stock, "updated_at": now}).eq("id", it["product_id"]).execute()

    # Record transaction
    supabase.table("store_transactions").insert({
        "order_id": order_id,
        "user_id": order.get("user_id"),
        "kind": "sale",
        "amount_cents": int(order.get("total_cents") or 0),
        "currency": order.get("currency") or "usd",
        "stripe_payment_intent_id": payment_intent_id,
    }).execute()

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
