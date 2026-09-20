"""routers/cdn_settings.py
Stores all CDN config in a single JSONB 'settings' column.

Migration (run once in Supabase SQL editor):
    ALTER TABLE cdn_config
        ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}';
    INSERT INTO cdn_config (key, settings)
        VALUES ('global', '{}')
        ON CONFLICT (key) DO NOTHING;
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request

from database import call_with_retry, supabase
from dependencies import require_admin, require_staff
from routers.cdn_upload import get_cdn_config as _get_cdn_config
from utils.audit import record as _audit

router = APIRouter()

def _get_row():
    res = supabase.table("cdn_config").select("settings").eq("key", "global").execute()
    return res.data[0] if res.data else None

_SECRET_FIELDS = frozenset({
    "cloudinaryApiSecret", "cloudinaryApiKey",
    "r2SecretAccessKey", "r2AccessKeyId",
    "imagekitPrivateKey",
    "b2AppKey", "b2KeyId",
    "bunnyAccessKey",
})


def _mask_secrets(settings: dict) -> dict:
    """Return a copy of settings with secret fields masked."""
    return {k: "••••••••" if k in _SECRET_FIELDS and v else v for k, v in settings.items()}


@router.get("")
async def get(_: dict = Depends(require_staff)):
    row = _get_row()
    if row is None:
        supabase.table("cdn_config").insert({"key": "global", "settings": {}}).execute()
        return {}
    return _mask_secrets(row.get("settings") or {})

@router.put("")
async def update(body: dict, _: dict = Depends(require_staff)):
    body.pop("id", None); body.pop("key", None); body.pop("settings", None)
    row = _get_row()
    if row is None:
        res = supabase.table("cdn_config").insert({"key": "global", "settings": body}).execute()
    else:
        merged = {**(row.get("settings") or {}), **body}
        res = supabase.table("cdn_config").update({"settings": merged}).eq("key", "global").execute()
    if not res.data:
        raise HTTPException(500, "Failed to save CDN settings")
    return res.data[0].get("settings") or {}

@router.get("/proxy-config")
async def proxy_config():
    """Public endpoint — returns only the info the CDN proxy needs (no secrets)."""
    row = call_with_retry(_get_row)
    cfg = (row.get("settings") or {}) if row else {}
    return {
        "provider":            cfg.get("provider", ""),
        "cloudinaryCloudName": cfg.get("cloudinaryCloudName", ""),
        "customDomain":        cfg.get("customDomain", ""),
    }


@router.post("/test")
async def test_connection(body: dict, _: dict = Depends(require_staff)):
    provider = body.get("provider", "cloudinary")

    if provider == "cloudinary":
        cloud = body.get("cloudinaryCloudName", "").strip()
        key   = body.get("cloudinaryApiKey", "").strip()
        secret = body.get("cloudinaryApiSecret", "").strip()
        if not all([cloud, key, secret]):
            raise HTTPException(400, "Cloud Name, API Key and API Secret are required.")
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(
                    f"https://api.cloudinary.com/v1_1/{cloud}/resources/image",
                    auth=(key, secret), params={"max_results": 1}
                )
            if r.status_code == 200:
                return {"message": f"Cloudinary connected. Cloud: {cloud}"}
            raise HTTPException(400, f"Cloudinary rejected credentials (HTTP {r.status_code}).")
        except httpx.RequestError as e:
            raise HTTPException(502, f"Could not reach Cloudinary: {e}")

    if provider == "r2":
        account = body.get("r2AccountId", "").strip()
        key_id  = body.get("r2AccessKeyId", "").strip()
        secret  = body.get("r2SecretAccessKey", "").strip()
        bucket  = body.get("r2BucketName", "").strip()
        if not all([account, key_id, secret, bucket]):
            raise HTTPException(400, "Account ID, Access Key ID, Secret and Bucket are required.")
        # Quick S3-compatible HEAD check
        try:
            import boto3
            from botocore.client import Config
            client = boto3.client(
                "s3",
                endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
                aws_access_key_id=key_id,
                aws_secret_access_key=secret,
                config=Config(signature_version="s3v4"),
                region_name="auto",
            )
            client.head_bucket(Bucket=bucket)
            return {"message": f"Cloudflare R2 connected. Bucket: {bucket}"}
        except Exception as e:
            raise HTTPException(400, f"R2 connection failed: {e}")

    if provider == "imagekit":
        private_key = body.get("imagekitPrivateKey", "").strip()
        endpoint    = body.get("imagekitUrlEndpoint", "").strip()
        if not all([private_key, endpoint]):
            raise HTTPException(400, "Private Key and URL Endpoint are required.")
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(
                    "https://api.imagekit.io/v1/files",
                    auth=(private_key, ""),
                    params={"limit": 1}
                )
            if r.status_code == 200:
                return {"message": f"ImageKit connected. Endpoint: {endpoint}"}
            raise HTTPException(400, f"ImageKit rejected credentials (HTTP {r.status_code}).")
        except httpx.RequestError as e:
            raise HTTPException(502, f"Could not reach ImageKit: {e}")

    if provider in ("b2", "bunny"):
        # For B2 / BunnyCDN just verify the required fields are present
        if provider == "b2":
            if not body.get("b2KeyId") or not body.get("b2AppKey"):
                raise HTTPException(400, "Key ID and Application Key are required.")
        else:
            if not body.get("bunnyStorageZone") or not body.get("bunnyAccessKey"):
                raise HTTPException(400, "Storage Zone and Access Key are required.")
        return {"message": f"{provider.upper()} credentials saved. Upload a file to verify connectivity."}

    raise HTTPException(400, f"Unknown provider: {provider}")


# ── Orphan sweeper ────────────────────────────────────────────────────────────
# Uploads are tracked in the `media` table (see routers/upload.py::_save_media).
# An upload is "orphaned" when neither its stored `url` nor its `storage_path`
# string appears anywhere in the latest content/blog rows.
_ORPHAN_MEDIA_LIMIT = 1000
_ORPHAN_SCAN_LIMIT = 500
_ORPHAN_SCAN_TABLES = (
    ("posts", "content,cover_image,excerpt"),
    ("content_blocks", "value"),
)


def _scan_table(table: str, cols: str) -> list[dict]:
    try:
        res = supabase.table(table).select(cols) \
            .order("created_at", desc=True).limit(_ORPHAN_SCAN_LIMIT).execute()
    except Exception:
        try:
            res = supabase.table(table).select(cols).limit(_ORPHAN_SCAN_LIMIT).execute()
        except Exception:
            return []
    return res.data or []


def _compute_orphans() -> dict:
    """Fresh server-side orphan computation. The delete endpoint re-runs this
    per call and intersects — a client-supplied key list is never trusted."""
    cfg = _get_cdn_config()
    _ = cfg  # provider creds stay server-side; only stored URL strings are matched
    media_res = supabase.table("media").select("*") \
        .order("created_at", desc=True).limit(_ORPHAN_MEDIA_LIMIT).execute()
    media_rows = media_res.data or []

    corpus_parts: list[str] = []
    scanned = 0
    for table, cols in _ORPHAN_SCAN_TABLES:
        rows = _scan_table(table, cols)
        scanned += len(rows)
        for row in rows:
            for val in row.values():
                if val:
                    corpus_parts.append(val if isinstance(val, str) else str(val))
    corpus = "\n".join(corpus_parts)

    orphans = []
    for m in media_rows:
        url = m.get("url") or ""
        sp = m.get("storage_path") or ""
        if (url and url in corpus) or (sp and sp in corpus):
            continue
        orphans.append({
            "key": sp or str(m.get("id")),
            "url": url,
            "size": m.get("size") or 0,
            "last_seen": m.get("created_at"),
        })
    return {"orphans": orphans, "scanned": scanned, "total_uploads": len(media_rows)}


@router.get("/orphans")
async def list_orphans(_: dict = Depends(require_admin)):
    return _compute_orphans()


@router.post("/orphans/delete")
async def delete_orphans(body: dict, request: Request, user: dict = Depends(require_admin)):
    keys = body.get("keys") or []
    if not body.get("confirm"):
        raise HTTPException(400, "Orphan deletion requires confirm:true")
    if not isinstance(keys, list) or not keys:
        raise HTTPException(422, "keys must be a non-empty list")
    if len(keys) > 50:
        raise HTTPException(400, "Maximum 50 keys per call")
    wanted = {str(k).strip() for k in keys if str(k).strip()}
    if not wanted:
        raise HTTPException(422, "keys must be a non-empty list")

    fresh = _compute_orphans()
    allowed = {o["key"] for o in fresh["orphans"]}
    targets = sorted(wanted & allowed)
    skipped = sorted(wanted - allowed)

    # Same provider-delete path as the upload flows (routers/upload.py).
    # Lazy import: upload.py must never import this module back.
    from routers.upload import delete_file
    id_by_key: dict[str, str] = {}
    try:
        all_media = supabase.table("media").select("id,storage_path") \
            .limit(_ORPHAN_MEDIA_LIMIT).execute()
        for m in all_media.data or []:
            if m.get("storage_path"):
                id_by_key[str(m["storage_path"])] = m.get("id")
            id_by_key[str(m.get("id"))] = m.get("id")
    except Exception:
        pass

    results: list[dict] = []
    for key in targets:
        mid = id_by_key.get(key)
        if not mid:
            results.append({"key": key, "ok": False, "error": "row not found"})
            continue
        try:
            await delete_file(mid, user)
            results.append({"key": key, "ok": True})
        except HTTPException as exc:
            results.append({"key": key, "ok": False, "error": str(exc.detail)[:200]})
        except Exception as exc:
            results.append({"key": key, "ok": False, "error": str(exc)[:200]})

    actor = str(user.get("username") or user.get("id") or "admin")
    _audit(actor, "cdn_orphan_delete", target="cdn_orphans",
           details={"requested": sorted(wanted),
                    "deleted": [r["key"] for r in results if r["ok"]],
                    "failed": [r for r in results if not r["ok"]],
                    "skipped_not_orphan": skipped},
           ip=request.client.host if request.client else "")
    return {"results": results, "skipped_not_orphan": skipped}
