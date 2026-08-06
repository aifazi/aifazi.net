"""
database.py — Supabase client (service role, bypasses RLS)
All backend queries use this client; the frontend uses the anon key.
"""
import os
import logging
from supabase import create_client, Client
from supabase.lib.client_options import ClientOptions
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("database")

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# Resilient client — generous timeouts so transient Supabase latency doesn't
# turn into ReadTimeout 500s on every endpoint. supabase-py's default
# postgrest_client_timeout is 5s, too tight for cold serverless + Supabase.
def _make_client():
    opts = ClientOptions(
        headers={"User-Agent": "aifazi-backend/2.0"},
        postgrest_client_timeout=30,
        storage_client_timeout=30,
        function_client_timeout=30,
    )
    return create_client(SUPABASE_URL, SUPABASE_KEY, options=opts)

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = _make_client()
else:
    logger.critical(
        "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. "
        "All database operations will raise an error. "
        "Add these to your .env file."
    )

    class _MissingSupabase:
        """Placeholder that raises a clear error on any attribute access."""
        def __getattr__(self, name: str):
            raise RuntimeError(
                f"Supabase client is not initialised (called .{name}()). "
                "Check that SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env"
            )

    supabase: Client = _MissingSupabase()  # type: ignore[assignment]
