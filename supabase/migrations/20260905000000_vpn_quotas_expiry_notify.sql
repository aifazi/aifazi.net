-- VPN quotas, guest expiry, and alert opt-in.
--
-- quota_bytes      monthly traffic cap (rx+tx, bytes), NULL = unlimited.
-- quota_warned_month  'YYYY-MM' of the last 80% warning (one per cycle).
-- suspended_reason 'quota' | 'manual' | NULL. status stays the source of
--                  truth ('active' / 'suspended' / 'expired').
-- expires_at       guest-peer expiry timestamp, NULL = never.
-- notify_events    per-peer opt-in for connect/offline alert mails.
--                  Quota-suspension and expiry mails always send.
ALTER TABLE vpn_peers ADD COLUMN IF NOT EXISTS quota_bytes BIGINT;
ALTER TABLE vpn_peers ADD COLUMN IF NOT EXISTS quota_warned_month TEXT;
ALTER TABLE vpn_peers ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE vpn_peers ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE vpn_peers ADD COLUMN IF NOT EXISTS notify_events BOOLEAN NOT NULL DEFAULT FALSE;
