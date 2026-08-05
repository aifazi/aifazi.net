"""
routers/store_terminal_admin.py - Stripe Terminal (NFC phone-as-terminal) and
Radar risk management for in-person (POS) sales. Mounted at /api/store/admin.

Flow for an NFC tap sale:
  1. Staff scans items -> POST /terminal/orders  creates a pending store_order
     (payment_method='card_present', location_id set) + order items.
  2. POST /terminal/payment-intents creates a card_present PaymentIntent for
     that order and returns {client_secret, payment_intent_id}. The staff phone
     (Stripe Terminal SDK / Reader app) presents the intent to the NFC card.
  3. POST /terminal/capture/{order_id} captures the authorized intent and marks
     the order paid (inventory consumed via store_inventory helpers).
     Alternatively auto-capture can be requested at intent creation.

Radar risk (`risk_level`, `risk_score`) from the card-present charge is stored
on the order + transaction and surfaced in /terminal/payments.
"""
from __future__ import annotations

import logging
import os
import asyncio
import random
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import supabase
from permissions import require_any_permission
from routers.store_ecommerce import _mark_order_paid

log = logging.getLogger("store.terminal")
router = APIRouter()

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")

# Pay + manage in-person payments, or full store admins.
POS = require_any_permission("store", "store.payments", action="manage")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _number(prefix: str) -> str:
    return f"{prefix}-{random.randint(100000, 999999)}"


# Lazily import stripe so cold starts that never touch payments don't pay for it.
def _stripe():
    if not STRIPE_SECRET_KEY:
        raise HTTPException(503, "Stripe is not configured. Set STRIPE_SECRET_KEY.")
    import stripe
    stripe.api_key = STRIPE_SECRET_KEY
    return stripe


def _risk_from_intent(pi: dict) -> dict:
    """Pull Radar outcome off a PaymentIntent's charge (present for card_present)."""
    charges = (pi.get("charges") or {}).get("data") or []
    if charges:
        outcome = charges[0].get("outcome") or {}
        risk = outcome.get("risk_level")
        score = outcome.get("risk_score")
        if risk or score:
            return {"risk_level": risk, "risk_score": score}
    return {"risk_level": None, "risk_score": None}


def _stripe_error(exc: Exception, action: str) -> HTTPException:
    """Turn a Stripe exception into an actionable 400/502.

    The most common failure is Terminal not being enabled on the Stripe
    account, which Stripe reports as an InvalidRequestError / PermissionError
    mentioning Terminal. Surface that clearly so the dashboard can tell staff
    what to enable instead of a generic 502.
    """
    msg = getattr(exc, "user_message", None) or str(exc)
    low = msg.lower()
    if "terminal" in low and any(k in low for k in ("enabled", "not have", "permission", "not supported", "account")):
        raise HTTPException(
            400,
            f"Stripe Terminal is not enabled for this account — enable it at "
            f"https://dashboard.stripe.com/terminal (Settings → Terminal → Enable). "
            f"Details: {msg}",
        )
    raise HTTPException(502, f"Stripe {action} failed: {msg}")


# ── Terminal locations / readers (Stripe side) ──────────────────────────────
@router.get("/terminal/locations")
async def terminal_locations(_: dict = Depends(POS)):
    if not STRIPE_SECRET_KEY:
        return []
    try:
        return [loc.to_dict() for loc in _stripe().terminal.Location.list(limit=50)]
    except Exception as exc:
        raise _stripe_error(exc, "Terminal locations")


class TerminalLocationBody(BaseModel):
    display_name: str
    address: dict


@router.post("/terminal/locations")
async def create_terminal_location(body: TerminalLocationBody, _: dict = Depends(POS)):
    try:
        return _stripe().terminal.Location.create(
            display_name=body.display_name,
            address=body.address,
        ).to_dict()
    except Exception as exc:
        raise _stripe_error(exc, "Terminal location create")


@router.get("/terminal/readers")
async def terminal_readers(location: str | None = None, _: dict = Depends(POS)):
    if not STRIPE_SECRET_KEY:
        return []
    try:
        kw = {"limit": 50}
        if location:
            kw["location"] = location
        return [r.to_dict() for r in _stripe().terminal.Reader.list(**kw)]
    except Exception as exc:
        raise _stripe_error(exc, "Terminal readers")


class ReaderBody(BaseModel):
    label: str
    registration_code: str
    location: str | None = None


@router.post("/terminal/readers")
async def register_reader(body: ReaderBody, _: dict = Depends(POS)):
    try:
        kw = {"label": body.label, "registration_code": body.registration_code}
        if body.location:
            kw["location"] = body.location
        return _stripe().terminal.Reader.create(**kw).to_dict()
    except Exception as exc:
        raise _stripe_error(exc, "Terminal reader registration")


@router.post("/terminal/connection-token")
async def terminal_connection_token(_: dict = Depends(POS)):
    """Token that lets a phone (Stripe Terminal SDK / Reader app) act as the
    NFC terminal paired with this account."""
    try:
        tok = _stripe().terminal.ConnectionToken.create().to_dict()
        return {"secret": tok.get("secret"), "object": tok.get("object")}
    except Exception as exc:
        raise _stripe_error(exc, "Terminal connection token")


# ── In-person orders ────────────────────────────────────────────────────────
class PosItem(BaseModel):
    product_id: str
    variant_id: str | None = None
    quantity: int = 1
    unit_price_cents: int | None = None  # default: product/variant price


class PosOrderBody(BaseModel):
    items: list[PosItem]
    customer_name: str = ""
    customer_email: str = ""
    location_id: str | None = None  # store location; defaults to default location
    notes: str = ""
    coupon_code: str = ""


@router.post("/terminal/orders")
async def create_pos_order(body: PosOrderBody, _: dict = Depends(POS)):
    if not body.items:
        raise HTTPException(400, "Order must have at least one item")
    s = supabase
    # Resolve product + variant prices & names
    pids = [it.product_id for it in body.items]
    prod_rows = {}
    if pids:
        res = s.table("store_products").select("id,name,price_cents,active,type").in_("id", pids).execute()
        prod_rows = {p["id"]: p for p in res.data or []}
    vid_to_pid: dict[str, str] = {}
    variant_rows: dict[str, dict] = {}
    vids = [it.variant_id for it in body.items if it.variant_id]
    if vids:
        vres = s.table("store_product_variants").select("id,product_id,name,price_cents,active").in_("id", vids).execute()
        for v in vres.data or []:
            variant_rows[v["id"]] = v
            vid_to_pid[v["id"]] = v.get("product_id")

    # Validate + build line items
    lines = []
    subtotal = 0
    for it in body.items:
        if it.variant_id:
            v = variant_rows.get(it.variant_id)
            if not v or not v.get("active", True):
                raise HTTPException(404, f"Variant not found: {it.variant_id}")
            unit = it.unit_price_cents if it.unit_price_cents is not None else int(v.get("price_cents") or 0)
            lines.append({"product_id": v["product_id"], "variant_id": v["id"],
                          "product_name": v.get("name") or "",
                          "variant_name": v.get("name") or "",
                          "quantity": max(1, it.quantity),
                          "unit_price_cents": unit,
                          "line_total_cents": unit * max(1, it.quantity)})
        else:
            p = prod_rows.get(it.product_id)
            if not p or not p.get("active", True):
                raise HTTPException(404, f"Product not found: {it.product_id}")
            unit = it.unit_price_cents if it.unit_price_cents is not None else int(p.get("price_cents") or 0)
            lines.append({"product_id": p["id"], "variant_id": None,
                          "product_name": p.get("name") or "",
                          "variant_name": None,
                          "quantity": max(1, it.quantity),
                          "unit_price_cents": unit,
                          "line_total_cents": unit * max(1, it.quantity)})
    subtotal = sum(l["line_total_cents"] for l in lines)

    # Coupon
    discount = 0
    coupon_id = None
    if body.coupon_code.strip():
        c = _coupon_discount(body.coupon_code.strip(), subtotal, [l["product_id"] for l in lines])
        if c:
            discount = c["discount_cents"]
            coupon_id = c["id"]

    # Location
    from routers.store_inventory import default_location_id
    loc = body.location_id or default_location_id()

    now = _now()
    order_number = _number("POS")
    order = s.table("store_orders").insert({
        "order_number": order_number,
        "status": "pending",
        "kind": "pos",
        "user_id": None,
        "payment_method": "card_present",
        "location_id": loc,
        "subtotal_cents": subtotal,
        "discount_cents": discount,
        "tax_cents": 0,
        "total_cents": subtotal - discount,
        "currency": "usd",
        "customer_name": body.customer_name or "",
        "customer_email": body.customer_email or "",
        "notes": body.notes or "",
        "coupon_id": coupon_id,
        "created_at": now,
        "updated_at": now,
    }).execute()
    if not order.data:
        raise HTTPException(500, "Could not create POS order")
    order_id = order.data[0]["id"]

    for l in lines:
        s.table("store_order_items").insert({
            "order_id": order_id, "product_id": l["product_id"], "variant_id": l["variant_id"],
            "product_name": l["product_name"], "variant_name": l["variant_name"],
            "quantity": l["quantity"], "unit_price_cents": l["unit_price_cents"],
            "line_total_cents": l["line_total_cents"],
        }).execute()

    try:
        s.table("store_order_events").insert({
            "order_id": order_id, "status": "pending", "note": "POS order created (card present)", "actor": "staff",
        }).execute()
    except Exception:
        pass

    return {"order_id": order_id, "order_number": order_number,
            "subtotal_cents": subtotal, "discount_cents": discount,
            "total_cents": subtotal - discount, "currency": "usd", "location_id": loc}


def _coupon_discount(code: str, subtotal_cents: int, product_ids: list[str]) -> dict | None:
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
    if subtotal_cents < int(c.get("min_subtotal_cents") or 0):
        return None
    restricted = [p for p in (c.get("product_ids") or []) if p]
    if restricted and not all(pid in restricted for pid in product_ids):
        return None
    if (c.get("type") or "fixed") == "fixed":
        discount = min(int(c.get("value_cents") or 0), subtotal_cents)
    else:
        discount = round(subtotal_cents * int(c.get("value_percent") or 0) / 100)
    return {"id": c.get("id"), "discount_cents": min(discount, subtotal_cents)}


# ── PaymentIntent (card_present) ────────────────────────────────────────────
class PosPaymentBody(BaseModel):
    order_id: str
    capture_method: str = "manual"  # "manual" | "automatic"


@router.post("/terminal/payment-intents")
async def create_pos_payment_intent(body: PosPaymentBody, _: dict = Depends(POS)):
    res = supabase.table("store_orders").select("id,total_cents,currency,order_number,customer_email,status").eq("id", body.order_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Order not found")
    order = res.data[0]
    if order.get("status") in ("paid", "refunded"):
        raise HTTPException(400, f"Order already {order.get('status')}")
    amount = int(order.get("total_cents") or 0)
    if amount <= 0:
        raise HTTPException(400, "Order total must be greater than zero")
    try:
        pi = _stripe().PaymentIntent.create(
            amount=amount,
            currency=order.get("currency") or "usd",
            payment_method_types=["card_present"],
            capture_method=body.capture_method,
            description=f"POS {order.get('order_number')}",
            metadata={"kind": "pos", "order_id": body.order_id, "order_number": order.get("order_number") or ""},
        )
        pid = pi.get("id")
        supabase.table("store_orders").update({
            "payment_intent_id": pid, "updated_at": _now(),
        }).eq("id", body.order_id).execute()
        return {"payment_intent_id": pid, "client_secret": pi.get("client_secret"),
                "amount_cents": amount, "currency": order.get("currency") or "usd",
                "capture_method": body.capture_method}
    except Exception as exc:
        raise _stripe_error(exc, "PaymentIntent")


@router.get("/terminal/payment-intents/{order_id}")
async def get_pos_payment_intent(order_id: str, _: dict = Depends(POS)):
    res = supabase.table("store_orders").select("payment_intent_id").eq("id", order_id).limit(1).execute()
    pid = (res.data[0] or {}).get("payment_intent_id") if res.data else None
    if not pid:
        raise HTTPException(404, "No payment intent for this order")
    try:
        pi = _stripe().PaymentIntent.retrieve(pid).to_dict()
        return {"payment_intent_id": pid, "status": pi.get("status"),
                "client_secret": pi.get("client_secret"), "amount_cents": pi.get("amount"),
                "radar": _risk_from_intent(pi)}
    except Exception as exc:
        raise _stripe_error(exc, "PaymentIntent retrieve")


@router.post("/terminal/capture/{order_id}")
async def capture_pos_order(order_id: str, _: dict = Depends(POS)):
    res = supabase.table("store_orders").select("id,payment_intent_id,status").eq("id", order_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Order not found")
    order = res.data[0]
    if order.get("status") == "paid":
        return {"ok": True, "already_paid": True}
    pid = order.get("payment_intent_id")
    if not pid:
        raise HTTPException(400, "No payment intent created for this order")
    try:
        pi = _stripe().PaymentIntent.retrieve(pid).to_dict()
    except Exception as exc:
        raise _stripe_error(exc, "PaymentIntent retrieve")
    if pi.get("status") == "requires_capture":
        try:
            pi = _stripe().PaymentIntent.capture(pid).to_dict()
        except Exception as exc:
            raise _stripe_error(exc, "PaymentIntent capture")
    risk = _risk_from_intent(pi)
    if pi.get("status") in ("succeeded", "requires_capture"):
        await asyncio.to_thread(_mark_order_paid, order_id, pid, **risk)
        return {"ok": True, "payment_intent_id": pid, "status": "paid",
                "radar": risk.get("risk_level"), "risk_score": risk.get("risk_score")}
    raise HTTPException(400, f"Payment not ready to capture (status={pi.get('status')})")


@router.post("/terminal/void/{order_id}")
async def void_pos_order(order_id: str, _: dict = Depends(POS)):
    res = supabase.table("store_orders").select("id,payment_intent_id,status").eq("id", order_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Order not found")
    order = res.data[0]
    pid = order.get("payment_intent_id")
    if pid:
        try:
            pi = _stripe().PaymentIntent.retrieve(pid).to_dict()
            if pi.get("status") in ("requires_payment_method", "requires_confirmation", "requires_capture", "processing"):
                _stripe().PaymentIntent.cancel(pid)
        except Exception as exc:
            log.warning("cancel PI %s failed: %s", pid, exc)
    supabase.table("store_orders").update({"status": "cancelled", "updated_at": _now()}).eq("id", order_id).execute()
    return {"ok": True, "status": "cancelled"}


# ── POS payment history + Radar ─────────────────────────────────────────────
@router.get("/terminal/payments")
async def pos_payments(limit: int = 100, _: dict = Depends(POS)):
    rows = (supabase.table("store_transactions")
            .select("*")
            .eq("payment_method", "card_present")
            .order("created_at", desc=True)
            .limit(min(max(limit, 1), 500))
            .execute().data or [])
    out = []
    for t in rows:
        out.append({
            "id": t.get("id"),
            "order_id": t.get("order_id"),
            "kind": t.get("kind"),
            "amount_cents": int(t.get("amount_cents") or 0),
            "currency": t.get("currency") or "usd",
            "payment_method": t.get("payment_method") or "card_present",
            "risk_level": t.get("risk_level"),
            "risk_score": t.get("risk_score"),
            "stripe_payment_intent_id": t.get("stripe_payment_intent_id"),
            "created_at": t.get("created_at"),
        })
    return out


@router.get("/terminal/summary")
async def pos_summary(_: dict = Depends(POS)):
    rows = (supabase.table("store_transactions")
            .select("amount_cents,risk_level")
            .eq("payment_method", "card_present")
            .execute().data or [])
    total_cents = sum(int(r.get("amount_cents") or 0) for r in rows)
    flagged = sum(1 for r in rows if r.get("risk_level") in ("elevated", "highest"))
    return {
        "total_sales_cents": total_cents,
        "sale_count": len(rows),
        "flagged_count": flagged,
        "low": sum(1 for r in rows if r.get("risk_level") == "low"),
        "normal": sum(1 for r in rows if r.get("risk_level") == "normal"),
        "elevated": sum(1 for r in rows if r.get("risk_level") == "elevated"),
        "highest": sum(1 for r in rows if r.get("risk_level") == "highest"),
    }

