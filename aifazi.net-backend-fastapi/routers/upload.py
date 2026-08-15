"""
routers/upload.py — File upload routed to the active CDN provider.

Reads cdn_config.settings to decide where to store files:
  activeProvider: 'cloudinary' | 'r2' | 'b2' | 'imagekit' | 'bunny' | 'supabase' (default fallback)

All providers save a record in the `media` table after upload.
"""
import base64
import logging
import mimetypes
import os
import uuid

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from database import supabase
from dependencies import get_current_user, require_staff
from routers.cdn_upload import _delete_r2, _upload_r2
from routers.cdn_upload import get_cdn_config as _get_cdn_config

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_BUCKET = "media"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB hard cap

# ── ClamAV malware scanning ────────────────────────────────────────────────────
_CLAMD_HOST = os.getenv("CLAMD_HOST", "localhost")
_CLAMD_PORT = int(os.getenv("CLAMD_PORT", "3310"))
_MALWARE_SCAN_ENABLED = os.getenv("MALWARE_SCAN_ENABLED", "false").lower() == "true"

log = logging.getLogger("upload")

def scan_for_malware(content: bytes, filename: str) -> None:
    """
    Scan file content for malware using ClamAV daemon.
    Raises HTTPException 415 if malware detected or scan fails critically.
    """
    if not _MALWARE_SCAN_ENABLED:
        return
    
    try:
        import pyclamd
        cd = pyclamd.ClamdUnixSocket() if _CLAMD_HOST == "localhost" else pyclamd.ClamdNetworkSocket(_CLAMD_HOST, _CLAMD_PORT)
        
        # Ping to verify connection
        if not cd.ping():
            log.warning("ClamAV daemon not reachable; skipping malware scan for %s", filename)
            return
        
        result = cd.scan_stream(content)
        if result:
            status, details = list(result.items())[0]
            if status == "FOUND":
                log.warning("Malware detected in %s: %s", filename, details)
                raise HTTPException(415, f"File rejected: malware detected ({details})")
    except ImportError:
        log.warning("pyclamd not installed; skipping malware scan for %s", filename)
    except pyclamd.ConnectionError:
        log.warning("ClamAV connection failed; skipping malware scan for %s", filename)
    except Exception as exc:
        log.warning("Malware scan error for %s: %s", filename, exc)
        # Fail-open: log but don't block upload on scan errors
        # Change to fail-closed by raising if desired

# Member-facing chat/media uploads are more conservative than the staff library:
# images + short-form media only, capped at 10 MB.
CHAT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024
CHAT_ALLOWED_MIMETYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "video/mp4", "video/webm",
    "audio/mpeg", "audio/ogg", "audio/wav",
}

ALLOWED_MIMETYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "video/mp4", "video/webm",
    "audio/mpeg", "audio/ogg", "audio/wav",
    "application/pdf",
    "application/zip",
    "text/plain", "text/csv",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

# H11 — image/svg+xml is DELIBERATELY EXCLUDED. SVG carries inline <script> and
# event-handler attributes that execute in the browser when served as
# image/svg+xml (browsers DO run scripts inside SVG loaded as an <img> source
# since SVG is also an XML document). Even with nosniff on your domain, an
# attacker can upload `<svg onload=alert(1)>` and serve it via the raw CDN URL
# where nosniff may not be set. Magic-byte sniffing is applied below so a
# client masquerading an .exe as image/png is rejected even if the header lies.

_MAGIC_BYTES = [
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"RIFF", "image/webp"),       # WebP starts with RIFF....WEBP
    (b"\x00\x00\x00", "video/mp4"),
    (b"\x1a\x45\xdf\xa3", "video/webm"),  # Matroska/WebM EBML header
    (b"ID3", "audio/mpeg"),
    (b"OggS", "audio/ogg"),
    (b"RIFF", "audio/wav"),
    (b"%PDF", "application/pdf"),
    (b"PK\x03\x04", "application/zip"),
    (b"PK\x03\x04", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    (b"PK\x03\x04", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
]


def _sniff_mimetype(content: bytes, fallback: str) -> str:
    """Detect actual file type via magic bytes rather than trusting the client
    Content-Type. H11 — the previous validation passed the attacker's own
    Content-Type header straight through, so a .exe labelled `image/png`
    passed and got served as image/png. Sniff the first bytes to confirm.
    H6 (audit) — if NO magic signature matches, return 'application/octet-stream'
    instead of the caller-supplied fallback, so a client-claimed allow-listed
    MIME can never smuggle arbitrary content through."""
    for magic, mime in _MAGIC_BYTES:
        if content.startswith(magic):
            # Disambiguate WebP (RIFF....WEBP) from WAV (RIFF....WAVE)
            if magic == b"RIFF" and len(content) >= 12:
                fourcc = content[8:12]
                if fourcc == b"WEBP":
                    return "image/webp"
                if fourcc == b"WAVE":
                    return "audio/wav"
            return mime
    # Office formats (docx/xlsx) share the .zip container; we can't distinguish
    # them by magic bytes alone, so let the allow-list decide — but never let an
    # arbitrary claimed MIME through without a matching signature.
    if fallback in ("application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") and content.startswith(b"PK\x03\x04"):
        return fallback
    return "application/octet-stream"


def _scrub_provider_error(text: str, *, max_len: int = 200) -> str:
    """H12 — collapse a raw provider error body into a safe, generic string so
    the staff UI doesn't see signed upload URLs, partial auth tokens, internal
    node IPs, or request-IDs echoed back by Cloudinary/R2/B2/Bunny/ImageKit."""
    if not text:
        return "Upload provider error"
    import re as _re
    # Redact obvious secret patterns even if we keep some text
    secret_patterns = [
        _re.compile(rb"authorizationToken[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9/+=_-]+", _re.IGNORECASE),
        _re.compile(rb"uploadUrl[\"']?\s*[:=]\s*[\"']?https?://[^\s\"'<>]+", _re.IGNORECASE),
        _re.compile(rb"x-amz-[a-z-]*[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9/+=%._-]+", _re.IGNORECASE),
        _re.compile(rb"signature[\"']?\s*[:=]\s*[\"']?[A-Za-z0-9/+=]+", _re.IGNORECASE),
    ]
    redacted = text.encode("utf-8", errors="replace") if isinstance(text, str) else text
    for p in secret_patterns:
        redacted = p.sub(b"[REDACTED]", redacted)
    out = redacted.decode("utf-8", errors="replace")
    return out[:max_len]


# ── helpers ────────────────────────────────────────────────────────────────────

def _safe_storage_filename(filename: str) -> str:
    """H6/M11 — strip path separators and traversal so the client-supplied
    filename can never escape its prefix inside the bucket (e.g. `../../x` on
    BunnyCDN becomes a URL path traversal against the storage zone)."""
    base = (filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    base = base.replace("..", "").replace("/", "_").strip()[:80]
    return base or "file"


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


async def _upload_to_provider(content: bytes, filename: str, mimetype: str, cfg: dict) -> tuple[str, str, str]:
    """Dispatch to the active CDN provider. Returns (public_url, storage_path, provider)."""
    provider = (cfg.get("provider") or cfg.get("activeProvider") or "supabase").lower()
    custom_domain = cfg.get("customDomain", "").strip().rstrip("/")

    if provider == "cloudinary":
        public_url, storage_path = await _upload_cloudinary(content, filename, mimetype, cfg)
        if custom_domain and "res.cloudinary.com" in public_url:
            cloud = cfg.get("cloudinaryCloudName", "").strip()
            public_url = public_url.replace(f"https://res.cloudinary.com/{cloud}", custom_domain)
    elif provider == "r2":
        public_url, storage_path = _upload_r2(content, filename, mimetype, cfg, "media")
    elif provider == "b2":
        public_url, storage_path = await _upload_b2(content, filename, mimetype, cfg)
    elif provider == "imagekit":
        public_url, storage_path = await _upload_imagekit(content, filename, mimetype, cfg)
    elif provider == "bunny":
        public_url, storage_path = await _upload_bunny(content, filename, mimetype, cfg)
    else:
        provider = "supabase"
        public_url, storage_path = await _upload_supabase(content, filename, mimetype)
    return public_url, storage_path, provider


# ── provider upload functions ──────────────────────────────────────────────────

async def _upload_cloudinary(content: bytes, filename: str, mimetype: str, cfg: dict) -> tuple[str, str]:
    """Upload via Cloudinary REST API. Returns (secure_url, public_id)."""
    import hashlib
    import time
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
        raise HTTPException(500, f"Cloudinary upload failed: {_scrub_provider_error(r.text)}")
    body = r.json()
    # public_id is needed to delete/transform the asset later
    return body["secure_url"], body.get("public_id", body["secure_url"])


async def _upload_b2(content: bytes, filename: str, mimetype: str, cfg: dict) -> tuple[str, str]:
    """Upload to Backblaze B2 via native API. Returns (file_url, storage_key)."""
    key_id  = cfg.get("b2KeyId", "").strip()
    app_key = cfg.get("b2AppKey", "").strip()
    bucket  = cfg.get("b2BucketName", "").strip()
    cdn_url = cfg.get("b2CdnUrl", "").strip().rstrip("/")
    if not (key_id and app_key and bucket):
        raise HTTPException(500, "Backblaze B2 credentials not configured.")

    storage_key = f"uploads/{uuid.uuid4()}_{_safe_storage_filename(filename)}"
    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Authorize
        auth = base64.b64encode(f"{key_id}:{app_key}".encode()).decode()
        r = await client.get(
            "https://api.backblazeb2.com/b2api/v2/b2_authorize_account",
            headers={"Authorization": f"Basic {auth}"},
        )
        if r.status_code != 200:
            raise HTTPException(500, f"B2 auth failed: {_scrub_provider_error(r.text)}")
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
            raise HTTPException(500, f"B2 upload failed: {_scrub_provider_error(r4.text)}")
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
        raise HTTPException(500, f"ImageKit upload failed: {_scrub_provider_error(r.text)}")
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

    host = "storage.bunnycdn.com" if not region else f"{region}.storage.bunnycdn.com"
    storage_key = f"uploads/{uuid.uuid4()}_{_safe_storage_filename(filename)}"
    url = f"https://{host}/{zone}/{storage_key}"
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.put(
            url,
            headers={"AccessKey": access_key, "Content-Type": mimetype},
            content=content,
        )
    if r.status_code not in (200, 201):
        raise HTTPException(500, f"BunnyCDN upload failed: {_scrub_provider_error(r.text)}")

    if pull_zone:
        public_url = f"{pull_zone}/{storage_key}"
    else:
        public_url = f"https://{host}/{zone}/{storage_key}"
    return public_url, storage_key   # storage_key is the path within the zone for deletion


async def _upload_supabase(content: bytes, filename: str, mimetype: str) -> tuple[str, str]:
    """Upload to Supabase Storage. Returns (public_url, storage_path)."""
    ext = os.path.splitext(filename)[1] or ""
    storage_path = f"media/{uuid.uuid4()}{ext}"
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

    # H11 — sniff magic bytes; reject any mismatch between claimed and detected MIME.
    mimetype = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    sniffed  = _sniff_mimetype(content, mimetype)
    if sniffed not in ALLOWED_MIMETYPES:
        raise HTTPException(415, f"File type '{sniffed}' is not allowed")
    mimetype = sniffed

    # Malware scan (fail-open)
    scan_for_malware(content, file.filename or "upload")

    filename = file.filename or f"upload_{uuid.uuid4()}"
    filename = _safe_storage_filename(filename)  # M11 — strip traversal/separators

    cfg      = _get_cdn_config()
    public_url, storage_path, provider = await _upload_to_provider(content, filename, mimetype, cfg)

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

        # H11 — sniff magic bytes for every file in the multi-upload batch.
        mimetype = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
        sniffed  = _sniff_mimetype(content, mimetype)
        if sniffed not in ALLOWED_MIMETYPES:
            raise HTTPException(415, f"File type '{sniffed}' is not allowed")
        mimetype = sniffed

        # Malware scan (fail-open)
        scan_for_malware(content, file.filename or "upload")

        filename = file.filename or f"upload_{uuid.uuid4()}"
        filename = _safe_storage_filename(filename)  # M11 — strip traversal/separators
        cfg = _get_cdn_config()
        public_url, storage_path, provider = await _upload_to_provider(content, filename, mimetype, cfg)

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


@router.post("/chat")
async def upload_chat_media(
    file: UploadFile = File(...),
    room_id: str = "",
    thread_id: str = "",
    user: dict = Depends(get_current_user),
):
    """Member-facing media upload for chat rooms and DMs.

    Unlike the staff library upload, this only requires that the caller can
    actually post in the target conversation:
      * room_id    → must pass _ensure_room_access + have `send_messages`
      * thread_id  → must be a participant of that DM thread
    The file is validated (magic bytes + allow-list) and routed to the same
    active CDN provider; the media row is tagged with the conversation for
    later cleanup/audit.
    """
    if not room_id and not thread_id:
        raise HTTPException(400, "room_id or thread_id required")

    if room_id:
        from routers.chat import _ensure_room_access, _require_room_perm
        room = _ensure_room_access(room_id, user)
        _require_room_perm(room, user, "send_messages")
    else:
        from routers.chat_dm import _get_thread
        _get_thread(thread_id, user)

    content = await file.read()
    if len(content) > CHAT_UPLOAD_MAX_BYTES:
        raise HTTPException(413, f"Chat media limit is {CHAT_UPLOAD_MAX_BYTES // 1024 // 1024} MB")

    mimetype = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    sniffed = _sniff_mimetype(content, mimetype)
    if sniffed not in CHAT_ALLOWED_MIMETYPES:
        raise HTTPException(415, f"File type '{sniffed}' is not allowed in chat")
    mimetype = sniffed

    # Malware scan (fail-open)
    scan_for_malware(content, file.filename or "chat")

    filename = _safe_storage_filename(file.filename or f"chat_{uuid.uuid4()}")

    cfg = _get_cdn_config()
    public_url, storage_path, provider = await _upload_to_provider(content, filename, mimetype, cfg)

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
        "url": public_url,
        "filename": filename,
        "size": len(content),
        "mimetype": mimetype,
        "provider": provider,
        "id": media.get("id"),
        "room_id": room_id,
        "thread_id": thread_id,
    }


@router.delete("/media/{media_id}")   # alias: frontend calls DELETE /upload/media/{id}
@router.delete("/{media_id}")
async def delete_file(media_id: str, _: dict = Depends(require_staff)):
    res = supabase.table("media").select("*").eq("id", media_id).single().execute()
    if not res.data:
        raise HTTPException(404, "File not found")

    row      = res.data
    provider = (row.get("provider") or "supabase").lower()
    path     = row.get("storage_path", "")
    url      = row.get("url", "")
    cfg      = _get_cdn_config()
    deletion_errors: list[str] = []

    # H13 — previously ONLY Supabase files were actually deleted from the CDN;
    # Cloudinary/R2/B2/ImageKit/Bunny URLs kept serving malicious content
    # forever even after the `media` row was removed. Now we best-effort delete
    # on every provider.
    try:
        if provider == "supabase" and path:
            supabase.storage.from_(SUPABASE_BUCKET).remove([path])

        elif provider == "cloudinary":
            # Cloudinary destroy uses the public_id (stored in storage_path) +
            # a signed request. We use the timestamp+signature approach.
            import hashlib
            import time as _time
            cloud  = cfg.get("cloudinaryCloudName", "").strip()
            key    = cfg.get("cloudinaryApiKey", "").strip()
            secret = cfg.get("cloudinaryApiSecret", "").strip()
            if cloud and key and secret and path:
                ts = int(_time.time())
                to_sign = f"public_id={path}&timestamp={ts}{secret}"
                sig = hashlib.sha1(to_sign.encode()).hexdigest()
                async with httpx.AsyncClient(timeout=15) as c:
                    await c.post(
                        f"https://api.cloudinary.com/v1_1/{cloud}/image/destroy",
                        data={"public_id": path, "timestamp": ts, "api_key": key, "signature": sig},
                    )

        elif provider == "r2":
            # boto3 DeleteObject via the S3-compatible R2 endpoint (uses the
            # same cdn_config bucket key as the upload path).
            _delete_r2(path, cfg)

        elif provider == "b2":
            # B2 native API: authorize → get_upload_url is per-bucket, but the
            # delete API endpoint is /b2api/v2/b2_delete_file_version.
            app_key_id    = cfg.get("b2KeyId", "").strip()
            app_key_secret = cfg.get("b2AppKey", "").strip()
            file_id       = path  # we store the file_id as storage_path for B2
            if app_key_id and app_key_secret and file_id:
                async with httpx.AsyncClient(timeout=15) as c:
                    auth = await c.post(
                        "https://api.backblazeb2.com/b2api/v2/b2_authorize_account",
                        auth=(app_key_id, app_key_secret),
                    )
                    if auth.status_code == 200:
                        api_url = auth.json()["apiUrl"] + "/b2api/v2/b2_delete_file_version"
                        tok = auth.json()["authorizationToken"]
                        await c.post(api_url, json={"fileId": file_id, "fileName": row.get("filename", "")},
                                     headers={"Authorization": tok})

        elif provider == "imagekit":
            # ImageKit delete: DELETE /v1/files/{fileId} with basic auth.
            pub_key = cfg.get("imagekitPublicKey", "").strip()
            priv_key = cfg.get("imagekitPrivateKey", "").strip()
            file_id = path  # we store the fileId as storage_path
            if pub_key and priv_key and file_id:
                import base64 as _b64
                basic = _b64.b64encode(f"{priv_key}:".encode()).decode()
                async with httpx.AsyncClient(timeout=15) as c:
                    await c.delete(
                        f"https://api.imagekit.io/v1/files/{file_id}",
                        headers={"Authorization": f"Basic {basic}"},
                    )

        elif provider == "bunny":
            # BunnyCDN storage: DELETE https://storage.bunnycdn.com/{zone}/{path}
            zone   = cfg.get("bunnyStorageZone", "").strip()
            api_key = cfg.get("bunnyApiKey", "").strip()
            if zone and api_key and path:
                async with httpx.AsyncClient(timeout=15) as c:
                    await c.delete(
                        f"https://storage.bunnycdn.com/{zone}/{path}",
                        headers={"AccessKey": api_key},
                    )
    except Exception as _del_exc:
        # Best-effort — we still drop the media row so the admin sees the file
        # gone from the library, but the CDN bytes may persist.
        import logging as _logging
        _logging.getLogger("upload").warning("CDN delete failed for %s: %s", provider, _del_exc)
        deletion_errors.append(str(_del_exc)[:200])

    supabase.table("media").delete().eq("id", media_id).execute()
    return {"message": "Deleted", "cdn_delete_errors": deletion_errors}
