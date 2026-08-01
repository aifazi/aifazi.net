"""
routers/documents.py — User-uploaded documents (ID, license, proof, etc.).
Mounted at /api/documents. All endpoints require an authenticated user and
enforce ownership (a user can only see/manage their own documents).
"""
from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from database import supabase
from dependencies import get_current_user
from routers.cdn_upload import upload_media, delete_media

log = logging.getLogger("documents")
router = APIRouter()

MAX_UPLOAD_BYTES = 20 * 1024 * 1024  # 20 MB

ALLOWED_MIMETYPES = {
    "application/pdf",
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "text/plain", "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
}


def _user_id(user: dict) -> str:
    uid = user.get("id") or user.get("sub") or user.get("forum_user_id")
    if not uid:
        raise HTTPException(401, "Login required")
    return str(uid)


def _safe_filename(filename: str) -> str:
    base = (filename or "file").replace("\\", "/").rsplit("/", 1)[-1]
    return base.replace("..", "").strip()[:80] or "file"


@router.post("")
async def upload_document(
    file: UploadFile = File(...),
    name: str = "",
    category: str = "other",
    user: dict = Depends(get_current_user),
):
    uid = _user_id(user)
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File exceeds {MAX_UPLOAD_BYTES // 1024 // 1024} MB limit")

    mimetype = file.content_type or "application/octet-stream"
    if mimetype not in ALLOWED_MIMETYPES:
        raise HTTPException(415, f"File type '{mimetype}' is not allowed")

    filename = _safe_filename(file.filename or name or "document")

    # All documents are stored via the active CDN provider (Cloudflare R2),
    # grouped under the 'documents' folder for easy management in R2.
    try:
        file_url, storage_path, provider = await upload_media(
            content, filename, mimetype, folder="documents"
        )
    except Exception as exc:
        raise HTTPException(500, f"Upload failed: {str(exc)[:200]}")

    try:
        row = supabase.table("user_documents").insert({
            "user_id": uid,
            "name": name or filename,
            "category": category or "other",
            "file_url": file_url,
            "storage_path": storage_path,
            "provider": provider,
            "mime_type": mimetype,
            "file_size": len(content),
        }).execute()
        rec = row.data[0] if row.data else {}
    except Exception as exc:
        log.error("user_documents insert failed: %s", exc)
        raise HTTPException(500, f"Document record failed: {exc}")

    return {
        "id": rec.get("id"),
        "name": rec.get("name"),
        "category": rec.get("category"),
        "file_url": file_url,
        "mime_type": mimetype,
        "file_size": len(content),
    }


@router.get("")
async def my_documents(user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    res = (supabase.table("user_documents")
           .select("id,name,category,file_url,mime_type,file_size,created_at")
           .eq("user_id", uid).order("created_at", desc=True).execute())
    return res.data or []


@router.get("/{doc_id}/content")
async def document_content(doc_id: str, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    res = (supabase.table("user_documents")
           .select("id,file_url").eq("id", doc_id).eq("user_id", uid).limit(1).execute())
    if not res.data:
        raise HTTPException(404, "Document not found")
    doc = res.data[0]
    file_url = doc.get("file_url") or ""
    if not file_url:
        raise HTTPException(404, "File is not available")
    return RedirectResponse(file_url)


class DocumentPatchBody(BaseModel):
    name: str | None = None
    category: str | None = None


@router.patch("/{doc_id}")
async def update_document(doc_id: str, body: DocumentPatchBody, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    patch = {k: v for k, v in body.dict().items() if v is not None}
    if not patch:
        raise HTTPException(400, "Nothing to update")
    res = supabase.table("user_documents").update(patch).eq("id", doc_id).eq("user_id", uid).execute()
    if not res.data:
        raise HTTPException(404, "Document not found")
    return res.data[0]


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, user: dict = Depends(get_current_user)):
    uid = _user_id(user)
    res = (supabase.table("user_documents")
           .select("id,storage_path,provider").eq("id", doc_id).eq("user_id", uid).limit(1).execute())
    if not res.data:
        raise HTTPException(404, "Document not found")
    doc = res.data[0]
    await delete_media(doc.get("provider") or "r2", doc.get("storage_path") or "")
    supabase.table("user_documents").delete().eq("id", doc_id).execute()
    return {"ok": True}
