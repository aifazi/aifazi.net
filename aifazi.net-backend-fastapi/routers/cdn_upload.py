"""
routers/cdn_upload.py — shared CDN media helpers.

Single source of truth for where uploaded bytes are stored and how the public
URL is derived. Every upload flow (forum/chat media, store digital product
files, user documents) routes through here so that ALL media lands in the same
provider and is served from the same domain.

Active provider is read from cdn_config (settings JSON):
  provider 'r2' (default) -> Cloudflare R2 via boto3 (S3-compatible). The
                             public URL prefers customDomain (cdn.aifazi.net)
                             and falls back to r2PublicUrl (.r2.dev).
  otherwise               -> Supabase Storage fallback.

Returns (public_url, storage_path, provider) so callers can persist the
provider string and later delete the exact bytes.
"""
from __future__ import annotations

import logging
import os
import uuid

from database import supabase

log = logging.getLogger("cdn_upload")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_BUCKET = "media"


def _safe_storage_filename(filename: str) -> str:
    """Strip path separators + traversal so the client-supplied filename can
    never escape the uploads/ prefix in the bucket."""
    base = (filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    base = base.replace("..", "").replace("/", "_").strip()[:80]
    return base or "file"


def get_cdn_config() -> dict:
    try:
        res = supabase.table("cdn_config").select("settings").eq("key", "global").execute()
        return (res.data[0].get("settings") or {}) if res.data else {}
    except Exception:
        return {}


def _bucket_name(cfg: dict) -> str:
    # strip defensively — the saved setting has had a stray leading space before
    return (cfg.get("r2BucketName") or cfg.get("r2Bucket") or "").strip()


def _public_base(cfg: dict) -> str:
    return (cfg.get("customDomain") or cfg.get("r2PublicUrl") or "").strip().rstrip("/")


def _upload_r2(content: bytes, filename: str, mimetype: str, cfg: dict, folder: str = "media") -> tuple[str, str]:
    import boto3
    from botocore.client import Config
    account  = (cfg.get("r2AccountId") or "").strip()
    key_id   = (cfg.get("r2AccessKeyId") or "").strip()
    secret   = (cfg.get("r2SecretAccessKey") or "").strip()
    bucket   = _bucket_name(cfg)
    base_url = _public_base(cfg)
    if not (account and key_id and secret and bucket):
        raise RuntimeError("Cloudflare R2 credentials not configured.")

    storage_key = f"{folder}/{uuid.uuid4()}_{_safe_storage_filename(filename)}"
    client = boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=key_id,
        aws_secret_access_key=secret,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )
    client.put_object(Bucket=bucket, Key=storage_key, Body=content, ContentType=mimetype)

    if base_url:
        return f"{base_url}/{storage_key}", storage_key
    return f"https://{account}.r2.cloudflarestorage.com/{bucket}/{storage_key}", storage_key


def _delete_r2(storage_path: str, cfg: dict) -> bool:
    import boto3
    from botocore.client import Config
    account = (cfg.get("r2AccountId") or "").strip()
    key_id  = (cfg.get("r2AccessKeyId") or "").strip()
    secret  = (cfg.get("r2SecretAccessKey") or "").strip()
    bucket  = _bucket_name(cfg)
    if not (account and key_id and secret and bucket and storage_path):
        return False
    client = boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=key_id,
        aws_secret_access_key=secret,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )
    client.delete_object(Bucket=bucket, Key=storage_path)
    return True


def _upload_supabase(content: bytes, filename: str, mimetype: str, folder: str = "media") -> tuple[str, str]:
    ext = os.path.splitext(filename)[1] or ""
    storage_path = f"{folder}/{uuid.uuid4()}{ext}"
    supabase.storage.from_(SUPABASE_BUCKET).upload(
        path=storage_path,
        file=content,
        file_options={"content-type": mimetype or "application/octet-stream"},
    )
    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{storage_path}"
    return public_url, storage_path


async def upload_media(
    content: bytes,
    filename: str,
    mimetype: str,
    *,
    folder: str = "media",
    fallback_to_supabase: bool = True,
) -> tuple[str, str, str]:
    """Upload bytes to the active provider. Returns (public_url, storage_path, provider).

    folder groups objects by purpose in the bucket, e.g. 'media' (forum/chat
    uploads), 'store' (digital product files), 'documents' (user documents).
    """
    cfg = get_cdn_config()
    provider = ((cfg.get("provider") or cfg.get("activeProvider") or "supabase") or "").lower()
    if provider == "r2":
        try:
            url, path = _upload_r2(content, filename, mimetype, cfg, folder)
            return url, path, "r2"
        except Exception as exc:
            log.warning("R2 upload failed (%s); fallback_to_supabase=%s", exc, fallback_to_supabase)
            if not fallback_to_supabase:
                raise
    url, path = _upload_supabase(content, filename, mimetype, folder)
    return url, path, "supabase"


async def delete_media(provider: str, storage_path: str) -> None:
    """Best-effort delete of stored bytes for the given provider."""
    if not storage_path:
        return
    cfg = get_cdn_config()
    try:
        if provider == "r2":
            _delete_r2(storage_path, cfg)
        elif provider == "supabase":
            supabase.storage.from_(SUPABASE_BUCKET).remove([storage_path])
    except Exception as exc:
        log.warning("media delete failed (%s): %s", provider, exc)
