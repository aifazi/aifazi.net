"""Unit tests for utils.ldap_client identifier normalization.

Authentik's LDAP outpost exposes the login name as `cn` (verified live
2026-10-07 against prod: `uid` holds an opaque UUID, `mail` the address).
The search filter must therefore match usernames on `cn`, never `uid`.
"""
import pytest

from utils.ldap_client import LdapAuthFailed, _normalize_identifier


def test_username_matches_cn_not_uid():
    ident, filt = _normalize_identifier("tanvir")
    assert ident == "tanvir"
    assert filt == "(&(objectClass=person)(cn=tanvir))"


def test_email_matches_mail():
    ident, filt = _normalize_identifier("tanvir@aifazi.net")
    assert ident == "tanvir@aifazi.net"
    assert filt == "(&(objectClass=person)(mail=tanvir@aifazi.net))"


def test_special_chars_escaped():
    ident, filt = _normalize_identifier("a)(uid=*")
    assert "(uid=*" not in filt  # raw injection must not survive
    assert filt.startswith("(&(objectClass=person)(cn=")


def test_empty_identifier_rejected():
    with pytest.raises(LdapAuthFailed):
        _normalize_identifier("   ")
