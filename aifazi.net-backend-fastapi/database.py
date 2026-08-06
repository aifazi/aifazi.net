"""
database.py — Supabase client (service role, bypasses RLS)
All backend queries use this client; the frontend uses the anon key.
"""
import os
import logging
import httpx
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("database")

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# httpx errors raised when the underlying keep-alive connection was closed by
# the peer (Supabase / Cloudflare) between warm serverless invocations.
RETRYABLE_CONN_ERRORS = (
    httpx.RemoteProtocolError,
    httpx.ConnectError,
    httpx.ReadError,
    httpx.WriteError,
    httpx.ReadTimeout,
    httpx.ConnectTimeout,
    httpx.PoolTimeout,
)

_client: Client | None = None


def _build_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def get_client() -> Client:
    """Return the shared sync Supabase client (service role)."""
    global _client
    if _client is None:
        _client = _build_client()
    return _client


def reset_client() -> None:
    """Drop the shared client so the next get_client() builds a fresh one.

    Warm serverless invocations reuse the module-level client and its httpx
    keep-alive connection. If Supabase closed that connection while idle, the
    next request fails with RemoteProtocolError ("Server disconnected").
    Building a fresh client after such an error self-heals without needing to
    touch every call site.
    """
    global _client
    if _client is not None:
        try:
            _client.postgrest.aclose()
        except Exception:
            pass
    _client = None


def call_with_retry(fn, retries: int = 2):
    """Run a synchronous Supabase operation, retrying after a connection error.

    On a retryable connection error the shared client is reset (fresh http
    connections) before retrying, which clears stale keep-alive connections
    without re-implementing retries at hundreds of call sites.
    """
    for attempt in range(retries):
        try:
            return fn()
        except RETRYABLE_CONN_ERRORS:
            reset_client()
            if attempt >= retries - 1:
                raise


# Back-compat: existing code uses `from database import supabase` everywhere.
# A small proxy keeps that binding valid even after reset_client() replaces the
# underlying client (a plain value would point at the closed client).
class _SupabaseProxy:
    def __getattr__(self, name):
        return getattr(get_client(), name)


supabase = _SupabaseProxy()  # type: ignore[misc]
