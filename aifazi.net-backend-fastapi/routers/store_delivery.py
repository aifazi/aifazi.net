"""
routers/store_delivery.py — Delivery agent management, assignments, scanning
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import supabase
from dependencies import get_current_user, require_staff

router = APIRouter()


def _user_id(user: dict) -> str:
    return user.get("id") or user.get("sub")


def _get_agent(user_id: str) -> dict | None:
    res = supabase.table("delivery_agents").select("*").eq("user_id", user_id).limit(1).execute()
    return res.data[0] if res.data else None


def _require_agent(user: dict) -> dict:
    agent = _get_agent(_user_id(user))
    if not agent:
        raise HTTPException(403, "You are not registered as a delivery agent. Contact an admin.")
    if agent["status"] == "offline":
        raise HTTPException(403, "Your agent account is offline.")
    return agent


# ── Models ─────────────────────────────────────────────────────────────────────
class AgentBody(BaseModel):
    user_id: str
    display_name: str = ""
    phone: str = ""
    vehicle: str = ""
    status: str = "available"
    current_area: str = ""


class AgentUpdateBody(BaseModel):
    display_name: str | None = None
    phone: str | None = None
    vehicle: str | None = None
    status: str | None = None
    current_area: str | None = None


class AssignBody(BaseModel):
    order_id: str
    agent_id: str
    notes: str = ""


class ScanBody(BaseModel):
    barcode: str
    scan_type: str = "pickup"
    location_lat: float | None = None
    location_lng: float | None = None
    note: str = ""


class StatusUpdateBody(BaseModel):
    status: str
    note: str = ""
    location_lat: float | None = None
    location_lng: float | None = None


# ── Admin: Agent CRUD ──────────────────────────────────────────────────────────
@router.get("/agents")
async def list_agents(status: str | None = None, _: dict = Depends(require_staff)):
    q = supabase.table("delivery_agents").select("id,user_id,display_name,phone,vehicle,status,current_area,created_at")
    if status:
        q = q.eq("status", status)
    res = q.order("created_at", desc=True).execute()
    agents = res.data or []
    user_ids = [a["user_id"] for a in agents if a.get("user_id")]
    profiles = {}
    if user_ids:
        p = supabase.table("users").select("id,username,avatar,role").in_("id", user_ids).execute()
        profiles = {u["id"]: u for u in (p.data or [])}
    return [{
        **a,
        "user": profiles.get(a.get("user_id"), {"username": "Unknown", "avatar": "", "role": "user"}),
        "active_assignments": None
    } for a in agents]


@router.post("/agents")
async def create_agent(body: AgentBody, _: dict = Depends(require_staff)):
    existing = supabase.table("delivery_agents").select("id").eq("user_id", body.user_id).limit(1).execute()
    if existing.data:
        raise HTTPException(409, "Agent already exists for this user")
    res = supabase.table("delivery_agents").insert({
        "user_id": body.user_id,
        "display_name": body.display_name,
        "phone": body.phone,
        "vehicle": body.vehicle,
        "status": body.status,
        "current_area": body.current_area,
    }).execute()
    return res.data[0]


@router.put("/agents/{agent_id}")
async def update_agent(agent_id: str, body: AgentUpdateBody, _: dict = Depends(require_staff)):
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not updates:
        raise HTTPException(400, "Nothing to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = supabase.table("delivery_agents").update(updates).eq("id", agent_id).execute()
    if not res.data:
        raise HTTPException(404, "Agent not found")
    return res.data[0]


@router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str, _: dict = Depends(require_staff)):
    supabase.table("delivery_agents").delete().eq("id", agent_id).execute()
    return {"message": "Deleted"}


# ── Agent Portal: My Profile ───────────────────────────────────────────────────
@router.get("/agents/me")
async def my_agent_profile(user: dict = Depends(get_current_user)):
    agent = _require_agent(user)
    return agent


@router.patch("/agents/me")
async def update_my_profile(body: AgentUpdateBody, user: dict = Depends(get_current_user)):
    agent = _require_agent(user)
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items() if k != "status"}
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        supabase.table("delivery_agents").update(updates).eq("id", agent["id"]).execute()
    return {"message": "Updated"}


@router.patch("/agents/me/status")
async def set_my_status(body: AgentUpdateBody, user: dict = Depends(get_current_user)):
    agent = _require_agent(user)
    if body.status and body.status in ("available", "busy", "offline"):
        supabase.table("delivery_agents").update({
            "status": body.status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", agent["id"]).execute()
    return {"message": "Status updated"}


# ── Admin: Assign Orders ──────────────────────────────────────────────────────
@router.post("/assign")
async def assign_order(body: AssignBody, _: dict = Depends(require_staff)):
    agent = supabase.table("delivery_agents").select("id,status,display_name").eq("id", body.agent_id).single().execute()
    if not agent.data:
        raise HTTPException(404, "Agent not found")
    if agent.data["status"] == "offline":
        raise HTTPException(400, "Agent is offline")

    order = supabase.table("store_orders").select("id,order_number,status").eq("id", body.order_id).single().execute()
    if not order.data:
        raise HTTPException(404, "Order not found")

    existing = supabase.table("delivery_assignments").select("id").eq("order_id", body.order_id).limit(1).execute()
    if existing.data:
        raise HTTPException(409, "Order already has an active assignment")

    now = datetime.now(timezone.utc).isoformat()
    res = supabase.table("delivery_assignments").insert({
        "order_id": body.order_id,
        "agent_id": body.agent_id,
        "status": "assigned",
        "notes": body.notes,
    }).execute()

    supabase.table("store_orders").update({
        "delivery_agent_id": body.agent_id,
        "delivery_status": "assigned",
    }).eq("id", body.order_id).execute()

    supabase.table("store_order_events").insert({
        "order_id": body.order_id,
        "status": "assigned",
        "note": f"Assigned to {agent.data['display_name']}",
        "created_at": now,
    }).execute()

    return res.data[0]


# ── Agent Portal: My Assignments ───────────────────────────────────────────────
@router.get("/assignments/me")
async def my_assignments(user: dict = Depends(get_current_user), status: str | None = None):
    agent = _require_agent(user)
    q = supabase.table("delivery_assignments").select(
        "id,order_id,status,assigned_at,picked_up_at,in_transit_at,delivered_at,notes,created_at"
    ).eq("agent_id", agent["id"])
    if status:
        q = q.eq("status", status)
    res = q.order("created_at", desc=True).limit(50).execute()
    assignments = res.data or []
    if not assignments:
        return []

    order_ids = [a["order_id"] for a in assignments]
    orders = supabase.table("store_orders").select(
        "id,order_number,status,total_cents,created_at,carrier,tracking_number,tracking_url,shipping_address"
    ).in_("id", order_ids).execute().data or []
    order_map = {o["id"]: o for o in orders}

    # Items
    items_res = supabase.table("store_order_items").select(
        "id,order_id,product_name,quantity,line_total_cents"
    ).in_("order_id", order_ids).execute().data or []
    items_by_order = {}
    for it in items_res:
        items_by_order.setdefault(it["order_id"], []).append(it)

    return [{
        **a,
        "order": order_map.get(a["order_id"]),
        "items": items_by_order.get(a["order_id"], []),
    } for a in assignments]


# ── Agent Portal: Update Assignment Status ─────────────────────────────────────
@router.patch("/assignments/{assignment_id}")
async def update_assignment(assignment_id: str, body: StatusUpdateBody, user: dict = Depends(get_current_user)):
    agent = _require_agent(user)
    assignment = supabase.table("delivery_assignments").select("*").eq("id", assignment_id).eq("agent_id", agent["id"]).single().execute()
    if not assignment.data:
        raise HTTPException(404, "Assignment not found")

    valid_statuses = ("assigned", "picked_up", "in_transit", "delivered", "failed", "returned")
    if body.status not in valid_statuses:
        raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(valid_statuses)}")

    now = datetime.now(timezone.utc).isoformat()
    updates = {"status": body.status, "notes": body.note or "", "updated_at": now}

    if body.status == "picked_up":
        updates["picked_up_at"] = now
    elif body.status == "in_transit":
        updates["in_transit_at"] = now
    elif body.status == "delivered":
        updates["delivered_at"] = now
    elif body.status == "failed":
        updates["failed_at"] = now
    elif body.status == "returned":
        updates["returned_at"] = now

    supabase.table("delivery_assignments").update(updates).eq("id", assignment_id).execute()

    # Sync to store_orders
    supabase.table("store_orders").update({
        "delivery_status": body.status,
        "status": "delivered" if body.status == "delivered" else "processing",
    }).eq("id", assignment.data["order_id"]).execute()

    # Create scan event
    supabase.table("delivery_scan_events").insert({
        "assignment_id": assignment_id,
        "agent_id": agent["id"],
        "scan_type": body.status,
        "note": body.note or "",
        "location_lat": body.location_lat,
        "location_lng": body.location_lng,
        "created_at": now,
    }).execute()

    # Store order event
    supabase.table("store_order_events").insert({
        "order_id": assignment.data["order_id"],
        "status": body.status,
        "note": f"Agent: {agent['display_name']} — " + (body.note or body.status),
        "created_at": now,
    }).execute()

    return {"message": "Updated", "status": body.status}


# ── Agent Portal: Barcode Scan ─────────────────────────────────────────────────
@router.post("/scan")
async def scan_barcode(body: ScanBody, user: dict = Depends(get_current_user)):
    agent = _require_agent(user)
    now = datetime.now(timezone.utc).isoformat()

    # Try to find matching order by order_number barcode
    order = supabase.table("store_orders").select(
        "id,order_number,status,delivery_agent_id,delivery_status"
    ).eq("order_number", body.barcode).limit(1).execute()

    if not order.data:
        raise HTTPException(404, f"No order found with number: {body.barcode}")

    o = order.data[0]

    # Find assignment
    assignment = supabase.table("delivery_assignments").select("*").eq("order_id", o["id"]).eq("agent_id", agent["id"]).single().execute()
    if not assignment.data:
        raise HTTPException(400, "This order is not assigned to you")

    a = assignment.data
    valid_map = {
        "pickup": "picked_up",
        "transit": "in_transit",
        "delivery": "delivered",
        "attempt": None,
        "return": "returned",
    }
    new_status = valid_map.get(body.scan_type)
    if not new_status and body.scan_type not in ("attempt",):
        raise HTTPException(400, f"Invalid scan type: {body.scan_type}")

    updates = {"updated_at": now}
    if new_status:
        updates["status"] = new_status
        if new_status == "picked_up":
            updates["picked_up_at"] = now
        elif new_status == "in_transit":
            updates["in_transit_at"] = now
        elif new_status == "delivered":
            updates["delivered_at"] = now
        elif new_status == "returned":
            updates["returned_at"] = now

        supabase.table("delivery_assignments").update(updates).eq("id", a["id"]).execute()
        supabase.table("store_orders").update({
            "delivery_status": new_status,
            "status": "delivered" if new_status == "delivered" else "processing",
        }).eq("id", o["id"]).execute()

    # Log scan event
    supabase.table("delivery_scan_events").insert({
        "assignment_id": a["id"],
        "agent_id": agent["id"],
        "scan_type": body.scan_type,
        "barcode_scanned": body.barcode,
        "location_lat": body.location_lat,
        "location_lng": body.location_lng,
        "note": body.note or "",
        "created_at": now,
    }).execute()

    # Store order event
    supabase.table("store_order_events").insert({
        "order_id": o["id"],
        "status": body.scan_type,
        "note": f"Scanned by {agent['display_name']} — " + (body.note or body.scan_type),
        "created_at": now,
    }).execute()

    return {
        "message": "Scan recorded",
        "order_number": o["order_number"],
        "scan_type": body.scan_type,
        "delivery_status": new_status or "unchanged",
    }


# ── Public: Delivery Tracking with Agent Info ───────────────────────────────────
@router.get("/tracking/{order_no}")
async def order_delivery_tracking(order_no: str):
    order = supabase.table("store_orders").select(
        "id,order_number,status,delivery_status,delivery_agent_id,estimated_delivery,carrier,tracking_number,tracking_url"
    ).eq("order_number", order_no).limit(1).execute()

    if not order.data:
        raise HTTPException(404, "Order not found")

    o = order.data
    agent_info = None
    assignment_info = None
    scan_events = []

    if o.get("delivery_agent_id"):
        agent = supabase.table("delivery_agents").select("id,display_name,phone,vehicle,status,current_area").eq("id", o["delivery_agent_id"]).single().execute()
        agent_info = {k: v for k, v in (agent.data or {}).items() if k != "phone"}  # never leak agent phone on a public endpoint

        assignment = supabase.table("delivery_assignments").select(
            "id,status,assigned_at,picked_up_at,in_transit_at,delivered_at,failed_at,returned_at"
        ).eq("order_id", o["id"]).limit(1).execute()
        if assignment.data:
            # H24 — export ONLY the public status + sanitized timestamps from the
            # assignment. The full row (select "*") was leaking internal fields
            # (agent_id, order_id, notes, updated_at …) to anyone with an order
            # number — a public endpoint must never mirror the DB row.
            raw = assignment.data[0]
            assignment_info = {
                "status": raw.get("status"),
                "assigned_at": raw.get("assigned_at"),
                "picked_up_at": raw.get("picked_up_at"),
                "in_transit_at": raw.get("in_transit_at"),
                "delivered_at": raw.get("delivered_at"),
                "failed_at": raw.get("failed_at"),
                "returned_at": raw.get("returned_at"),
            }
            scans = supabase.table("delivery_scan_events").select(
                "scan_type,note,created_at"
            ).eq("assignment_id", raw["id"]).order("created_at").execute()
            scan_events = scans.data or []

    events = supabase.table("store_order_events").select("status,note,created_at").eq("order_id", o["id"]).order("created_at").execute()

    return {
        "order_number": o["order_number"],
        "status": o["status"],
        "delivery_status": o.get("delivery_status"),
        "estimated_delivery": o.get("estimated_delivery"),
        "carrier": o.get("carrier"),
        "tracking_number": o.get("tracking_number"),
        "tracking_url": o.get("tracking_url"),
        "agent": agent_info,
        "assignment": assignment_info,
        "scan_events": scan_events,
        "events": events.data or [],
    }
