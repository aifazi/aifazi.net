"""
database.py — Supabase client (service role, bypasses RLS)
All backend queries use this client; the frontend uses the anon key.
"""
import os
import logging
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("database")

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if SUPABASE_URL and SUPABASE_KEY:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
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
