"""config_check.py — admin-only environment diagnostics (was routers/auth.py)."""
import logging

import bcrypt as _bcrypt
from fastapi import APIRouter, Depends, Request

from dependencies import require_admin
from routers.auth_shared import SECRET, ADMIN_PASSWORD

router = APIRouter()
log = logging.getLogger("auth.config")


@router.get("/config-check")
async def config_check(request: Request, _=Depends(require_admin)):
    """Admin-only diagnostic — reveals no secret values."""
    pw = ADMIN_PASSWORD
    bcrypt_ok = False
    bcrypt_error = None
    try:
        test_hash = _bcrypt.hashpw(b"test", _bcrypt.gensalt())
        bcrypt_ok = _bcrypt.checkpw(b"test", test_hash)
    except Exception as exc:
        log.exception("config_check bcrypt probe failed")
        bcrypt_error = "Internal error"

    return {
        "admin_password_is_set": bool(pw),
        "jwt_secret_is_set":  bool(SECRET),
        "bcrypt_working":     bcrypt_ok,
        "bcrypt_error":       bcrypt_error,
    }
