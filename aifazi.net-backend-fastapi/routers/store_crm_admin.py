from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from database import safe_search_term, supabase
from permissions import has_permission, require_any_permission
from routers.store_inventory import restock
from utils.audit import record as _audit

log = logging.getLogger("store.crm")
router = APIRouter()

CUSTOMERS = require_any_permission("store", "store.customers", action="view")
CUSTOMERS_MANAGE = require_any_permission("store", "store.customers", action="manage")
CUSTOMERS_EDIT = require_any_permission("store", "store.customers", action="edit")
CUSTOMERS_DEL = require_any_permission("store", "store.customers", action="delete")
PAYMENTS = require_any_permission("store", "store.payments", action="view")
REVIEWS_VIEW = require_any_permission("store", "store.reviews", action="view")
REVIEWS_MOD = require_any_permission("store", "store.reviews", action="edit")
REVIEWS_DEL = require_any_permission("store", "store.reviews", action="delete")
# Refunds are a destructive financial write — never gate them behind a read-only
# "view" permission. Only explicit manage-level access may reverse a payment.
REFUND = require_any_permission("store", "store.payments", action="manage")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _actor(staff: dict) -> str:
    return str(staff.get("username") or staff.get("id") or "staff")


def _ip(request: Request | None) -> str:
    try:
        return request.client.host if request and request.client else ""
    except Exception:
        return ""


# Customers / CRM -----------------------------------------------------------
@router.get("/customers")
async def list_customers(search: str = "", limit: int = 100, _: dict = Depends(CUSTOMERS)):
    q = supabase.table("users").select(
        "id,username,email,role,created_at,last_seen,profile_avatar,email_verified,banned")
    if search.strip():
        # Cap search length — safe_search_term sanitizes, this bounds the OR clause.
        s = safe_search_term(search[:64])
        if s:
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
async def customer_detail(user_id: str, staff: dict = Depends(CUSTOMERS)):
    # Explicit allowlist — never select("*"): the users row holds password_hash,
    # refresh_token and totp_secret. list_customers uses the same safe columns.
    res = supabase.table("users").select(
        "id,username,email,role,created_at,last_seen,profile_avatar,profile_bio,email_verified,banned"
    ).eq("id", user_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Customer not found")
    u = res.data[0]

    # Sub-query allowlists: names/emails/dates/amounts only. No id-doc blobs,
    # no Stripe PI secrets, no full addresses at view level.
    orders = (supabase.table("store_orders").select(
                "id,order_number,user_id,status,subtotal_cents,discount_cents,tax_cents,total_cents,currency,created_at,updated_at")
              .eq("user_id", user_id).order("created_at", desc=True).limit(100).execute()).data or []
    for o in orders:
        items = (supabase.table("store_order_items")
                 .select("product_name,variant_name,product_sku,unit_price_cents,quantity,line_total_cents")
                 .eq("order_id", o["id"]).order("created_at").execute()).data or []
        o["items"] = items
        o["total"] = (o.get("total_cents") or 0) / 100

    subs = (supabase.table("user_subscriptions").select(
                "id,plan_slug,plan_name,status,current_period_end,cancel_at_period_end,created_at,updated_at")
            .eq("user_id", user_id).order("updated_at", desc=True).limit(50).execute()).data or []
    notes = (supabase.table("store_customer_notes").select(
                "id,user_id,staff_name,body,created_at")
             .eq("user_id", user_id).order("created_at", desc=True).limit(100).execute()).data or []
    # docs (id-doc blobs/URLs) + txns (Stripe secrets) stay behind manage-level
    # access — view-only staff get orders/subs/notes only.
    can_manage = has_permission(staff, "store", "manage") or has_permission(staff, "store.customers", "manage")
    docs = (supabase.table("user_documents").select(
                "id,doc_type,status,created_at,updated_at")
            .eq("user_id", user_id).order("created_at", desc=True).limit(50).execute()).data or [] if can_manage else []
    txns = (supabase.table("store_transactions").select(
                "id,order_id,kind,amount_cents,currency,created_at")
            .eq("user_id", user_id).order("created_at", desc=True).limit(100).execute()).data or [] if can_manage else []

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
 


class RefundBody(BaseModel):
    amount_cents: int | None = Field(None, ge=1, description="Partial refund amount in cents. If omitted, full refund.")


class CustomerNoteBody(BaseModel):
    body: str


@router.post("/customers/{user_id}/notes")
async def add_customer_note(user_id: str, body: CustomerNoteBody, request: Request, staff: dict = Depends(CUSTOMERS_EDIT)):
    if not body.body.strip():
        raise HTTPException(400, "Note cannot be empty")
    actor = staff.get("username") or staff.get("id") or "staff"
    res = supabase.table("store_customer_notes").insert({
        "user_id": user_id, "staff_id": staff.get("id"),
        "staff_name": actor, "body": body.body.strip(),
    }).execute()
    _audit(actor, "crm_note_add", target=f"customers:{user_id}", ip=_ip(request))
    return res.data[0] if res.data else {"id": None}


@router.delete("/customers/{user_id}/notes/{note_id}")
async def delete_customer_note(user_id: str, note_id: str, request: Request, staff: dict = Depends(CUSTOMERS_DEL)):
    res = supabase.table("store_customer_notes").delete().eq("id", note_id).eq("user_id", user_id).execute()
    if not res.data:
        raise HTTPException(404, "Note not found")
    _audit(_actor(staff), "crm_note_delete", target=f"customers:{user_id}",
           details={"note_id": note_id}, ip=_ip(request))
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
async def refund_order(order_id: str, body: RefundBody, request: Request, staff: dict = Depends(REFUND)):
    now = _now()
    # Atomic claim: only ONE concurrent refund proceeds. The conditional update
    # flips paid → refunded; a second caller (double-click / Stripe retry) claims
    # 0 rows and aborts, so inventory is restocked and the transaction/invoice
    # are written exactly once.
    claimed = supabase.table("store_orders").update({
        "status": "refunded", "updated_at": now,
    }).eq("id", order_id).eq("status", "paid").execute()
    if not claimed.data:
        existing = supabase.table("store_orders").select("id,status").eq("id", order_id).limit(1).execute()
        if not existing.data:
            raise HTTPException(404, "Order not found")
        if existing.data[0].get("status") != "paid":
            raise HTTPException(400, "Order is already refunded or not in a refundable state")
        raise HTTPException(409, "Refund already in progress")
    order = claimed.data[0]

    payment_intent_id = order.get("payment_intent_id") or order.get("stripe_payment_intent_id")

    # Partial-refund support: body.amount_cents (when set) must not exceed the
    # order total / remaining refundable amount. Full refund when omitted.
    total_cents = int(order.get("total_cents") or 0)
    refund_cents = total_cents
    if body.amount_cents is not None:
        if body.amount_cents <= 0 or body.amount_cents > total_cents:
            try:
                supabase.table("store_orders").update({"status": "paid", "updated_at": now}).eq("id", order_id).execute()
            except Exception:
                pass
            raise HTTPException(400, "Refund amount must be between 1 and the order total")
        refund_cents = int(body.amount_cents)

    # Reverse the payment at Stripe FIRST. Only if that succeeds (or there is
    # nothing to reverse) do we keep the local 'refunded' state — otherwise the
    # claim is reverted and the customer stays charged while the admin panel
    # would have claimed the order was refunded.
    if payment_intent_id:
        try:
            from routers.store import _stripe_client
            refund_kw: dict = {
                "payment_intent": payment_intent_id,
                "idempotency_key": f"refund_{order_id}",
            }
            if body.amount_cents is not None:
                refund_kw["amount"] = refund_cents
            _stripe_client().Refund.create(**refund_kw)
        except Exception as exc:
            try:
                supabase.table("store_orders").update({"status": "paid", "updated_at": now}).eq("id", order_id).execute()
            except Exception:
                pass
            raise HTTPException(502, f"Stripe refund failed: {exc}")

    # Record refund transaction
    supabase.table("store_transactions").insert({
        "order_id": order_id,
        "user_id": order.get("user_id"),
        "kind": "refund",
        "amount_cents": refund_cents,
        "currency": order.get("currency") or "usd",
        "stripe_payment_intent_id": payment_intent_id,
    }).execute()

    actor = staff.get("username") or staff.get("id") or "staff"
    try:
        supabase.table("store_order_events").insert({
            "order_id": order_id, "status": "refunded",
            "note": f"Order refunded by {actor}", "actor": actor,
        }).execute()
    except Exception:
        pass

    # Restock items (location-aware via the inventory helper)
    items = (supabase.table("store_order_items")
             .select("id,product_id,variant_id,product_name,quantity").eq("order_id", order_id).execute()).data or []
    for it in items:
        qty = int(it.get("quantity") or 1)
        restock(it.get("product_id"), it.get("variant_id"), qty, actor=actor,
                ref_type="order", ref_id=order_id,
                note=f"Restock on refund ({it.get('product_name')})")

    # Void any linked invoice
    supabase.table("store_invoices").update({"status": "void"}).eq("order_id", order_id).execute()
    _audit(actor, "crm_order_refund", target=f"orders:{order_id}",
           details={"refund_cents": refund_cents, "partial": body.amount_cents is not None}, ip=_ip(request))
    return {"ok": True, "status": "refunded", "refund_cents": refund_cents}


# Reviews / testimonials ----------------------------------------------------
@router.get("/reviews")
async def admin_reviews(status: str | None = None, _: dict = Depends(REVIEWS_VIEW)):
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
async def moderate_review(review_id: str, body: ReviewModerationBody, request: Request, staff: dict = Depends(REVIEWS_MOD)):
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
    _audit(_actor(staff), "crm_review_moderate", target=f"reviews:{review_id}",
           details={"status": body.status}, ip=_ip(request))
    return res.data[0]


@router.delete("/reviews/{review_id}")
async def delete_review(review_id: str, request: Request, staff: dict = Depends(REVIEWS_DEL)):
    res = supabase.table("store_reviews").delete().eq("id", review_id).execute()
    if not res.data:
        raise HTTPException(404, "Review not found")
    _audit(_actor(staff), "crm_review_delete", target=f"reviews:{review_id}", ip=_ip(request))
    return {"ok": True}


@router.get("/testimonials")
async def admin_testimonials(_: dict = Depends(REVIEWS_VIEW)):
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
async def create_testimonial(body: TestimonialBody, request: Request, staff: dict = Depends(REVIEWS_MOD)):
    if not body.content.strip():
        raise HTTPException(400, "Content is required")
    try:
        res = supabase.table("store_testimonials").insert(body.dict()).execute()
    except Exception as exc:
        log.warning("testimonial create failed: %s", exc)
        raise HTTPException(400, "Testimonial not created")
    _audit(_actor(staff), "crm_testimonial_create", target="testimonials", ip=_ip(request))
    return res.data[0] if res.data else {"id": None}


@router.patch("/testimonials/{tid}")
async def update_testimonial(tid: str, body: TestimonialBody, request: Request, staff: dict = Depends(REVIEWS_MOD)):
    res = supabase.table("store_testimonials").update({**body.dict(), "updated_at": _now()}).eq("id", tid).execute()
    if not res.data:
        raise HTTPException(404, "Testimonial not found")
    _audit(_actor(staff), "crm_testimonial_update", target=f"testimonials:{tid}", ip=_ip(request))
    return res.data[0]


@router.delete("/testimonials/{tid}")
async def delete_testimonial(tid: str, request: Request, staff: dict = Depends(REVIEWS_DEL)):
    res = supabase.table("store_testimonials").delete().eq("id", tid).execute()
    if not res.data:
        raise HTTPException(404, "Testimonial not found")
    _audit(_actor(staff), "crm_testimonial_delete", target=f"testimonials:{tid}", ip=_ip(request))
    return {"ok": True}
