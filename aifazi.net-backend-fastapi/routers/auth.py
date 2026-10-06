"""routers/auth.py — assembly module for the /api/auth router tree.

God-file split: the former 2000-line monolith was broken into domain
sub-routers (auth_login, auth_2fa, auth_profile, auth_sessions,
auth_register, auth_staff, auth_discord) whose shared
helpers live in routers/auth_shared.py. This module only wires them
together, so every /api/auth/* endpoint is registered exactly once
(config_check mounts directly in main.py, not here, to avoid a double
registration).
"""
from fastapi import APIRouter

from routers.auth_login import router as _login_router
from routers.auth_2fa import router as _2fa_router
from routers.auth_profile import router as _profile_router
from routers.auth_sessions import router as _sessions_router
from routers.auth_discord import router as _discord_router
from routers.auth_register import router as _register_router
from routers.auth_staff import router as _staff_router

router = APIRouter()

router.include_router(_login_router)
router.include_router(_2fa_router)
router.include_router(_profile_router)
router.include_router(_sessions_router)
router.include_router(_discord_router)
router.include_router(_register_router)
router.include_router(_staff_router)
