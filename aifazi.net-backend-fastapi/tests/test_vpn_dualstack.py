"""VPN dual-stack unit tests: IPv6 allocation + dual-stack client configs."""
from __future__ import annotations

import os
import sys

import pytest

os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.wireguard import (
    WG_SERVER_IPV6,
    find_free_ipv6,
    generate_client_config,
)


class TestFindFreeIpv6:
    def test_skips_server_address(self):
        assert find_free_ipv6(set()) == "fd00:8::2"

    def test_skips_used_addresses(self):
        used = {"fd00:8::2", "fd00:8::3"}
        assert find_free_ipv6(used) == "fd00:8::4"

    def test_server_ip_never_returned(self):
        used = {"fd00:8::2"}
        got = find_free_ipv6(used, server_ip="fd00:8::3")
        assert got not in (WG_SERVER_IPV6, "fd00:8::3")
        assert got == "fd00:8::4"

    def test_rejects_ipv4_subnet(self):
        with pytest.raises(ValueError):
            find_free_ipv6(set(), subnet="10.8.0.0/24")

    def test_exhaustion_raises(self):
        used = {f"fd00:8::{i:x}" for i in range(2, 10)}
        with pytest.raises(ValueError):
            find_free_ipv6(used, scan_limit=10)


class TestDualstackConfig:
    PRIV = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    PUB = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="

    def test_v4_only_config_unchanged(self):
        cfg = generate_client_config(self.PRIV, "10.8.0.5", self.PUB, preshared_key=None)
        assert "Address = 10.8.0.5/32\n" in cfg
        assert "fd00" not in cfg
        assert "2606:4700" not in cfg
        assert "AllowedIPs = 0.0.0.0/0, ::/0" in cfg

    def test_dualstack_address_and_dns(self):
        cfg = generate_client_config(
            self.PRIV, "10.8.0.5", self.PUB, preshared_key=None, client_address_v6="fd00:8::7"
        )
        assert "Address = 10.8.0.5/32, fd00:8::7/128" in cfg
        assert "2606:4700:4700::1111" in cfg
        assert "1.1.1.1" in cfg
        # Full-tunnel claim from day one — no v6 leak outside the tunnel.
        assert "AllowedIPs = 0.0.0.0/0, ::/0" in cfg

    def test_blank_v6_is_v4_only(self):
        cfg = generate_client_config(
            self.PRIV, "10.8.0.5", self.PUB, preshared_key=None, client_address_v6="  "
        )
        assert "Address = 10.8.0.5/32\n" in cfg
        assert "fd00" not in cfg
