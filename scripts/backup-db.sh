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
FAIL=0 # set to 1 on any failure; the script exits non-zero (ALERT) at the end

# Run a command inside a container with a secret env var that never appears
# in process argv (host `ps`, container /proc, or `docker inspect`). The
# secret travels via a 600-perm file copied with `docker cp`, is sourced
# inside the container, then shredded on both sides.
docker_exec_secret() { # <container> <ENV_NAME> <secret> -- <cmd...>
  local container="$1" env_name="$2" secret="$3"
  shift 3
  [ "${1:-}" = "--" ] && shift
  local host_file cpath escaped rc
  host_file=$(mktemp)
  chmod 600 "$host_file"
  escaped=$(printf '%s' "$secret" | sed "s/'/'\\\\''/g")
  printf "%s='%s'\n" "$env_name" "$escaped" > "$host_file"
  unset secret escaped
  cpath="/tmp/.backup-secret-$$"
  docker cp "$host_file" "$container:$cpath" >/dev/null
  shred -u "$host_file" 2>/dev/null || rm -f "$host_file"
  docker exec -i "$container" sh -c 'set -a; . "$0"; rm -f "$0"; set +a; exec "$@"' "$cpath" "$@"
  rc=$?
  docker exec "$container" rm -f "$cpath" 2>/dev/null || true
  return $rc
}

# Postgres password comes from the db container's own env (root cron only).
PGPASS_SUPABASE=$(docker exec "$DB_CONTAINER" printenv POSTGRES_PASSWORD)
if [ -z "$PGPASS_SUPABASE" ]; then
  echo "backup-db: could not read POSTGRES_PASSWORD from $DB_CONTAINER" >&2
  exit 1
fi

# Dump straight through gzip into openssl (no plaintext ever touches disk,
# and the DB password never appears in process argv — see docker_exec_secret).
docker_exec_secret "$DB_CONTAINER" PGPASSWORD "$PGPASS_SUPABASE" -- \
  pg_dump -U "$DB_USER" -d "$DB_NAME" \
  | gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -pass "env:BACKUP_PASSPHRASE" -out "$TMP_OUT.enc"
unset PGPASS_SUPABASE
mv "$TMP_OUT.enc" "$FINAL_OUT"

# Verify the archive decrypts + gunzips (header check only, cheap).
if ! openssl enc -d -aes-256-cbc -pbkdf2 -pass "env:BACKUP_PASSPHRASE" -in "$FINAL_OUT" 2>/dev/null | gunzip -t 2>/dev/null; then
  echo "backup-db: ALERT — VERIFY FAILED for $FINAL_OUT" >&2
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
    FIVEM_ROOT_PW=$(cat /opt/fivem/.mysql_root_pw)
    for FIVEM_DB in qbox_f4f194 nextcloud; do
      FIVEM_FINAL="$BACKUP_DIR/fivem-$FIVEM_DB-$TS.sql.gz.enc"
      if docker_exec_secret "$FIVEM_DB_CONTAINER" MYSQL_PWD "$FIVEM_ROOT_PW" -- \
          mariadb-dump -uroot --single-transaction --routines --events "$FIVEM_DB" 2>/dev/null \
          | gzip \
          | openssl enc -aes-256-cbc -pbkdf2 -pass "env:BACKUP_PASSPHRASE" -out "$FIVEM_FINAL.tmp"; then
        mv "$FIVEM_FINAL.tmp" "$FIVEM_FINAL"
        if openssl enc -d -aes-256-cbc -pbkdf2 -pass "env:BACKUP_PASSPHRASE" -in "$FIVEM_FINAL" 2>/dev/null | gunzip -t 2>/dev/null; then
          echo "backup-db: OK $FIVEM_FINAL ($(du -h "$FIVEM_FINAL" | cut -f1))"
        else
          echo "backup-db: ALERT — VERIFY FAILED for $FIVEM_FINAL" >&2
          rm -f "$FIVEM_FINAL"
          FAIL=$((FAIL + 1))
        fi
      else
        echo "backup-db: ALERT — fivem dump failed for $FIVEM_DB (mysqldump error)" >&2
        rm -f "$FIVEM_FINAL.tmp"
        FAIL=$((FAIL + 1))
      fi
    done
    unset FIVEM_ROOT_PW
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
      echo "backup-db: ALERT — VERIFY FAILED for $out" >&2
      rm -f "$out"
      FAIL=$((FAIL + 1))
    fi
  else
    echo "backup-db: ALERT — file backup failed for $name" >&2
    rm -f "$out.tmp"
    FAIL=$((FAIL + 1))
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

# ── Upload to Nextcloud WebDAV (offsite copy) ──────────────────────────────
# Requires: NEXTCLOUD_WEBDAV_URL, NEXTCLOUD_WEBDAV_USER, NEXTCLOUD_WEBDAV_PASS
# Set these in the cron environment or /root/.aifazi-backup-pass.
NEXTCLOUD_WEBDAV_URL="${NEXTCLOUD_WEBDAV_URL:-https://cloud.aifazi.net/remote.php/dav/files/admin/aifazi-backups}"
if [ -n "${NEXTCLOUD_WEBDAV_USER:-}" ] && [ -n "${NEXTCLOUD_WEBDAV_PASS:-}" ]; then
  echo "backup-db: uploading to Nextcloud WebDAV..."
  for f in "$BACKUP_DIR"/postgres-"$TS".sql.gz.enc "$BACKUP_DIR"/fivem-*-"$TS".sql.gz.enc "$BACKUP_DIR"/files-*-"$TS".tar.gz.enc; do
    [ -f "$f" ] || continue
    fname=$(basename "$f")
    if curl -sS --fail --max-time 300 \
      -u "$NEXTCLOUD_WEBDAV_USER:$NEXTCLOUD_WEBDAV_PASS" \
      -T "$f" \
      "$NEXTCLOUD_WEBDAV_URL/$fname" 2>/dev/null; then
      echo "backup-db: uploaded $fname to Nextcloud"
    else
      echo "backup-db: ALERT — FAILED to upload $fname to Nextcloud" >&2
      FAIL=$((FAIL + 1))
    fi
  done
  # Rotate remote backups (keep last $KEEP). PROPFIND returns server-relative
  # href paths, so DELETE must use the full WebDAV URL, not the bare path.
  WEBDAV_BASE="${NEXTCLOUD_WEBDAV_URL%%/remote.php/*}"
  REMOTE_LIST=$(curl -sS --fail -u "$NEXTCLOUD_WEBDAV_USER:$NEXTCLOUD_WEBDAV_PASS" \
    -X PROPFIND -H "Depth: 1" "$NEXTCLOUD_WEBDAV_URL" 2>/dev/null \
    | grep -oP '<d:href>[^<]+</d:href>' | sed 's/<[^>]*>//g' | sort -r || true)
  REMOTE_COUNT=$(echo "$REMOTE_LIST" | grep -c '\.enc$' || true)
  if [ "$REMOTE_COUNT" -gt "$KEEP" ]; then
    echo "$REMOTE_LIST" | tail -n +"$((KEEP + 1))" | while read -r rpath; do
      [ -z "$rpath" ] && continue
      case "$rpath" in
        http://*|https://*) del_url="$rpath" ;;
        *) del_url="$WEBDAV_BASE$rpath" ;;
      esac
      if ! curl -sS --fail -u "$NEXTCLOUD_WEBDAV_USER:$NEXTCLOUD_WEBDAV_PASS" \
        -X DELETE "$del_url" 2>/dev/null; then
        echo "backup-db: ALERT — FAILED to rotate remote $(basename "$rpath")" >&2
      else
        echo "backup-db: rotated remote $(basename "$rpath")"
      fi
    done
  fi
else
  echo "backup-db: NEXTCLOUD_WEBDAV_USER/PASS not set — skipping remote upload"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "backup-db: ALERT — $FAIL backup step(s) failed (see log above)" >&2
  exit 1
fi
echo "backup-db: all steps OK"
