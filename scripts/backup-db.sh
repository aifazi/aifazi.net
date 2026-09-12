#!/usr/bin/env bash
#
# scripts/backup-db.sh — encrypted nightly backups on the VPS (3 AM UTC cron).
# Databases: Supabase Postgres (pg_dump), FiveM MariaDB qbox_f4f194 +
# Nextcloud MariaDB nextcloud (mariadb-dump). Files: lldap dir, Nextcloud
# html, Stalwart volumes, FiveM server-data minus live MariaDB dir (the SQL
# dumps are the consistent copy). Live at /opt/aifazi.net/scripts/backup-db.sh.
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

# ── FiveM MariaDB (skipped silently if the stack isn't present) ─────────────
# Same encryption + verify + rotation, separate archive per database.
# Covers the game DB (qbox_f4f194) and the Nextcloud DB (nextcloud).
FIVEM_DB_CONTAINER=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E '^fivem-db-' | head -n 1 || true)
if [ -n "$FIVEM_DB_CONTAINER" ]; then
  if [ -r /opt/fivem/.mysql_root_pw ]; then
    for FIVEM_DB in qbox_f4f194 nextcloud; do
      FIVEM_FINAL="$BACKUP_DIR/fivem-$FIVEM_DB-$TS.sql.gz.enc"
      if docker exec -e "MYSQL_PWD=$(cat /opt/fivem/.mysql_root_pw)" "$FIVEM_DB_CONTAINER" \
          mariadb-dump -uroot --single-transaction --routines --events "$FIVEM_DB" 2>/dev/null \
          | gzip \
          | openssl enc -aes-256-cbc -pbkdf2 -pass "env:BACKUP_PASSPHRASE" -out "$FIVEM_FINAL.tmp"; then
        mv "$FIVEM_FINAL.tmp" "$FIVEM_FINAL"
        if openssl enc -d -aes-256-cbc -pbkdf2 -pass "env:BACKUP_PASSPHRASE" -in "$FIVEM_FINAL" 2>/dev/null | gunzip -t 2>/dev/null; then
          echo "backup-db: OK $FIVEM_FINAL ($(du -h "$FIVEM_FINAL" | cut -f1))"
        else
          echo "backup-db: VERIFY FAILED for $FIVEM_FINAL" >&2
          rm -f "$FIVEM_FINAL"
        fi
      else
        echo "backup-db: fivem dump failed for $FIVEM_DB (mysqldump error)" >&2
      fi
    done
    ls -1t "$BACKUP_DIR"/fivem-*.sql.gz.enc 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
  else
    echo "backup-db: /opt/fivem/.mysql_root_pw unreadable — skipping FiveM dump" >&2
  fi
fi

# ── File backups (stateless code excluded; live DB dirs excluded — the SQL
# dumps above are the consistent copy) ─────────────────────────────────────
# Same encryption + verify + rotation. Archives:
#   files-lldap        /opt/lldap (directory sqlite — the identity source)
#   files-nextcloud    /opt/nextcloud/html (code+config+user data)
#   files-stalwart     mail volumes (config + queues + blobs)
#   files-fivemdata    /opt/fivem minus server-data/db (covered by SQL dumps)
file_backup() {
  local name="$1"; shift
  local out="$BACKUP_DIR/files-$name-$TS.tar.gz.enc"
  if "$@" | gzip | openssl enc -aes-256-cbc -pbkdf2 -pass "env:BACKUP_PASSPHRASE" -out "$out.tmp"; then
    mv "$out.tmp" "$out"
    if openssl enc -d -aes-256-cbc -pbkdf2 -pass "env:BACKUP_PASSPHRASE" -in "$out" 2>/dev/null | gunzip -t 2>/dev/null; then
      echo "backup-db: OK $out ($(du -h "$out" | cut -f1))"
    else
      echo "backup-db: VERIFY FAILED for $out" >&2
      rm -f "$out"
    fi
  else
    echo "backup-db: file backup failed for $name" >&2
    rm -f "$out.tmp"
  fi
  ls -1t "$BACKUP_DIR"/files-"$name"-*.tar.gz.enc 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
}

[ -d /opt/lldap ] && file_backup lldap tar -czf - -C /opt lldap
[ -d /opt/nextcloud ] && file_backup nextcloud tar -czf - -C /opt nextcloud
if docker volume inspect mbkueai1hukfyan8mei8sdbc_stalwart-data >/dev/null 2>&1; then
  file_backup stalwart docker run --rm \
    -v mbkueai1hukfyan8mei8sdbc_stalwart-data:/v/data:ro \
    -v mbkueai1hukfyan8mei8sdbc_stalwart-mail:/v/mail:ro \
    alpine tar -czf - -C /v data mail
fi
[ -d /opt/fivem/server-data ] && file_backup fivemdata tar -czf - -C /opt --exclude='fivem/server-data/db' fivem
