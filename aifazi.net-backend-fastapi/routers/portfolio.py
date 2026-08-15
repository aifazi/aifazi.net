"""routers/portfolio.py — Projects, SkillCategories, Certifications CRUD"""
from fastapi import APIRouter, Depends, HTTPException

from database import supabase
from dependencies import require_staff

router = APIRouter()

# ── Projects ────────────────────────────────────────────────────────────────────
@router.get("/projects")
async def list_projects():
    if not supabase:
        return []
    return (supabase.table("projects").select("*").order("display_order").execute().data or [])

@router.post("/projects")
async def create_project(body: dict, _: dict = Depends(require_staff)):
    return supabase.table("projects").insert(body).execute().data[0]

@router.put("/projects/{pid}")
async def update_project(pid: str, body: dict, _: dict = Depends(require_staff)):
    res = supabase.table("projects").update(body).eq("id", pid).execute()
    if not res.data: raise HTTPException(404, "Not found")
    return res.data[0]

@router.delete("/projects/{pid}")
async def delete_project(pid: str, _: dict = Depends(require_staff)):
    supabase.table("projects").delete().eq("id", pid).execute()
    return {"message": "Deleted"}

# ── Skill Categories ────────────────────────────────────────────────────────────
@router.get("/skills")
async def list_skills():
    return (supabase.table("skill_categories").select("*").order("display_order").execute().data or [])

@router.post("/skills")
async def create_skill(body: dict, _: dict = Depends(require_staff)):
    return supabase.table("skill_categories").insert(body).execute().data[0]

@router.put("/skills/{sid}")
async def update_skill(sid: str, body: dict, _: dict = Depends(require_staff)):
    res = supabase.table("skill_categories").update(body).eq("id", sid).execute()
    if not res.data: raise HTTPException(404, "Not found")
    return res.data[0]

@router.delete("/skills/{sid}")
async def delete_skill(sid: str, _: dict = Depends(require_staff)):
    supabase.table("skill_categories").delete().eq("id", sid).execute()
    return {"message": "Deleted"}

# ── Certifications ──────────────────────────────────────────────────────────────
@router.get("/certifications")
async def list_certs():
    return (supabase.table("certifications").select("*").order("display_order").execute().data or [])

@router.post("/certifications")
async def create_cert(body: dict, _: dict = Depends(require_staff)):
    return supabase.table("certifications").insert(body).execute().data[0]

@router.put("/certifications/{cid}")
async def update_cert(cid: str, body: dict, _: dict = Depends(require_staff)):
    res = supabase.table("certifications").update(body).eq("id", cid).execute()
    if not res.data: raise HTTPException(404, "Not found")
    return res.data[0]

@router.delete("/certifications/{cid}")
async def delete_cert(cid: str, _: dict = Depends(require_staff)):
    supabase.table("certifications").delete().eq("id", cid).execute()
    return {"message": "Deleted"}
