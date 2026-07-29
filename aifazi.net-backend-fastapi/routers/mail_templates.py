"""routers/mail_templates.py
CRUD for email templates stored in mail_templates table.
Mounted at /api/admin/mail/templates in main.py
"""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from database import supabase
from dependencies import require_staff

router = APIRouter()


class TemplateBody(BaseModel):
    name:      str
    purpose:   str
    subject:   str
    html:      str
    variables: list[str] = []
    active:    bool = True


class TemplateUpdateBody(BaseModel):
    name:      str | None = None
    purpose:   str | None = None
    subject:   str
    html:      str
    variables: list[str] = []
    active:    bool = True


@router.get("")
async def list_templates(_: dict = Depends(require_staff)):
    res = supabase.table("mail_templates").select("*").order("purpose").limit(500).execute()
    return res.data or []


@router.get("/{purpose}")
async def get_template(purpose: str, _: dict = Depends(require_staff)):
    res = supabase.table("mail_templates").select("*").eq("purpose", purpose).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Template not found")
    return res.data[0]


@router.post("")
async def create_template(body: TemplateBody, _: dict = Depends(require_staff)):
    now = datetime.now(timezone.utc).isoformat()
    res = supabase.table("mail_templates").insert({
        "name": body.name, "purpose": body.purpose,
        "subject": body.subject, "html": body.html,
        "variables": body.variables, "active": body.active,
        "created_at": now, "updated_at": now,
    }).execute()
    if not res.data:
        raise HTTPException(500, "Failed to create template")
    return res.data[0]


@router.put("/{template_id}")
async def update_template(template_id: str, body: TemplateUpdateBody, _: dict = Depends(require_staff)):
    now = datetime.now(timezone.utc).isoformat()
    purpose = body.purpose or template_id
    name = body.name or purpose.replace("_", " ").title()
    payload = {
        "name": name, "purpose": purpose,
        "subject": body.subject, "html": body.html,
        "variables": body.variables, "active": body.active,
        "updated_at": now,
    }
    res = supabase.table("mail_templates").update(payload).or_(f"id.eq.{template_id},purpose.eq.{template_id}").execute()
    if not res.data:
        res = supabase.table("mail_templates").insert({
            **payload,
            "created_at": now,
        }).execute()
    if not res.data:
        raise HTTPException(500, "Failed to save template")
    return res.data[0]


@router.patch("/{template_id}/toggle")
async def toggle_template(template_id: str, _: dict = Depends(require_staff)):
    res = supabase.table("mail_templates").select("active").eq("id", template_id).execute()
    if not res.data:
        raise HTTPException(404, "Template not found")
    new_active = not res.data[0].get("active", True)
    supabase.table("mail_templates").update({"active": new_active}).eq("id", template_id).execute()
    return {"active": new_active}


@router.delete("/{template_id}")
async def delete_template(template_id: str, _: dict = Depends(require_staff)):
    supabase.table("mail_templates").delete().eq("id", template_id).execute()
    return {"message": "Deleted"}
