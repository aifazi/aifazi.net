"""
routers/store_crm_admin.py - Customers (CRM), payments/transactions/refunds,
and review/testimonial moderation. Mounted at /api/store/admin. Permission
gated per module (store.customers / store.payments / store.reviews).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import supabase
from permissions import require_any_permission
from routers.store_ledger import log_stock_change

log = logging.getLogger("store.crm")
router = APIRouter()

CUSTOMERS = require_any_permission("store", "store.customers", action="view")
PAYMENTS = require_any_permission("store", "store.payments", action="view")
REVIEWS = require_any_permission("store", "store.reviews", action="view")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# Customers / CRM -----------------------------------------------------------
@router.get("/customers")
async def list_customers(search: str = "", limit: int = 100, _: dict = Depends(CUSTOMERS)):
    q = supabase.table("users").select(
        "id,username,email,role,created_at,last_seen,profile_avatar,email_verified,banned")
    if search.strip():
        s = search.strip()
        q = q.or_(f"username.ilike.%{s}%,email.ilike.%{s}%")
    rows = q.limit(min(max(limit, 1), 500)).execute().data or []

    # Order aggregates
    uid_order: dict[str, list[dict]] = {}
    uids = [u["id"] for u in rows]
    if uids:
        orders = (supabase.table("store_orders")
                  .select("id,user_id,status,total_cents,created_at,order_number")
                  .in_("user_id", uids).execute().data or [])
        for o in orders:
            uid_order.setdefault(o.get("user_id"), []).append(o)

    out = []
    for u in rows:
        orders = uid_order.get(u["id"], [])
        paid = [o for o in orders if o.get("status") == "paid"]
        spent = sum(int(o.get("total_cents") or 0) for o in paid)
        out.append({
            "id": u.get("id"),
            "username": u.get("username"),
            "email": u.get("email"),
            "role": u.get("role"),
            "avatar": u.get("profile_avatar"),
            "created_at": u.get("created_at"),
            "last_seen": u.get("last_seen"),
            "email_verified": u.get("email_verified"),
            "banned": u.get("banned"),
            "orders_count": len(orders),
            "paid_orders_count": len(paid),
            "spent_cents": spent,
            "spent": spent / 100,
            "last_order_at": max((o.get("created_at") for o in orders), default=None),
        })
    return out


@router.get("/customers/{user_id}")
async def customer_detail(user_id: str, _: dict = Depends(CUSTOMERS)):
    res = supabase.table("users").select("*").eq("id", user_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Customer not found")
    u = res.data[0]

    orders = (supabase.table("store_orders").select("*")
              .eq("user_id", user_id).order("created_at", desc=True).limit(100).execute()).data or []
    for o in orders:
        items = (supabase.table("store_order_items")
                 .select("product_name,variant_name,product_sku,unit_price_cents,quantity,line_total_cents")
                 .eq("order_id", o["id"]).order("created_at").execute()).data or []
        o["items"] = items
        o["total"] = (o.get("total_cents") or 0) / 100

    subs = (supabase.table("user_subscriptions").select("*")
            .eq("user_id", user_id).order("updated_at", desc=True).limit(50).execute()).data or []
    docs = (supabase.table("user_documents").select("*")
            .eq("user_id", user_id).order("created_at", desc=True).limit(50).execute()).data or []
    notes = (supabase.table("store_customer_notes").select("*")
             .eq("user_id", user_id).order("created_at", desc=True).limit(100).execute()).data or []
    txns = (supabase.table("store_transactions").select("*")
            .eq("user_id", user_id).order("created_at", desc=True).limit(100).execute()).data or []

    spent = sum(int(o.get("total_cents") or 0) for o in orders if o.get("status") == "paid")
    return {
        "customer": u,
        "spent_cents": spent,
        "spent": spent / 100,
        "orders": orders,
        "subscriptions": subs,
        "documents": docs,
        "notes": notes,
        "transactions": txns,
    }


class CustomerNoteBody(BaseModel):
    body: str


@router.post("/customers/{user_id}/notes")
async def add_customer_note(user_id: str, body: CustomerNoteBody, staff: dict = Depends(CUSTOMERS)):
    if not body.body.strip():
        raise HTTPException(400, "Note cannot be empty")
    actor = staff.get("username") or staff.get("id") or "staff"
    res = supabase.table("store_customer_notes").insert({
        "user_id": user_id, "staff_id": staff.get("id"),
        "staff_name": actor, "body": body.body.strip(),
    }).execute()
    return res.data[0] if res.data else {"id": None}


@router.delete("/customers/{user_id}/notes/{note_id}")
async def delete_customer_note(user_id: str, note_id: str, _: dict = Depends(CUSTOMERS)):
    res = supabase.table("store_customer_notes").delete().eq("id", note_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(404, "Note not found")
    return {"ok": True}


# Payments / transactions ---------------------------------------------------
@router.get("/transactions")
async def list_transactions(kind: str | None = None, limit: int = 300, _: dict = Depends(PAYMENTS)):
    q = supabase.table("store_transactions").select("*").order("created_at", desc=True).limit(min(max(limit, 1), 1000))
    if kind:
        q = q.eq("kind", kind)
    rows = q.execute().data or []
    uids = sorted({r.get("user_id") for r in rows if r.get("user_id")})
    names: dict[str, str] = {}
    if uids:
        users = supabase.table("users").select("id,username,email").in_("id", uids).execute().data or []
        names = {u["id"]: f"{u.get('username') or ''} <{u.get('email') or ''}>".strip() for u in users}
    out = []
    for r in rows:
        out.append({
            "id": r.get("id"),
            "order_id": r.get("order_id"),
            "user_id": r.get("user_id"),
            "customer": names.get(r.get("user_id")) or "",
            "kind": r.get("kind"),
            "amount_cents": int(r.get("amount_cents") or 0),
            "amount": (r.get("amount_cents") or 0) / 100,
            "currency": r.get("currency"),
            "stripe_payment_intent_id": r.get("stripe_payment_intent_id"),
            "created_at": r.get("created_at"),
        })
    return out


@router.post("/orders/{order_id}/refund")
async def refund_order(order_id: str, staff: dict = Depends(PAYMENTS)):
    res = supabase.table("store_orders").select("*").eq("id", order_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Order not found")
    order = res.data[0]
    if order.get("status") != "paid":
        raise HTTPException(400, "Only paid orders can be refunded")
    if not order.get("payment_intent_id"):
        # Manual refund for non-Stripe paid orders still records the ledger entry
        pass

    # Record refund transaction
    supabase.table("store_transactions").insert({
        "order_id": order_id,
        "user_id": order.get("user_id"),
        "kind": "refund",
        "amount_cents": int(order.get("total_cents") or 0),
        "currency": order.get("currency") or "usd",
        "stripe_payment_intent_id": order.get("payment_intent_id"),
    }).execute()

    supabase.table("store_orders").update({
        "status": "refunded", "updated_at": _now(),
    }).eq("id", order_id).execute()

    actor = staff.get("username") or staff.get("id") or "staff"
    try:
        supabase.table("store_order_events").insert({
            "order_id": order_id, "status": "refunded",
            "note": f"Order refunded by {actor}", "actor": actor,
        }).execute()
    except Exception:
        pass

    # Restock items
    items = (supabase.table("store_order_items")
             .select("id,product_id,variant_id,product_name,quantity").eq("order_id", order_id).execute()).data or []
    for it in items:
        qty = int(it.get("quantity") or 1)
        if it.get("variant_id"):
            v = supabase.table("store_product_variants").select("stock_qty").eq("id", it["variant_id"]).limit(1).execute()
            if v.data:
                supabase.table("store_product_variants").update(
                    {"stock_qty": int((v.data[0] or {}).get("stock_qty") or 0) + qty, "updated_at": _now()}
                ).eq("id", it["variant_id"]).execute()
            log_stock_change(None, qty, reason="refund", ref_type="order", ref_id=order_id,
                             variant_id=it.get("variant_id"), actor=actor,
                             note=f"Restock on refund ({it.get('product_name')})")
        elif it.get("product_id"):
            p = supabase.table("store_products").select("track_inventory,stock_qty").eq("id", it["product_id"]).limit(1).execute()
            if p.data and (p.data[0] or {}).get("track_inventory", True):
                supabase.table("store_products").update(
                    {"stock_qty": int((p.data[0] or {}).get("stock_qty") or 0) + qty, "updated_at": _now()}
                ).eq("id", it["product_id"]).execute()
                log_stock_change(it["product_id"], qty, reason="refund", ref_type="order", ref_id=order_id,
                                 actor=actor, note=f"Restock on refund ({it.get('product_name')})")

    # Void any linked invoice
    supabase.table("store_invoices").update({"status": "void"}).eq("order_id", order_id).execute()
    return {"ok": True, "status": "refunded", "refund_cents": int(order.get("total_cents") or 0)}


# Reviews / testimonials ----------------------------------------------------
@router.get("/reviews")
async def admin_reviews(status: str | None = None, _: dict = Depends(REVIEWS)):
    q = supabase.table("store_reviews").select("*").order("created_at", desc=True).limit(500)
    if status:
        q = q.eq("status", status)
    rows = q.execute().data or []
    uids = sorted({r.get("user_id") for r in rows if r.get("user_id")})
    pids = sorted({r.get("product_id") for r in rows if r.get("product_id")})
    names: dict[str, str] = {}
    if uids:
        users = supabase.table("users").select("id,username,email").in_("id", uids).execute().data or []
        names = {u["id"]: u.get("username") or u.get("email") or "" for u in users}
    pnames: dict[str, str] = {}
    if pids:
        prods = supabase.table("store_products").select("id,name").in_("id", pids).execute().data or []
        pnames = {p["id"]: p.get("name") or "" for p in prods}
    out = []
    for r in rows:
        out.append({
            **r,
            "username": names.get(r.get("user_id")) or "",
            "product_name": pnames.get(r.get("product_id")) or "",
        })
    return out


class ReviewModerationBody(BaseModel):
    status: str
    title: str | None = None
    body: str | None = None
    rating: int | None = None


@router.patch("/reviews/{review_id}")
async def moderate_review(review_id: str, body: ReviewModerationBody, _: dict = Depends(REVIEWS)):
    if body.status not in ("pending", "approved", "rejected"):
        raise HTTPException(400, "Invalid status")
    patch: dict = {"status": body.status, "updated_at": _now()}
    if body.title is not None:
        patch["title"] = body.title
    if body.body is not None:
        patch["body"] = body.body
    if body.rating is not None:
        patch["rating"] = body.rating
    res = supabase.table("store_reviews").update(patch).eq("id", review_id).execute()
    if not res.data:
        raise HTTPException(404, "Review not found")
    return res.data[0]


@router.delete("/reviews/{review_id}")
async def delete_review(review_id: str, _: dict = Depends(REVIEWS)):
    res = supabase.table("store_reviews").delete().eq("id", review_id).execute()
    if not res.data:
        raise HTTPException(404, "Review not found")
    return {"ok": True}


@router.get("/testimonials")
async def admin_testimonials(_: dict = Depends(REVIEWS)):
    res = (supabase.table("store_testimonials").select("*")
           .order("display_order").order("created_at", desc=True).execute())
    return res.data or []


class TestimonialBody(BaseModel):
    author_name: str = ""
    role: str = ""
    content: str
    rating: int = 5
    status: str = "pending"
    display_order: int = 0


@router.post("/testimonials")
async def create_testimonial(body: TestimonialBody, _: dict = Depends(REVIEWS)):
    if not body.content.strip():
        raise HTTPException(400, "Content is required")
    try:
        res = supabase.table("store_testimonials").insert(body.dict()).execute()
    except Exception as exc:
        raise HTTPException(400, f"Testimonial not created: {exc}")
    return res.data[0] if res.data else {"id": None}


@router.patch("/testimonials/{tid}")
async def update_testimonial(tid: str, body: TestimonialBody, _: dict = Depends(REVIEWS)):
    res = supabase.table("store_testimonials").update({**body.dict(), "updated_at": _now()}).eq("id", tid).execute()
    if not res.data:
        raise HTTPException(404, "Testimonial not found")
    return res.data[0]


@router.delete("/testimonials/{tid}")
async def delete_testimonial(tid: str, _: dict = Depends(REVIEWS)):
    res = supabase.table("store_testimonials").delete().eq("id", tid).execute()
    if not res.data:
        raise HTTPException(404, "Testimonial not found")
    return {"ok": True}
