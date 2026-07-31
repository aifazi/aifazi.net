"""Universal application forms.

Public routes render editable form definitions. Staff routes manage definitions
and review submissions from the admin FiveM panel.
"""
from __future__ import annotations

from datetime import datetime, timezone
from html import escape
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import supabase
from dependencies import get_current_user, require_staff
from utils.email_queue import queue_email

router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug(text: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in (text or "").lower()).strip("-")


def _steam64_to_hex(steam_id: Any) -> str:
    try:
        return f"steam:{hex(int(str(steam_id)))[2:].lower()}"
    except (TypeError, ValueError):
        return ""


class FormDefinitionBody(BaseModel):
    slug: str
    title: str
    category: str = "General"
    description: str = ""
    intro: str = ""
    success_message: str = "Application submitted. Staff will review it soon."
    status: str = "active"
    require_login: bool = True
    require_whitelist: bool = True
    email_template_purpose: str = "application_submitted"
    fields: list[dict[str, Any]] = Field(default_factory=list)
    approval_action: dict[str, Any] = Field(default_factory=dict)
    form_kind: str = "universal"
    system_locked: bool = False
    public_path: str = ""


class FormSubmissionBody(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)


class SubmissionReviewBody(BaseModel):
    status: str
    reviewer_note: Optional[str] = None


def _form_public(row: dict) -> dict:
    return {
        "id": row.get("id"), "slug": row.get("slug"), "title": row.get("title"), "category": row.get("category"),
        "description": row.get("description") or "", "intro": row.get("intro") or "",
        "success_message": row.get("success_message") or "", "status": row.get("status") or "active",
        "require_login": row.get("require_login") is not False, "require_whitelist": row.get("require_whitelist") is not False,
        "fields": row.get("fields") or [], "form_kind": row.get("form_kind") or "universal",
        "system_locked": bool(row.get("system_locked")), "public_path": row.get("public_path") or f"/forms/{row.get('slug')}",
    }

DEFAULT_WHITELIST_FIELDS = [
    {"id":"character_name","label":"Character Full Name","type":"text","required":True,"placeholder":"e.g. Marcus Reyes"},
    {"id":"character_backstory","label":"Character Backstory","type":"textarea","required":True,"placeholder":"Your character's background story...","min_length":80},
    {"id":"why_join","label":"Why do you want to join AIFAZI RP?","type":"textarea","required":True,"placeholder":"What draws you to this server?","min_length":40},
    {"id":"age","label":"Age","type":"number","required":True,"placeholder":"18"},
    {"id":"rp_experience","label":"RP Experience","type":"text","required":True,"placeholder":"FiveM, GTA RP, text RP, etc."},
    {"id":"roleplay_style","label":"Preferred RP Style","type":"text","required":True,"placeholder":"Civilian business, police, EMS, crime, legal..."},
    {"id":"availability","label":"Availability / Timezone","type":"text","required":True,"placeholder":"Asia/Dubai evenings, weekends"},
    {"id":"rule_scenario","label":"Rules Scenario","type":"textarea","required":True,"placeholder":"What do you do if a scene goes wrong?","min_length":60},
    {"id":"extra_notes","label":"Anything staff should know?","type":"textarea","required":False,"placeholder":"Optional notes for staff..."},
]

def _whitelist_payload() -> dict:
    now = _now()
    return {
        "slug":"whitelist", "title":"Whitelist Application", "category":"FiveM",
        "description":"Apply for AIFAZI RP whitelist access.",
        "intro":"Tell us who you are, what story you want to create, and how you understand serious RP.",
        "success_message":"Whitelist application submitted. Staff will review it soon.",
        "status":"active", "require_login":True, "require_whitelist":False,
        "email_template_purpose":"whitelist_submitted", "fields":DEFAULT_WHITELIST_FIELDS,
        "approval_action":{"type":"server_whitelist"}, "form_kind":"whitelist", "system_locked":True, "public_path":"/whitelist",
        "created_at":now, "updated_at":now,
    }

def _ensure_whitelist_form() -> dict:
    try:
        res = supabase.table("application_forms").select("*").eq("slug", "whitelist").limit(1).execute()
        if res.data:
            row = res.data[0]
            patch = {"form_kind":"whitelist", "system_locked":True, "public_path":"/whitelist", "approval_action":{"type":"server_whitelist"}}
            if row.get("form_kind") != "whitelist" or not row.get("system_locked") or row.get("public_path") != "/whitelist":
                supabase.table("application_forms").update(patch).eq("id", row["id"]).execute()
                row = {**row, **patch}
            return row
        ins = supabase.table("application_forms").insert(_whitelist_payload()).execute()
        return (ins.data or [_whitelist_payload()])[0]
    except Exception:
        return _whitelist_payload()


def _load_account(user: dict) -> dict:
    user_id = str(user.get("id") or user.get("_id") or "")
    if user_id:
        try:
            res = supabase.table("users").select(
                "id,username,email,avatar,role,discord_id,discord_username,discord_avatar,"
                "steam_id,steam_username,steam_avatar"
            ).eq("id", user_id).limit(1).execute()
            if res.data:
                account = dict(res.data[0])
                account["steam_hex"] = _steam64_to_hex(account.get("steam_id"))
                return account
        except Exception:
            pass
    return {
        "id": user_id,
        "username": user.get("username") or "",
        "email": user.get("email") or "",
        "role": user.get("role") or "member",
    }


def _find_approved_whitelist(account: dict) -> dict | None:
    candidates = [
        ("discord_id", account.get("discord_id")),
        ("steam_hex", account.get("steam_hex")),
        ("email", account.get("email")),
    ]
    for field, value in candidates:
        value = str(value or "").strip()
        if not value:
            continue
        try:
            res = (
                supabase.table("fivem_whitelist")
                .select(
                    "id,status,character_name,fivem_id,fivem_license,steam_hex,discord_id,"
                    "discord_name,email,priority_tier,priority_level,priority_expires_at,last_played_at,last_played_name"
                )
                .eq("status", "approved")
                .eq(field, value)
                .order("reviewed_at", desc=True)
                .limit(1)
                .execute()
            )
            if res.data:
                return res.data[0]
        except Exception:
            continue
    return None


def _account_prefill(account: dict, whitelist: dict | None) -> dict:
    whitelist = whitelist or {}
    return {
        "account_id": account.get("id") or "",
        "username": account.get("username") or "",
        "real_name": account.get("username") or "",
        "name": account.get("username") or "",
        "preferred_name": account.get("username") or "",
        "email": account.get("email") or whitelist.get("email") or "",
        "discord": account.get("discord_username") or whitelist.get("discord_name") or account.get("discord_id") or "",
        "discord_username": account.get("discord_username") or whitelist.get("discord_name") or "",
        "discord_id": account.get("discord_id") or whitelist.get("discord_id") or "",
        "steam": account.get("steam_username") or account.get("steam_id") or "",
        "steam_username": account.get("steam_username") or "",
        "steam_id": account.get("steam_id") or "",
        "steam_hex": account.get("steam_hex") or whitelist.get("steam_hex") or "",
        "character_name": whitelist.get("character_name") or "",
        "fivem_id": whitelist.get("fivem_id") or "",
        "fivem_license": whitelist.get("fivem_license") or "",
        "license": whitelist.get("fivem_license") or "",
        "whitelist_id": whitelist.get("id") or "",
        "whitelist_status": whitelist.get("status") or "",
        "last_played_name": whitelist.get("last_played_name") or "",
        "last_played_at": whitelist.get("last_played_at") or "",
        "priority_tier": whitelist.get("priority_tier") or "",
        "priority_level": str(whitelist.get("priority_level") or ""),
        "priority_expires_at": whitelist.get("priority_expires_at") or "",
    }


def _safe_account(account: dict) -> dict:
    return {
        "id": account.get("id") or "",
        "username": account.get("username") or "",
        "email": account.get("email") or "",
        "role": account.get("role") or "member",
        "avatar": account.get("avatar") or "",
        "discord_id": account.get("discord_id") or "",
        "discord_username": account.get("discord_username") or "",
        "discord_avatar": account.get("discord_avatar") or "",
        "steam_id": account.get("steam_id") or "",
        "steam_username": account.get("steam_username") or "",
        "steam_avatar": account.get("steam_avatar") or "",
        "steam_hex": account.get("steam_hex") or "",
    }


def _validate_answers(form: dict, answers: dict[str, Any]) -> None:
    fields = form.get("fields") or []
    missing: list[str] = []
    too_short: list[str] = []
    for field in fields:
        field_id = str(field.get("id") or "").strip()
        if not field_id:
            continue
        value = answers.get(field_id)
        text = "" if value is None else str(value).strip()
        if field.get("required") and not text:
            missing.append(field.get("label") or field_id)
        min_length = int(field.get("min_length") or 0)
        if text and min_length and len(text) < min_length:
            too_short.append(f"{field.get('label') or field_id} needs {min_length}+ characters")
    if missing:
        raise HTTPException(422, "Required fields missing: " + ", ".join(missing))
    if too_short:
        raise HTTPException(422, "; ".join(too_short))


def _render_template(purpose: str, variables: dict[str, str], fallback_subject: str, fallback_html: str) -> tuple[str, str]:
    subject, html = fallback_subject, fallback_html
    try:
        res = (
            supabase.table("mail_templates")
            .select("subject,html,active")
            .eq("purpose", purpose)
            .eq("active", True)
            .limit(1)
            .execute()
        )
        if res.data:
            subject = res.data[0].get("subject") or subject
            html = res.data[0].get("html") or html
    except Exception:
        pass
    for key, value in variables.items():
        token = "{{" + key + "}}"
        subject = subject.replace(token, value)
        html = html.replace(token, value)
    return subject, html


def _answers_table(answers: dict[str, Any]) -> str:
    rows = "".join(
        f"<tr><td style='padding:8px 10px;color:#7dd3fc;font-family:monospace;font-size:11px;border-bottom:1px solid #1f2937'>{escape(str(k))}</td>"
        f"<td style='padding:8px 10px;color:#e5e7eb;border-bottom:1px solid #1f2937'>{escape(str(v))}</td></tr>"
        for k, v in answers.items()
        if v not in (None, "")
    )
    if not rows:
        return ""
    return (
        "<table style='width:100%;border-collapse:collapse;margin-top:18px;"
        "background:#0b1220;border:1px solid #1f2937;border-radius:8px;overflow:hidden'>"
        f"{rows}</table>"
    )


async def _send_submission_email(form: dict, submission: dict, user: dict, answers: dict[str, Any]) -> None:
    to_email = user.get("email") or answers.get("email")
    if not to_email:
        return
    variables = {
        "site_name": "AIFAZI RP",
        "username": str(user.get("username") or "player"),
        "email": str(to_email),
        "form_title": str(form.get("title") or "Application"),
        "form_slug": str(form.get("slug") or ""),
        "submission_id": str(submission.get("id") or ""),
        "status": str(submission.get("status") or "pending"),
        "reviewer_note": "",
        "answers_table": _answers_table(answers),
    }
    fallback_subject = "[{{site_name}}] {{form_title}} received"
    fallback_html = """
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#00ff88;padding:3px"></div>
  <div style="padding:28px">
    <h2 style="color:#00ff88;margin:0 0 8px">{{form_title}} received</h2>
    <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, your application was submitted and is waiting for staff review.</p>
    {{answers_table}}
  </div>
  <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">AIFAZI RP · aifazi.net</div>
</div>"""
    subject, html = _render_template(
        form.get("email_template_purpose") or "application_submitted",
        variables,
        fallback_subject,
        fallback_html,
    )
    queue_email(to_email, subject, html, "", "application_submitted")


async def _send_review_email(submission: dict, status: str) -> None:
    purpose_map = {
        "approved": "application_approved",
        "denied": "application_denied",
        "pending": "application_reset",
        "archived": "application_archived",
    }
    purpose = purpose_map.get(status)
    if not purpose:
        return
    to_email = submission.get("email")
    if not to_email:
        return
    variables = {
        "site_name": "AIFAZI RP",
        "username": str(submission.get("username") or "player"),
        "email": str(to_email),
        "form_title": str(submission.get("form_title") or "Application"),
        "form_slug": str(submission.get("form_slug") or ""),
        "submission_id": str(submission.get("id") or ""),
        "status": status,
        "reviewer_note": str(submission.get("reviewer_note") or ""),
        "answers_table": _answers_table(submission.get("answers") or {}),
    }
    fallback_subject = "[{{site_name}}] {{form_title}} application {{status}}"
    fallback_html = """
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0d1117;color:#e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#00d4ff;padding:3px"></div>
  <div style="padding:28px">
    <h2 style="color:#00d4ff;margin:0 0 8px">{{form_title}} application {{status}}</h2>
    <p style="color:#94a3b8;line-height:1.7">Hi {{username}}, staff updated your application.</p>
    <p style="color:#e5e7eb;line-height:1.7">{{reviewer_note}}</p>
    {{answers_table}}
  </div>
  <div style="background:#111827;padding:14px;text-align:center;font-size:11px;color:#64748b">AIFAZI RP · aifazi.net</div>
</div>"""
    subject, html = _render_template(purpose, variables, fallback_subject, fallback_html)
    queue_email(to_email, subject, html, "", purpose)


def _normal_action(action: Any) -> dict[str, Any]:
    if not isinstance(action, dict):
        return {}
    game = action.get("game") if isinstance(action.get("game"), dict) else None
    out: dict[str, Any] = {}
    website_role = str(action.get("website_role") or "").strip()
    if website_role:
        out["website_role"] = website_role
    if game and game.get("type") in ("job", "group"):
        out["game"] = game
    return out


def _action_requires_game_sync(action: dict[str, Any]) -> bool:
    game = action.get("game") if isinstance(action, dict) else None
    return isinstance(game, dict) and game.get("type") in ("job", "group")


def _submission_display_status(row: dict) -> str:
    status = row.get("status") or "pending"
    action_status = row.get("action_status") or "none"
    if status == "approved" and row.get("last_active_at"):
        return "active"
    if status == "approved" and action_status == "failed":
        return "sync_failed"
    if status == "approved" and action_status == "pending":
        return "syncing"
    return status


def _submission_public(row: dict) -> dict:
    action = row.get("approved_action") if isinstance(row.get("approved_action"), dict) else {}
    return {
        "id": row.get("id"),
        "form_slug": row.get("form_slug"),
        "form_title": row.get("form_title"),
        "status": row.get("status") or "pending",
        "display_status": row.get("display_status") or _submission_display_status(row),
        "reviewer_note": row.get("reviewer_note") or "",
        "reviewed_by": row.get("reviewed_by") or "",
        "reviewed_at": row.get("reviewed_at"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "answers": row.get("answers") or {},
        "action_status": row.get("action_status") or "none",
        "action_synced_at": row.get("action_synced_at"),
        "action_sync_error": row.get("action_sync_error") or "",
        "approved_action": action,
        "last_active_at": row.get("last_active_at"),
        "last_active_name": row.get("last_active_name") or "",
    }


def _notify_admin(icon: str, title: str, msg: str) -> None:
    try:
        supabase.table("admin_notifications").insert({
            "icon": icon,
            "title": title,
            "msg": msg,
            "created_at": _now(),
        }).execute()
    except Exception:
        pass


@router.get("")
async def list_public_forms():
    try:
        res = (supabase.table("application_forms").select("*").eq("status", "active").neq("form_kind", "whitelist").order("category").order("title").execute())
    except Exception:
        res = (supabase.table("application_forms").select("*").eq("status", "active").order("category").order("title").execute())
    return {"forms": [_form_public(row) for row in (res.data or []) if (row.get("form_kind") or "universal") != "whitelist" and row.get("slug") != "whitelist"]}


@router.get("/admin/definitions")
async def list_form_definitions(_: dict = Depends(require_staff)):
    whitelist = _ensure_whitelist_form()
    res = supabase.table("application_forms").select("*").order("category").order("title").execute()
    rows = res.data or []
    if not any(r.get("slug") == "whitelist" for r in rows):
        rows = [whitelist, *rows]
    return {"forms": rows}


@router.post("/admin/definitions")
async def create_form_definition(body: FormDefinitionBody, _: dict = Depends(require_staff)):
    slug = _slug(body.slug or body.title)
    if not slug:
        raise HTTPException(422, "Slug is required")
    existing = supabase.table("application_forms").select("id").eq("slug", slug).limit(1).execute()
    if existing.data:
        raise HTTPException(409, "A form with this URL already exists")
    now = _now()
    payload = body.model_dump()
    payload["slug"] = slug
    payload["form_kind"] = "universal"
    payload["system_locked"] = False
    payload["public_path"] = f"/forms/{slug}"
    payload["created_at"] = now
    payload["updated_at"] = now
    res = supabase.table("application_forms").insert(payload).execute()
    if not res.data:
        raise HTTPException(500, "Failed to create form")
    return res.data[0]


@router.put("/admin/definitions/{slug}")
async def update_form_definition(slug: str, body: FormDefinitionBody, _: dict = Depends(require_staff)):
    clean_slug = _slug(body.slug or slug)
    if not clean_slug:
        raise HTTPException(422, "Slug is required")
    existing = supabase.table("application_forms").select("id,slug").eq("slug", clean_slug).neq("slug", slug).limit(1).execute()
    if existing.data:
        raise HTTPException(409, "A form with this URL already exists")
    current_res = supabase.table("application_forms").select("*").eq("slug", slug).limit(1).execute()
    current = (current_res.data or [{}])[0]
    payload = body.model_dump()
    if current.get("system_locked") or (current.get("form_kind") == "whitelist") or slug == "whitelist":
        clean_slug = "whitelist"
        payload["slug"] = "whitelist"
        payload["form_kind"] = "whitelist"
        payload["system_locked"] = True
        payload["public_path"] = "/whitelist"
        payload["approval_action"] = {"type":"server_whitelist"}
        payload["require_whitelist"] = False
    else:
        payload["slug"] = clean_slug
        payload["form_kind"] = "universal"
        payload["system_locked"] = False
        payload["public_path"] = f"/forms/{clean_slug}"
    payload["updated_at"] = _now()
    res = supabase.table("application_forms").update(payload).eq("slug", slug).execute()
    if not res.data:
        raise HTTPException(404, "Form not found")
    return res.data[0]


@router.get("/admin/submissions")
async def list_submissions(slug: str = "", status: str = "", _: dict = Depends(require_staff)):
    q = supabase.table("application_form_submissions").select("*").order("created_at", desc=True).limit(100)
    if slug:
        q = q.eq("form_slug", slug)
    if status:
        q = q.eq("status", status)
    res = q.execute()
    return {"submissions": [_submission_public(row) for row in (res.data or [])]}


@router.patch("/admin/submissions/{submission_id}")
async def review_submission(submission_id: str, body: SubmissionReviewBody, staff: dict = Depends(require_staff)):
    if body.status not in ("pending", "approved", "denied", "archived"):
        raise HTTPException(422, "Invalid status")

    cur = supabase.table("application_form_submissions").select("*").eq("id", submission_id).limit(1).execute()
    if not cur.data:
        raise HTTPException(404, "Submission not found")
    current = cur.data[0]

    submitter_id = str(current.get("user_id") or "")
    staff_id = str(staff.get("id") or staff.get("_id") or "")
    if submitter_id and staff_id and submitter_id == staff_id:
        raise HTTPException(403, "You cannot review your own application")

    form_res = supabase.table("application_forms").select("approval_action").eq("id", current.get("form_id")).limit(1).execute()
    action = _normal_action((form_res.data or [{}])[0].get("approval_action") if form_res.data else {})

    now = _now()
    patch = {
        "status": body.status,
        "reviewer_note": body.reviewer_note,
        "reviewed_by": staff.get("username") or staff.get("id"),
        "reviewed_at": now,
        "updated_at": now,
    }
    if body.status == "approved":
        patch["approved_action"] = action
        patch["action_status"] = "pending" if _action_requires_game_sync(action) else "synced"
        patch["action_sync_error"] = None
        if not _action_requires_game_sync(action):
            patch["action_synced_at"] = now
        website_role = action.get("website_role")
        if website_role and current.get("user_id"):
            try:
                supabase.table("users").update({"role": website_role}).eq("id", current.get("user_id")).execute()
            except Exception:
                patch["action_sync_error"] = "Website role update failed"
    elif body.status in ("denied", "archived"):
        patch["action_status"] = "skipped"
        patch["action_sync_error"] = f"Application {body.status} by staff"
    else:
        patch["action_status"] = "none"
        patch["action_sync_error"] = "Application reset by staff"

    res = supabase.table("application_form_submissions").update(patch).eq("id", submission_id).execute()
    if not res.data:
        raise HTTPException(404, "Submission not found")
    submission = res.data[0]
    _notify_admin("OK", f"{submission.get('form_title')} {body.status}", f"{submission.get('username') or submission.get('email') or 'A user'} was marked {body.status}")
    try:
        await _send_review_email(submission, body.status)
    except Exception:
        pass
    return _submission_public(submission)


@router.get("/my-submissions")
async def my_submissions(user: dict = Depends(get_current_user)):
    account = _load_account(user)
    user_id = str(account.get("id") or user.get("id") or user.get("_id") or "")
    q = supabase.table("application_form_submissions").select("*").order("created_at", desc=True).limit(20)
    if user_id:
        q = q.eq("user_id", user_id)
    elif account.get("email"):
        q = q.eq("email", account.get("email"))
    else:
        return {"submissions": []}
    res = q.execute()
    return {"submissions": [_submission_public(row) for row in (res.data or [])]}


@router.get("/{slug}")
async def get_public_form(slug: str):
    if slug == "whitelist":
        row = _ensure_whitelist_form()
        if row.get("status") != "active":
            raise HTTPException(404, "Form not found")
        return _form_public(row)
    res = supabase.table("application_forms").select("*").eq("slug", slug).limit(1).execute()
    if not res.data or res.data[0].get("status") != "active" or (res.data[0].get("form_kind") == "whitelist"):
        raise HTTPException(404, "Form not found")
    return _form_public(res.data[0])


@router.get("/{slug}/context")
async def get_form_context(slug: str, user: dict = Depends(get_current_user)):
    res = supabase.table("application_forms").select("*").eq("slug", slug).limit(1).execute()
    if not res.data or res.data[0].get("status") != "active":
        raise HTTPException(404, "Form not found")
    account = _load_account(user)
    whitelist = _find_approved_whitelist(account)
    return {
        "form": _form_public(res.data[0]),
        "account": _safe_account(account),
        "whitelist": whitelist,
        "whitelist_approved": bool(whitelist),
        "prefill": _account_prefill(account, whitelist),
        "requirement_message": "" if whitelist else "You must be whitelisted before applying for this form.",
    }


@router.post("/{slug}/submit")
async def submit_form(slug: str, body: FormSubmissionBody, user: dict = Depends(get_current_user)):
    form_res = supabase.table("application_forms").select("*").eq("slug", slug).limit(1).execute()
    if not form_res.data or form_res.data[0].get("status") != "active":
        raise HTTPException(404, "Form not found")
    form = form_res.data[0]
    account = _load_account(user)
    whitelist = _find_approved_whitelist(account)
    if form.get("require_whitelist") is not False and not whitelist:
        raise HTTPException(403, "You must be whitelisted before applying for this form.")
    answers = {**_account_prefill(account, whitelist), **body.answers}
    _validate_answers(form, answers)
    user_id = str(account.get("id") or user.get("id") or "")
    existing = (
        supabase.table("application_form_submissions")
        .select("id,status")
        .eq("user_id", user_id)
        .in_("status", ["pending", "approved"])
        .limit(1)
        .execute()
    )
    if existing.data:
        raise HTTPException(400, "You already have an active application. Only one community application can be pending or approved at a time.")
    now = _now()
    res = supabase.table("application_form_submissions").insert({
        "form_id": form["id"],
        "form_slug": form["slug"],
        "form_title": form["title"],
        "user_id": user_id,
        "username": account.get("username") or user.get("username"),
        "email": account.get("email") or user.get("email"),
        "answers": answers,
        "status": "pending",
        "action_status": "none",
        "approved_action": {},
        "last_active_at": None,
        "last_active_name": None,
        "created_at": now,
        "updated_at": now,
    }).execute()
    submission = (res.data or [{}])[0]
    _notify_admin("FORM", f"{form.get('title')} submitted", f"{account.get('username') or user.get('username') or 'A user'} submitted {form.get('title')}")
    await _send_submission_email(form, submission, account, answers)
    return {"message": form.get("success_message") or "Application submitted.", "submission": submission}
