--[[
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  aifazi_status / config.lua  v9.0
  ✏️  THIS IS THE ONLY FILE YOU NEED TO EDIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
]]

Config = {}

-- ─────────────────────────────────────────────────────────────
--  🌐 BACKEND
--  Your FastAPI backend — no trailing slash
-- ─────────────────────────────────────────────────────────────
Config.BackendUrl = GetConvar("backend_url", "https://api.aifazi.net")

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
--  txAdmin events, or the commands in server.lua.
-- ─────────────────────────────────────────────────────────────
Config.StatusInterval = 30000   -- push status every 30s so the website stays online
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
--  🔗 CONNECT SESSION GATE
--
--  The whitelist gate (/playerConnecting) always runs. When
--  RequireConnectSession = true, the server ALSO requires the player to
--  have clicked "Connect" on fivem.aifazi.net/connect first (a recent,
--  single-use session token linked to their account). Set false to keep
--  the old permissive behavior where whitelisted players can join
--  directly by IP / cfx link without a website connect session.
-- ─────────────────────────────────────────────────────────────
Config.RequireConnectSession = false  -- true = block direct joins not started from the website


-- ─────────────────────────────────────────────────────────────
--  APPLICATION ACTIONS
--  Approved website forms are polled by server.lua. Match is by
--  license, license2, discord, steam, or fivem identifier.
-- ─────────────────────────────────────────────────────────────
Config.ApplicationActionInterval = Config.SyncInterval
Config.ApplicationActions = {
    staff = { enabled = true, website_role = "moderator", game = { type = "group", group = "staff" } },
    moderator = { enabled = true, website_role = "moderator", game = { type = "group", group = "mod" } },
    admin = { enabled = true, website_role = "admin", game = { type = "group", group = "admin" } },
    police = { enabled = true, game = { type = "job", job = "police", grade = 0 } },
    ambulance = { enabled = true, game = { type = "job", job = "ambulance", grade = 0 } },
    doj = { enabled = true, game = { type = "job", job = "lawyer", grade = 0 } },
}

-- ─────────────────────────────────────────────────────────────
--  🛒 SUBSCRIPTION SYNC  (Store / VIP)
--  Stripe subscriptions purchased on aifazi.net store are polled by
--  server.lua. Match is by license / steam / discord / fivem identifier.
--  Each tier applies:
--      group.vip  +  group.vip{level}   (ACE principals for permissions)
--      SetPlayerResourceKvp aifazi_vip_* (level/plan/expires/perks json) so
--      any other resource can gate features (vehicle class, phone digits,
--      plates, weapon skins, auction access, garage/home slots, etc.).
--  Exports: GetSubscriptionLevel(src), GetSubscriptionPlan(src),
--           GetSubscriptionPerks(src), IsSubscribed(src)
--
--  Set SubscriptionSyncInterval = 0 to disable the poller (no auto perks).
--  The 30s status loop does NOT apply perks — this poller does.
-- ─────────────────────────────────────────────────────────────
Config.SubscriptionSyncInterval = 30000
Config.SubscriptionKvpPrefix = "aifazi_vip"

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


