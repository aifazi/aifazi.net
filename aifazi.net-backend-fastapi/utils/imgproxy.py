"""
utils/imgproxy.py — Generate imgproxy URLs for images stored in Supabase Storage.

imgproxy runs on the Supabase Docker network and serves transformed images
from Supabase Storage buckets. This module constructs signed (if configured)
or plain imgproxy URLs.

Env vars:
  IMGPROXY_URL        — base URL (e.g. http://imgproxy:8080)
  IMGPROXY_KEY        — hex-encoded HMAC key (optional, for URL signing)
  IMGPROXY_SALT       — hex-encoded HMAC salt (optional, for URL signing)
  SUPABASE_URL        — Supabase project URL (for source URL construction)
"""
import base64
import hashlib
import hmac
import os

IMGPROXY_URL = os.getenv("IMGPROXY_URL", "").rstrip("/")
IMGPROXY_KEY = os.getenv("IMGPROXY_KEY", "")
IMGPROXY_SALT = os.getenv("IMGPROXY_SALT", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")


def _hex_to_bytes(hex_str: str) -> bytes:
    return bytes.fromhex(hex_str) if hex_str else b""


def _sign_url(path: str) -> str:
    """Sign an imgproxy URL path if IMGPROXY_KEY and IMGPROXY_SALT are set."""
    if not IMGPROXY_KEY or not IMGPROXY_SALT:
        return path
    key = _hex_to_bytes(IMGPROXY_KEY)
    salt = _hex_to_bytes(IMGPROXY_SALT)
    HMAC_SHA256 = 1
    mac = hmac.new(key, salt + path.encode("utf-8"), hashlib.sha256).digest()
    encoded = base64.urlsafe_b64encode(mac).rstrip(b"=").decode("utf-8")
    return f"/{encoded}{path}"


def make_imgproxy_url(
    source_url: str,
    width: int | None = None,
    height: int | None = None,
    resize: str = "fill",
    quality: int | None = None,
    format: str | None = None,
    enlarge: bool = False,
    gravity: str = "sm",
) -> str:
    """Construct an imgproxy URL for a given source image.

    Args:
        source_url: Full URL to the source image (Supabase Storage URL).
        width: Target width in pixels.
        height: Target height in pixels.
        resize: Resize type — 'fill', 'fit', 'auto', 'force', 'strip'.
        output quality (1-100).
        format: Output format — 'webp', 'avif', 'jpg', 'png', etc.
        enlarge: Allow upscaling.
        gravity: Gravity for cropping — 'sm' (smart), 'no', 'ce', etc.

    Returns:
        Full imgproxy URL string.
    """
    if not IMGPROXY_URL:
        return source_url

    # Encode source URL per imgproxy spec: base64url("plain"/source_url)
    plain = f"plain/{source_url}@webp" if not format else f"plain/{source_url}"
    encoded_source = base64.urlsafe_b64encode(plain.encode("utf-8")).rstrip(b"=").decode("utf-8")

    # Build processing options
    parts = []
    if resize:
        parts.append(f"rs:{resize}")
    if width:
        parts.append(f"w:{width}")
    if height:
        parts.append(f"h:{height}")
    if gravity:
        parts.append(f"g:{gravity}")
    if quality:
        parts.append(f"q:{quality}")
    if format:
        parts.append(f"f:{format}")
    if enlarge:
        parts.append("el:1")

    processing = ":".join(parts) if parts else "rs:fill"

    path = f"/{processing}/{encoded_source}"
    signed_path = _sign_url(path)
    return f"{IMGPROXY_URL}{signed_path}"


def imgproxy_url_for_storage(
    storage_path: str,
    bucket: str = "media",
    width: int | None = None,
    height: int | None = None,
    **kwargs,
) -> str:
    """Generate an imgproxy URL for a Supabase Storage object.

    Args:
        storage_path: Path within the bucket (e.g. 'media/uuid.jpg').
        bucket: Storage bucket name (default 'media').
        width: Target width.
        height: Target height.
        **kwargs: Additional imgproxy options passed to make_imgproxy_url.

    Returns:
        imgproxy URL string.
    """
    source_url = f"{SUPABASE_URL}/storage/v1/object/public/{bucket}/{storage_path}"
    return make_imgproxy_url(source_url, width=width, height=height, **kwargs)


def is_imgproxy_configured() -> bool:
    return bool(IMGPROXY_URL)
