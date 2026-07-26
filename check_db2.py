"""Check forum_categories table via Supabase REST API.

Usage:
    set SUPABASE_URL=https://your-project.supabase.co
    set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
    python check_db2.py
"""
import os
import json

url = os.environ.get("SUPABASE_URL", "")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not url or not key:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.")
    print("Usage: set SUPABASE_URL=<url> && set SUPABASE_SERVICE_ROLE_KEY=<key> && python check_db2.py")
    exit(1)

from supabase import create_client
sb = create_client(url, key)

try:
    res = sb.table("forum_categories").select("*").limit(5).execute()
    print(f"forum_categories exists! {len(res.data)} rows")
    if res.data:
        print("Sample row:", json.dumps({k: str(v)[:50] for k, v in res.data[0].items()}, indent=2))
    else:
        print("Table exists but no rows yet")
except Exception as e:
    print(f"forum_categories query failed: {e}")
    # Try inserting a test category
    try:
        test = sb.table("forum_categories").insert({"name": "test-cat", "display_order": 0}).execute()
        print(f"INSERT test succeeded: {test.data}")
        # Clean up
        sb.table("forum_categories").delete().eq("name", "test-cat").execute()
    except Exception as e2:
        print(f"INSERT also failed: {e2}")
        # Check what tables DO exist
        tables_to_check = ["forum_categories", "forum_threads", "forum_users", "helpdesk_tickets", "chat_rooms", "staff_users"]
        for t in tables_to_check:
            try:
                r = sb.table(t).select("*").limit(1).execute()
                print(f"  {t}: OK ({len(r.data)} rows)")
            except Exception as e3:
                print(f"  {t}: FAILED - {e3}")
