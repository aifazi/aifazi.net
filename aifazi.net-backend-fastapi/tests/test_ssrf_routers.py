"""Round-5 audit A5-1/A5-2: seo_proxy + fonts must use the shared is_blocked_ip
guard (IPv4-mapped IPv6 included), and font imports must not follow redirects
off the Google Fonts allowlist.
"""
from __future__ import annotations

import importlib.util
import os
import socket
import sys
import types

import httpx
import pytest
from fastapi import HTTPException

os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def _load_module(file_name: str, monkeypatch, stubs: dict) -> types.ModuleType:
    for name, mod in stubs.items():
        monkeypatch.setitem(sys.modules, name, mod)
    spec = importlib.util.spec_from_file_location(
        f"under_test_{file_name.replace('.', '_')}",
        os.path.join(BACKEND_DIR, "routers", file_name),
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _require_staff_stub(*_args, **_kwargs):
    return {}


def _fonts_stubs() -> dict:
    db = types.ModuleType("database")
    db.supabase = None
    deps = types.ModuleType("dependencies")
    deps.require_staff = _require_staff_stub
    pkg = types.ModuleType("routers")
    cdn = types.ModuleType("routers.cdn_upload")
    cdn.delete_media = None
    cdn.upload_media = None
    upl = types.ModuleType("routers.upload")
    upl.scan_for_malware = lambda *a, **k: None
    return {
        "database": db,
        "dependencies": deps,
        "routers": pkg,
        "routers.cdn_upload": cdn,
        "routers.upload": upl,
    }


def _fake_getaddrinfo(ip: str, family: int):
    def fake(host, *args, **kwargs):
        return [(family, socket.SOCK_STREAM, 6, "", (ip, 80))]
    return fake


# ── seo_proxy (A5-1) ──────────────────────────────────────────────────────────

def test_seo_proxy_blocks_ipv4_mapped_metadata(monkeypatch):
    mod = _load_module("seo_proxy.py", monkeypatch, {})
    monkeypatch.setattr(mod.socket, "getaddrinfo", _fake_getaddrinfo("::ffff:169.254.169.254", socket.AF_INET6))
    with pytest.raises(HTTPException) as exc:
        mod._validate_resolved_host("cdn.youtube.com")
    assert exc.value.status_code == 403


def test_seo_proxy_blocks_ipv4_mapped_rfc1918(monkeypatch):
    mod = _load_module("seo_proxy.py", monkeypatch, {})
    monkeypatch.setattr(mod.socket, "getaddrinfo", _fake_getaddrinfo("::ffff:10.1.2.3", socket.AF_INET6))
    with pytest.raises(HTTPException) as exc:
        mod._validate_resolved_host("github.com")
    assert exc.value.status_code == 403


def test_seo_proxy_accepts_public_ip(monkeypatch):
    mod = _load_module("seo_proxy.py", monkeypatch, {})
    monkeypatch.setattr(mod.socket, "getaddrinfo", _fake_getaddrinfo("93.184.216.34", socket.AF_INET))
    assert mod._validate_resolved_host("example.com") == "93.184.216.34"


def test_seo_proxy_still_rejects_numeric_hosts(monkeypatch):
    mod = _load_module("seo_proxy.py", monkeypatch, {})
    with pytest.raises(HTTPException) as exc:
        mod._validate_resolved_host("10.0.0.1")
    assert exc.value.status_code == 403


# ── fonts (A5-1) ──────────────────────────────────────────────────────────────

def test_fonts_host_guard_blocks_ipv4_mapped(monkeypatch):
    mod = _load_module("fonts.py", monkeypatch, _fonts_stubs())
    monkeypatch.setattr(mod.socket, "getaddrinfo", _fake_getaddrinfo("::ffff:169.254.169.254", socket.AF_INET6))
    assert mod._host_is_private("fonts.gstatic.com") is True


def test_fonts_host_guard_blocks_ipv4_mapped_private(monkeypatch):
    mod = _load_module("fonts.py", monkeypatch, _fonts_stubs())
    monkeypatch.setattr(mod.socket, "getaddrinfo", _fake_getaddrinfo("::ffff:192.168.1.1", socket.AF_INET6))
    assert mod._host_is_private("fonts.googleapis.com") is True


def test_fonts_host_guard_allows_public(monkeypatch):
    mod = _load_module("fonts.py", monkeypatch, _fonts_stubs())
    monkeypatch.setattr(mod.socket, "getaddrinfo", _fake_getaddrinfo("142.250.77.1", socket.AF_INET))
    assert mod._host_is_private("fonts.gstatic.com") is False


def test_fonts_host_guard_refuses_unresolvable(monkeypatch):
    mod = _load_module("fonts.py", monkeypatch, _fonts_stubs())

    def boom(host, *args, **kwargs):
        raise socket.gaierror("no such host")
    monkeypatch.setattr(mod.socket, "getaddrinfo", boom)
    assert mod._host_is_private("fonts.gstatic.com") is True


# ── fonts redirect guard (A5-2) ───────────────────────────────────────────────

def test_fonts_redirect_guard_allows_font_hosts(monkeypatch):
    mod = _load_module("fonts.py", monkeypatch, _fonts_stubs())
    mod._redirect_guard(httpx.Request("GET", "https://fonts.gstatic.com/abc.woff2"))
    mod._redirect_guard(httpx.Request("GET", "https://fonts.googleapis.com/css2?family=Inter"))


def test_fonts_redirect_guard_blocks_other_hosts(monkeypatch):
    mod = _load_module("fonts.py", monkeypatch, _fonts_stubs())
    for bad in (
        "https://example.com/font.woff2",
        "https://fonts.gstatic.evil.com/font.woff2",
        "https://169.254.169.254/font.woff2",
    ):
        with pytest.raises(mod._RedirectLeftAllowlist):
            mod._redirect_guard(httpx.Request("GET", bad))
