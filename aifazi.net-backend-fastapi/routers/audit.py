"""routers/audit.py
Frontend AuditPanel expects:
  GET  /admin/audit?page=1&limit=50        → { logs: [], total: 0 }
  POST /admin/audit                        → log event
  DELETE /admin/audit?olderThanDays=90     → { deleted: N }
  GET  /admin/audit/migrate                → create tables if missing
  GET  /admin/audit/check                  → verify tables exist + row counts
  GET  /admin/auth-log?page=1&limit=50     → { logs: [], total: 0 }

Frontend log fields used: log.actor, log.action, log.target, log.details, log.createdAt
Auth log fields: log.username, log.success, log.ip, log.userAgent, log.role, log.reason, log.createdAt
"""
import csv
import io
import json as _json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Response

from database import supabase
from permissions import require_permission
from utils.audit import migrate as audit_migrate
from utils.audit import record as audit_record

logger = logging.getLogger("audit.router")
router = APIRouter()


# ── Health / migration helpers ─────────────────────────────────────────────────

@router.get("/migrate")
async def run_migrate(_: dict = Depends(require_permission("system.audit", "manage"))):
    """Idempotent — create audit_logs table + indexes if they don't already exist.
    Restricted to admin or staff with system.audit.manage (escalated from view-only)."""
    return audit_migrate()


@router.get("/check")
async def check_table(_: dict = Depends(require_permission("system.audit", "view"))):
    """Verify audit_logs + auth_logs tables exist and return row counts."""
    result = {}
    for table in ("audit_logs", "auth_logs"):
        try:
            res = supabase.table(table).select("id", count="exact").limit(1).execute()
            result[table] = {"exists": True, "total_rows": res.count or 0}
        except Exception as exc:
            logger.error("audit /check failed for %s: %s", table, exc)
            result[table] = {"exists": False, "error": str(exc),
                             "hint": "Visit /api/admin/audit/migrate to create the table."}
    return result


@router.get("")
async def list_logs(
    page:  int = Query(1, ge=1),
    limit: int = Query(50, le=500),
    _: dict = Depends(require_permission("system.audit", "view")),
):
    offset = (page - 1) * limit
    count_res = supabase.table("audit_logs").select("id", count="exact").execute()
    total = count_res.count or 0
    res = (
        supabase.table("audit_logs")
        .select("*")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    logs = []
    for row in (res.data or []):
        logs.append({
            "_id":       row.get("id"),
            # prefer new column names; fall back to legacy column names
            "actor":     row.get("actor")   or row.get("username", "system"),
            "action":    row.get("action")  or row.get("event", ""),
            "target":    row.get("target")  or "",
            "details":   row.get("details") or row.get("meta"),
            "ip":        row.get("ip", ""),
            "role":      row.get("role", ""),
            "userAgent": row.get("user_agent", ""),
            "createdAt": row.get("created_at"),
        })
    return {"logs": logs, "total": total}


@router.get("/auth-log")
async def list_auth_logs(
    page:  int = Query(1, ge=1),
    limit: int = Query(50, le=500),
    _: dict = Depends(require_permission("system.audit", "view")),
):
    """#5 — Auth login activity log: every login attempt with username, IP, UA, success/fail."""
    offset = (page - 1) * limit
    try:
        count_res = supabase.table("auth_logs").select("id", count="exact").execute()
        total = count_res.count or 0
        res = (
            supabase.table("auth_logs")
            .select("*")
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        logs = []
        for row in (res.data or []):
            logs.append({
                "_id":       row.get("id"),
                "username":  row.get("username", ""),
                "success":   row.get("success", False),
                "ip":        row.get("ip", ""),
                "userAgent": row.get("user_agent", ""),
                "role":      row.get("role", ""),
                "reason":    row.get("reason", ""),
                "createdAt": row.get("created_at"),
            })
        return {"logs": logs, "total": total}
    except Exception as exc:
        logger.error("GET /auth-log failed: %s", exc)
        # Table may not exist yet — return empty with hint
        return {
            "logs": [], "total": 0,
            "hint": "auth_logs table missing — visit /api/admin/audit/migrate"
        }


@router.get("/export")
async def export_logs(_: dict = Depends(require_permission("system.audit", "view"))):
    """Stream the full audit log as CSV (paginated internally)."""
    rows = []
    page = 0
    while True:
        res = supabase.table("audit_logs").select("*").order("created_at", desc=True).range(page * 500, page * 500 + 499).execute()
        data = res.data or []
        rows.extend(data)
        if len(data) < 500:
            break
        page += 1
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["created_at", "actor", "action", "target", "ip", "role", "user_agent", "details"])
    for r in rows:
        det = r.get("details") or r.get("meta")
        try:
            det_s = _json.dumps(det) if det is not None else ""
        except Exception:
            det_s = str(det) if det is not None else ""
        w.writerow([
            r.get("created_at", ""), r.get("actor") or r.get("username", ""),
            r.get("action") or r.get("event", ""), r.get("target", ""),
            r.get("ip", ""), r.get("role", ""), r.get("user_agent", ""), det_s,
        ])
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="audit-log.csv"'},
    )

@router.post("")
async def log_event(body: dict, _: dict = Depends(require_permission("system.audit", "create"))):
    ok = audit_record(
        actor=body.get("actor")   or body.get("username", ""),
        action=body.get("action") or body.get("event",    ""),
        target=body.get("target", ""),
        details=body.get("details") or body.get("meta", {}),
        ip=body.get("ip", ""),
    )
    if not ok:
        logger.error("POST /admin/audit failed to insert row — check utils/audit.py logs")
    return {"ok": ok}

@router.delete("")
async def purge_logs(
    olderThanDays: int = Query(90, ge=1),
    _: dict = Depends(require_permission("system.audit", "delete")),
):
    """C4 — purging audit logs is destructive and must require admin or an explicit
    system.audit.delete permission. Previously any moderator (who only has view) could
    wipe the audit trail — a privilege escalation that contradicts the role matrix."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=olderThanDays)).isoformat()
    # Supabase delete returns deleted rows
    res = supabase.table("audit_logs").delete().lt("created_at", cutoff).execute()
    deleted = len(res.data) if res.data else 0
    return {"deleted": deleted, "cutoff": cutoff}
