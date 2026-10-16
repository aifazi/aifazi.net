"""routers/fivem/whitelist.py - extracted from routers/fivem.py."""

from __future__ import annotations

from routers.fivem.shared import WL_PUBLIC_FIELDS, WL_PUBLIC_FIELDS_WITH_PLAY, _discord_assign_whitelist_role, _discord_remove_whitelist_role, _effective_whitelist_status, _now, _pending_count, _priority_update_fields, _push_realtime, _sync_to_txadmin
from database import safe_or_in, supabase
from dependencies import get_current_user, require_staff
from fastapi import BackgroundTasks, Depends, HTTPException, Request
from routers.fivem_models import ApplicationActionSyncBody, BulkWhitelistApproveBody, MarkSynced, ServerSyncRefresh, WhitelistApply, WhitelistIdentifiersBody, WhitelistManualAdd, WhitelistPriorityUpdate, WhitelistReview, _check_token
from typing import Any
from utils.fivem_emails import _send_whitelist_email
from utils.fivem_ids import _answer_identifiers, _player_ids_from_fields

# â”€â”€â”€ Whitelist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async def my_whitelist_application(user: dict = Depends(get_current_user)):
    """
    Return the logged-in forum user's latest whitelist application.
    Used by /whitelist to block duplicate submissions before the form renders.
    """
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(401, "Authentication required")

    user_res = (
        supabase.table("users")
        .select("discord_id")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not user_res.data:
        raise HTTPException(404, "User not found")

    discord_id = user_res.data[0].get("discord_id")
    if not discord_id:
        raise HTTPException(404, "No linked Discord account")

    try:
        app_res = (
            supabase.table("fivem_whitelist")
            .select(WL_PUBLIC_FIELDS_WITH_PLAY)
            .eq("discord_id", discord_id)
            .order("applied_at", desc=True)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        if "last_played" not in str(exc):
            raise
        app_res = (
            supabase.table("fivem_whitelist")
            .select(WL_PUBLIC_FIELDS)
            .eq("discord_id", discord_id)
            .order("applied_at", desc=True)
            .limit(1)
            .execute()
        )
    if not app_res.data:
        raise HTTPException(404, "No whitelist application found")

    return _effective_whitelist_status(app_res.data[0])
async def apply_whitelist(body: WhitelistApply, user: dict = Depends(get_current_user)):
    if not body.rules_accepted:
        raise HTTPException(400, "You must accept the server rules.")
    user_id = user.get("id") or user.get("forum_user_id")
    if not user_id:
        raise HTTPException(401, "Authentication required")
    forum_res = (
        supabase.table("users")
        .select("id,username,email,discord_id,discord_username,steam_id")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not forum_res.data:
        raise HTTPException(404, "User not found")
    forum_user = forum_res.data[0]
    discord_id = (forum_user.get("discord_id") or "").strip()
    if not discord_id:
        raise HTTPException(403, "Link Discord before submitting a whitelist application.")
    discord_name = (forum_user.get("discord_username") or forum_user.get("username") or user.get("username") or "").strip()
    email = (forum_user.get("email") or user.get("email") or "").strip() or None
    steam_hex = (forum_user.get("steam_id") or body.steam_hex or "").strip() or None
    existing = (supabase.table("fivem_whitelist").select("id,status")
                .eq("discord_id", discord_id)
                .order("applied_at", desc=True).limit(1).execute())
    if existing.data:
        st = existing.data[0]["status"]
        if st == "approved": raise HTTPException(400, "You are already whitelisted.")
        raise HTTPException(400, "You already submitted a whitelist application. Please open a ticket if you need to change anything.")
    res = supabase.table("fivem_whitelist").insert({
        "discord_id": discord_id, "discord_name": discord_name,
        "steam_hex": steam_hex,   "fivem_id": body.fivem_id,
        "character_name": body.character_name,
        "character_backstory": body.character_backstory,
        "age": body.age, "rp_experience": body.rp_experience,
        "why_join": body.why_join, "status": "pending",
        "email": email,
        "extra_answers": body.extra_answers or {},
        "applied_at": _now(), "txadmin_synced": False,
        "sync_source": "website",
    }).execute()
    app = (res.data or [{}])[0]
    await _send_whitelist_email(app, "applied")
    from utils.admin_notify import notify_admin
    notify_admin('🎮', 'New Whitelist Application', f"{app.get('discord_name') or body.discord_name or user.get('username', 'Someone')} applied to whitelist")
    return {"message": "Application submitted!", "id": app.get("id")}
async def pending_sync(request: Request):
    """
    Static route must be declared before /whitelist/{app_id}; Lua expects a bare
    JSON array of approved rows waiting for server sync.
    """
    _check_token(request)
    res = (supabase.table("fivem_whitelist")
           .select("id,discord_name,steam_hex,fivem_id,fivem_license,approved_at")
           .eq("status", "approved").eq("txadmin_synced", False)
           .order("reviewed_at", desc=False).limit(20).execute())
    rows = res.data or []
    out = []
    for r in rows:
        steam = (r.get("steam_hex") or "").strip()
        license_id = (r.get("fivem_license") or "").strip()
        fivem = (r.get("fivem_id") or "").strip()
        lic = license_id or steam or fivem
        if not lic:
            continue
        r["license"] = lic
        out.append(r)
    return out
async def refresh_server_sync(
    body: ServerSyncRefresh | None = None,
    user: dict = Depends(require_staff),
):
    """
    Manual admin refresh for the FiveM server sync queue.
    Whitelist rows are pushed to txAdmin immediately; ban/unban/form actions stay
    queued for the FiveM resource and are returned as pending counts.
    """
    body = body or ServerSyncRefresh()
    username = user.get("username", "admin")

    q = (
        supabase.table("fivem_whitelist")
        .select("*")
        .eq("status", "approved")
        .eq("txadmin_synced", False)
        .order("reviewed_at", desc=False)
        .limit(20)
    )
    if body.app_id:
        q = q.eq("id", body.app_id)

    rows = q.execute().data or []
    synced = 0
    failed = 0
    for app in rows:
        result = await _sync_to_txadmin(app, username, "website")
        if result.get("txadmin_synced"):
            synced += 1
        else:
            failed += 1

    pending = {
        "whitelist": _pending_count("fivem_whitelist", {"status": "approved", "txadmin_synced": False}),
        "bans": _pending_count("fivem_bans", {"active": True, "txadmin_synced": False}),
        "unbans": _pending_count("fivem_bans", {"active": False, "txadmin_synced": False, "source": "qbx_unban_pending"}),
        "application_actions": _pending_count(
            "application_form_submissions",
            {"status": "approved"},
            {"action_status": ["pending", "failed"]},
        ),
    }

    await _push_realtime("server_sync_refresh", {
        "requested_by": username,
        "reason": body.reason or "manual",
        "synced": synced,
        "failed": failed,
        "pending": pending,
    })

    return {
        "ok": True,
        "message": "Server sync refreshed.",
        "attempted": len(rows),
        "synced": synced,
        "failed": failed,
        "pending": pending,
    }
async def update_whitelist_priority(
    app_id: str,
    body: WhitelistPriorityUpdate,
    user: dict = Depends(require_staff),
):
    app_res = supabase.table("fivem_whitelist").select("*").eq("id", app_id).execute()
    if not app_res.data:
        raise HTTPException(404, "Application not found")
    if app_res.data[0].get("status") != "approved":
        raise HTTPException(400, "Priority can only be assigned to approved whitelist players")

    updates = {
        **_priority_update_fields(body.priority_tier, body.priority_level, body.priority_expires_at),
        "reviewed_by": user.get("username", "admin"),
        "reviewed_at": _now(),
    }
    res = supabase.table("fivem_whitelist").update(updates).eq("id", app_id).execute()
    updated_app = (res.data or [app_res.data[0]])[0]
    await _send_whitelist_email(updated_app, "priority", None, {
        "tier": updated_app.get("priority_tier") or "None",
        "level": updated_app.get("priority_level") or 0,
        "expires_at": updated_app.get("priority_expires_at"),
    })
    return {"message": "Priority updated.", "app": updated_app}
async def review_whitelist(
    app_id: str, body: WhitelistReview,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_staff)
):
    if body.status not in ("approved", "denied", "pending"):
        raise HTTPException(400, "Invalid status")

    app_res = supabase.table("fivem_whitelist").select("*").eq("id", app_id).execute()
    if not app_res.data: raise HTTPException(404, "Application not found")
    app      = app_res.data[0]
    username = user.get("username", "admin")
    discord_id = app.get("discord_id", "")
    current_status = app.get("status", "pending")

    # Guard: reject no-op transitions with a clear message
    if body.status == current_status:
        status_labels = {"approved": "already approved", "denied": "already denied", "pending": "already pending"}
        raise HTTPException(409, f"Player is {status_labels.get(current_status, current_status)} â€” no change made.")

    if body.status == "approved":
        priority_updates = _priority_update_fields(
            body.priority_tier,
            body.priority_level,
            body.priority_expires_at,
        )
        supabase.table("fivem_whitelist").update({
            "status":         "approved",
            "reviewer_note":  body.reviewer_note,
            "reviewed_by":    username,
            "reviewed_at":    _now(),
            "approved_at":    _now(),
            "sync_source":    "website",
            "txadmin_synced": False,
            **priority_updates,
        }).eq("id", app_id).execute()

        # Re-fetch the updated app for background tasks
        updated_app = supabase.table("fivem_whitelist").select("*").eq("id", app_id).execute()
        app_updated = (updated_app.data or [app])[0]

        # 1. Assign Discord Whitelisted role
        if discord_id:
            background_tasks.add_task(_discord_assign_whitelist_role, discord_id)

        # 2. Sync approval in background.
        background_tasks.add_task(_sync_to_txadmin, app_updated, username, "website")

        # 3. Send approval email
        await _send_whitelist_email(app, "approved", body.reviewer_note)

        return {
            "message":  "Approved â€” syncing to server + sending email in background.",
            "app_id":   app_id,
            "syncing":  True,
        }

    else:
        priority_updates = {}
        if body.status != "pending":
            priority_updates = {
                "priority_tier": None,
                "priority_level": 0,
                "priority_expires_at": None,
            }
        supabase.table("fivem_whitelist").update({
            "status":        body.status,
            "reviewer_note": body.reviewer_note,
            "reviewed_by":   username,
            "reviewed_at":   _now(),
            **priority_updates,
        }).eq("id", app_id).execute()

        # Remove Discord role on deny
        if body.status == "denied" and discord_id:
            background_tasks.add_task(_discord_remove_whitelist_role, discord_id)

        # Send email notification (approved/denied/pending)
        await _send_whitelist_email(app, body.status, body.reviewer_note)

        return {"message": f"Application {body.status}. Email notification sent."}
async def manual_add_whitelist(
    body: WhitelistManualAdd,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_staff)
):
    existing = (supabase.table("fivem_whitelist").select("id,status")
                .eq("discord_id", body.discord_id).eq("status", "approved").execute())
    if existing.data:
        raise HTTPException(400, "Player is already whitelisted.")

    identifier_filters = []
    if body.fivem_license:
        identifier_filters.append(safe_or_in("fivem_license", [body.fivem_license]))
    if body.steam_hex:
        identifier_filters.append(safe_or_in("steam_hex", [body.steam_hex]))
    if body.fivem_id:
        identifier_filters.append(safe_or_in("fivem_id", [body.fivem_id]))
    if identifier_filters:
        id_existing = (supabase.table("fivem_whitelist")
                       .select("id,status,discord_id")
                       .eq("status", "approved")
                       .or_(",".join(identifier_filters))
                       .limit(1)
                       .execute())
        if id_existing.data:
            raise HTTPException(400, "That player identifier is already whitelisted.")

    username = user.get("username", "admin")
    priority_updates = _priority_update_fields(
        body.priority_tier,
        body.priority_level,
        body.priority_expires_at,
    )
    res = supabase.table("fivem_whitelist").insert({
        "discord_id":         body.discord_id,
        "discord_name":       body.discord_name,
        "steam_hex":          body.steam_hex,
        "fivem_license":      body.fivem_license,
        "fivem_id":           body.fivem_id,
        "character_name":     body.character_name,
        "character_backstory":"Manually added by admin.",
        "age": 0, "rp_experience": "N/A",
        "why_join":       "Manually added by admin.",
        "status":         "approved",
        "reviewer_note":  body.reviewer_note or "Manually added.",
        "reviewed_by":    username,
        "reviewed_at":    _now(),
        "applied_at":     _now(),
        "approved_at":    _now(),
        "sync_source":    "website_manual",
        "txadmin_synced": False,
        **priority_updates,
    }).execute()
    app = (res.data or [{}])[0]

    async def _push():
        await _sync_to_txadmin(app, username, "website_manual")

    background_tasks.add_task(_push)
    await _send_whitelist_email(app, "approved", body.reviewer_note or "Manually added by staff.")
    return {"message": "Player manually whitelisted â€” syncing to server in background.", "app": app}
# â”€â”€â”€ Fallback Lua polling endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async def mark_synced(body: MarkSynced, request: Request):
    """Lua calls this after successfully adding a player to txAdmin."""
    _check_token(request)
    upd = {"txadmin_synced": True, "sync_source": "txadmin", "approved_at": _now()}
    if body.app_id:
        supabase.table("fivem_whitelist").update(upd).eq("id", body.app_id).execute()
    elif body.license:
        supabase.table("fivem_whitelist").update(upd).or_(
            ",".join([safe_or_in("steam_hex", [body.license]), safe_or_in("fivem_id", [body.license])])
        ).execute()
    else:
        raise HTTPException(400, "Provide app_id or license")
    return {"ok": True}
async def pending_application_actions(request: Request):
    _check_token(request)
    res = (
        supabase.table("application_form_submissions")
        .select("id,form_slug,form_title,user_id,username,email,answers,status,approved_action,action_status,action_attempts,updated_at")
        .eq("status", "approved")
        .in_("action_status", ["pending", "failed"])
        .order("updated_at", desc=False)
        .limit(25)
        .execute()
    )
    out = []
    for row in res.data or []:
        answers = row.get("answers") or {}
        action = row.get("approved_action") if isinstance(row.get("approved_action"), dict) else {}
        out.append({
            "submission_id": row.get("id"),
            "form_slug": row.get("form_slug"),
            "form_title": row.get("form_title"),
            "username": row.get("username"),
            "email": row.get("email"),
            "answers": answers,
            "approved_action": action,
            "identifiers": _answer_identifiers(answers),
            "attempts": int(row.get("action_attempts") or 0),
        })
    return out
async def mark_application_action_synced(body: ApplicationActionSyncBody, request: Request):
    _check_token(request)
    current = supabase.table("application_form_submissions").select("action_attempts").eq("id", body.submission_id).limit(1).execute()
    attempts = int((current.data or [{}])[0].get("action_attempts") or 0) + 1
    patch = {
        "action_status": body.status,
        "action_attempts": attempts,
        "action_sync_error": body.message if body.status == "failed" else None,
        "updated_at": _now(),
    }
    if body.status in ("synced", "skipped"):
        patch["action_synced_at"] = _now()
    res = supabase.table("application_form_submissions").update(patch).eq("id", body.submission_id).execute()
    if not res.data:
        raise HTTPException(404, "Submission not found")
    return {"ok": True, "submission": res.data[0]}
async def update_whitelist_identifiers(body: WhitelistIdentifiersBody, request: Request):
    """Lua patches license/steam/fivem identifiers onto the approved whitelist row on connect."""
    _check_token(request)
    ids = _player_ids_from_fields(body.license, body.license2, body.steam_hex, body.fivem_id, body.discord_id, body.identifiers)
    filters: list[str] = []
    discord = (ids.get("discord_id") or "").strip()
    if discord:
        filters.append(safe_or_in("discord_id", [discord]))
    for field in ("fivem_license", "steam_hex", "fivem_id"):
        val = str(ids.get(field) or "").strip()
        if val:
            filters.append(safe_or_in(field, [val]))
    if not filters:
        return {"ok": False, "reason": "no_identifiers"}
    res = (supabase.table("fivem_whitelist")
           .select("id,fivem_license,steam_hex,fivem_id")
           .eq("status", "approved")
           .or_(",".join(dict.fromkeys(filters)))
           .order("approved_at", desc=True).limit(1).execute())
    row = (res.data or [None])[0]
    if not row:
        return {"ok": False, "reason": "no_match"}
    updates: dict = {}
    for field, value in (
        ("fivem_license", ids.get("license")),
        ("fivem_license", ids.get("license2")),
        ("fivem_license", ids.get("fivem_license")),
        ("steam_hex", ids.get("steam_hex")),
        ("fivem_id", ids.get("fivem_id")),
    ):
        val = str(value or "").strip()
        if val and not row.get(field):
            updates.setdefault(field, val)
    if updates:
        supabase.table("fivem_whitelist").update(updates).eq("id", row["id"]).execute()
    return {"ok": True, "updated": updates}
async def bulk_approve_whitelist(
    body: BulkWhitelistApproveBody,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_staff),
):
    if not body.app_ids:
        raise HTTPException(400, "No application IDs provided")
    if len(body.app_ids) > 100:
        raise HTTPException(400, "Maximum 100 applications per bulk operation")

    username = user.get("username", "admin")
    priority_updates = _priority_update_fields(
        body.priority_tier, body.priority_level, body.priority_expires_at,
    )
    now_iso = _now()
    results: dict[str, Any] = {"approved": 0, "errors": []}

    apps_res = (
        supabase.table("fivem_whitelist").select("*")
        .in_("id", body.app_ids)
        .execute()
    )
    existing = {a["id"]: a for a in (apps_res.data or []) if a.get("id")}

    for app_id in body.app_ids:
        try:
            app = existing.get(app_id)
            if not app:
                results["errors"].append({"id": app_id, "error": "not found"})
                continue
            if app["status"] == "approved":
                results["errors"].append({"id": app_id, "error": "already approved"})
                continue

            supabase.table("fivem_whitelist").update({
                "status": "approved",
                "reviewer_note": body.reviewer_note or app.get("reviewer_note"),
                "reviewed_by": username,
                "reviewed_at": now_iso,
                "approved_at": now_iso,
                "sync_source": "website",
                "txadmin_synced": False,
                **priority_updates,
            }).eq("id", app_id).execute()

            app_updated = app | {
                "status": "approved",
                "reviewed_by": username,
                "reviewed_at": now_iso,
                "approved_at": now_iso,
                **priority_updates,
            }

            if app.get("discord_id"):
                background_tasks.add_task(_discord_assign_whitelist_role, app["discord_id"])
            background_tasks.add_task(_sync_to_txadmin, app_updated, username, "website")
            results["approved"] += 1
        except Exception as exc:
            results["errors"].append({"id": app_id, "error": str(exc)[:200]})

    return {
        "message": f"Approved {results['approved']}/{len(body.app_ids)} applications.",
        **results,
    }
