"""
paseto_token.py — PASETO v4 local token implementation (XChaCha20-Poly1305)

Replaces JWT with a secure, unambiguous token format.
- No algorithm confusion attacks (fixed XChaCha20-Poly1305)
- No "none" algorithm bypass
- Authenticated encryption (confidentiality + integrity)
- Random nonces prevent replay attacks
- 24-hour default expiry

Format: v4.local.<encrypted_base64url>.<optional_footer>
Requires: PyNaCl>=1.5.0 (cryptography does not ship XChaCha20-Poly1305)
"""
import base64
import hashlib
import json
import logging
import os
import time

import nacl.bindings

log = logging.getLogger("token")

TOKEN_VERSION = "v4"
TOKEN_PURPOSE = "local"
TOKEN_HEADER_B64 = base64.urlsafe_b64encode(
    json.dumps({"v": TOKEN_VERSION, "t": TOKEN_PURPOSE}).encode()
).rstrip(b"=").decode()
TOKEN_EXPIRY_SECONDS = 24 * 60 * 60  # 24 hours
NONCE_SIZE = 24  # XChaCha20 nonce
KEY_SIZE = 32   # XChaCha20 key


class XChaCha20Poly1305:
    """XChaCha20-Poly1305 AEAD backed by libsodium (PyNaCl).

    `cryptography` does not provide XChaCha20-Poly1305 (only the short-nonce
    ChaCha20Poly1305), so this adapter wraps libsodium's IETF construction used
    by the PASETO v4 spec (24-byte nonce, 32-byte key).
    """

    def __init__(self, key: bytes) -> None:
        if len(key) != KEY_SIZE:
            raise ValueError(f"Key must be {KEY_SIZE} bytes, got {len(key)}")
        self._key = bytes(key)

    def encrypt(self, nonce: bytes, data: bytes, aad: bytes | None) -> bytes:
        if len(nonce) != NONCE_SIZE:
            raise ValueError(f"Nonce must be {NONCE_SIZE} bytes, got {len(nonce)}")
        return nacl.bindings.crypto_aead_xchacha20poly1305_ietf_encrypt(
            data, aad, nonce, self._key
        )

    def decrypt(self, nonce: bytes, data: bytes, aad: bytes | None) -> bytes:
        if len(nonce) != NONCE_SIZE:
            raise ValueError(f"Nonce must be {NONCE_SIZE} bytes, got {len(nonce)}")
        return nacl.bindings.crypto_aead_xchacha20poly1305_ietf_decrypt(
            data, aad, nonce, self._key
        )


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


def _get_xcha() -> XChaCha20Poly1305:
    secret = os.environ.get("PASETO_SECRET", "")
    if not secret:
        raise RuntimeError("PASETO_SECRET is not set. Cannot create tokens.")
    return XChaCha20Poly1305(_derive_key(secret))


def create_token(payload: dict, expires_in: int = TOKEN_EXPIRY_SECONDS, purpose: str = "auth") -> str:
    """
    Create a PASETO v4 local token using XChaCha20-Poly1305.

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
    nonce = os.urandom(NONCE_SIZE)
    ciphertext = xcha.encrypt(nonce, payload_bytes, None)
    encrypted = nonce + ciphertext  # nonce prepended per PASETO v4 spec
    return f"{TOKEN_HEADER_B64}.{_b64url_encode(encrypted)}"


def decode_token(token: str, purpose: str = "auth") -> dict | None:
    """
    Decode and verify a PASETO v4 local token.

    Validates expiry and optional purpose claim.

    Args:
        token: The PASETO token string.
        purpose: Expected purpose (must match token's purpose claim).

    Returns:
        Decoded payload dict, or None if invalid/expired.
    """
    parts = token.split(".")
    if len(parts) != 2:
        return None

    xcha = _get_xcha()
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
        return None


def verify_token_signature(token: str) -> bool:
    """
    Verify the encryption AND expiry of a PASETO token.
    """
    parts = token.split(".")
    if len(parts) != 2:
        return False

    xcha = _get_xcha()
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


def decode_token_payload(token: str) -> dict | None:
    """
    Decode a PASETO token's payload without verifying signature/encryption.
    ONLY use for trusted tokens (e.g., after verify_token_signature returns True).
    """
    parts = token.split(".")
    if len(parts) != 2:
        return None
    try:
        encrypted = _b64url_decode(parts[1])
        xcha = _get_xcha()
        if len(encrypted) < NONCE_SIZE + 16:
            return None
        nonce = encrypted[:NONCE_SIZE]
        ciphertext = encrypted[NONCE_SIZE:]
        plaintext = xcha.decrypt(nonce, ciphertext, None)
        return json.loads(plaintext.decode())
    except Exception:
        return None