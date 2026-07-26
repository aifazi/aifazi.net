"""Check forum_categories table in Supabase source database.

Usage:
    set SUPABASE_HOST=db.ztqjjfnhuiinkfsgvjlr.supabase.co
    set SUPABASE_DB_PASSWORD=your-service-role-key
    python check_db.py
"""
import os
import psycopg2

host = os.environ.get("SUPABASE_HOST", "db.ztqjjfnhuiinkfsgvjlr.supabase.co")
password = os.environ.get("SUPABASE_DB_PASSWORD", "")

if not password:
    print("ERROR: SUPABASE_DB_PASSWORD environment variable is required.")
    print("Usage: set SUPABASE_DB_PASSWORD=<service-role-key> && python check_db.py")
    exit(1)

conn = psycopg2.connect(
    host=host, dbname='postgres', user='postgres',
    password=password,
    port=5432, sslmode='require', connect_timeout=10
)
cur = conn.cursor()
cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
tables = [r[0] for r in cur.fetchall()]
print("Tables:", ", ".join(tables))

if "forum_categories" in tables:
    cur.execute("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='forum_categories' ORDER BY ordinal_position")
    print("\nforum_categories columns:")
    for c, t, n, d in cur.fetchall():
        print(f"  {c}: {t} (nullable={n}, default={d})")
else:
    print("\nforum_categories table NOT FOUND!")
    cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='forum_categories2' ORDER BY ordinal_position")
    cols2 = cur.fetchall()
    if cols2:
        print("\nforum_categories2 exists with columns:")
        for c, t in cols2:
            print(f"  {c}: {t}")

cur.close()
conn.close()
