-- VPN dual-stack: per-peer IPv6 (ULA) address.
--
-- allocated_ipv6   e.g. fd00:8::2, NULL = v4-only peer (default until the
--                  host has a working IPv6 uplink + NAT66 and WG_DUALSTACK=true).
--                  Backend allocates only when dual-stack is enabled; old rows
--                  stay NULL and keep working. Unique index allows many NULLs.
ALTER TABLE vpn_peers ADD COLUMN IF NOT EXISTS allocated_ipv6 TEXT DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vpn_peers_allocated_ipv6_uidx
    ON vpn_peers (allocated_ipv6);
