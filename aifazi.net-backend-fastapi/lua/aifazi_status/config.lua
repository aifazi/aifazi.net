--[[
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  aifazi_status / config.lua  v6.0
  ✏️  THIS IS THE ONLY FILE YOU NEED TO EDIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
]]

Config = {}

-- ─────────────────────────────────────────────────────────────
--  🌐 BACKEND
--  Your FastAPI backend — no trailing slash
-- ─────────────────────────────────────────────────────────────
Config.BackendUrl = "https://api.aifazi.net"

-- ─────────────────────────────────────────────────────────────
--  🔑 SECRET
--  Must match FIVEM_SERVER_SECRET in your backend .env
--  Set in server.cfg:   set fivem_api_secret "your_secret"
-- ─────────────────────────────────────────────────────────────
Config.Secret = GetConvar("fivem_api_secret", "")

-- ─────────────────────────────────────────────────────────────
--  🕒 TIMINGS  (milliseconds)
--  Set StatusInterval / SyncInterval to 0 to disable interval loops.
--  Default is event/manual refresh only: startup, connect/drop, shutdown,
--  txAdmin events, or the commands below.
-- ─────────────────────────────────────────────────────────────
Config.StatusInterval = 0      -- 0 = no 30s status loop
Config.SyncInterval   = 0      -- 0 = no 30s pending-sync poll
Config.WhitelistTimeout = 8000  -- join whitelist check timeout
Config.StartupDelay   = 8000   -- wait before first push after start

-- ─────────────────────────────────────────────────────────────
--  🚪 WHITELIST GATE
--
--  When a player connects, Lua checks the backend directly.
--  The backend (Supabase) is the single source of truth.
--  txAdmin approved-license whitelist is kept in sync by this bridge.
--
--  FailOpen = true  → allow player if backend is unreachable
--  FailOpen = false → deny player if backend is unreachable
--                     (safer for production)
-- ─────────────────────────────────────────────────────────────
Config.WhitelistFailOpen = false  -- set true only for testing

-- ─────────────────────────────────────────────────────────────
--  txAdmin SYNC
--
--  Website approvals are stored in Supabase first. This resource polls the
--  backend, pushes approved license identifiers to txAdmin's local whitelist,
--  then marks those rows synced. txAdmin whitelist events are forwarded back
--  to the backend so the web admin portal stays current.
--
--  Required in server.cfg for website -> txAdmin pushes:
--      set txadmin_admin_ids "license:YOUR_LICENSE,discord:YOUR_DISCORD"
--
--  The admin identifiers must belong to a txAdmin admin with players.whitelist.
-- ─────────────────────────────────────────────────────────────


