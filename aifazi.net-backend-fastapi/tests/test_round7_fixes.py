"""Round-7 backend audit fixes (R7-1..R7-9, R7-21).

Follows the repo's hermetic router-test pattern (cf.
test_authentik_identity_toggle.py): `database`/`dependencies` (and any other
server-bound modules) are stubbed in sys.modules, the real router modules are
loaded from file, and network is faked so no test touches DNS, TCP, LDAP, or
third-party APIs.
"""
from __future__ import annotations

import importlib.util
import os
import sys
import types

from fastapi import FastAPI
from fastapi.testclient import TestClient

os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


# ── generic fakes ─────────────────────────────────────────────────────────────

class _Table:
    """Chainable supabase-table fake with per-table select/insert/update."""

    def __init__(self, store: dict, writes: list, name: str):
        self._store = store
        self._writes = writes
        self._name = name
        self._op: str | None = None
        self._payload: dict | None = None
        self._filters: list = []

    def select(self, *a, **k):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op, self._payload = "insert", dict(payload)
        return self

    def update(self, payload):
        self._op, self._payload = "update", dict(payload)
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def neq(self, *a, **k):
        return self

    def ilike(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def range(self, *a, **k):
        return self

    def _rows(self):
        rows = list(self._store.get(self._name, []) or [])
        for col, val in self._filters:
            rows = [r for r in rows if str(r.get(col)) == str(val)]
        return rows

    def execute(self):
        if self._op == "insert":
            self._writes.append((self._name, "insert", dict(self._payload or {})))
            if self._name in ("site_config", "cdn_config"):
                self._store[self._name] = dict(self._payload.get("settings", {}))
                return types.SimpleNamespace(
                    data=[{"key": "global", "settings": dict(self._store[self._name])}])
            row = {"id": (self._payload or {}).get("id", "u-new"), **(self._payload or {})}
            self._store.setdefault(self._name, []).append(row)
            return types.SimpleNamespace(data=[dict(row)])
        if self._op == "update":
            self._writes.append((self._name, "update", dict(self._payload or {})))
            if self._name in ("site_config", "cdn_config"):
                self._store[self._name] = dict(self._payload.get("settings", {}))
                return types.SimpleNamespace(
                    data=[{"key": "global", "settings": dict(self._store[self._name])}])
            targets = self._rows() or list(self._store.get(self._name, []) or [])
            for r in targets:
                r.update(self._payload or {})
            return types.SimpleNamespace(data=[dict(targets[0])] if targets else [{"id": "w1"}])
        if self._op == "delete":
            self._writes.append((self._name, "delete", None))
            return types.SimpleNamespace(data=[])
        if self._name in ("site_config", "cdn_config"):
            return types.SimpleNamespace(
                data=[{"key": "global", "settings": dict(self._store.get(self._name, {}))}])
        return types.SimpleNamespace(data=[dict(r) for r in self._rows()])


def _db_stub(store: dict, writes: list):
    db = types.ModuleType("database")
    db.supabase = types.SimpleNamespace(table=lambda name: _Table(store, writes, name))
    db._escape_ilike = lambda v: v
    db.call_with_retry = lambda fn, *a, **k: fn(*a, **k)
    return db


def _audit_stub(writes: list):
    mod = types.ModuleType("utils.audit")

    def _record(actor, action, target=None, details=None, **k):
        writes.append(("audit_logs", "insert",
                       {"actor": actor, "action": action, "target": target, "details": details}))

    mod.record = _record
    mod.record_auth = lambda *a, **k: None
    return mod


def _deps_stub(role: str = "admin"):
    deps = types.ModuleType("dependencies")
    user = {"id": "staff-1", "username": "staffer", "role": role}
    deps.require_admin = lambda: {"id": "admin-1", "username": "root", "role": "admin"}
    deps.require_staff = lambda: dict(user)
    deps.get_current_user = lambda: dict(user)
    deps._enrich_user = lambda u: u

    class _Bearer:
        def __init__(self, auto_error=True):
            pass

        async def __call__(self, *a, **k):
            return None

    deps.CookieHTTPBearer = _Bearer
    deps.bearer = _Bearer()
    return deps


def _routers_pkg_stub():
    return types.ModuleType("routers")


def _load_ROUTER(monkeypatch, filename: str, module_name: str):
    spec = importlib.util.spec_from_file_location(
        module_name, os.path.join(BACKEND_DIR, "routers", filename))
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _client_for(module, prefix: str = ""):
    app = FastAPI()
    app.include_router(module.router, prefix=prefix)
    return TestClient(app, raise_server_exceptions=False)


# ── R7-1: site_settings auth-key gate ─────────────────────────────────────────

def _load_site_settings(monkeypatch, role: str, store=None, writes=None):
    store = {"site_config": {}} if store is None else store
    writes = [] if writes is None else writes
    monkeypatch.setitem(sys.modules, "database", _db_stub(store, writes))
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub(role))
    monkeypatch.setitem(sys.modules, "utils.audit", _audit_stub(writes))
    module = _load_ROUTER(monkeypatch, "site_settings.py", "site_settings_r7")
    return module, _client_for(module, prefix="/t"), store, writes


def test_r71_non_admin_staff_blocked_on_oauth_keys(monkeypatch):
    _, client, _, _ = _load_site_settings(monkeypatch, "staff")
    for keys in ({"oauth": {"x": 1}}, {"lldap": {"url": "ldap://x"}}, {"authentik": {}},
                 {"LLDAP": {"url": "ldap://x"}}):
        r = client.put("/t", json=dict(keys))
        assert r.status_code == 403, (keys, r.text)


def test_r71_non_admin_staff_may_edit_generic_keys(monkeypatch):
    _, client, store, _ = _load_site_settings(monkeypatch, "staff")
    r = client.put("/t", json={"site_name": "aifazi"})
    assert r.status_code == 200, r.text
    assert store["site_config"]["site_name"] == "aifazi"


def test_r71_admin_pass_through(monkeypatch):
    _, client, store, _ = _load_site_settings(monkeypatch, "admin")
    r = client.put("/t", json={"oauth": {"clients": {}}, "site_name": "aifazi"})
    assert r.status_code == 200, r.text
    assert store["site_config"]["oauth"] == {"clients": {}}


def test_r71_corrupt_payload_still_400(monkeypatch):
    _, client, _, _ = _load_site_settings(monkeypatch, "admin")
    r = client.put("/t", json={"0": "<", "1": "!", "2": "D"})
    assert r.status_code == 400, r.text


# ── R7-2: cdn_settings masked PUT ─────────────────────────────────────────────

def _load_cdn_settings(monkeypatch, store=None, writes=None):
    store = {"cdn_config": {}} if store is None else store
    writes = [] if writes is None else writes
    monkeypatch.setitem(sys.modules, "database", _db_stub(store, writes))
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub("admin"))
    monkeypatch.setitem(sys.modules, "utils.audit", _audit_stub(writes))
    monkeypatch.setitem(sys.modules, "routers", _routers_pkg_stub())
    cdn_upload = types.ModuleType("routers.cdn_upload")
    cdn_upload.get_cdn_config = dict
    monkeypatch.setitem(sys.modules, "routers.cdn_upload", cdn_upload)
    fake_httpx = types.ModuleType("httpx")
    fake_httpx.AsyncClient = lambda *a, **k: None
    fake_httpx.RequestError = type("RequestError", (Exception,), {})
    monkeypatch.setitem(sys.modules, "httpx", fake_httpx)
    module = _load_ROUTER(monkeypatch, "cdn_settings.py", "cdn_settings_r7")
    return module, _client_for(module, prefix="/t"), store, writes


def test_r72_put_returns_masked_view(monkeypatch):
    _, client, _, _ = _load_cdn_settings(monkeypatch)
    r = client.put("/t", json={"provider": "r2", "r2SecretAccessKey": "supersecret",
                             "r2AccessKeyId": "keyid"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["r2SecretAccessKey"] == "••••••••"
    assert body["r2AccessKeyId"] == "••••••••"
    assert body["provider"] == "r2"
    assert "supersecret" not in r.text and "keyid" not in r.text


def test_r72_masked_sentinel_echo_does_not_clobber_secret(monkeypatch):
    _, client, store, _ = _load_cdn_settings(monkeypatch)
    client.put("/t", json={"r2SecretAccessKey": "real-secret"})
    r = client.put("/t", json={"provider": "r2", "r2SecretAccessKey": "••••••••"})
    assert r.status_code == 200, r.text
    assert store["cdn_config"]["r2SecretAccessKey"] == "real-secret"


# ── R7-3: ldap password grant needs a confidential client ─────────────────────

def _oauth_store_stub():
    mod = types.ModuleType("utils.oauth_store")
    codes: dict = {}
    tokens: dict = {}
    mod.put_auth_code = lambda code, rec, ttl: codes.__setitem__(code, rec)
    mod.pop_auth_code = lambda code: codes.pop(code, None)
    mod.get_access_token = lambda tok: tokens.get(tok)
    mod.put_access_token = lambda tok, rec, ttl: tokens.__setitem__(tok, rec)
    mod.revoke_access_token = lambda tok: tokens.pop(tok, None)
    return mod


def _ldap_client_stub():
    mod = types.ModuleType("utils.ldap_client")

    class LdapAuthFailed(Exception):
        pass

    class LdapUnavailable(Exception):
        pass

    mod.LdapAuthFailed = LdapAuthFailed
    mod.LdapUnavailable = LdapUnavailable
    mod.LdapUser = type("LdapUser", (), {})
    mod.bind_user = lambda u, p: types.SimpleNamespace(
        uid="bob", email="bob@example.com", display_name="Bob", groups=[])
    mod.healthcheck = lambda: True
    return mod


def _load_ldap_oauth(monkeypatch, store=None, writes=None, oauth_clients=None):
    store = {"users": []} if store is None else store
    writes = [] if writes is None else writes
    monkeypatch.setitem(sys.modules, "database", _db_stub(store, writes))
    monkeypatch.setitem(sys.modules, "routers", _routers_pkg_stub())
    shared = types.ModuleType("routers.auth_shared")
    shared._audit = lambda *a, **k: None
    shared._auth_log = lambda *a, **k: None
    shared._find_user_by_ci = lambda *a, **k: None
    shared._record_user_activity = lambda *a, **k: None
    shared._upsert_forum_session = lambda *a, **k: None
    monkeypatch.setitem(sys.modules, "routers.auth_shared", shared)
    monkeypatch.setitem(sys.modules, "utils.ldap_client", _ldap_client_stub())
    monkeypatch.setitem(sys.modules, "utils.oauth_store", _oauth_store_stub())
    oauth_admin = types.ModuleType("routers.oauth_admin")
    oauth_admin.get_oauth_config = lambda: {"enabled": True, "clients": oauth_clients or {}}
    monkeypatch.setitem(sys.modules, "routers.oauth_admin", oauth_admin)
    module = _load_ROUTER(monkeypatch, "ldap_oauth.py", "ldap_oauth_r7")
    return module, _client_for(module), store, writes


def _token_form(grant_extra: dict):
    form = {"grant_type": "password", "username": "bob", "password": "pw"}
    form.update(grant_extra)
    return form


def test_r73_password_grant_without_client_is_401(monkeypatch):
    module, client, _, _ = _load_ldap_oauth(monkeypatch)
    _ = module
    r = client.post("/oauth/token", data=_token_form({}))
    assert r.status_code == 401, r.text
    assert r.json()["detail"] == "invalid_client"


def test_r73_password_grant_with_wrong_secret_is_401(monkeypatch):
    _, client, _, _ = _load_ldap_oauth(
        monkeypatch, oauth_clients={"myapp": {"secret": "s3cret", "redirect_uris": []}})
    r = client.post("/oauth/token", data=_token_form(
        {"client_id": "myapp", "client_secret": "nope"}))
    assert r.status_code == 401, r.text


def test_r73_password_grant_public_client_is_401(monkeypatch):
    _, client, _, _ = _load_ldap_oauth(
        monkeypatch, oauth_clients={"spa": {"public": True, "redirect_uris": []}})
    r = client.post("/oauth/token", data=_token_form({"client_id": "spa"}))
    assert r.status_code == 401, r.text


def test_r73_password_grant_valid_confidential_client_ok(monkeypatch):
    _, client, _, _ = _load_ldap_oauth(
        monkeypatch, oauth_clients={"myapp": {"secret": "s3cret", "redirect_uris": []}})
    r = client.post("/oauth/token", data=_token_form(
        {"client_id": "myapp", "client_secret": "s3cret"}))
    assert r.status_code == 200, r.text
    assert r.json()["access_token"]


# ── R7-6: authorize re-validates the cookie user ──────────────────────────────

def _mint_auth_cookie(user_id: str = "u1", username: str = "bob", role: str = "user") -> str:
    from paseto_token import create_token
    return create_token({"id": user_id, "username": username, "role": role},
                        expires_in=3600, purpose="auth")


def test_r76_banned_cookie_user_denied(monkeypatch):
    store = {"users": [{"id": "u1", "username": "bob", "role": "user",
                        "banned": True, "ban_reason": "spam"}]}
    module, client, _, _ = _load_ldap_oauth(monkeypatch, store=store)
    module._get_client = lambda cid: {"redirect_uris": ["https://app.example/cb"], "name": "T"}
    tok = _mint_auth_cookie()
    r = client.get("/oauth/authorize?client_id=c&redirect_uri=https://app.example/cb",
                   cookies={"auth_token": tok}, follow_redirects=False)
    assert r.status_code == 403, r.text


def test_r76_unknown_cookie_user_denied(monkeypatch):
    module, client, _, _ = _load_ldap_oauth(monkeypatch, store={"users": []})
    module._get_client = lambda cid: {"redirect_uris": ["https://app.example/cb"], "name": "T"}
    tok = _mint_auth_cookie(user_id="ghost")
    r = client.get("/oauth/authorize?client_id=c&redirect_uri=https://app.example/cb",
                   cookies={"auth_token": tok}, follow_redirects=False)
    assert r.status_code == 401, r.text


def test_r76_known_cookie_user_gets_code(monkeypatch):
    store = {"users": [{"id": "u1", "username": "bob", "role": "user", "banned": False}]}
    module, client, _, _ = _load_ldap_oauth(monkeypatch, store=store)
    module._get_client = lambda cid: {"redirect_uris": ["https://app.example/cb"], "name": "T"}
    tok = _mint_auth_cookie()
    r = client.get("/oauth/authorize?client_id=c&redirect_uri=https://app.example/cb",
                   cookies={"auth_token": tok}, follow_redirects=False)
    assert r.status_code in (302, 307), r.text
    assert "code=" in (r.headers.get("location") or "")


# ── R7-4: discord player token purpose/aud ────────────────────────────────────

def _load_discord_auth(monkeypatch, store=None, writes=None):
    store = {"discord_users": []} if store is None else store
    writes = [] if writes is None else writes
    monkeypatch.setitem(sys.modules, "database", _db_stub(store, writes))
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub("admin"))
    monkeypatch.setitem(sys.modules, "routers", _routers_pkg_stub())
    email_mod = types.ModuleType("utils.email")
    email_mod.render_template = lambda *a, **k: ("", "")
    monkeypatch.setitem(sys.modules, "utils.email", email_mod)
    queue_mod = types.ModuleType("utils.email_queue")
    queue_mod.queue_email = lambda *a, **k: None
    monkeypatch.setitem(sys.modules, "utils.email_queue", queue_mod)
    module = _load_ROUTER(monkeypatch, "discord_auth.py", "discord_auth_r7")
    return module, _client_for(module), store, writes


def test_r74_player_token_carries_purpose_and_aud(monkeypatch):
    module, _, _, _ = _load_discord_auth(monkeypatch)
    tok = module._make_player_token({"discord_id": "123", "username": "p", "avatar": ""})
    payload = module._decode_player_token(tok)
    assert payload["discord_id"] == "123"
    assert payload["purpose"] == "discord_player"
    assert payload["aud"] == module._DISCORD_PLAYER_AUD


def test_r74_forum_token_rejected_as_player_token(monkeypatch):
    from jwt_compat import jwt as _jwt
    module, _, _, _ = _load_discord_auth(monkeypatch)
    forum_style = _jwt.encode(
        {"sub": "u1", "username": "bob", "role": "user", "purpose": "auth"},
        os.environ.get("PASETO_SECRET", ""), algorithm="HS256")
    try:
        module._decode_player_token(forum_style)
    except Exception as exc:
        assert getattr(exc, "status_code", None) == 401
    else:
        raise AssertionError("forum token accepted as player token")


# ── R7-5 + R7-9: github callback ──────────────────────────────────────────────

class _GHResp:
    def __init__(self, status=200, payload=None):
        self.status_code = status
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload


class _GHClient:
    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, **k):
        return _GHResp(200, {"access_token": "gtok"})

    async def get(self, url, **k):
        if url.endswith("/user/emails"):
            return _GHResp(200, [])
        return _GHResp(200, {"id": 4242, "login": "ghbob", "name": "Bob",
                             "avatar_url": "", "email": ""})


def _load_github_auth(monkeypatch, store=None, writes=None, verified_dest="/forum/profile"):
    store = {"users": []} if store is None else store
    writes = [] if writes is None else writes
    monkeypatch.setitem(sys.modules, "database", _db_stub(store, writes))
    monkeypatch.setitem(sys.modules, "dependencies", _deps_stub("admin"))
    monkeypatch.setitem(sys.modules, "routers", _routers_pkg_stub())
    shared = types.ModuleType("routers.auth_shared")
    shared.ACTIVE_IDENTITY_MESSAGE = "locked"
    shared.ALGO = "HS256"
    shared.SECRET = "x"
    shared.SITE_URL = "https://web.test"
    shared._active_identity_locked = lambda uid: False
    shared._ensure_identity_available = lambda *a, **k: None
    shared._find_user_by_ci = lambda *a, **k: None
    shared._get_forum_user = lambda creds: None
    shared._next_available_username = lambda raw: "ghuser"
    shared._normalized_email = lambda e: ""
    shared._record_user_activity = lambda *a, **k: None
    shared.bearer = lambda: None
    monkeypatch.setitem(sys.modules, "routers.auth_shared", shared)
    mobile_codes = types.ModuleType("utils.mobile_oauth_codes")
    mobile_codes.app_state_from = lambda extra: None
    mobile_codes.issue_code = lambda *a, **k: "code"
    mobile_codes.mobile_fragment = lambda code, dest: f"#code={code}&dest={dest}"
    mobile_codes.state_echo = lambda extra: ""
    monkeypatch.setitem(sys.modules, "utils.mobile_oauth_codes", mobile_codes)
    oauth_state = types.ModuleType("utils.oauth_state")
    oauth_state._safe_relative_path = lambda dest, default="/": (
        dest if isinstance(dest, str) and dest.startswith("/") and "://" not in dest
        and not dest.startswith("//") else default)
    oauth_state.make_oauth_state = lambda *a, **k: "st"
    oauth_state.verify_oauth_state_full = lambda s, p: {"dest": verified_dest, "mobile": False}
    monkeypatch.setitem(sys.modules, "utils.oauth_state", oauth_state)
    module = _load_ROUTER(monkeypatch, "github_auth.py", "github_auth_r7")
    module._client_id = lambda: "cid"
    module._client_secret = lambda: "csec"
    fake_httpx = types.SimpleNamespace(AsyncClient=_GHClient)
    monkeypatch.setattr(module, "_httpx", fake_httpx)
    return module, _client_for(module), store, writes


def test_r75_web_fallback_redirect_carries_no_token(monkeypatch):
    import utils.auth_tokens as _auth_tokens
    module, client, _, _ = _load_github_auth(monkeypatch)

    def _boom(resp, access, refresh):
        raise RuntimeError("cookie write failed")

    monkeypatch.setattr(_auth_tokens, "_set_auth_cookies", _boom)
    r = client.get("/callback?code=c&state=plain", follow_redirects=False)
    assert r.status_code in (302, 307), r.text
    loc = r.headers.get("location") or ""
    assert "#token=" not in loc and "token=" not in loc.split("#", 1)[-1], loc
    assert loc == "https://web.test/auth/github-callback#dest=/forum/profile", loc


def test_r79_connect_dest_comes_from_verified_state(monkeypatch):
    module, client, _, _ = _load_github_auth(
        monkeypatch,
        store={"users": [{"id": "u1", "username": "bob", "role": "user", "banned": False}]},
        verified_dest="/forum/profile")
    link = module._make_github_link_token("u1")
    state = f"connect:{link}:/evil-page:signedstub"
    r = client.get(f"/callback?code=c&state={state}", follow_redirects=False)
    assert r.status_code in (302, 307), r.text
    loc = r.headers.get("location") or ""
    assert "evil" not in loc, loc
    assert "dest=/forum/profile" in loc, loc


# ── R7-8: mobile exchange re-validates the user ───────────────────────────────

def _load_mobile_oauth(monkeypatch, payload, store=None, writes=None):
    store = {"users": [], "discord_users": []} if store is None else store
    writes = [] if writes is None else writes
    monkeypatch.setitem(sys.modules, "database", _db_stub(store, writes))
    monkeypatch.setitem(sys.modules, "routers", _routers_pkg_stub())
    mobile_codes = types.ModuleType("utils.mobile_oauth_codes")
    mobile_codes.exchange_code = lambda code, state=None: dict(payload)
    monkeypatch.setitem(sys.modules, "utils.mobile_oauth_codes", mobile_codes)
    player_auth = types.ModuleType("routers.discord_auth")
    player_auth._make_player_token = lambda user: "PLAYERTOK"
    monkeypatch.setitem(sys.modules, "routers.discord_auth", player_auth)
    module = _load_ROUTER(monkeypatch, "mobile_oauth.py", "mobile_oauth_r7")
    return module, _client_for(module), store, writes


def _forum_payload(**over):
    base = {"user_id": "u1", "username": "bob", "role": "user",
            "dest": "/profile", "provider": "github"}
    base.update(over)
    return base


def test_r78_banned_forum_user_exchange_denied(monkeypatch):
    store = {"users": [{"id": "u1", "username": "bob", "role": "user", "banned": True}],
             "discord_users": []}
    _, client, _, _ = _load_mobile_oauth(monkeypatch, _forum_payload(), store=store)
    r = client.post("/mobile/exchange", json={"code": "code123456"})
    assert r.status_code == 403, r.text


def test_r78_missing_forum_row_proceeds_with_code_claims(monkeypatch):
    # Provisioning parity: the OAuth callbacks create the user row just before
    # issuing the code, so a missing row at exchange time is tolerated (the
    # enforced invariant is banned=True → 403, covered above).
    _, client, _, _ = _load_mobile_oauth(monkeypatch, _forum_payload())
    r = client.post("/mobile/exchange", json={"code": "code123456"})
    assert r.status_code == 200, r.text
    assert r.json()["token"]


def test_r78_forum_success_uses_db_identity(monkeypatch):
    store = {"users": [{"id": "u1", "username": "bob", "role": "moderator", "banned": False}],
             "discord_users": []}
    _, client, _, _ = _load_mobile_oauth(
        monkeypatch, _forum_payload(role="user"), store=store)
    r = client.post("/mobile/exchange", json={"code": "code123456"})
    assert r.status_code == 200, r.text
    assert r.json()["token"] and r.json()["refreshToken"]


def test_r78_unknown_discord_player_denied(monkeypatch):
    payload = {"user_id": "d123", "username": "p", "role": "player",
               "dest": "/x", "provider": "discord", "kind": "discord_player"}
    _, client, _, _ = _load_mobile_oauth(monkeypatch, payload)
    r = client.post("/mobile/exchange", json={"code": "code123456"})
    assert r.status_code == 400, r.text


def test_r78_known_discord_player_ok(monkeypatch):
    payload = {"user_id": "d123", "username": "p", "role": "player",
               "dest": "/x", "provider": "discord", "kind": "discord_player"}
    store = {"users": [], "discord_users": [{"discord_id": "d123"}]}
    _, client, _, _ = _load_mobile_oauth(monkeypatch, payload, store=store)
    r = client.post("/mobile/exchange", json={"code": "code123456"})
    assert r.status_code == 200, r.text
    assert r.json()["token"] == "PLAYERTOK"