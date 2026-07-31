"""
paseto_token.py — PASETO v4 local token implementation (XChaCha20-Poly1305)

Replaces JWT with a secure, unambiguous token format.
- No algorithm confusion attacks (fixed XChaCha20-Poly1305)
- No "none" algorithm bypass
- Authenticated encryption (confidentiality + integrity)
- Random nonces prevent replay attacks
- 24-hour default expiry

Format: v4.local.<encrypted_base64url>.<optional_footer>
"""
import os
import json
import time
import base64
import hashlib
import hmac as hmac_mod
import logging
from typing import Optional

log = logging.getLogger("token")

try:
    from cryptography.hazmat.primitives.ciphers.aead import XChaCha20Poly1305
    HAS_XCHACHA = True
except ImportError:
    log.warning(
        "cryptography>=42.0 not available (XChaCha20-Poly1305 missing). "
        "Falling back to HMAC-SHA256 tokens. "
        "Install: pip install 'cryptography>=42.0'."
    )
    HAS_XCHACHA = False

TOKEN_VERSION = "v4"
TOKEN_PURPOSE = "local"
TOKEN_HEADER_B64 = base64.urlsafe_b64encode(
    json.dumps({"v": TOKEN_VERSION, "t": TOKEN_PURPOSE}).encode()
).rstrip(b"=").decode()
TOKEN_EXPIRY_SECONDS = 24 * 60 * 60  # 24 hours
NONCE_SIZE = 24  # XChaCha20 nonce
KEY_SIZE = 32   # XChaCha20 key


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    s = s.rstrip("=")
    s += "=" * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s)


_derived_key_cache: dict = {}

def _derive_key(secret: str) -> bytes:
    """Derive a 32-byte key from an arbitrary-length secret using PBKDF2.

    Always expands to the full key size instead of truncating raw secrets to
    their first 32 bytes (truncation silently reduced entropy for base64-style
    secrets, e.g. a 44-char base64 value collapsed to 24 bytes). Result is
    cached per secret so the 100k-iteration KDF runs once per process, not on
    every token create/decode.
    """
    cached = _derived_key_cache.get(secret)
    if cached is not None:
        return cached
    raw = secret.encode("utf-8")
    key = hashlib.pbkdf2_hmac("sha256", raw, b"paseto-v4-aifazi", 100000, KEY_SIZE)
    _derived_key_cache[secret] = key
    return key


def _get_xcha() -> Optional["XChaCha20Poly1305"]:
    if HAS_XCHACHA:
        return XChaCha20Poly1305(_derive_key(os.environ.get("PASETO_SECRET", os.environ.get("JWT_SECRET", ""))))
    return None


def create_token(payload: dict, expires_in: int = TOKEN_EXPIRY_SECONDS, purpose: str = "auth") -> str:
    """
    Create a PASETO v4 local token.

    If XChaCha20-Poly1305 is available, produces true PASETO v4 local tokens.
    Otherwise, falls back to HMAC-SHA256 signed tokens (PASETO-like format).

    Args:
        payload: Claims to encode (must be JSON-serializable).
        expires_in: Seconds until expiry (default 24h).
        purpose: Token purpose label stored in payload.

    Returns:
        PASETO v4 local token string.
    """
    now = int(time.time())
    data = {
        **payload,
        "iat": now,
        "exp": now + expires_in,
        "purpose": purpose,
    }
    payload_bytes = json.dumps(data, separators=(",", ":"), sort_keys=True).encode()

    xcha = _get_xcha()
    if xcha is not None:
        nonce = os.urandom(NONCE_SIZE)
        ciphertext = xcha.encrypt(nonce, payload_bytes, None)
        encrypted = nonce + ciphertext  # nonce prepended per PASETO v4 spec
        return f"{TOKEN_HEADER_B64}.{_b64url_encode(encrypted)}"

    # Fallback: HMAC-SHA256 signed token (PASETO-like format)
    secret = os.environ.get("PASETO_SECRET", os.environ.get("JWT_SECRET", ""))
    if not secret:
        raise RuntimeError("Neither PASETO_SECRET nor JWT_SECRET is set. Cannot create tokens.")

    payload_b64 = _b64url_encode(payload_bytes)
    msg = f"{TOKEN_HEADER_B64}.{payload_b64}"
    sig = hmac_mod.new(secret.encode(), msg.encode(), hashlib.sha256).digest()
    return f"{msg}.{_b64url_encode(sig)}"


def decode_token(token: str, purpose: str = "auth") -> Optional[dict]:
    """
    Decode and verify a PASETO v4 local token.

    Supports both XChaCha20-Poly1305 encrypted tokens and HMAC-SHA256 fallback.
    Validates expiry and optional purpose claim.

    Args:
        token: The PASETO token string.
        purpose: Expected purpose (must match token's purpose claim).

    Returns:
        Decoded payload dict, or None if invalid/expired.
    """
    parts = token.split(".")
    if len(parts) < 2:
        return None

    # ── Try XChaCha20-Poly1305 decryption first ──
    xcha = _get_xcha()
    if xcha is not None and len(parts) == 2:
        try:
            encrypted = _b64url_decode(parts[1])
            if len(encrypted) < NONCE_SIZE + 16:
                return None  # too short (nonce + poly1305 tag minimum)
            nonce = encrypted[:NONCE_SIZE]
            ciphertext = encrypted[NONCE_SIZE:]
            plaintext = xcha.decrypt(nonce, ciphertext, None)
            data = json.loads(plaintext.decode())
            if data.get("exp", 0) < time.time():
                log.debug("PASETO token expired")
                return None
            if purpose and data.get("purpose") != purpose:
                log.debug("PASETO token purpose mismatch: expected=%s got=%s", purpose, data.get("purpose"))
                return None
            return data
        except Exception:
            pass

    # ── Fallback: HMAC-SHA256 verification ──
    # M5 — never silently downgrade to HMAC when XChaCha is available.
    if HAS_XCHACHA:
        log.warning("Rejecting 3-part HMAC token while XChaCha is available (downgrade attempt?)")
        return None
    if len(parts) != 3:
        return None
    secret = os.environ.get("PASETO_SECRET", os.environ.get("JWT_SECRET", ""))
    if not secret:
        return None

    msg = f"{parts[0]}.{parts[1]}"
    expected_sig = hmac_mod.new(secret.encode(), msg.encode(), hashlib.sha256).digest()
    provided_sig = _b64url_decode(parts[2])
    if not hmac_mod.compare_digest(expected_sig, provided_sig):
        log.debug("PASETO token signature mismatch")
        return None

    try:
        payload_bytes = _b64url_decode(parts[1])
        data = json.loads(payload_bytes.decode())
    except Exception:
        return None

    if data.get("exp", 0) < time.time():
        log.debug("PASETO token expired")
        return None
    if purpose and data.get("purpose") != purpose:
        log.debug("PASETO token purpose mismatch: expected=%s got=%s", purpose, data.get("purpose"))
        return None
    return data


def verify_token_signature(token: str) -> bool:
    """
    Verify the signature/encryption AND expiry of a PASETO token.
    M7 — previously skipped the expiry check, so an attacker who managed to
    mint a signature-valid token could keep it alive forever.
    """
    parts = token.split(".")
    if len(parts) < 2:
        return False

    # XChaCha20-Poly1305 tokens (2 parts) — decryption verifies authenticity
    xcha = _get_xcha()
    if xcha is not None and len(parts) == 2:
        try:
            encrypted = _b64url_decode(parts[1])
            if len(encrypted) < NONCE_SIZE + 16:
                return False
            nonce = encrypted[:NONCE_SIZE]
            ciphertext = encrypted[NONCE_SIZE:]
            plaintext = xcha.decrypt(nonce, ciphertext, None)
            data = json.loads(plaintext.decode())
            return data.get("exp", 0) >= time.time()
        except Exception:
            return False

    # HMAC-SHA256 fallback (3 parts) — M5: reject downgrade when XChaCha available
    if HAS_XCHACHA:
        return False
    if len(parts) != 3:
        return False
    secret = os.environ.get("PASETO_SECRET", os.environ.get("JWT_SECRET", ""))
    if not secret:
        return False
    msg = f"{parts[0]}.{parts[1]}"
    expected = hmac_mod.new(secret.encode(), msg.encode(), hashlib.sha256).digest()
    provided = _b64url_decode(parts[2])
    if not hmac_mod.compare_digest(expected, provided):
        return False
    try:
        payload_bytes = _b64url_decode(parts[1])
        data = json.loads(payload_bytes.decode())
        return data.get("exp", 0) >= time.time()
    except Exception:
        return False


def decode_token_payload(token: str) -> Optional[dict]:
    """
    Decode a PASETO token's payload without verifying signature/encryption.
    ONLY use for trusted tokens (e.g., after verify_token_signature returns True).
    """
    parts = token.split(".")
    if len(parts) < 2:
        return None
    try:
        if len(parts) == 2:
            encrypted = _b64url_decode(parts[1])
            xcha = _get_xcha()
            if xcha is None or len(encrypted) < NONCE_SIZE + 16:
                return None
            nonce = encrypted[:NONCE_SIZE]
            ciphertext = encrypted[NONCE_SIZE:]
            plaintext = xcha.decrypt(nonce, ciphertext, None)
            return json.loads(plaintext.decode())
        else:
            payload_bytes = _b64url_decode(parts[1])
            return json.loads(payload_bytes.decode())
    except Exception:
        return None
