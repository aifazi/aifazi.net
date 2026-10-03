"""SSRF helper tests: private / link-local / metadata addresses must not resolve as public."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")
os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-only")

from utils.ssrf import is_blocked_ip, resolve_public_ips


def test_loopback_rejected():
    assert resolve_public_ips("127.0.0.1") in (None, [], False) or not resolve_public_ips("127.0.0.1")


def test_private_rejected():
    assert not resolve_public_ips("10.0.0.1")
    assert not resolve_public_ips("192.168.1.1")
    assert not resolve_public_ips("172.16.0.1")


def test_metadata_rejected():
    assert not resolve_public_ips("169.254.169.254")


def test_invalid_host_rejected():
    assert not resolve_public_ips("not a host!!")


def test_public_ip_accepted():
    # 1.1.1.1 is Cloudflare DNS — a real global address
    result = resolve_public_ips("1.1.1.1")
    assert result


def test_ipv4_mapped_literals_rejected():
    # Round-4 audit S2: IPv4-mapped IPv6 must be tested as its embedded v4
    # address, not slip past the v4 networks as an "IPv6" address.
    assert not resolve_public_ips("::ffff:169.254.169.254")
    assert not resolve_public_ips("::ffff:127.0.0.1")
    assert not resolve_public_ips("::ffff:10.0.0.1")
    assert not resolve_public_ips("::ffff:192.168.1.1")
    assert not resolve_public_ips("::ffff:172.16.0.1")


def test_ipv4_mapped_public_allowed():
    assert resolve_public_ips("::ffff:1.1.1.1")


def test_is_blocked_ip_handles_mapped_addresses():
    import ipaddress

    assert is_blocked_ip(ipaddress.ip_address("169.254.169.254"))
    assert is_blocked_ip(ipaddress.ip_address("::ffff:169.254.169.254"))
    assert is_blocked_ip(ipaddress.ip_address("::ffff:127.0.0.1"))
    assert is_blocked_ip(ipaddress.ip_address("::1"))
    assert not is_blocked_ip(ipaddress.ip_address("::ffff:1.1.1.1"))
    assert not is_blocked_ip(ipaddress.ip_address("1.1.1.1"))
