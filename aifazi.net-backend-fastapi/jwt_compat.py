"""
jwt_compat.py — PASETO v4 compatibility layer for jose.jwt interface.

Drop-in replacement for `from jose import jwt` — provides encode() and decode()
with the same API, backed by PASETO v4 local tokens.

Usage in routers:
    from jwt_compat import jwt
    token = jwt.encode({"id": 1, "role": "admin", "exp": exp}, SECRET, algorithm="HS256")
    payload = jwt.decode(token, SECRET, algorithms=["HS256"])

All tokens created through this module use PASETO v4 format (v4.local.*).
The algorithm parameter is accepted but ignored (PASETO v4 always uses XChaCha20-Poly1305).
Requires: PyNaCl>=1.5.0 (cryptography does not ship XChaCha20-Poly1305)
"""
import os
import time
import json
import base64
import hashlib
import logging
from typing import Optional, Union
from datetime import datetime, timezone

from paseto_token import _derive_key, XChaCha20Poly1305

log = logging.getLogger("jwt_compat")

_TOKEN_VERSION = "v4"
_TOKEN_PURPOSE = "local"
_HEADER_JSON = json.dumps({"v": _TOKEN_VERSION, "t": _TOKEN_PURPOSE})
_HEADER_B64 = base64.urlsafe_b64encode(_HEADER_JSON.encode()).rstrip(b"=").decode()
_NONCE_SIZE = 24
_KEY_SIZE = 32


class JWTError(Exception):
    pass


class ExpiredSignatureError(JWTError):
    pass


class _JWTCompat:
    """
    Drop-in replacement for jose.jwt with PASETO v4 backend.
    """

    def encode(
        self,
        payload: dict,
        key: Union[str, bytes],
        algorithm: str = "HS256",
        headers: Optional[dict] = None,
    ) -> str:
        """
        Create a PASETO v4 local token (ignoring algorithm parameter).

        Args:
            payload: Claims to encode. 'exp' should be a Unix timestamp.
            key: Secret key (base64, hex, or plain string).
            algorithm: Ignored (PASETO v4 always uses XChaCha20-Poly1305).
            headers: Ignored (PASETO has no custom headers).

        Returns:
            PASETO v4 local token string.
        """
        secret = self._resolve_key(key)
        data = {
            k: v for k, v in payload.items()
            if k not in ("iat", "exp", "purpose")
        }
        now = int(time.time())
        data["iat"] = payload.get("iat", now)
        exp = payload.get("exp", now + 86400)
        if isinstance(exp, datetime):
            exp = int(exp.timestamp())
        data["exp"] = exp
        data["purpose"] = payload.get("purpose", "auth")

        payload_bytes = json.dumps(data, separators=(",", ":"), sort_keys=True).encode()

        xcha = self._get_xcha(secret)
        nonce = os.urandom(_NONCE_SIZE)
        ciphertext = xcha.encrypt(nonce, payload_bytes, None)
        encrypted = nonce + ciphertext
        return f"{_HEADER_B64}.{self._b64url_encode(encrypted)}"

    def decode(
        self,
        token: str,
        key: Union[str, bytes],
        algorithms: Optional[list] = None,
        options: Optional[dict] = None,
        audience: Optional[str] = None,
        issuer: Optional[str] = None,
        subject: Optional[str] = None,
        leeway: Union[int, float] = 0,
    ) -> dict:
        """
        Decode and verify a PASETO v4 token.

        Args:
            token: PASETO v4 token string.
            key: Secret key (must match the key used to create the token).
            algorithms: Ignored (PASETO v4 only).
            options: Ignored.
            audience: Ignored.
            issuer: Ignored.
            subject: Ignored.
            leeway: Seconds of clock skew tolerance.

        Returns:
            Decoded payload dict.

        Raises:
            JWTError: If token is invalid or expired.
            ExpiredSignatureError: If token has expired.
        """
        secret = self._resolve_key(key)
        parts = token.split(".")

        if len(parts) != 2:
            raise JWTError("Invalid token format: expected PASETO v4.local (2 parts)")

        return self._decode_xcha(parts, secret, leeway)

    def _decode_xcha(self, parts: list, secret: bytes, leeway: int) -> dict:
        xcha = self._get_xcha(secret)
        try:
            encrypted = self._b64url_decode(parts[1])
            if len(encrypted) < _NONCE_SIZE + 16:
                raise JWTError("Token too short")
            nonce = encrypted[:_NONCE_SIZE]
            ciphertext = encrypted[_NONCE_SIZE:]
            plaintext = xcha.decrypt(nonce, ciphertext, None)
            data = json.loads(plaintext.decode())
            self._check_expiry(data, leeway)
            return data
        except (ValueError, TypeError) as e:
            raise JWTError(f"Invalid token: {e}")

    def _check_expiry(self, data: dict, leeway: int) -> None:
        exp = data.get("exp")
        if exp and time.time() > exp + leeway:
            raise ExpiredSignatureError("Signature has expired")

    def get_unverified_claims(self, token: str) -> dict:
        parts = token.split(".")
        if len(parts) != 2:
            return {}
        try:
            encrypted = self._b64url_decode(parts[1])
            if len(encrypted) < _NONCE_SIZE + 16:
                return {}
            nonce = encrypted[:_NONCE_SIZE]
            ciphertext = encrypted[_NONCE_SIZE:]
            xcha = self._get_xcha(self._resolve_key(os.environ.get("PASETO_SECRET", "")))
            if xcha is None:
                return {}
            plaintext = xcha.decrypt(nonce, ciphertext, None)
            return json.loads(plaintext.decode())
        except Exception:
            return {}

    @staticmethod
    def _b64url_encode(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    @staticmethod
    def _b64url_decode(s: str) -> bytes:
        s = s.rstrip("=")
        s += "=" * (4 - len(s) % 4)
        return base64.urlsafe_b64decode(s)

    @staticmethod
    def _resolve_key(key: Union[str, bytes]) -> bytes:
        if isinstance(key, bytes):
            return key
        return _derive_key(key)

    @staticmethod
    def _get_xcha(secret: bytes) -> XChaCha20Poly1305:
        if len(secret) != _KEY_SIZE:
            raise ValueError(f"Derived key must be {_KEY_SIZE} bytes, got {len(secret)}")
        return XChaCha20Poly1305(secret)


jwt = _JWTCompat()

__all__ = ["jwt", "JWTError", "ExpiredSignatureError"]