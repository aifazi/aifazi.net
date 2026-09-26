# aifazi.net — VPS / Infrastructure Audit

**Date:** 2026-09-24  
**Scope:** repo-defined infra (Docker, Coolify deploy scripts, WireGuard, ClamAV, Stalwart, backups, DNS, firewall notes in ROADMAP)  
**Host context (from ROADMAP):** Contabo VPS `75.119.131.157`, Coolify + Traefik, self-hosted Supabase, FiveM, Nextcloud `cloud.aifazi.net`, Stalwart mail, lldap, WireGuard full-tunnel  
**Method:** static review of scripts/Dockerfiles/compose only — **no live SSH** to the VPS

Severity: **CRITICAL / HIGH / MEDIUM / LOW / INFO**

---

## Executive Summary

This is a **thoughtful, production-minded VPS setup** — better than typical solo ops. Atomic deploys with rollback, encrypted backups that avoid putting secrets in `argv`, fail-closed malware scan, host-only ClamAV, non-root app user with `gosu`, path-validated deploy scripts, and a written firewall history in ROADMAP.

The **most important gap is disaster recovery**: offsite backups upload to **Nextcloud on the same VPS** (`cloud.aifazi.net`). A host loss loses both the service and its backups.

Second tier: root SSH deploys with TOFU host keys, `docker-compose.web.yml` binding all interfaces with default secrets, ClamAV listening `0.0.0.0` inside Docker, and WireGuard full-tunnel peers with broad FORWARD access.

Overall infra grade: **B** (ops hygiene strong, DR and network blast-radius need work).

---

## 1. Topology (as defined in repo)

```
Internet
   │
   ├─ Cloudflare DNS (proxied: false on key CNAMEs in setup-dns.cjs)
   │
   ├─ Vercel ── Next.js frontend (aifazi.net)
   │
   └─ Contabo VPS 75.119.131.157
        ├─ Coolify + Traefik (443) ── api.aifazi.net → FastAPI
        ├─ Self-hosted Supabase (Postgres)
        ├─ FiveM + MariaDB (qbox + nextcloud DBs)
        ├─ Nextcloud cloud.aifazi.net  ← also backup target ⚠
        ├─ Stalwart mail
        ├─ lldap (identity)
        ├─ WireGuard wg0 (full-tunnel, UDP 51820)
        ├─ ClamAV (coolify Docker net only)
        └─ fail2ban + iptables-persistent
```

---

## 2. What is solid (keep)

| Area | Evidence | Verdict |
|------|----------|---------|
| **Atomic deploys** | `deploy-live.sh` stages `.new`, swaps, health-checks container, rolls back from `.bak` | Excellent |
| **Path / injection guards** | `CONTAINER` / `RESOURCE` regex + `..` reject; local path must exist | Excellent |
| **rsync safety** | `sync-live.sh` requires existing `fivem-resources/`; `--delete` is opt-in | Excellent |
| **Backup crypto** | AES-256-CBC + PBKDF2; verify decrypt after write; rotate 7 days | Excellent |
| **Secret hygiene in backups** | `docker_exec_secret` via 600 file + `docker cp`, never in `ps`/`docker inspect` | Excellent |
| **Backup coverage** | Postgres + FiveM/Nextcloud MariaDB + lldap + Nextcloud files + Stalwart volumes + FiveM data | Strong |
| **ClamAV isolation** | No host ports; coolify network only; mem/cpu limits; fail-closed prod env | Strong |
| **Container user** | `USER app` + `gosu` after WG init (`Dockerfile.backend`) | Strong |
| **Local compose bind** | `127.0.0.1:8000` / `127.0.0.1:3000` | Good |
| **WireGuard key perms** | `chmod 600` on keys/config | Good |
| **Firewall narrative** | ROADMAP documents closed `:8000/:8080`, fail2ban sshd, iptables-persistent | Good |
| **Healthchecks** | Backend `/api/monitor/ping`, frontend wget, ClamAV clamdcheck | Good |
| **Env templates** | Placeholders only in `.env.docker.production.example` | Good |
| **Deploy scripts `set -euo pipefail`** | Throughout | Good |

---

## 3. Findings

### CRITICAL / HIGH

#### I1 — Offsite backups live on the same VPS (CRITICAL DR)

`backup-db.sh` uploads to `https://cloud.aifazi.net/remote.php/dav/...` — Nextcloud is **on this same host** (`ROADMAP` coturn/relay-ip `75.119.131.157`).

**Impact:** Disk failure, ransomware, or VPS wipe destroys production **and** the backup copies.

**Fix:**
1. Push encrypted archives to **another region/provider** (Backblaze B2 / Wasabi / S3 / another VPS / home NAS via rsync.net).
2. Keep the passphrase **off the VPS** (password manager / sealed envelope) or use age/GPG with a key that is not stored beside the data.
3. Monthly **restore drill**: decrypt one archive and restore into a scratch DB.

#### I2 — Root SSH for deploys + TOFU host keys (HIGH)

`deploy-live.sh` / `sync-live.sh` default `VPS_USER=root` and use `StrictHostKeyChecking=accept-new`.

**Impact:** Root shell for game-resource deploys is broader than needed; `accept-new` accepts a MITM host key on first connect (or after known_hosts wipe).

**Fix:**
1. Dedicated `deploy` user with forced-command / sudo only for `docker restart` + rsync paths.
2. Pin `known_hosts` in the repo/CI secret; use `StrictHostKeyChecking=yes`.
3. Prefer key-only auth, disable password SSH on the host (verify live).

#### I3 — `docker-compose.web.yml` publishes 3000/8000/54322 on all interfaces (HIGH if used on VPS/LAN)

```yaml
ports:
  - "3000:3000"
  - "8000:8000"
  - "54322:5432"
```
Defaults include `PASETO_SECRET=dev-paseto`, `INTERNAL_API_SECRET=dev-secret`, Postgres `postgres/postgres`. Bind mounts are WSL paths (`/mnt/e/...`).

**Impact:** If this stack is ever started on a reachable host, auth secrets and Postgres are exposed.

**Fix:** Bind `127.0.0.1:…` like root `docker-compose.yml`; drop default secrets (require env); mark file **dev-only** in the header; never ship to Coolify.

### MEDIUM

#### I4 — ClamAV `TCPAddr 0.0.0.0` inside container (MEDIUM)

`deploy-clamav.sh` writes `TCPAddr 0.0.0.0`. Isolation relies on the `coolify` Docker network only.

**Impact:** Any compromised container on `coolify` can talk to clamd (and scan/DoS). If the network is ever published, clamd is internet-reachable.

**Fix:** `TCPAddr 127.0.0.1` is too strict for cross-container; prefer a **dedicated internal network** (`clamav-net`) with only the backend attached, or firewall the clamd port. Document that `coolify` net is trusted.

#### I5 — WireGuard full-tunnel peer blast radius (MEDIUM)

`setup-wireguard-vps.sh` PostUp: `FORWARD -i wg0 -j ACCEPT` + MASQUERADE. Full tunnel means any authenticated peer can reach **everything the VPS can reach** (Coolify, DBs, Stalwart, internal APIs) unless filtered.

**Impact:** Stolen laptop/client config = broad lateral movement.

**Fix:**
1. Split-tunnel or `AllowedIPs` per peer where possible.
2. Forward filter: allow WAN + explicit internal IPs; **deny RFC1918 to DB/mail nets** unless needed.
3. Peer expiry / quarterly key rotation (ROADMAP already has quotas/expiry notify tables — wire enforcement).
4. `SaveConfig = true` can rewrite conf and **drop PostUp/PostDown** on `wg-quick save` — set `SaveConfig = false` or manage peers only via the API + file.

#### I6 — MySQL root password file (MEDIUM)

`/opt/fivem/.mysql_root_pw` is read by `backup-db.sh`. Permissions not enforced in the script.

**Fix:** `chmod 400` + owner root in a setup step; consider Docker secrets or a root-only credential helper.

#### I7 — Hardcoded Coolify network/volume IDs (MEDIUM)

- `connect-stalwart-network.sh`: `STALWART_NETWORK="mbkueai1hukfyan8mei8sdbc"`
- `backup-db.sh`: volume `mbkueai1hukfyan8mei8sdbc_stalwart-data`

**Impact:** Coolify redeploy/rename breaks mail network attach and backups silently (script may skip).

**Fix:** Resolve via `docker network ls --filter label=…` / compose project labels; fail with ALERT if not found (don’t skip silently for backups).

#### I8 — Firewall manager conflict still open (MEDIUM)

ROADMAP: `iptables-persistent` removed `ufw`; coolify-realtime `6001/6002` left open; Docker/Coolify upgrades can reset `DOCKER-USER` rules.

**Fix:**
1. Default-deny INPUT (22/80/443/51820-udp + established) documented as a script `harden-firewall.sh`.
2. Close `6001/6002` or bind to localhost/Tailscale.
3. Post-upgrade checklist: `iptables -L DOCKER-USER`, `ss -lntup`, fail2ban status.

#### I9 — No infra-as-code / rebuild runbook (MEDIUM)

Everything is imperative shell + Coolify UI. Full rebuild after host loss is tribal knowledge.

**Fix:** `docs/runbook-vps.md`: package list, Coolify apps, DNS, WG peers, backup restore order (Postgres → FiveM DB → lldap → files), secrets locations.

### LOW

#### I10 — `setup-dns.cjs` targets stale backend host (LOW)

`BACKEND_URL = "aifazinet-backend-fastapi.vercel.app"` but production API is `api.aifazi.net` on Coolify. Records `proxied: false` (no Cloudflare proxy/WAF on those names).

**Fix:** Point `api` at the VPS/Coolify hostname; decide explicitly on Cloudflare proxy for WAF/DDoS (mail/MX must stay unproxied).

#### I11 — `Dockerfile.backend` `EXPOSE 51820/udp` (LOW)

WireGuard runs on the **host** (`init-wireguard.sh`), not in the container. Misleading.

#### I12 — Duplicate COPY of backend source in `Dockerfile.backend` (LOW)

`WORKDIR /build` + `COPY` then `COPY --chown` into `/app` leaves a second tree in `/build` (image size). Use multi-stage or single COPY.

#### I13 — Root `docker-compose.yml` is “dev” but points at prod Supabase (LOW/MEDIUM)

Isolation guidance was added in Phase 4; still easy to mutate prod from a laptop.

#### I14 — Backup script silent skips (LOW)

Missing lldap/Nextcloud/Stalwart paths skip without FAIL++. Fine for optional stacks, but a missing **Postgres** dump already fails hard — good. Consider ALERT if `files-*` expected dirs vanish.

### INFO

- `check-wg-policy.py` is an Authentik Django shell snippet, not a host checker.
- `deploy-live.sh` `StrictHostKeyChecking=accept-new` is better than `no` but still TOFU.
- Entrypoint briefly runs as root for WG init then `gosu app` — standard pattern with `NET_ADMIN`.
- Local compose ClamAV `mem_limit: 2g` is appropriate.

---

## 4. Network exposure checklist (verify on live host)

```bash
ss -lntup                          # expect 22,80,443,51820/udp only (+ maybe 25/465/587/143/993 for mail)
iptables -L INPUT -n -v
iptables -L DOCKER-USER -n -v
ufw status || echo "ufw not used"
fail2ban-client status sshd
docker ps --format '{{.Names}}\t{{.Ports}}'
wg show
```

Expected public: `22/tcp` (or better: VPN-only SSH), `80/443`, `51820/udp`, mail ports if self-hosting SMTP/IMAP, FiveM `30120` if public game.  
**Not** public: `8000`, `8080`, `3310` (clamd), `51821` (wg-api), `5432`, `3000` (unless intended).

---

## 5. Priority action plan

| Pri | Item | Effort |
|----:|------|--------|
| 1 | **Offsite backup target** (B2/S3/other box) + passphrase escrow + restore drill | 0.5–1 day |
| 2 | Non-root deploy user + pinned `known_hosts` + disable SSH passwords | 0.5 day |
| 3 | Fix `docker-compose.web.yml` binds/secrets; mark dev-only | 1 hour |
| 4 | ClamAV on dedicated internal net; drop `0.0.0.0` if possible | 1–2 hours |
| 5 | WireGuard FORWARD filter + `SaveConfig=false` + peer rotation | 0.5 day |
| 6 | Resolve Coolify IDs dynamically; ALERT on missing volumes | 2 hours |
| 7 | Firewall harden script + post-upgrade checklist | 0.5 day |
| 8 | `docs/runbook-vps.md` rebuild + restore order | 0.5 day |
| 9 | Refresh `setup-dns.cjs` targets; decide CF proxy | 1 hour |

---

## 6. Positive callouts

- Deploy scripts are unusually careful (atomic swap, rollback, name sanitization).
- Backup secret handling (`docker_exec_secret`) is better than many enterprise scripts.
- Fail-closed ClamAV + upload size caps match the app threat model.
- ROADMAP firewall history shows real hardening work (public :8000 closed, fail2ban).
- Healthchecks and resource limits on ClamAV/backend are present.

---

---

## 7. Live host verification (2026-09-24, SSH as root)

Host: `vmi3544696` / `75.119.131.157` · Ubuntu kernel 7.0.0-31 · up 2d · load ~3–4 · 11G RAM · disk 71G/193G (37%)

### Confirmed good

| Check | Live result |
|-------|-------------|
| SSH effective policy | `permitrootlogin prohibit-password`, `passwordauthentication no` (via `sshd -T`) |
| fail2ban | `sshd` jail active — 107 total banned |
| DOCKER-USER | DROP `eth0` → 40120, 8081, **8000,8080** |
| HTTP/HTTPS origin | Cloudflare IP allowlist + **DROP 80/443** from the rest |
| LDAP 389/636 | ACCEPT private/loopback + **DROP public** |
| WG API 51821 | ACCEPT loopback + RFC1918 + **DROP public** |
| WireGuard | `wg0` :51820, 2 peers (one active handshake 18h ago), keys `600` |
| MySQL / backup secrets | `/opt/fivem/.mysql_root_pw` and `/root/.aifazi-backup-pass` are `600` |
| Nightly backups | Running 01:00 UTC — postgres + qbox + nextcloud DB + lldap + nextcloud files + stalwart + fivemdata, encrypted `.enc` |
| ClamAV | Healthy container, size caps 50M match app |
| Stack | Coolify + Traefik, Supabase set, Stalwart, Nextcloud, Authentik, coturn, backend healthy |

### Live findings (update / upgrade prior list)

#### LIVE-1 — **CRITICAL: offsite backup is not configured**

`/root/.aifazi-backup-pass` is a **single line** (65 bytes = passphrase only).  
`backup-db.sh` log has **zero** `uploaded` / `uploading to Nextcloud` lines.

Cron is:
```cron
0 3 * * * BACKUP_PASSPHRASE=$(cat /root/.aifazi-backup-pass) bash /opt/aifazi.net/scripts/backup-db.sh
```
`NEXTCLOUD_WEBDAV_USER` / `NEXTCLOUD_WEBDAV_PASS` are never set → script prints skip (or fails silently in this log).  
**All backups live only in `/var/backups/aifazi` on the same disk.** Daily `files-nextcloud` ~1.8G + `files-fivemdata` ~1.1G fill the volume and are lost with the host.

**Status: STILL OPEN.** Needs WebDAV/B2 credentials (not in repo).

#### LIVE-2 — ~~HIGH: INPUT policy ACCEPT~~ **FIXED 2026-09-24** (policy DROP + 6001/6002 public DROP)

`iptables -L INPUT` → `policy ACCEPT`. `ufw-before-input` is an **empty** leftover chain (`ufw` binary not present). Hardening is only a list of explicit DROPs.

Anything not listed is **world-reachable**, including:
- **coolify-realtime `6001–6002`** (published `0.0.0.0`, ACCEPT from RFC1918, **no public DROP**, **not** in DOCKER-USER)
- **Stalwart mail ports** `25/110/143/465/587/993/995/4190` (published `0.0.0.0` — expected for mail, but confirm each is intentional)
- High Docker/ephemeral ports not covered by DROP lists

**Fix:** default INPUT DROP after ESTABLISHED/lo; explicit ALLOW 22 (or VPN-only), 80/443 (CF), 51820/udp, 3478/5349, mail ports if needed. DROP or un-publish `6001/6002` unless Coolify requires them publicly (it should not).

#### LIVE-3 — ~~MEDIUM: cloud-init password auth~~ **FIXED 2026-09-24**

`sshd -T` currently shows `no` (later drop-in wins), but cloud-init can rewrite `50-cloud-init.conf` on image updates and flip password auth back on.

**Fix:** set `PasswordAuthentication no` in that file too, or `chmod a-r` / override permanently; `sshd -t && systemctl reload ssh`.

#### LIVE-4 — **MEDIUM: WireGuard FORWARD still open** (`SaveConfig=false` done 2026-09-24)

Live `wg0.conf` still has `SaveConfig = true` and `FORWARD -i wg0 -j ACCEPT`. A `wg-quick save` can strip PostUp/PostDown. Peers get full-tunnel reach into RFC1918 (Coolify, DBs, mail).

**Fix:** `SaveConfig = false`; FORWARD filter (allow WAN + explicit); rotate peer configs quarterly.

#### LIVE-5 — **LOW: ClamAV `TCPAddr 0.0.0.0` on `coolify` + app nets**

Confirmed live. Isolation is network-membership only.

#### LIVE-6 — **INFO: `ak-outpost-ldap` health = unhealthy**

Authentik LDAP outpost container is unhealthy (second outpost `ak-outpost-ldap-wa47…` is healthy). Worth restarting/checking logs so SSO doesn’t fail over silently.

#### LIVE-7 — **INFO: INPUT DROP for 6001/6002 missing at end of chain**

After rule 59 (ACCEPT RFC1918 for 8000/8080/6001/6002) the chain ends — no matching public DROP. See LIVE-2.

### Live exposure snapshot

| Port | Published | Effective public? |
|------|-----------|-------------------|
| 22/tcp | sshd | **Yes** (key-only) |
| 80/443 | coolify-proxy | Cloudflare only (DROP others) |
| 51820/udp | wg0 | **Yes** (VPN) |
| 3478/5349 + 49160–49399 | coturn | **Yes** (TURN — intentional) |
| 25/110/143/465/587/993/995/4190 | stalwart | **Yes** (mail — confirm) |
| 389/636 | lldap | No (DROP public) |
| 8000/8080 | coolify | No (DOCKER-USER DROP) |
| **6001/6002** | coolify-realtime | **Likely YES — fix** |
| 3310 | clamav | Docker nets only |
| 51821 | wg-api | No (DROP public) |

---

## 8. Revised priority (live-first)

| Pri | Action | Status |
|----:|--------|--------|
| 1 | **Enable real offsite backups** (WebDAV/B2) + restore drill | **BLOCKING** |
| 2 | INPUT default-deny + DROP/unpublish **6001/6002** | **Do next** |
| 3 | Neutralize `50-cloud-init.conf` password auth | 10 min |
| 4 | WG `SaveConfig=false` + FORWARD filter | 0.5 day |
| 5 | ClamAV dedicated network | 1–2 hours |
| 6 | Deploy user instead of root SSH | 0.5 day |
| 7 | Restart/fix `ak-outpost-ldap` | 15 min |

## 9. Remediation applied live (2026-09-24)

`scripts/harden-vps-20260924.sh` + `netfilter-persistent`:

- `50-cloud-init.conf` → `PasswordAuthentication no` / `PermitRootLogin prohibit-password`
- `wg0.conf` → `SaveConfig = false`
- INPUT + ip6tables policy → **DROP** (allows: lo, ESTABLISHED, 22, 51820/udp, mail 25/465/587/143/993/110/995/4190, TURN, CF 80/443)
- Public **6001/6002 DROP** (RFC1918/lo still allowed)
- Persisted `/etc/iptables/rules.v4`

**Verified after change:** SSH reconnect OK · external probe `6001` closed · `22` open · `443` open · `api_health 200` · 34 containers up.

**Still open:** offsite backups (LIVE-1), WG FORWARD filter, ClamAV dedicated net, deploy user, `ak-outpost-ldap` unhealthy.
