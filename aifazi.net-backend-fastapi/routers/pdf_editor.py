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
import base64
import io
import time
import uuid

from fastapi import APIRouter, File, HTTPException, Request, Response, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()

# ── In-memory session store ───────────────────────────────────────
# Values are {"bytes": pdf_bytes, "ip": creator_ip, "at": last_used_ts}
# so a leaked session_id (e.g. via <img> Referer headers) can't be used to
# render someone else's PDF from a different client IP. Sessions expire after
# SESSION_TTL_S of inactivity and are also FIFO-evicted at MAX_SESSIONS.
_sessions: dict[str, dict] = {}
MAX_SESSIONS = 20
MAX_PDF_MB   = 40
SESSION_TTL_S = 1800   # 30 min idle → drop session

def _now() -> float:
    return time.monotonic()

def _evict():
    """Drop expired sessions, then FIFO-evict the oldest if over cap."""
    now = _now()
    expired = [k for k, v in _sessions.items() if now - (v.get("at") or 0) > SESSION_TTL_S]
    for k in expired:
        del _sessions[k]
    while len(_sessions) > MAX_SESSIONS:
        del _sessions[next(iter(_sessions))]

def _touch(session_id: str):
    sess = _sessions.get(session_id)
    if sess:
        sess["at"] = _now()

def _client_ip(request) -> str:
    from utils.request_ip import client_ip
    return client_ip(request)

def _require_session(request, session_id: str):
    _evict()
    sess = _sessions.get(session_id)
    if not sess:
        raise HTTPException(404, "Session not found")
    # NOTE: IP binding was removed because every request transits the Vercel
    # proxy, which forwards from a pool of edge IPs → the session's stored IP
    # never matches the rendering/export request IP, breaking the whole editor.
    # The unguessable session UUID is the access control here.
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
    url:        str   = ""
    find:       str   = ""
    replacement: str  = ""
    match_case: bool  = True
    font_size:  float = 14
    color:      str   = "#000000"
    fill:       str   = ""
    image_b64:  str   = ""
    content:    str   = ""
    label:      str   = ""
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

class SearchBody(BaseModel):
    session_id: str
    query: str = ""
    match_case: bool = True

# ── Helpers ───────────────────────────────────────────────────────
def _hex_rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    if len(h) == 3: h = "".join(c*2 for c in h)
    if len(h) != 6:
        raise HTTPException(400, f"Invalid color: {h!r}")
    try:
        return int(h[:2],16)/255, int(h[2:4],16)/255, int(h[4:6],16)/255
    except ValueError:
        raise HTTPException(400, f"Invalid color: {h!r}")

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
        elif op.type == "replace_text":
            # Find + replace: redact every match rect, then stamp the new text.
            needle = op.find or op.text
            if not needle: continue
            matches = page.search_for(needle)
            if not matches: continue
            first = matches[0]
            for r in matches:
                rect = fitz.Rect(r.x0 - 1, r.y0, r.x1 + 1, r.y1)
                page.add_redact_annot(rect)
            try:
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)
            except Exception:
                pass
            fontsize = max(8, min(op.font_size or 11, first.height * 1.6))
            page.insert_text((first.x0, first.y1), op.replacement or op.text,
                             fontname=op.font_name or "helv",
                             fontsize=fontsize, color=_hex_rgb(op.color))
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
        elif op.type == "add_arrow":
            if len(op.points) >= 2:
                import math
                p1 = fitz.Point(op.points[0][0], op.points[0][1])
                p2 = fitz.Point(op.points[1][0], op.points[1][1])
                stroke = _hex_rgb(op.color)
                sh = page.new_shape()
                sh.draw_line(p1, p2)
                # arrowhead
                dx, dy = p2.x - p1.x, p2.y - p1.y
                ang = math.atan2(dy, dx)
                hw = max(6, min(18, op.line_width * 6 or 12))
                tip = fitz.Point(p2.x - hw * 0.3 * math.cos(ang), p2.y - hw * 0.3 * math.sin(ang))
                pA = fitz.Point(tip.x - hw * math.cos(ang - 0.4), tip.y - hw * math.sin(ang - 0.4))
                pB = fitz.Point(tip.x - hw * math.cos(ang + 0.4), tip.y - hw * math.sin(ang + 0.4))
                sh.draw_polyline([pA, tip, pB])
                sh.finish(color=stroke, width=op.line_width, closePath=False); sh.commit()
        elif op.type == "add_underline":
            stroke = _hex_rgb(op.color)
            r = fitz.Rect(op.x, op.y, op.x + op.width, op.y + op.height)
            sh = page.new_shape()
            sh.draw_line(fitz.Point(r.x0, r.y1), fitz.Point(r.x1, r.y1))
            sh.finish(color=stroke, width=1.5, closePath=False); sh.commit()
        elif op.type == "add_strikethrough":
            stroke = _hex_rgb(op.color)
            r = fitz.Rect(op.x, op.y, op.x + op.width, op.y + op.height)
            mid = (r.y0 + r.y1) / 2
            sh = page.new_shape()
            sh.draw_line(fitz.Point(r.x0, mid), fitz.Point(r.x1, mid))
            sh.finish(color=stroke, width=1.5, closePath=False); sh.commit()
        elif op.type in ("add_weblink", "add_link"):
            r = fitz.Rect(op.x, op.y, op.x + op.width, op.y + op.height)
            page.insert_link({"kind": fitz.LINK_URI, "from": r, "uri": op.url or op.text or "https://"})
        elif op.type == "add_articlebox":
            r = fitz.Rect(op.x, op.y, op.x + op.width, op.y + op.height)
            a = page.add_highlight_annot(r)
            a.set_colors(stroke=_hex_rgb(op.color or "#3b82f6"))
            a.set_opacity(0.15); a.update()
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
# H24 — memory-amplification guards. A crafted PDF can declare absurd page
# dimensions and still be tiny on disk; rendering such a page (any scale) or
# even iterating its metadata costs real RAM. These caps keep worst-case
# memory bounded regardless of the uploaded bytes.
MAX_PDF_PAGES   = 2000   # sane doc length
MAX_PAGE_POINTS = 20000  # a page dimension beyond this is almost surely hostile
MAX_RENDER_PX   = 4096   # longest rendered edge (px) regardless of scale

def _page_is_huge(page) -> bool:
    try:
        return page.rect.width > MAX_PAGE_POINTS or page.rect.height > MAX_PAGE_POINTS
    except Exception:
        return True


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
        if count > MAX_PDF_PAGES:
            doc.close()
            raise HTTPException(413, f"PDF exceeds {MAX_PDF_PAGES} pages")
        for i in range(count):
            if _page_is_huge(doc[i]):
                doc.close()
                raise HTTPException(413, "PDF page dimensions exceed the supported maximum")
        meta  = doc.metadata or {}
        pages = [{"width": doc[i].rect.width, "height": doc[i].rect.height,
                  "rotation": doc[i].rotation} for i in range(count)]
        doc.close()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"Cannot open PDF: {e}")
    _evict()
    sid = str(uuid.uuid4())
    _sessions[sid] = {"bytes": content, "ip": _client_ip(request), "at": _now()}
    return {"session_id": sid, "page_count": count, "filename": file.filename,
            "title": meta.get("title") or file.filename,
            "author": meta.get("author",""), "pages": pages,
            "size_bytes": len(content)}

@router.get("/page/{session_id}/{page_num}")
async def render_page(request: Request, session_id: str, page_num: int, scale: float = 1.5):
    import fitz
    sess = _require_session(request, session_id)
    _touch(session_id)
    doc  = fitz.open(stream=sess["bytes"], filetype="pdf")
    if not (0 <= page_num < doc.page_count):
        doc.close(); raise HTTPException(400, "Invalid page")
    # H24 — clamp the requested scale so the output edge never exceeds the cap,
    # even if the page itself is large. Prevents a pixel-bomb pixmap in RAM.
    page  = doc[page_num]
    base  = max(page.rect.width, page.rect.height)
    scale = max(0.5, min(float(scale), 4.0))
    if base > 0 and base * scale > MAX_RENDER_PX:
        scale = MAX_RENDER_PX / base
        scale = max(0.05, scale)
    mat = fitz.Matrix(scale, scale)
    pix = page.get_pixmap(matrix=mat, alpha=False)
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
    _touch(session_id)
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
    _touch(body.session_id)
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

@router.post("/search")
async def search_pdf(request: Request, body: SearchBody):
    import fitz
    sess = _require_session(request, body.session_id)
    _touch(body.session_id)
    query = body.query.strip()
    if not query:
        return {"total": 0, "matches": []}
    doc = fitz.open(stream=sess["bytes"], filetype="pdf")
    low_query = query.lower()
    results = []
    for i in range(doc.page_count):
        if body.match_case:
            rects = [r for r in doc[i].search_for(query)]
        else:
            # case-insensitive: match across word boxes so multi-word phrases
            # with different casing still resolve to real rects.
            words = doc[i].get_text("words")  # x0,y0,x1,y1,word,block,line,word_no
            hay = " ".join(w[4] for w in words)
            idx = hay.lower().find(low_query)
            rects = []
            while idx != -1 and len(rects) < 50:
                start_word = hay[:idx].count(" ")  # word index of match start
                end_word = hay[:idx + len(query)].count(" ")
                if 0 <= start_word < len(words) and 0 <= end_word < len(words):
                    a, b = words[start_word], words[end_word]
                    rects.append(fitz.Rect(a[0], a[1], b[2], b[3]))
                idx = hay.lower().find(low_query, idx + len(query))
        if rects:
            results.append({
                "page": i,
                "matches": [
                    {"x": r.x0, "y": r.y0, "width": r.x1 - r.x0, "height": r.y1 - r.y0}
                    for r in rects
                ],
            })
    doc.close()
    total = sum(len(m["matches"]) for m in results)
    return {"total": total, "matches": results}

@router.post("/ocr")
async def ocr_pdf(request: Request, body: CloseBody):
    """Run Tesseract OCR on every page and replace the session's PDF with an
    OCR'd copy that has a searchable/editable text layer."""
    import fitz
    sess = _require_session(request, body.session_id)
    _touch(body.session_id)
    doc = fitz.open(stream=sess["bytes"], filetype="pdf")
    out = fitz.open()
    errs = 0
    for page in doc:
        try:
            pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
            ocr_bytes = pix.pdfocr_tobytes(language="eng")
            sub = fitz.open("pdf", ocr_bytes)
            out.insert_pdf(sub)
            sub.close()
        except Exception:
            errs += 1
            out.insert_pdf(doc, from_page=page.number, to_page=page.number)
    doc.close()
    buf = io.BytesIO()
    out.save(buf, garbage=4, deflate=True)
    ocr_page_count = out.page_count
    out.close(); buf.seek(0)
    content = buf.getvalue()
    # replace session bytes so renders reflect the OCR'd copy
    _sessions[body.session_id] = {"bytes": content, "ip": sess.get("ip"), "at": _now()}
    return {"page_count": ocr_page_count, "ocr_errors": errs,
            "title": "OCR'd PDF", "size_bytes": len(content)}
