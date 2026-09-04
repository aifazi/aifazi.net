#!/usr/bin/env bash
#
# scripts/backup-db.sh — encrypted nightly pg_dump of the self-hosted Supabase
# Postgres (supabase-db container) on the VPS.
#
# There is no managed PITR for self-hosted Supabase, and the in-app
# /api/admin/backup export truncates at 200k rows/table — so this is the
# real disaster-recovery path. Run from root's crontab:
#
#   BACKUP_PASSPHRASE='<long-random>'  # same value every run (kept in a root-only file, NOT git)
#   0 3 * * * BACKUP_PASSPHRASE=$(cat /root/.aifazi-backup-pass) /opt/aifazi.net/scripts/backup-db.sh >> /var/log/aifazi-backup.log 2>&1
#
# Keeps the last 7 daily dumps in /var/backups/aifazi (AES-256-CBC + PBKDF2).
# Restore: openssl enc -d -aes-256-cbc -pbkdf2 -in <file> | gunzip | psql.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/aifazi}"
KEEP="${BACKUP_KEEP:-7}"
# Coolify suffixes the service name (supabase-db-<uuid>); resolve live.
if [ -z "${DB_CONTAINER:-}" ]; then
  DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E '^supabase-db-' | head -n 1)
fi
: "${DB_CONTAINER:?supabase-db container not running}"
DB_NAME="${DB_NAME:-postgres}"
DB_USER="${DB_USER:-postgres}"

: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE must be set (root-only env, never git)}"
command -v docker >/dev/null || { echo "backup-db: docker not found" >&2; exit 1; }
command -v openssl >/dev/null || { echo "backup-db: openssl not found" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
TS=$(date -u +%Y%m%dT%H%M%SZ)
TMP_OUT="$BACKUP_DIR/.postgres-$TS.sql.gz"
FINAL_OUT="$BACKUP_DIR/postgres-$TS.sql.gz.enc"

# Postgres password comes from the db container's own env (root cron only).
PGPASS_SUPABASE=$(docker exec "$DB_CONTAINER" printenv POSTGRES_PASSWORD)
if [ -z "$PGPASS_SUPABASE" ]; then
  echo "backup-db: could not read POSTGRES_PASSWORD from $DB_CONTAINER" >&2
  exit 1
fi

# Dump straight through gzip into openssl (no plaintext ever touches disk).
docker exec -e "PGPASSWORD=$PGPASS_SUPABASE" "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
  | gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -pass "env:BACKUP_PASSPHRASE" -out "$TMP_OUT.enc"
unset PGPASS_SUPABASE
mv "$TMP_OUT.enc" "$FINAL_OUT"

# Verify the archive decrypts + gunzips (header check only, cheap).
if ! openssl enc -d -aes-256-cbc -pbkdf2 -pass "env:BACKUP_PASSPHRASE" -in "$FINAL_OUT" 2>/dev/null | gunzip -t 2>/dev/null; then
  echo "backup-db: VERIFY FAILED for $FINAL_OUT" >&2
  rm -f "$FINAL_OUT"
  exit 1
fi

# Rotation: keep newest $KEEP.
ls -1t "$BACKUP_DIR"/postgres-*.sql.gz.enc 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "backup-db: OK $FINAL_OUT ($(du -h "$FINAL_OUT" | cut -f1))"
