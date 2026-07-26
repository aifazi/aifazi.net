"""
routers/upload.py — File upload routed to the active CDN provider.

Reads cdn_config.settings to decide where to store files:
  activeProvider: 'cloudinary' | 'r2' | 'b2' | 'imagekit' | 'bunny' | 'supabase' (default fallback)

All providers save a record in the `media` table after upload.
"""
import os, uuid, mimetypes, base64
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from database import supabase
from dependencies import require_staff
import httpx

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_BUCKET = "media"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB hard cap

ALLOWED_MIMETYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "video/mp4", "video/webm",
    "audio/mpeg", "audio/ogg", "audio/wav",
    "application/pdf",
    "application/zip",
    "text/plain", "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


# ── helpers ────────────────────────────────────────────────────────────────────

def _get_cdn_config() -> dict:
    res = supabase.table("cdn_config").select("settings").eq("key", "global").execute()
    return (res.data[0].get("settings") or {}) if res.data else {}


def _save_media(filename: str, original_name: str, mimetype: str, size: int, url: str,
                storage_path: str, provider: str) -> dict:
    row = supabase.table("media").insert({
        "filename":      filename,
        "original_name": original_name,
        "mimetype":      mimetype,
        "size":          size,
        "url":           url,
        "storage_path":  storage_path,
        "provider":      provider,
    }).execute()
    return row.data[0] if row.data else {}


# ── provider upload functions ──────────────────────────────────────────────────

async def _upload_cloudinary(content: bytes, filename: str, mimetype: str, cfg: dict) -> tuple[str, str]:
    """Upload via Cloudinary REST API. Returns (secure_url, public_id)."""
    import hashlib, time
    cloud  = cfg.get("cloudinaryCloudName", "").strip()
    key    = cfg.get("cloudinaryApiKey", "").strip()
    secret = cfg.get("cloudinaryApiSecret", "").strip()
    folder = cfg.get("cloudinaryFolder", "media").strip() or "media"
    if not (cloud and key and secret):
        raise HTTPException(500, "Cloudinary credentials not configured.")

    ts        = str(int(time.time()))
    sig_str   = f"folder={folder}&timestamp={ts}{secret}"
    signature = hashlib.sha1(sig_str.encode()).hexdigest()

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"https://api.cloudinary.com/v1_1/{cloud}/auto/upload",
            data={"api_key": key, "timestamp": ts, "signature": signature, "folder": folder},
            files={"file": (filename, content, mimetype)},
        )
    if r.status_code != 200:
        raise HTTPException(500, f"Cloudinary upload failed: {r.text[:200]}")
    body = r.json()
    # public_id is needed to delete/transform the asset later
    return body["secure_url"], body.get("public_id", body["secure_url"])


async def _upload_r2(content: bytes, filename: str, mimetype: str, cfg: dict) -> tuple[str, str]:
    """Upload to Cloudflare R2 via boto3 (S3-compatible). Returns (public_url, storage_key)."""
    import boto3
    from botocore.client import Config
    account    = cfg.get("r2AccountId", "").strip()
    key_id     = cfg.get("r2AccessKeyId", "").strip()
    secret     = cfg.get("r2SecretAccessKey", "").strip()
    bucket     = cfg.get("r2BucketName", "").strip()
    public_url = cfg.get("r2PublicUrl", "").strip().rstrip("/")
    if not (account and key_id and secret and bucket):
        raise HTTPException(500, "Cloudflare R2 credentials not configured.")

    storage_key = f"uploads/{uuid.uuid4()}_{filename}"
    try:
        client = boto3.client(
            "s3",
            endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
            aws_access_key_id=key_id,
            aws_secret_access_key=secret,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
        client.put_object(Bucket=bucket, Key=storage_key, Body=content, ContentType=mimetype)
    except Exception as e:
        raise HTTPException(500, f"R2 upload failed: {e}")

    if public_url:
        return f"{public_url}/{storage_key}", storage_key
    return f"https://{account}.r2.cloudflarestorage.com/{bucket}/{storage_key}", storage_key

async def _upload_b2(content: bytes, filename: str, mimetype: str, cfg: dict) -> tuple[str, str]:
    """Upload to Backblaze B2 via native API. Returns (file_url, storage_key)."""
    key_id  = cfg.get("b2KeyId", "").strip()
    app_key = cfg.get("b2AppKey", "").strip()
    bucket  = cfg.get("b2BucketName", "").strip()
    cdn_url = cfg.get("b2CdnUrl", "").strip().rstrip("/")
    if not (key_id and app_key and bucket):
        raise HTTPException(500, "Backblaze B2 credentials not configured.")

    storage_key = f"uploads/{uuid.uuid4()}_{filename}"
    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Authorize
        auth = base64.b64encode(f"{key_id}:{app_key}".encode()).decode()
        r = await client.get(
            "https://api.backblazeb2.com/b2api/v2/b2_authorize_account",
            headers={"Authorization": f"Basic {auth}"},
        )
        if r.status_code != 200:
            raise HTTPException(500, f"B2 auth failed: {r.text[:200]}")
        auth_data = r.json()
        api_url   = auth_data["apiUrl"]
        auth_token = auth_data["authorizationToken"]

        # 2. Get bucket ID
        r2 = await client.post(
            f"{api_url}/b2api/v2/b2_list_buckets",
            headers={"Authorization": auth_token},
            json={"accountId": auth_data["accountId"], "bucketName": bucket},
        )
        buckets = r2.json().get("buckets", [])
        if not buckets:
            raise HTTPException(500, f"B2 bucket '{bucket}' not found.")
        bucket_id = buckets[0]["bucketId"]

        # 3. Get upload URL
        r3 = await client.post(
            f"{api_url}/b2api/v2/b2_get_upload_url",
            headers={"Authorization": auth_token},
            json={"bucketId": bucket_id},
        )
        up = r3.json()
        up_url   = up["uploadUrl"]
        up_token = up["authorizationToken"]

        # 4. Upload
        import hashlib
        sha1 = hashlib.sha1(content).hexdigest()
        r4 = await client.post(
            up_url,
            headers={
                "Authorization": up_token,
                "X-Bz-File-Name": storage_key,
                "Content-Type": mimetype,
                "X-Bz-Content-Sha1": sha1,
            },
            content=content,
        )
        if r4.status_code != 200:
            raise HTTPException(500, f"B2 upload failed: {r4.text[:200]}")
        file_data = r4.json()

    if cdn_url:
        return f"{cdn_url}/{storage_key}", storage_key
    download_url = auth_data.get("downloadUrl", "")
    return f"{download_url}/file/{bucket}/{storage_key}", storage_key


async def _upload_imagekit(content: bytes, filename: str, mimetype: str, cfg: dict) -> tuple[str, str]:
    """Upload to ImageKit. Returns (url, fileId). fileId is needed for deletion."""
    private_key = cfg.get("imagekitPrivateKey", "").strip()
    endpoint    = cfg.get("imagekitUrlEndpoint", "").strip().rstrip("/")
    folder      = cfg.get("imagekitFolder", "/media").strip() or "/media"
    if not (private_key and endpoint):
        raise HTTPException(500, "ImageKit credentials not configured.")

    auth = base64.b64encode(f"{private_key}:".encode()).decode()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            "https://upload.imagekit.io/api/v1/files/upload",
            headers={"Authorization": f"Basic {auth}"},
            data={"fileName": filename, "folder": folder},
            files={"file": (filename, content, mimetype)},
        )
    if r.status_code not in (200, 201):
        raise HTTPException(500, f"ImageKit upload failed: {r.text[:200]}")
    body = r.json()
    # fileId is the identifier for deletion/management via ImageKit API
    return body["url"], body.get("fileId", body["url"])


async def _upload_bunny(content: bytes, filename: str, mimetype: str, cfg: dict) -> tuple[str, str]:
    """Upload to BunnyCDN Storage. Returns (pull_zone_url, storage_path)."""
    zone       = cfg.get("bunnyStorageZone", "").strip()
    access_key = cfg.get("bunnyAccessKey", "").strip()
    region     = cfg.get("bunnyStorageRegion", "").strip() or ""
    pull_zone  = cfg.get("bunnyPullZoneUrl", "").strip().rstrip("/")
    if not (zone and access_key):
        raise HTTPException(500, "BunnyCDN credentials not configured.")

    host = f"storage.bunnycdn.com" if not region else f"{region}.storage.bunnycdn.com"
    storage_key = f"uploads/{uuid.uuid4()}_{filename}"
    url = f"https://{host}/{zone}/{storage_key}"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.put(
            url,
            headers={"AccessKey": access_key, "Content-Type": mimetype},
            content=content,
        )
    if r.status_code not in (200, 201):
        raise HTTPException(500, f"BunnyCDN upload failed: {r.text[:200]}")

    if pull_zone:
        public_url = f"{pull_zone}/{storage_key}"
    else:
        public_url = f"https://{host}/{zone}/{storage_key}"
    return public_url, storage_key   # storage_key is the path within the zone for deletion


async def _upload_supabase(content: bytes, filename: str, mimetype: str) -> tuple[str, str]:
    """Upload to Supabase Storage. Returns (public_url, storage_path)."""
    ext = os.path.splitext(filename)[1] or ""
    storage_path = f"uploads/{uuid.uuid4()}{ext}"
    try:
        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=storage_path,
            file=content,
            file_options={"content-type": mimetype or "application/octet-stream"},
        )
    except Exception as e:
        err = str(e)
        if "Bucket not found" in err or "not found" in err.lower():
            raise HTTPException(500,
                "Storage bucket 'media' not found. "
                "Create a public bucket named 'media' in your Supabase project under Storage.")
        if "already exists" not in err.lower():
            raise HTTPException(500, f"Upload failed: {err}")
    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{storage_path}"
    return public_url, storage_path


# ── routes ────────────────────────────────────────────────────────────────────

@router.post("")
@router.post("/single")   # alias — chat frontend calls /upload/single
async def upload_file(
    file: UploadFile = File(...),
    _: dict = Depends(require_staff),
):
    content  = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File exceeds maximum allowed size of {MAX_UPLOAD_BYTES // 1024 // 1024} MB")

    mimetype = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    if mimetype not in ALLOWED_MIMETYPES:
        raise HTTPException(415, f"File type '{mimetype}' is not allowed")

    filename = file.filename or f"upload_{uuid.uuid4()}"

    cfg      = _get_cdn_config()
    # Frontend saves as 'provider'; fall back to 'activeProvider' for compat
    provider = (cfg.get("provider") or cfg.get("activeProvider") or "supabase").lower()

    public_url   = ""
    storage_path = ""

    custom_domain = cfg.get("customDomain", "").strip().rstrip("/")

    if provider == "cloudinary":
        public_url, storage_path = await _upload_cloudinary(content, filename, mimetype, cfg)
        # Rewrite to custom domain if set: replace res.cloudinary.com/<cloud>/
        if custom_domain and "res.cloudinary.com" in public_url:
            cloud = cfg.get("cloudinaryCloudName", "").strip()
            public_url = public_url.replace(
                f"https://res.cloudinary.com/{cloud}", custom_domain
            )

    elif provider == "r2":
        public_url, storage_path = await _upload_r2(content, filename, mimetype, cfg)

    elif provider == "b2":
        public_url, storage_path = await _upload_b2(content, filename, mimetype, cfg)

    elif provider == "imagekit":
        public_url, storage_path = await _upload_imagekit(content, filename, mimetype, cfg)

    elif provider == "bunny":
        public_url, storage_path = await _upload_bunny(content, filename, mimetype, cfg)

    else:
        # Default: Supabase Storage
        provider = "supabase"
        public_url, storage_path = await _upload_supabase(content, filename, mimetype)

    # Save record to media table
    media = _save_media(
        filename=filename,
        original_name=file.filename or filename,
        mimetype=mimetype,
        size=len(content),
        url=public_url,
        storage_path=storage_path,
        provider=provider,
    )

    return {
        "url":      public_url,
        "filename": filename,
        "size":     len(content),
        "mimetype": mimetype,
        "provider": provider,
        "id":       media.get("id"),
    }


@router.get("")
@router.get("/media")          # alias: frontend calls GET /upload/media
async def list_files(_: dict = Depends(require_staff)):
    res = supabase.table("media").select("*").order("created_at", desc=True).execute()
    return res.data or []


@router.post("/multiple")      # alias: frontend calls POST /upload/multiple
async def upload_multiple(
    files: list[UploadFile] = File(...),
    staff: dict = Depends(require_staff),
):
    """Upload multiple files at once. Delegates to single-file logic for each."""
    results = []
    cfg = _get_cdn_config()   # Fetch CDN config ONCE for all files
    for file in files:
        content  = await file.read()
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(413, f"File '{file.filename}' exceeds {MAX_UPLOAD_BYTES // 1024 // 1024} MB limit")

        mimetype = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
        if mimetype not in ALLOWED_MIMETYPES:
            raise HTTPException(415, f"File type '{mimetype}' is not allowed")

        filename = file.filename or f"upload_{uuid.uuid4()}"
        provider = (cfg.get("provider") or cfg.get("activeProvider") or "supabase").lower()

        if provider == "cloudinary":
            public_url, storage_path = await _upload_cloudinary(content, filename, mimetype, cfg)
        elif provider == "r2":
            public_url, storage_path = await _upload_r2(content, filename, mimetype, cfg)
        elif provider == "b2":
            public_url, storage_path = await _upload_b2(content, filename, mimetype, cfg)
        elif provider == "imagekit":
            public_url, storage_path = await _upload_imagekit(content, filename, mimetype, cfg)
        elif provider == "bunny":
            public_url, storage_path = await _upload_bunny(content, filename, mimetype, cfg)
        else:
            provider = "supabase"
            public_url, storage_path = await _upload_supabase(content, filename, mimetype)

        media = _save_media(
            filename=filename, original_name=file.filename or filename,
            mimetype=mimetype, size=len(content),
            url=public_url, storage_path=storage_path, provider=provider,
        )
        results.append({
            "url": public_url, "filename": filename,
            "size": len(content), "mimetype": mimetype,
            "provider": provider, "id": media.get("id"),
        })
    return results


@router.delete("/media/{media_id}")   # alias: frontend calls DELETE /upload/media/{id}
@router.delete("/{media_id}")
async def delete_file(media_id: str, _: dict = Depends(require_staff)):
    res = supabase.table("media").select("*").eq("id", media_id).single().execute()
    if not res.data:
        raise HTTPException(404, "File not found")

    row      = res.data
    provider = row.get("provider", "supabase")
    path     = row.get("storage_path", "")

    # Only attempt actual delete for Supabase (other CDNs don't expose delete here)
    if provider == "supabase" and path:
        try:
            supabase.storage.from_(SUPABASE_BUCKET).remove([path])
        except Exception:
            pass  # Best-effort delete

    supabase.table("media").delete().eq("id", media_id).execute()
    return {"message": "Deleted"}
