"""utils/timezone — Shared datetime helpers.

Centralises the ubiquitous ``_now()`` pattern so that behaviour (e.g. adding
microseconds, switching to a different timezone strategy) only needs to change
in one place.
"""
from datetime import datetime, timezone


def utc_now_iso() -> str:
    """Return the current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


def utc_now() -> datetime:
    """Return the current UTC datetime (timezone-aware)."""
    return datetime.now(timezone.utc)
