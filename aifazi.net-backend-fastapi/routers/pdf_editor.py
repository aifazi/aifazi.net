"""
routers/pdf_editor.py — Full-featured PDF Editor API (Foxit-like)
All processing done server-side with PyMuPDF (fitz).

Session: in-memory dict {session_id: pdf_bytes}.
Sessions are cleared when MAX_SESSIONS is hit (FIFO eviction).

Endpoints:
  POST /api/pdf-editor/open            upload PDF → session
  GET  /api/pdf-editor/page/{sid}/{n}  render page as PNG
  GET  /api/pdf-editor/thumb/{sid}/{n} thumbnail render
  GET  /api/pdf-editor/info/{sid}      page dims + metadata
  POST /api/pdf-editor/export          apply ops + download PDF
  POST /api/pdf-editor/close           discard session

SQL migration (run once in Supabase — only needed if you persist sessions):
  None — sessions are fully in-memory.
"""
import io, uuid, base64
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()

# ── In-memory session store ───────────────────────────────────────
# Values are {"bytes": pdf_bytes, "ip": creator_ip} so a leaked session_id
# (e.g. via <img> Referer headers) can't be used to render someone else's PDF
# from a different client IP.
_sessions: dict[str, dict] = {}
MAX_SESSIONS = 80
MAX_PDF_MB   = 80

def _evict():
    if len(_sessions) > MAX_SESSIONS:
        del _sessions[next(iter(_sessions))]

def _client_ip(request) -> str:
    from utils.request_ip import client_ip
    return client_ip(request)

def _require_session(request, session_id: str):
    sess = _sessions.get(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    if sess.get("ip") and sess["ip"] != _client_ip(request):
        raise HTTPException(403, "Session is bound to a different client")
    return sess

# ── Models ────────────────────────────────────────────────────────
class Operation(BaseModel):
    type:       str
    page:       int   = 0
    x:          float = 0
    y:          float = 0
    width:      float = 0
    height:     float = 0
    x2:         float = 0
    y2:         float = 0
    text:       str   = ""
    font_size:  float = 14
    color:      str   = "#000000"
    fill:       str   = ""
    image_b64:  str   = ""
    content:    str   = ""
    angle:      int   = 0
    points:     list  = []
    opacity:    float = 1.0
    line_width: float = 1.5
    font_name:  str   = "helv"

class ExportBody(BaseModel):
    session_id: str
    operations: list[Operation] = []

class CloseBody(BaseModel):
    session_id: str

# ── Helpers ───────────────────────────────────────────────────────
def _hex_rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    if len(h) == 3: h = "".join(c*2 for c in h)
    return int(h[:2],16)/255, int(h[2:4],16)/255, int(h[4:6],16)/255

def _apply_ops(doc, ops: list[Operation]):
    import fitz
    pages_to_delete = sorted(
        set(o.page for o in ops if o.type == "delete_page" and 0 <= o.page < doc.page_count),
        reverse=True,
    )
    for op in ops:
        if op.type == "delete_page": continue
        if not (0 <= op.page < doc.page_count): continue
        page = doc[op.page]
        if op.type == "rotate_page":
            page.set_rotation((page.rotation + op.angle) % 360)
        elif op.type == "add_text":
            page.insert_text((op.x, op.y), op.text,
                             fontname=op.font_name or "helv",
                             fontsize=op.font_size, color=_hex_rgb(op.color))
        elif op.type == "add_highlight":
            r = fitz.Rect(op.x, op.y, op.x+op.width, op.y+op.height)
            a = page.add_highlight_annot(r)
            a.set_colors(stroke=_hex_rgb(op.color or "#FFFF00"))
            a.set_opacity(op.opacity if op.opacity < 1 else 0.4)
            a.update()
        elif op.type in ("add_rect", "add_circle"):
            stroke = _hex_rgb(op.color)
            fill   = _hex_rgb(op.fill) if op.fill else None
            r = fitz.Rect(op.x, op.y, op.x+op.width, op.y+op.height)
            sh = page.new_shape()
            sh.draw_ellipse(r) if op.type == "add_circle" else sh.draw_rect(r)
            sh.finish(color=stroke, fill=fill, width=op.line_width); sh.commit()
        elif op.type == "add_line":
            if len(op.points) >= 2:
                p1 = fitz.Point(op.points[0][0], op.points[0][1])
                p2 = fitz.Point(op.points[1][0], op.points[1][1])
                sh = page.new_shape(); sh.draw_line(p1, p2)
                sh.finish(color=_hex_rgb(op.color), width=op.line_width); sh.commit()
        elif op.type == "add_freehand":
            if len(op.points) >= 2:
                pts = [fitz.Point(p[0], p[1]) for p in op.points]
                sh = page.new_shape(); sh.draw_polyline(pts)
                sh.finish(color=_hex_rgb(op.color), width=op.line_width, closePath=False)
                sh.commit()
        elif op.type == "add_note":
            page.add_text_annot(fitz.Point(op.x, op.y), op.content or op.text)
        elif op.type == "add_image":
            if op.image_b64:
                try:
                    raw = base64.b64decode(op.image_b64.split(",")[-1])
                    r = fitz.Rect(op.x, op.y, op.x+op.width, op.y+op.height)
                    page.insert_image(r, stream=raw)
                except Exception: pass
    for p in pages_to_delete:
        if 0 <= p < doc.page_count: doc.delete_page(p)

# ── Routes ────────────────────────────────────────────────────────
@router.post("/open")
async def open_pdf(request: Request, file: UploadFile = File(...)):
    import fitz
    content = await file.read()
    if not content: raise HTTPException(400, "Empty file")
    if len(content) > MAX_PDF_MB * 1024 * 1024:
        raise HTTPException(413, f"PDF too large (max {MAX_PDF_MB} MB)")
    try:
        doc   = fitz.open(stream=content, filetype="pdf")
        count = doc.page_count
        meta  = doc.metadata or {}
        pages = [{"width": doc[i].rect.width, "height": doc[i].rect.height,
                  "rotation": doc[i].rotation} for i in range(count)]
        doc.close()
    except Exception as e:
        raise HTTPException(400, f"Cannot open PDF: {e}")
    _evict()
    sid = str(uuid.uuid4())
    _sessions[sid] = {"bytes": content, "ip": _client_ip(request)}
    return {"session_id": sid, "page_count": count, "filename": file.filename,
            "title": meta.get("title") or file.filename,
            "author": meta.get("author",""), "pages": pages,
            "size_bytes": len(content)}

@router.get("/page/{session_id}/{page_num}")
async def render_page(request: Request, session_id: str, page_num: int, scale: float = 1.5):
    import fitz
    sess = _require_session(request, session_id)
    doc  = fitz.open(stream=sess["bytes"], filetype="pdf")
    if not (0 <= page_num < doc.page_count):
        doc.close(); raise HTTPException(400, "Invalid page")
    mat = fitz.Matrix(max(0.5, min(scale, 4.0)), max(0.5, min(scale, 4.0)))
    pix = doc[page_num].get_pixmap(matrix=mat, alpha=False)
    png = pix.tobytes("png")
    doc.close()
    return Response(content=png, media_type="image/png",
                    headers={"Cache-Control": "no-store"})

@router.get("/thumb/{session_id}/{page_num}")
async def thumbnail(request: Request, session_id: str, page_num: int):
    return await render_page(request, session_id, page_num, scale=0.28)

@router.get("/info/{session_id}")
async def get_info(request: Request, session_id: str):
    import fitz
    sess = _require_session(request, session_id)
    doc   = fitz.open(stream=sess["bytes"], filetype="pdf")
    pages = [{"width": doc[i].rect.width, "height": doc[i].rect.height,
               "rotation": doc[i].rotation} for i in range(doc.page_count)]
    meta  = doc.metadata or {}
    doc.close()
    return {"page_count": len(pages), "pages": pages, "metadata": meta}

@router.post("/export")
async def export_pdf(request: Request, body: ExportBody):
    import fitz
    sess = _require_session(request, body.session_id)
    doc = fitz.open(stream=sess["bytes"], filetype="pdf")
    if body.operations: _apply_ops(doc, body.operations)
    buf = io.BytesIO()
    doc.save(buf, garbage=4, deflate=True); doc.close(); buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="edited.pdf"'})

@router.post("/close")
async def close_session(request: Request, body: CloseBody):
    _require_session(request, body.session_id)
    _sessions.pop(body.session_id, None)
    return {"closed": True}
