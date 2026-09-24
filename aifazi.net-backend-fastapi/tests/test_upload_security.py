"""Upload security unit tests: path traversal, MIME sniffing, allowlists."""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import helpers without requiring a live Supabase connection.
os.environ.setdefault("PASETO_SECRET", "test-secret-for-unit-tests-only")
os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-only")

from routers.upload import (
    ALLOWED_MIMETYPES,
    CHAT_ALLOWED_MIMETYPES,
    MAX_UPLOAD_BYTES,
    _is_cloudinary_url,
    _safe_storage_filename,
    _scrub_provider_error,
    _sniff_mimetype,
)


class TestSafeStorageFilename:
    def test_strips_unix_traversal(self):
        assert _safe_storage_filename("../../etc/passwd") == "passwd"

    def test_strips_windows_traversal(self):
        assert _safe_storage_filename("..\\..\\windows\\system32\\cmd.exe") == "cmd.exe"

    def test_strips_nested_paths(self):
        assert _safe_storage_filename("a/b/c/d.png") == "d.png"

    def test_removes_dotdot_in_name(self):
        assert ".." not in _safe_storage_filename("foo..bar.png")

    def test_empty_falls_back(self):
        assert _safe_storage_filename("") == "file"
        assert _safe_storage_filename(None) == "file"  # type: ignore[arg-type]

    def test_truncates_long_names(self):
        assert len(_safe_storage_filename("x" * 500)) <= 80


class TestSniffMimetype:
    def test_png_magic(self):
        assert _sniff_mimetype(b"\x89PNG\r\n\x1a\n....", "application/pdf") == "image/png"

    def test_jpeg_magic(self):
        assert _sniff_mimetype(b"\xff\xd8\xff\xe0....", "text/plain") == "image/jpeg"

    def test_pdf_magic(self):
        assert _sniff_mimetype(b"%PDF-1.7....", "image/png") == "application/pdf"

    def test_exe_as_png_rejected_to_octet_stream(self):
        # PE header masquerading as image/png
        out = _sniff_mimetype(b"MZ\x90\x00\x03", "image/png")
        assert out == "application/octet-stream"
        assert out not in ALLOWED_MIMETYPES

    def test_unknown_magic_never_trusts_claimed_mime(self):
        assert _sniff_mimetype(b"not-a-real-file", "image/png") == "application/octet-stream"

    def test_webp_vs_wav_disambiguation(self):
        webp = b"RIFF\x00\x00\x00\x00WEBP"
        wav = b"RIFF\x00\x00\x00\x00WAVE"
        assert _sniff_mimetype(webp, "") == "image/webp"
        assert _sniff_mimetype(wav, "") == "audio/wav"

    def test_docx_pk_fallback_allowed_claim(self):
        docx = _sniff_mimetype(
            b"PK\x03\x04rest",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        assert docx.endswith("wordprocessingml.document")

    def test_plain_zip_not_admitted_as_image(self):
        assert _sniff_mimetype(b"PK\x03\x04rest", "image/png") == "application/zip"


class TestAllowlists:
    def test_svg_excluded(self):
        assert "image/svg+xml" not in ALLOWED_MIMETYPES
        assert "image/svg+xml" not in CHAT_ALLOWED_MIMETYPES

    def test_text_and_zip_excluded_from_public_bucket(self):
        assert "text/html" not in ALLOWED_MIMETYPES
        assert "text/plain" not in ALLOWED_MIMETYPES
        assert "application/zip" not in ALLOWED_MIMETYPES
        assert "application/x-msdownload" not in ALLOWED_MIMETYPES

    def test_chat_is_stricter_than_library(self):
        assert CHAT_ALLOWED_MIMETYPES <= ALLOWED_MIMETYPES
        assert "application/pdf" in ALLOWED_MIMETYPES
        assert "application/pdf" not in CHAT_ALLOWED_MIMETYPES

    def test_upload_cap(self):
        assert MAX_UPLOAD_BYTES == 50 * 1024 * 1024


class TestCloudinaryUrl:
    @pytest.mark.parametrize(
        "url,ok",
        [
            ("https://res.cloudinary.com/demo/image/upload/x.png", True),
            ("https://res.cloudinary.com.evil.com/x.png", False),
            ("https://evil.com/?x=res.cloudinary.com", False),
            ("http://res.cloudinary.com/x", True),
            ("javascript:alert(1)", False),
            ("file:///etc/passwd", False),
            ("", False),
        ],
    )
    def test_hostname_exact_match(self, url: str, ok: bool):
        assert _is_cloudinary_url(url) is ok


class TestScrubProviderError:
    def test_redacts_tokens_and_urls(self):
        msg = _scrub_provider_error(
            'fail authorizationToken=abc123 uploadUrl=https://internal/secret x-amz-signature=zzz'
        )
        assert "abc123" not in msg
        assert "https://internal/secret" not in msg
        assert "REDACTED" in msg

    def test_empty_is_generic(self):
        assert _scrub_provider_error("") == "Upload provider error"

    def test_truncates(self):
        assert len(_scrub_provider_error("x" * 10_000)) <= 200
