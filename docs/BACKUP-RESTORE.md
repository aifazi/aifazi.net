# Backup & Restore Runbook (C3)

Status: **open risk** — the offsite copy is same-host and no restore has ever
been executed end-to-end. This runbook is the missing half of the backup
feature: it defines the offsite target, the fail-loud changes, and the exact
restore drill that must be run and dated before C3 can be closed.

Owner inputs needed before Step 1 can run: **an offsite bucket + write
credentials** (Cloudflare R2 preferred — S3-compatible, no egress fee).

---

## 1. What exists today

`scripts/backup-db.sh` (live at `/opt/aifazi.net/scripts/backup-db.sh`, root
cron `0 3 * * *`):

| Artifact | Source | Archive |
|----------|--------|---------|
| `postgres-<TS>.sql.gz.enc` | Supabase Postgres `pg_dump` | AES-256-CBC + PBKDF2 |
| `fivem-qbox_f4f194-<TS>.sql.gz.enc` | FiveM MariaDB | same |
| `fivem-nextcloud-<TS>.sql.gz.enc` | Nextcloud MariaDB | same |
| `files-lldap-<TS>.tar.gz.enc` | `/opt/lldap` (identity source) | same |
| `files-nextcloud-<TS>.tar.gz.enc` | `/opt/nextcloud/html` | same |
| `files-stalwart-<TS>.tar.gz.enc` | Stalwart mail volumes | same |
| `files-fivemdata-<TS>.tar.gz.enc` | `/opt/fivem` minus `server-data/db` | same |

- Local dir `/var/backups/aifazi`, keeps the last `BACKUP_KEEP=7` per series.
- Every archive is **decrypt-verified right after writing** (`gunzip -t`); a
  verify failure deletes the file and exits non-zero.
- Passphrase: `BACKUP_PASSPHRASE`, read from `/root/.aifazi-backup-pass` by the
  cron line, never on the command line (`docker_exec_secret` streams each DB
  password through a 600-perm file inside the container).
- No PITR: self-hosted Supabase has no managed point-in-time recovery, and the
  in-app `/api/admin/backup` export truncates at 200k rows/table. **This script
  is the real disaster-recovery path.**

## 2. Gaps this runbook closes (C3)

1. **Offsite is same-host.** The only offsite copy goes to
   `https://cloud.aifazi.net/...` (Nextcloud on the same VPS). A host loss
   takes the backups with it.
2. **Silent skip.** `scripts/backup-db.sh:202-204` logs
   `NEXTCLOUD_WEBDAV_USER/PASS not set — skipping remote upload` and still
   exits 0, so a mis-set cron env looks healthy while nothing leaves the box.
3. **Restore never tested.** The decrypt-verify only checks the gzip header; it
   does not prove the dump loads.
4. **Cron not in repo.** The active schedule is not verifiable from the tree.

## 3. Target #2 — offsite copy (implementation)

Add a second, independent destination and make a missing destination **fatal**.
Sketch (to be finalised when credentials exist):

```bash
# After the existing Nextcloud block, before the final FAIL check.
R2_BUCKET="${R2_BACKUP_BUCKET:-}"
if [ -z "${R2_BACKUP_BUCKET:-}" ] || [ -z "${R2_BACKUP_ACCESS_KEY_ID:-}" ] \
   || [ -z "${R2_BACKUP_SECRET_ACCESS_KEY:-}" ]; then
  echo "backup-db: ALERT — R2 target env not set; refusing to run without an offsite copy" >&2
  FAIL=$((FAIL + 1))                       # (2) fail loud, not silent
else
  export AWS_ACCESS_KEY_ID="$R2_BACKUP_ACCESS_KEY_ID" \
         AWS_SECRET_ACCESS_KEY="$R2_BACKUP_SECRET_ACCESS_KEY" \
         AWS_DEFAULT_REGION=auto
  for f in "$BACKUP_DIR"/*-"$TS".*.enc; do
    [ -f "$f" ] || continue
    aws s3 cp --only-show-errors --endpoint-url "$R2_ENDPOINT" \
      "$f" "s3://$R2_BUCKET/$(basename "$f")" || { echo "backup-db: ALERT — R2 upload failed $(basename "$f")" >&2; FAIL=$((FAIL + 1)); }
  done
fi
```

Also:
- **Alerting:** cron must surface the non-zero exit. The `notify-failure`
  pattern in CI does not cover the VPS; wire the log line
  `backup-db: ALERT` to the existing monitor/alert channel (Coolify healthcheck
  or the app's error-alert mailer) so a skipped/failed run is visible.
- **Immutability:** enable object-lock / versioning on the bucket so ransomware
  cannot overwrite history.
- **Rotation:** keep ≥30 days offsite (the 7-day local window is too short for
  slow-burn corruption).
- **Commit the cron line** to `docs/` (or a checked-in `deploy/` snippet) so the
  schedule is verifiable.

## 4. Restore drill (run quarterly + before trusting a release)

Do this on a **scratch host / throwaway DB**, never against production.

Set the passphrase the same way the backup used it:

```bash
export BACKUP_PASSPHRASE="$(cat /root/.aifazi-backup-pass)"
```

### 4.1 Postgres (Supabase)

```bash
# to a throwaway database on a local postgres
createdb restore_test
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE \
  -in postgres-<TS>.sql.gz.enc | gunzip | psql -d restore_test
# sanity
psql -d restore_test -c "select count(*) from users;" \
  -c "select count(*) from store_orders;" \
  -c "select count(*) from infra_diagrams;"
```

### 4.2 FiveM / Nextcloud MariaDB

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE \
  -in fivem-qbox_f4f194-<TS>.sql.gz.enc | gunzip | mariadb restore_test
mariadb restore_test -e "select count(*) from players;"
```

### 4.3 File archives

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE \
  -in files-lldap-<TS>.tar.gz.enc | tar -tzf - | head    # list
mkdir -p /tmp/restore && cd /tmp/restore
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE \
  -in files-lldap-<TS>.tar.gz.enc | gunzip | tar -xzf -
```

### 4.4 Offsite object

```bash
aws s3 ls "s3://$R2_BUCKET/" --endpoint-url "$R2_ENDPOINT" | tail
```

## 5. Verification checklist (record the date + result in STATUS.md)

- [ ] Latest `postgres-*.sql.gz.enc` decrypts and loads into a scratch DB — **row counts match** a fresh `select count(*)` on prod for `users`, `store_orders`, `infra_diagrams`, `chat_messages`.
- [ ] `fivem-*.enc` (both DBs) load into MariaDB with non-zero table counts.
- [ ] `files-lldap-*.enc` extracts and `/opt/lldap` sqlite opens (`sqlite3 <db> 'pragma integrity_check;'` → `ok`).
- [ ] `files-nextcloud-*.enc` and `files-stalwart-*.enc` extract without tar errors.
- [ ] An offsite object exists **in the second bucket** for the same `TS`.
- [ ] Un-setting target #2 env causes the script to **exit non-zero** (fail-loud proven).
- [ ] Log line `backup-db: all steps OK` appears in `/var/log/aifazi-backup.log` for the last run.

## 6. Rollback / notes

- Restores are additive to a scratch DB; production is untouched until the
  operator promotes a restored DB intentionally.
- Keep the encrypted archives; **never** decrypt to disk outside the drill
  window, and `shred -u` any plaintext dumps produced during a drill.
- If rotation evicts a needed archive, the offsite window (≥30d) is the
  recovery source — the local 7-day window is not.

---

*Related: `docs/SECRETS-ROTATION.md` (passphrase + credential rotation),
`docs/AUDIT.md` §21.4 / §21.5 (C3 standing risk), `scripts/backup-db.sh`.*
