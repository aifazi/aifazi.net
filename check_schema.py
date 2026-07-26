"""Reproduce the create_category API call to debug 500.

Usage:
    set SUPABASE_URL=https://your-project.supabase.co
    set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
    python check_schema.py
"""
import os
import json
import requests

url = os.environ.get("SUPABASE_URL", "")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not url or not key:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required.")
    exit(1)

from supabase import create_client
sb = create_client(url, key)

# Exact payload the frontend sends
payload = {
    "name": "Test Category",
    "description": "Testing",
    "icon": "\U0001f4ac",
    "color": "var(--cyan)",
    "display_order": 0
}

print("=== Test 1: Full payload ===")
try:
    res = sb.table("forum_categories").insert(payload).execute()
    print(f"OK: {res.data}")
    sb.table("forum_categories").delete().eq("id", res.data[0]["id"]).execute()
    print("Cleaned up")
except Exception as e:
    print(f"FAILED: {e}")
    print(f"Type: {type(e).__name__}")

# Test without optional fields
print("\n=== Test 2: Minimal payload ===")
try:
    res = sb.table("forum_categories").insert({"name": "Test2"}).execute()
    print(f"OK: {res.data}")
    sb.table("forum_categories").delete().eq("id", res.data[0]["id"]).execute()
except Exception as e:
    print(f"FAILED: {e}")

# Test with name and display_order
print("\n=== Test 3: With display_order ===")
try:
    res = sb.table("forum_categories").insert({"name": "Test3", "display_order": 1}).execute()
    print(f"OK: {res.data}")
    sb.table("forum_categories").delete().eq("id", res.data[0]["id"]).execute()
except Exception as e:
    print(f"FAILED: {e}")

# Check table DDL
print("\n=== Test 4: Get columns ===")
r = requests.get(
    f"{url}/rest/v1/forum_categories?limit=1&select=*",
    headers={
        "apikey": key,
        "Authorization": f"Bearer {key}"
    }
)
print(f"Status: {r.status_code}")
if r.status_code == 200:
    print(f"Columns: {list(r.json()[0].keys()) if r.json() else 'no rows'}")
else:
    print(f"Error: {r.text[:200]}")
