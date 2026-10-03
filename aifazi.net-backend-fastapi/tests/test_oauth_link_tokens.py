"""Regression: PASETO account-link tokens for the GitHub/Steam connect flows.

Root cause: paseto_token.create_token builds
`{**payload, "iat", "exp", "purpose": purpose}` — the outer PASETO purpose
CLOBBERS any payload-level `purpose` claim. The old link tokens were minted
as `{"id": ..., "purpose": "github_link"}` / `"steam_link"` under
purpose="auth", so the stored claim was always `purpose: "auth"` and the
decoder's `payload.get("purpose") == "<provider>_link"` check never matched —
the connect callback always failed with `github_error=link` /
`steam_error=link` and account linking was broken.

Fix: link tokens carry `token_type` (the convention already used by
access/refresh and mobile OAuth codes), and the decoders check `token_type`.
"""
import importlib.util
import os
import sys
import types

import pytest

os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def _db_stub():
    class _Res:
        def __init__(self, data=None):
            self.data = data or []

    class _Q:
        def select(self, *a, **k):
            return self

        def insert(self, *a, **k):
            return self

        def update(self, *a, **k):
            return self

        def delete(self, *a, **k):
            return self

        def eq(self, *a, **k):
            return self

        def limit(self, *a, **k):
            return self

        def order(self, *a, **k):
            return self

        def execute(self):
            return _Res()

    db = types.ModuleType("database")
    db.supabase = types.SimpleNamespace(table=lambda name: _Q())
    db._escape_ilike = lambda v: v
    db.safe_search_term = lambda v: v
    db.safe_or_in = lambda v: v
    db.call_with_retry = lambda fn, *a, **k: fn(*a, **k)
    return db


def _deps_stub():
    deps = types.ModuleType("dependencies")

    class _HTTPBearer:
        # Must be a callable, not None: FastAPI treats Depends(None) as
        # "use the parameter's type annotation as the dependency", which breaks
        # route registration for `creds: HTTPAuthorizationCredentials | None`.
        def __init__(self, auto_error=True):
            pass

        async def __call__(self):
            return None

    def _user():
        return {"id": "u-test", "username": "test", "role": "admin"}

    deps.CookieHTTPBearer = _HTTPBearer
    deps.bearer = _HTTPBearer()
    deps.get_current_user = _user
    deps.require_admin = _user
    deps.require_staff = _user
    deps._enrich_user = lambda user: user
    deps.decode_token = lambda token: None
    return deps


@pytest.fixture()
def link_modules(monkeypatch):
    """Load github_auth + steam_auth with `database`/`dependencies` stubbed
    (same pattern as test_oauth_state_extra.py); routers.auth_shared,
    jwt_compat and utils.* import for real against those stubs."""
    monkeypatch.setitem(sys.modules, "database", _db_stub())
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub())
    out = {}
    for name in ("github_auth", "steam_auth"):
        spec = importlib.util.spec_from_file_location(
            f"{name}_under_test", os.path.join(BACKEND_DIR, "routers", f"{name}.py")
        )
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        out[name] = module
    return out


# ── Round-trip: maker → decoder ──────────────────────────────────────────────

def test_github_link_token_round_trip(link_modules):
    gh = link_modules["github_auth"]
    token = gh._make_github_link_token("user-123")
    payload = gh._decode_github_link_token(token)
    assert payload is not None, "github link token must decode"
    assert payload["id"] == "user-123"
    assert payload["token_type"] == "github_link"


def test_steam_link_token_round_trip(link_modules):
    st = link_modules["steam_auth"]
    token = st._make_steam_link_token("user-456")
    payload = st._decode_steam_link_token(token)
    assert payload is not None, "steam link token must decode"
    assert payload["id"] == "user-456"
    assert payload["token_type"] == "steam_link"


# ── Rejection: wrong token_type / garbage ────────────────────────────────────

def test_github_decoder_rejects_access_token(link_modules):
    gh, st = link_modules["github_auth"], link_modules["steam_auth"]
    access = st._make_forum_token("user-123", "someuser", "user")  # token_type "access"
    assert gh._decode_github_link_token(access) is None


def test_github_decoder_rejects_foreign_link_type(link_modules):
    gh, st = link_modules["github_auth"], link_modules["steam_auth"]
    assert gh._decode_github_link_token(st._make_steam_link_token("user-123")) is None


def test_steam_decoder_rejects_foreign_link_type(link_modules):
    gh, st = link_modules["github_auth"], link_modules["steam_auth"]
    assert st._decode_steam_link_token(gh._make_github_link_token("user-123")) is None


@pytest.mark.parametrize("token", [None, "", "not-a-token", "v4.local.garbage"])
def test_github_decoder_rejects_garbage(link_modules, token):
    assert link_modules["github_auth"]._decode_github_link_token(token) is None


@pytest.mark.parametrize("token", [None, "", "not-a-token", "v4.local.garbage"])
def test_steam_decoder_rejects_garbage(link_modules, token):
    assert link_modules["steam_auth"]._decode_steam_link_token(token) is None


# ── Root cause documented: the outer PASETO purpose clobbers payload purpose ─

def test_paseto_purpose_clobbers_payload_purpose():
    from paseto_token import create_token, decode_token

    token = create_token({"id": "u", "purpose": "x"}, expires_in=60, purpose="auth")
    payload = decode_token(token, purpose="auth")
    assert payload is not None
    assert payload["purpose"] == "auth", (
        "payload-level `purpose` is clobbered by the outer PASETO purpose — "
        "link-token markers must use `token_type`, not `purpose`"
    )
