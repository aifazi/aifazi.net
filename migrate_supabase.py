"""
migrate_supabase.py — Migrate all schema and data from one Supabase project to another.

Usage:
    set SOURCE_SUPABASE_HOST=db.ztqjjfnhuiinkfsgvjlr.supabase.co
    set SOURCE_SUPABASE_KEY=your-source-service-role-key
    python migrate_supabase.py <TARGET_SERVICE_ROLE_KEY>

Get the target key from: Supabase Dashboard -> Settings -> API -> service_role (secret)
"""
import psycopg2
import psycopg2.extras
import json
import sys
import time
import os

# ── Connection strings (from environment variables) ──────────────────────────
SRC_HOST = os.environ.get("SOURCE_SUPABASE_HOST", "db.ztqjjfnhuiinkfsgvjlr.supabase.co")
SRC_DB = "postgres"
SRC_USER = "postgres"
SRC_PASS = os.environ.get("SOURCE_SUPABASE_KEY", "")

# Target: xdzhvwmttshrauemakea
TGT_HOST = "db.xdzhvwmttshrauemakea.supabase.co"
TGT_DB = "postgres"
TGT_USER = "postgres"

if not SRC_PASS:
    print("ERROR: SOURCE_SUPABASE_KEY environment variable is required.")
    print("Usage: set SOURCE_SUPABASE_KEY=<key> && python migrate_supabase.py <TARGET_KEY>")
    sys.exit(1)

if len(sys.argv) < 2:
    print("Usage: python migrate_supabase.py <TARGET_SERVICE_ROLE_KEY>")
    print("Get the key from: Supabase Dashboard -> Settings -> API -> service_role (secret)")
    sys.exit(1)

TGT_PASS = sys.argv[1].strip()

# Tables to skip (Supabase internal)
SKIP_TABLES = {
    "auth_users", "auth_sessions", "auth_refresh_tokens", "auth_instances",
    "auth_aud", "auth_saml_providers", "auth_saml_relay_states", "auth_flow_state",
    "auth_one_time_tokens", "auth_identities", "auth_mfa_factors", "auth_mfa_challenges",
    "auth_mfa_amr_claims", "auth_sso_providers", "auth_sso_domains",
    "storage_buckets", "storage_objects", "storage_migrations",
    "realtime_messages", "realtime_schema_migrations",
    "pg_stat_statements", "pg_stat_statements_info",
    "pgsodium_masking", "pgsodium_keyiduser", "pgsodium_key", "pgsodium_key_keybytes",
    "supabase_migrations", "schema_migrations",
    "audit_log_entries",
    "_prisma_migrations",
    "cron", "job", "job_run_details", "schedule", "runtime_globals",
}

TABLE_ORDER = []

def get_conn(host, db, user, password):
    return psycopg2.connect(
        host=host, dbname=db, user=user, password=password,
        port=5432, sslmode="require", connect_timeout=15
    )

def get_tables(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT schemaname, tablename
        FROM pg_tables
        WHERE schemaname IN ('public', 'auth', 'storage', 'realtime')
          AND tablename NOT LIKE 'pg_%'
          AND tablename NOT LIKE '_%'
        ORDER BY schemaname, tablename
    """)
    tables = []
    for schema, table in cur.fetchall():
        full = f"{schema}.{table}"
        if table not in SKIP_TABLES and not table.startswith("pg_"):
            tables.append((schema, table))
    cur.close()
    return tables

def get_table_ddl(conn, schema, table):
    cur = conn.cursor()
    cur.execute(f"""
        SELECT pg_get_tabledef('{schema}.{table}'::regclass);
    """)
    result = cur.fetchone()
    cur.close()
    if result and result[0]:
        return result[0]
    return None

def get_indexes_ddl(conn, schema, table):
    cur = conn.cursor()
    cur.execute("""
        SELECT pg_get_indexdef(idx.indexrelid) || ';'
        FROM pg_index idx
        JOIN pg_class tbl ON tbl.oid = idx.indrelid
        JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
        WHERE ns.nspname = %s AND tbl.relname = %s
          AND NOT idx.indisprimary
          AND NOT idx.indisunique
    """, (schema, table))
    indexes = [row[0] for row in cur.fetchall()]
    cur.close()
    return indexes

def get_foreign_keys_ddl(conn, schema, table):
    cur = conn.cursor()
    cur.execute("""
        SELECT
            'ALTER TABLE ' || quote_ident(tc.table_schema) || '.' || quote_ident(tc.table_name) ||
            ' ADD CONSTRAINT ' || quote_ident(tc.constraint_name) ||
            ' FOREIGN KEY (' || string_agg(quote_ident(kcu.column_name), ', ' ORDER BY kcu.ordinal_position) ||
            ') REFERENCES ' || quote_ident(rc.unique_constraint_schema) || '.' || quote_ident(rc.unique_constraint_name) ||
            ' (' || string_agg(quote_ident(ccu.column_name), ', ' ORDER BY kcu.ordinal_position) ||
            ')' ||
            CASE WHEN rc.delete_rule != 'NO ACTION' THEN ' ON DELETE ' || rc.delete_rule ELSE '' END ||
            CASE WHEN rc.update_rule != 'NO ACTION' THEN ' ON UPDATE ' || rc.update_rule ELSE '' END ||
            ';'
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.referential_constraints rc
            ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
        JOIN information_schema.key_column_usage ccu
            ON rc.unique_constraint_name = ccu.constraint_name AND rc.unique_constraint_schema = ccu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = %s AND tc.table_name = %s
        GROUP BY tc.table_schema, tc.table_name, tc.constraint_name,
                 rc.unique_constraint_schema, rc.unique_constraint_name,
                 rc.delete_rule, rc.update_rule
    """, (schema, table))
    fks = [row[0] for row in cur.fetchall()]
    cur.close()
    return fks

def get_triggers_ddl(conn, schema, table):
    cur = conn.cursor()
    cur.execute("""
        SELECT pg_get_triggerdef(t.oid) || ';'
        FROM pg_trigger t
        JOIN pg_class tbl ON tbl.oid = t.tgrelid
        JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
        WHERE ns.nspname = %s AND tbl.relname = %s
          AND NOT t.tgisinternal
    """, (schema, table))
    triggers = [row[0] for row in cur.fetchall()]
    cur.close()
    return triggers

def get_functions_ddl(conn, schema):
    cur = conn.cursor()
    cur.execute("""
        SELECT pg_get_functiondef(p.oid) || ';'
        FROM pg_proc p
        JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = %s
          AND p.prokind IN ('f', 'p')
          AND NOT p.proname LIKE 'pg_%'
    """, (schema,))
    funcs = [row[0] for row in cur.fetchall()]
    cur.close()
    return funcs

def get_table_data(conn, schema, table):
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(f'SELECT * FROM "{schema}"."{table}"')
    rows = cur.fetchall()
    cur.close()
    return rows

def get_column_info(conn, schema, table):
    cur = conn.cursor()
    cur.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s
        ORDER BY ordinal_position
    """, (schema, table))
    cols = cur.fetchall()
    cur.close()
    return cols

def insert_data(conn, schema, table, rows):
    if not rows:
        return 0
    cur = conn.cursor()
    columns = list(rows[0].keys())
    col_names = ', '.join(f'"{c}"' for c in columns)
    placeholders = ', '.join(['%s'] * len(columns))
    sql = f'INSERT INTO "{schema}"."{table}" ({col_names}) VALUES ({placeholders})'

    count = 0
    batch_size = 500
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i+batch_size]
        values = []
        for row in batch:
            vals = []
            for col in columns:
                v = row[col]
                if isinstance(v, dict):
                    vals.append(json.dumps(v))
                elif isinstance(v, list):
                    vals.append(json.dumps(v))
                else:
                    vals.append(v)
            values.append(tuple(vals))
        psycopg2.extras.execute_values(cur, sql, values, page_size=batch_size)
        count += len(batch)
    conn.commit()
    cur.close()
    return count

def get_extensions(conn):
    cur = conn.cursor()
    cur.execute("SELECT extname, extversion FROM pg_extension WHERE extname NOT IN ('plpgsql')")
    exts = cur.fetchall()
    cur.close()
    return exts

def get_sequences(conn, schema):
    cur = conn.cursor()
    cur.execute("""
        SELECT 'CREATE SEQUENCE IF NOT EXISTS ' || quote_ident(schemaname) || '.' || quote_ident(sequencename) ||
               ' START ' || start_value ||
               ' INCREMENT ' || increment_by ||
               ' MINVALUE ' || minimum_value ||
               ' MAXVALUE ' || maximum_value ||
               ' CACHE ' || cache_size ||
               CASE WHEN cycle_option = 'YES' THEN ' CYCLE' ELSE ' NO CYCLE' END ||
               ';'
        FROM information_schema.sequences
        WHERE sequence_schema = %s
    """, (schema,))
    seqs = [row[0] for row in cur.fetchall()]
    cur.close()
    return seqs

def get_sequence_values(conn, schema):
    cur = conn.cursor()
    cur.execute("""
        SELECT schemaname, sequencename, last_value
        FROM pg_sequences
        WHERE schemaname = %s
    """, (schema,))
    seqs = cur.fetchall()
    cur.close()
    return seqs

def main():
    print("=" * 60)
    print("Supabase Migration Tool")
    print(f"Source: {SRC_HOST}")
    print(f"Target: {TGT_HOST}")
    print("=" * 60)

    print("\n[1/7] Connecting to source database...")
    src = get_conn(SRC_HOST, SRC_DB, SRC_USER, SRC_PASS)
    print("  Connected")

    print("\n[2/7] Connecting to target database...")
    tgt = get_conn(TGT_HOST, TGT_DB, TGT_USER, TGT_PASS)
    print("  Connected")

    print("\n[3/7] Discovering tables...")
    tables = get_tables(src)
    print(f"  Found {len(tables)} tables:")
    for schema, table in tables:
        print(f"    - {schema}.{table}")

    print("\n[4/7] Migrating extensions...")
    extensions = get_extensions(src)
    tgt_cur = tgt.cursor()
    for ext_name, ext_ver in extensions:
        try:
            tgt_cur.execute(f'CREATE EXTENSION IF NOT EXISTS "{ext_name}"')
            print(f"  Extension: {ext_name}")
        except Exception as e:
            print(f"  Extension {ext_name}: {e}")
    tgt.commit()
    tgt_cur.close()

    print("\n[5/7] Migrating functions...")
    functions = get_functions_ddl(src, "public")
    tgt_cur = tgt.cursor()
    for func_ddl in functions:
        try:
            tgt_cur.execute(func_ddl)
            print(f"  Function created")
        except Exception as e:
            print(f"  Function: {e}")
    tgt.commit()
    tgt_cur.close()

    print("\n[6/7] Creating tables on target...")
    tgt_cur = tgt.cursor()
    tgt_cur.execute("SET session_replication_role = 'replica'")

    created_tables = []
    for schema, table in tables:
        try:
            ddl = get_table_ddl(src, schema, table)
            if ddl:
                tgt_cur.execute(ddl)
                created_tables.append((schema, table))
                print(f"  Table: {schema}.{table}")
            else:
                print(f"  Table {schema}.{table}: Could not get DDL")
        except Exception as e:
            print(f"  Table {schema}.{table}: {e}")

    tgt.commit()

    print("\n[7/7] Migrating data...")
    total_rows = 0
    for schema, table in created_tables:
        try:
            rows = get_table_data(src, schema, table)
            if rows:
                count = insert_data(tgt, schema, table, rows)
                total_rows += count
                print(f"  {schema}.{table}: {count} rows")
            else:
                print(f"  - {schema}.{table}: empty")
        except Exception as e:
            print(f"  {schema}.{table}: {e}")

    tgt_cur.execute("SET session_replication_role = 'origin'")
    tgt.commit()
    tgt_cur.close()

    print("\n[8/8] Migrating sequences...")
    sequences = get_sequences(src, "public")
    tgt_cur = tgt.cursor()
    for seq_ddl in sequences:
        try:
            tgt_cur.execute(seq_ddl)
            print(f"  Sequence created")
        except Exception as e:
            print(f"  Sequence: {e}")

    seq_values = get_sequence_values(src, "public")
    for schema, seq_name, last_val in seq_values:
        if last_val is not None:
            try:
                tgt_cur.execute(f"SELECT setval('{schema}.{seq_name}', {last_val})")
                print(f"  Sequence {seq_name} set to {last_val}")
            except Exception as e:
                print(f"  Sequence {seq_name}: {e}")

    tgt.commit()
    tgt_cur.close()

    print("\n[9/9] Creating indexes and foreign keys...")
    tgt_cur = tgt.cursor()
    for schema, table in created_tables:
        indexes = get_indexes_ddl(src, schema, table)
        for idx_ddl in indexes:
            try:
                tgt_cur.execute(idx_ddl)
            except Exception:
                pass

        fks = get_foreign_keys_ddl(src, schema, table)
        for fk_ddl in fks:
            try:
                tgt_cur.execute(fk_ddl)
            except Exception:
                pass

        triggers = get_triggers_ddl(src, schema, table)
        for trig_ddl in triggers:
            try:
                tgt_cur.execute(trig_ddl)
            except Exception as e:
                print(f"   Trigger on {schema}.{table}: {e}")

    tgt.commit()
    tgt_cur.close()

    print("\n" + "=" * 60)
    print(f"Migration complete!")
    print(f"Tables migrated: {len(created_tables)}")
    print(f"Total rows: {total_rows}")
    print("=" * 60)

    src.close()
    tgt.close()

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n Migration failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
