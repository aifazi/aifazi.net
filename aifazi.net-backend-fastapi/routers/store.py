"""
routers/store.py — Stripe subscription store (plans, checkout, webhook, portal)
Mounted at /api/store in main.py. Lua sync endpoints are exposed via
/api/fivem/store/* (auth via X-FiveM-Token) so aifazi_status can apply in-game
perks automatically.

Public:
  GET  /api/store/categories          — active categories (scope filter)
  GET  /api/store/plans               — active plans w/ category + perks
Authenticated (JWT):
  POST /api/store/checkout            — create Stripe Checkout Session → {url}
  GET  /api/store/my-subscription     — caller's latest subscription + perks
  POST /api/store/portal              — Stripe Billing Portal session → {url}
  POST /api/store/cancel              — cancel at period end
Webhook (Stripe signature verified):
  POST /api/store/webhook             — checkout.session.completed (subscription OR
                                        product_order), payment_intent.succeeded,
                                        customer.subscription.created/updated/deleted,
                                        invoice.payment_failed
FiveM Lua bridge (X-FiveM-Token):
  GET  /api/fivem/store/subscriptions/pending-sync
  POST /api/fivem/store/subscriptions/mark-synced
"""
from __future__ import annotations

import os
import logging
import hmac
from datetime import datetime, timezone

import stripe as _stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from database import supabase
from dependencies import get_current_user
from routers.store_ecommerce import _mark_order_paid

log = logging.getLogger("store")
router = APIRouter()

STRIPE_SECRET_KEY   = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
FRONTEND_URL        = os.getenv("FRONTEND_URL", "https://aifazi.net")
FIVEM_SERVER_SECRET = os.getenv("FIVEM_SERVER_SECRET", "")

_ACTIVE_STATUSES = ("active", "trialing")


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


def _check_token(request: Request) -> None:
    secret = os.getenv("FIVEM_SERVER_SECRET", "")
    token  = request.headers.get("X-FiveM-Token", "")
    if not secret:
        raise HTTPException(503, "FiveM server token is not configured")
    if not token or not hmac.compare_digest(token, secret):
        raise HTTPException(403, "Invalid server token")


# ── Helpers ───────────────────────────────────────────────────────────────────
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
    }


def _build_plan_rows() -> list[dict]:
    """Plans joined with their category slug in one pass."""
    plans = (supabase.table("store_plans")
             .select("*,category_id,store_categories(slug)")
             .eq("active", True)
             .order("display_order")
             .execute())
    out = []
    for p in plans.data or []:
        p = dict(p)
        cats = p.get("store_categories")
        if isinstance(cats, dict):
            p["category_slug"] = cats.get("slug")
        elif isinstance(cats, list) and cats:
            p["category_slug"] = cats[0].get("slug")
        out.append(p)
    return out


def _categories() -> list[dict]:
    res = (supabase.table("store_categories")
           .select("*")
           .eq("active", True)
           .order("display_order")
           .execute())
    return [
        {
            "id": c["id"], "slug": c.get("slug"), "name": c.get("name"),
            "icon": c.get("icon", "🛒"), "description": c.get("description", ""),
            "scope": c.get("scope", "all"),
        }
        for c in (res.data or [])
    ]


def _ensure_stripe_price(plan: dict) -> str:
    """Idempotently create (or look up) the Stripe recurring Price for a plan."""
    if plan.get("stripe_price_id"):
        return plan["stripe_price_id"]
    st = _stripe_client()

    # Product (idempotent via lookup_key)
    product_id = plan.get("stripe_product_id")
    if not product_id:
        existing = st.Product.list(lookup_keys=[f"aifazi-{plan['slug']}"], limit=1)
        if existing.data:
            product = existing.data[0]
        else:
            product = st.Product.create(
                name=plan.get("name") or plan.get("slug"),
                description=plan.get("headline") or "",
                metadata={"plan_slug": plan["slug"], "level": str(plan.get("level", 1))},
                lookup_key=f"aifazi-{plan['slug']}",
            )
        product_id = product.id
        supabase.table("store_plans").update({"stripe_product_id": product_id}).eq("id", plan["id"]).execute()

    # Recurring price (idempotent via lookup_key)
    existing_price = st.Price.list(lookup_keys=[f"aifazi-{plan['slug']}-monthly"], limit=1)
    if existing_price.data:
        price = existing_price.data[0]
    else:
        price = st.Price.create(
            currency="usd",
            unit_amount=int(plan.get("price_cents") or 0),
            recurring={"interval": plan.get("interval") or "month"},
            product=product_id,
            metadata={"plan_slug": plan["slug"]},
            lookup_key=f"aifazi-{plan['slug']}-monthly",
        )
    supabase.table("store_plans").update({"stripe_price_id": price.id}).eq("id", plan["id"]).execute()
    return price.id


def _user_identifiers(user_id: str) -> list[str]:
    """Map a website user to FiveM identifiers via their Discord link + whitelist row."""
    ids: list[str] = []
    user = (supabase.table("users")
            .select("discord_id,steam_id,username,email")
            .eq("id", user_id).limit(1).execute())
    if not user.data:
        return ids
    u = user.data[0]
    discord_id = (u.get("discord_id") or "").strip()
    if discord_id:
        ids.append(f"discord:{discord_id}")
        wl = (supabase.table("fivem_whitelist")
              .select("steam_hex,fivem_license,fivem_id")
              .eq("discord_id", discord_id)
              .eq("status", "approved")
              .order("applied_at", desc=True)
              .limit(1).execute())
        if wl.data:
            w = wl.data[0]
            if w.get("fivem_license"): ids.append(str(w["fivem_license"]))
            if w.get("steam_hex"):     ids.append(str(w["steam_hex"]))
            if w.get("fivem_id"):      ids.append(str(w["fivem_id"]))
    return ids


# ── Public catalog ─────────────────────────────────────────────────────────────
@router.get("/categories")
async def get_categories(scope: str | None = None):
    cats = _categories()
    if scope:
        cats = [c for c in cats if c["scope"] in ("all", scope)]
    return cats


@router.get("/plans")
async def get_plans(category: str | None = None):
    rows = _build_plan_rows()
    if category:
        rows = [r for r in rows if (r.get("category_slug") or "") == category]
    return [_plan_payload(r) for r in rows]


# ── Authenticated ──────────────────────────────────────────────────────────────
class CheckoutBody(BaseModel):
    plan_slug: str
    success_url: str = ""
    cancel_url: str = ""


@router.post("/checkout")
async def create_checkout(body: CheckoutBody, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    plans = supabase.table("store_plans").select("*").eq("slug", body.plan_slug).limit(1).execute()
    if not plans.data:
        raise HTTPException(404, "Plan not found")
    plan = plans.data[0]
    if not plan.get("active", True):
        raise HTTPException(404, "Plan not found")
    try:
        price_id = _ensure_stripe_price(plan)
    except Exception as exc:
        log.error("checkout ensure-stripe-price failed: %s", exc)
        raise HTTPException(502, f"Stripe setup failed: {exc}")

    st = _stripe_client()
    email = user.get("email") or ""
    if not email:
        try:
            u = supabase.table("users").select("email").eq("id", uid).limit(1).execute()
            email = (u.data or [{}])[0].get("email") or ""
        except Exception:
            pass

    success_url = body.success_url or f"{FRONTEND_URL}/store/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url  = body.cancel_url  or f"{FRONTEND_URL}/store"

    try:
        session = st.checkout.Session.create(
            mode="subscription",
            client_reference_id=uid,
            customer_email=email or None,
            line_items=[{"price": price_id, "quantity": 1}],
            subscription_data={"metadata": {"user_id": uid, "plan_slug": plan["slug"]}},
            metadata={"user_id": uid, "plan_slug": plan["slug"]},
            success_url=success_url,
            cancel_url=cancel_url,
            allow_promotion_codes=True,
        )
    except Exception as exc:
        log.error("checkout create failed: %s", exc)
        raise HTTPException(502, f"Stripe checkout failed: {exc}")

    return {"url": session.url, "session_id": session.id}


@router.get("/my-subscription")
async def my_subscription(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    res = (supabase.table("user_subscriptions")
           .select("*,plan_id,store_plans(slug,name,level,price_cents)")
           .eq("user_id", uid)
           .order("created_at", desc=True)
           .limit(1).execute())
    if not res.data:
        return {"subscription": None, "identifiers": _user_identifiers(uid)}
    s = res.data[0]
    plan = s.get("store_plans")
    if isinstance(plan, list):
        plan = plan[0] if plan else None
    return {
        "subscription": {
            "id": s.get("id"),
            "status": s.get("status"),
            "plan": (plan or {}).get("slug"),
            "plan_name": s.get("plan_name") or (plan or {}).get("name"),
            "plan_level": s.get("plan_level") or (plan or {}).get("level"),
            "perks": s.get("perks") or {},
            "current_period_start": s.get("current_period_start"),
            "current_period_end": s.get("current_period_end"),
            "cancel_at_period_end": bool(s.get("cancel_at_period_end")),
            "created_at": s.get("created_at"),
        },
        "identifiers": _user_identifiers(uid),
    }


@router.post("/portal")
async def create_portal(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    res = (supabase.table("user_subscriptions")
           .select("stripe_customer_id")
           .eq("user_id", uid)
           .not_.is_("stripe_customer_id", "null")
           .order("created_at", desc=True).limit(1).execute())
    if not res.data or not res.data[0].get("stripe_customer_id"):
        raise HTTPException(404, "No active subscription with a Stripe customer")
    st = _stripe_client()
    try:
        portal = st.billing_portal.Session.create(
            customer=res.data[0]["stripe_customer_id"],
            return_url=f"{FRONTEND_URL}/store",
        )
    except Exception as exc:
        log.error("portal create failed: %s", exc)
        raise HTTPException(502, f"Stripe portal failed: {exc}")
    return {"url": portal.url}


@router.post("/cancel")
async def cancel_subscription(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    res = (supabase.table("user_subscriptions")
           .select("stripe_subscription_id,status")
           .eq("user_id", uid)
           .eq("status", "active")
           .order("created_at", desc=True).limit(1).execute())
    if not res.data or not res.data[0].get("stripe_subscription_id"):
        raise HTTPException(404, "No active subscription to cancel")
    st = _stripe_client()
    try:
        sub = st.subscriptions.update(res.data[0]["stripe_subscription_id"], cancel_at_period_end=True)
    except Exception as exc:
        log.error("cancel failed: %s", exc)
        raise HTTPException(502, f"Stripe cancel failed: {exc}")
    supabase.table("user_subscriptions").update({
        "cancel_at_period_end": True,
        "sync_status": "pending",
        "updated_at": _now(),
    }).eq("user_id", uid).eq("stripe_subscription_id", sub.id).execute()
    return {"cancel_at_period_end": True}


# ── Stripe webhook ─────────────────────────────────────────────────────────────
@router.post("/webhook")
async def stripe_webhook(request: Request):
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(503, "Stripe webhook secret is not configured")
    payload = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    try:
        event = _stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET).to_dict()
    except Exception as exc:
        raise HTTPException(400, f"Webhook signature verification failed: {exc}")

    event_type = event.get("type", "")
    data = event.get("data", {}).get("object", {})
    log.info("stripe webhook: %s (id=%s)", event_type, data.get("id"))

    if event_type == "checkout.session.completed":
        meta = data.get("metadata") or {}
        if meta.get("kind") == "product_order" and meta.get("order_id"):
            await _mark_order_paid(meta["order_id"], data.get("payment_intent"))
        else:
            await _handle_checkout_completed(data)
    elif event_type == "payment_intent.succeeded":
        pi_id = data.get("id")
        if pi_id:
            res = supabase.table("store_orders").select("id").eq("payment_intent_id", pi_id).limit(1).execute()
            if res.data:
                await _mark_order_paid(res.data[0]["id"], pi_id)
    elif event_type in ("customer.subscription.created", "customer.subscription.updated"):
        await _handle_subscription_upsert(data)
    elif event_type == "customer.subscription.deleted":
        await _handle_subscription_deleted(data)
    elif event_type == "invoice.payment_failed":
        await _handle_payment_failed(data)

    return {"received": True}


async def _plan_for_price(price_id: str) -> dict | None:
    if not price_id:
        return None
    res = supabase.table("store_plans").select("*").eq("stripe_price_id", price_id).limit(1).execute()
    return (res.data or [None])[0]


async def _subscription_payload(sub: dict) -> dict:
    """Normalise a Stripe subscription object into our row shape."""
    price_id = ""
    for item in sub.get("items", {}).get("data", []) or []:
        price_id = (item.get("price") or {}).get("id") or ""
        if price_id:
            break
    plan = await _plan_for_price(price_id)
    period = (sub.get("current_period") or {}).get("end") or sub.get("current_period_end")
    period_start = (sub.get("current_period") or {}).get("start") or sub.get("current_period_start")
    payload = {
        "plan_id": (plan or {}).get("id"),
        "plan_slug": (plan or {}).get("slug") if plan else None,
        "plan_name": (plan or {}).get("name") if plan else None,
        "plan_level": (plan or {}).get("level") if plan else None,
        "perks": (plan or {}).get("perks") or {},
        "status": sub.get("status") or "active",
        "current_period_start": datetime.fromtimestamp(period_start, tz=timezone.utc).isoformat() if period_start else None,
        "current_period_end": datetime.fromtimestamp(period, tz=timezone.utc).isoformat() if period else None,
        "cancel_at_period_end": bool(sub.get("cancel_at_period_end")),
        "sync_status": "pending",
        "sync_attempts": 0,
        "sync_error": None,
        "updated_at": _now(),
    }
    return payload


async def _upsert_subscription(sub: dict, user_id: str | None = None) -> None:
    sub_id = sub.get("id")
    if not sub_id:
        return
    customer = sub.get("customer")
    payload = await _subscription_payload(sub)
    existing = supabase.table("user_subscriptions").select("id").eq("stripe_subscription_id", sub_id).limit(1).execute()
    if existing.data:
        supabase.table("user_subscriptions").update({**payload, "stripe_customer_id": customer}).eq("id", existing.data[0]["id"]).execute()
        return
    if not user_id:
        return
    supabase.table("user_subscriptions").insert({
        **payload,
        "user_id": user_id,
        "stripe_customer_id": customer,
        "stripe_subscription_id": sub_id,
    }).execute()


async def _handle_checkout_completed(session: dict) -> None:
    sub_id = session.get("subscription")
    if not sub_id:
        return
    meta = session.get("metadata") or {}
    user_id = str(session.get("client_reference_id") or meta.get("user_id") or "")
    if not user_id:
        return
    # Fetch full subscription to get plan + period info.
    try:
        sub = _stripe_client().subscriptions.retrieve(sub_id).to_dict()
    except Exception:
        sub = {"id": sub_id, "customer": session.get("customer"),
               "status": "active", "items": {"data": []}}
    await _upsert_subscription(sub, user_id)


async def _handle_subscription_upsert(sub: dict) -> None:
    sub_id = sub.get("id")
    existing = supabase.table("user_subscriptions").select("user_id").eq("stripe_subscription_id", sub_id).limit(1).execute()
    if existing.data:
        await _upsert_subscription(sub, existing.data[0].get("user_id"))
    else:
        # No row yet — created outside checkout or missing metadata. Link via
        # customer email fallback to a matching website user.
        await _upsert_subscription(sub, None)


async def _handle_subscription_deleted(sub: dict) -> None:
    sub_id = sub.get("id")
    if not sub_id:
        return
    supabase.table("user_subscriptions").update({
        "status": "canceled",
        "cancel_at_period_end": True,
        "sync_status": "pending",
        "sync_attempts": 0,
        "sync_error": None,
        "updated_at": _now(),
    }).eq("stripe_subscription_id", sub_id).execute()


async def _handle_payment_failed(invoice: dict) -> None:
    sub_id = invoice.get("subscription")
    if not sub_id:
        return
    supabase.table("user_subscriptions").update({
        "status": "past_due",
        "sync_status": "pending",
        "sync_attempts": 0,
        "updated_at": _now(),
    }).eq("stripe_subscription_id", sub_id).execute()


# ── FiveM Lua bridge ───────────────────────────────────────────────────────────
@router.get("/subscriptions/pending-sync")
async def pending_subscription_sync(request: Request, limit: int = 25):
    _check_token(request)
    res = (supabase.table("user_subscriptions")
           .select("id,user_id,plan_slug,plan_name,plan_level,perks,status,current_period_end,cancel_at_period_end,created_at")
           .in_("sync_status", ["pending", "failed"])
           .order("updated_at", desc=False)
           .limit(limit)
           .execute())
    out = []
    for row in res.data or []:
        uid = row.get("user_id")
        out.append({
            "subscription_id": row.get("id"),
            "user_id": uid,
            "plan": {
                "slug": row.get("plan_slug"),
                "name": row.get("plan_name"),
                "level": int(row.get("plan_level") or 0),
                "perks": row.get("perks") or {},
            },
            "status": row.get("status"),
            "active": row.get("status") in _ACTIVE_STATUSES and row.get("cancel_at_period_end") is not True,
            "current_period_end": row.get("current_period_end"),
            "identifiers": _user_identifiers(uid) if uid else [],
        })
    return out


class SubscriptionSyncBody(BaseModel):
    subscription_id: str
    ok: bool
    note: str = ""


@router.post("/subscriptions/mark-synced")
async def mark_subscription_synced(body: SubscriptionSyncBody, request: Request):
    _check_token(request)
    current = supabase.table("user_subscriptions").select("sync_attempts").eq("id", body.subscription_id).limit(1).execute()
    attempts = int((current.data or [{}])[0].get("sync_attempts") or 0) + 1
    patch = {
        "sync_status": "synced" if body.ok else "failed",
        "sync_attempts": attempts,
        "sync_error": None if body.ok else (body.note or "unknown"),
        "updated_at": _now(),
    }
    res = supabase.table("user_subscriptions").update(patch).eq("id", body.subscription_id).execute()
    if not res.data:
        raise HTTPException(404, "Subscription not found")
    return {"ok": True, "subscription": res.data[0]}
