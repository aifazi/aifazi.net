"""Tests for utils/cors_origins.py (B16: prod subdomain pattern must survive)."""
from utils.cors_origins import build_cors, is_allowed_origin

PROD_STATIC, PROD_PATTERNS = build_cors("https://aifazi.net", True)
DEV_STATIC, DEV_PATTERNS = build_cors("http://localhost:3000", False)


class TestProdOrigins:
    def test_public_frontends_allowed(self):
        for origin in ("https://aifazi.net", "https://www.aifazi.net", "https://admin.aifazi.net"):
            assert is_allowed_origin(origin, PROD_STATIC, PROD_PATTERNS), origin

    def test_subdomain_frontends_allowed(self):
        # B16: the old prod `else` branch wiped the subdomain pattern, so these
        # were CORS-blocked despite the code's own comment promising it.
        for origin in ("https://store.aifazi.net", "https://fivem.aifazi.net", "https://status.aifazi.net"):
            assert is_allowed_origin(origin, PROD_STATIC, PROD_PATTERNS), origin

    def test_unrelated_origins_rejected(self):
        for origin in ("https://evil.com", "http://aifazi.net", "https://aifazi.net.evil.com"):
            assert not is_allowed_origin(origin, PROD_STATIC, PROD_PATTERNS), origin

    def test_spoofed_subdomain_rejected(self):
        # A lookalike that merely ends with the pattern text must not match —
        # the pattern is anchored with `^` and requires a real `.<sub>.aifazi.net`.
        assert not is_allowed_origin("https://evil-aifazi.net.evil.com", PROD_STATIC, PROD_PATTERNS)
        assert not is_allowed_origin("https://x-evil.com/aifazi.net", PROD_STATIC, PROD_PATTERNS)


class TestCustomRoot:
    def test_fresh_clone_subdomain_pattern(self):
        static, patterns = build_cors("https://example.com", True)
        assert is_allowed_origin("https://store.example.com", static, patterns)
        assert is_allowed_origin("https://example.com", static, patterns)
        assert not is_allowed_origin("https://example.com.evil.com", static, patterns)

    def test_localhost_root_no_subdomain_pattern(self):
        static, patterns = build_cors("http://localhost:3000", False)
        assert "http://localhost:3000" in static
        assert patterns == DEV_PATTERNS


class TestDevOrigins:
    def test_localhost_allowed_in_dev_only(self):
        assert is_allowed_origin("http://localhost:3000", DEV_STATIC, DEV_PATTERNS)
        assert not is_allowed_origin("http://localhost:3000", PROD_STATIC, PROD_PATTERNS)

    def test_vercel_previews_allowed_in_dev(self):
        assert is_allowed_origin("https://abc123.vercel.app", DEV_STATIC, DEV_PATTERNS)
        assert not is_allowed_origin("https://abc123.vercel.app", PROD_STATIC, PROD_PATTERNS)
