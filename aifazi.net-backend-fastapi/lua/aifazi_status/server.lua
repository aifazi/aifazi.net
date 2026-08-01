--[[
    aifazi_status / server.lua  v9
    1. Pushes live status + player list on startup/connect/drop/manual refresh
    2. Syncs /whitelist/pending-sync on startup/manual refresh or optional interval
       (FiveM server can reach txAdmin on localhost — Vercel cannot)
    3. Whitelist enforcement on playerConnecting
    4. Player session tracking: /players/join on playerJoining,
       /players/leave on playerDropped, /players/heartbeat-sync on the status loop
    5. Identifier patch on connect (/whitelist/update-identifiers)
    6. Ban fallback sync: polls /bans/pending-sync + /bans/pending-unban and
       applies them via txAdmin's monitor exports (backup for the backend's
       direct txAdmin push)
    7. Connect-session gate: playerConnecting also calls /connect/session-check;
       the token requirement is enforced only when Config.RequireConnectSession=true

    server.cfg:
        set fivem_api_secret "mOlVcBjLEzA6kDrFEgKPwt2EM7NakQ3tCp84h0vRhoe"
        set txadmin_port "40120"   (default txAdmin port)
]]

local BACKEND_URL   = (Config and Config.BackendUrl) or "https://api.aifazi.net"
local API_BASE      = BACKEND_URL .. "/api/fivem"
local TXADMIN_BASE  = BACKEND_URL .. "/api/txadmin"
local PUSH_INTERVAL = (Config and Config.StatusInterval) or 0  -- 0 disables interval loop
local APP_ACTION_INTERVAL = (Config and Config.ApplicationActionInterval) or ((Config and Config.SyncInterval) or 0)

-- ── Helpers ───────────────────────────────────────────────────────────────────
local function secret() return (Config and Config.Secret) or GetConvar("fivem_api_secret", "") end
local function authHeader() return { ["X-FiveM-Token"] = secret(), ["Content-Type"] = "application/json" } end
local function whitelistTimeout() return (Config and Config.WhitelistTimeout) or 10000 end
local function whitelistFailOpen() return Config and Config.WhitelistFailOpen == true end

local priorityBySource = {}
local priorityByIdentifier = {}

local function cachePriority(src, identifiers, priority)
    local level = tonumber(priority and priority.level) or 0
    local active = priority and priority.active == true and level > 0
    local entry = {
        active = active,
        level = active and level or 0,
        tier = active and priority.tier or nil,
        expires_at = active and priority.expires_at or nil,
        checked_at = os.time(),
    }

    priorityBySource[tostring(src)] = entry
    for _, ident in ipairs(identifiers.all or {}) do
        priorityByIdentifier[ident] = entry
    end
    return entry
end

local function clearPriority(src)
    priorityBySource[tostring(src)] = nil
end

local function collectIdentifiers(src)
    local ids = { all = {} }
    for i = 0, GetNumPlayerIdentifiers(src) - 1 do
        local ident = GetPlayerIdentifier(src, i) or ""
        if ident ~= "" then
            table.insert(ids.all, ident)
        end

        if ident:find("^discord:") then
            ids.discord_id = ident:gsub("^discord:", "")
        elseif ident:find("^steam:") then
            ids.steam_hex = ident
        elseif ident:find("^fivem:") then
            ids.fivem_id = ident
        elseif ident:find("^license2:") then
            ids.license2 = ident
            ids.fivem_license = ids.fivem_license or ident
        elseif ident:find("^license:") then
            ids.license = ident
            ids.fivem_license = ids.fivem_license or ident
        end
    end
    return ids
end

exports("GetPriorityLevel", function(source)
    local cached = priorityBySource[tostring(source)]
    if cached and cached.active then return cached.level or 0 end

    local ids = collectIdentifiers(source)
    for _, ident in ipairs(ids.all or {}) do
        cached = priorityByIdentifier[ident]
        if cached and cached.active then return cached.level or 0 end
    end

    return 0
end)

exports("GetPriorityTier", function(source)
    local cached = priorityBySource[tostring(source)]
    return cached and cached.tier or nil
end)


local function lowerSet(list)
    local set = {}
    for _, v in ipairs(list or {}) do
        if v and v ~= "" then set[string.lower(tostring(v))] = true end
    end
    return set
end

local function actionConfig(slug)
    local actions = (Config and Config.ApplicationActions) or {}
    return actions[slug or ""] or {}
end

local function findOnlinePlayerByIdentifiers(identifiers)
    local targets = lowerSet(identifiers or {})
    for _, src in ipairs(GetPlayers()) do
        local ids = collectIdentifiers(src)
        for _, ident in ipairs(ids.all or {}) do
            if targets[string.lower(ident)] then return tonumber(src), ids end
        end
    end
    return nil, nil
end

local function mergeAction(entry)
    local action = entry.approved_action or {}
    local cfg = actionConfig(entry.form_slug)
    if cfg.enabled == false then return { disabled = true } end
    if cfg.website_role and cfg.website_role ~= "" then action.website_role = cfg.website_role end
    if cfg.game then action.game = cfg.game end
    return action
end

local function applyApplicationAction(src, ids, action)
    if action.disabled then return true, "disabled in Config.ApplicationActions" end
    local game = action.game
    if not game or not game.type or game.type == "none" then return true, "no game action" end
    if not src then return false, "player not online; will retry when detected" end

    if game.type == "job" then
        local ok, err = pcall(function()
            exports.qbx_core:SetJob(src, tostring(game.job or ""), tonumber(game.grade or 0) or 0)
        end)
        if not ok then return false, tostring(err) end
        return true, ("job %s grade %s applied"):format(tostring(game.job), tostring(game.grade or 0))
    end

    if game.type == "group" then
        local principal = nil
        for _, ident in ipairs(ids.all or {}) do
            if ident:find("^license:") or ident:find("^license2:") or ident:find("^discord:") or ident:find("^steam:") then
                principal = "identifier." .. ident
                break
            end
        end
        if not principal then return false, "no identifier principal available" end
        local group = tostring(game.group or "")
        if group == "" then return false, "missing group" end
        ExecuteCommand(("add_principal %s group.%s"):format(principal, group))
        return true, ("group %s applied to %s"):format(group, principal)
    end

    return false, "unsupported game action"
end

local function markApplicationAction(entry, status, message)
    PerformHttpRequest(API_BASE .. "/application-actions/mark-synced", function(code)
        if code == 200 then
            print(("[aifazi_status] Application action %s: %s"):format(status, entry.form_slug or entry.submission_id or "?"))
        elseif code ~= 0 then
            print(("[aifazi_status] Application action mark HTTP %d"):format(code))
        end
    end, "POST", json.encode({
        submission_id = entry.submission_id,
        status = status,
        message = message,
    }), authHeader())
end

local function SyncApplicationActions()
    PerformHttpRequest(API_BASE .. "/application-actions/pending", function(code, body)
        if code == 0 then
            print("[aifazi_status] Application action sync - API unreachable")
            return
        end
        if code ~= 200 or not body then return end
        local ok, entries = pcall(json.decode, body)
        if not ok or type(entries) ~= "table" or #entries == 0 then return end

        print(("[aifazi_status] Syncing %d application action(s)"):format(#entries))
        for _, entry in ipairs(entries) do
            local action = mergeAction(entry)
            local src, ids = findOnlinePlayerByIdentifiers(entry.identifiers or {})
            local applied, message = applyApplicationAction(src, ids, action)
            markApplicationAction(entry, applied and "synced" or "failed", message)
        end
    end, "GET", "", authHeader())
end

-- ── Player session recording (v8) ─────────────────────────────────────────────
local sessionRecorded = {}

local function RecordJoin(src)
    local ids = collectIdentifiers(src)
    local name = GetPlayerName(src) or "Unknown"
    PerformHttpRequest(API_BASE .. "/players/join", function(code, body)
        if code == 200 then
            sessionRecorded[tostring(src)] = true
            print(("^2[aifazi_status]^7 Session recorded: %s (%d)"):format(name, tonumber(src)))
        elseif code == 0 then
            print("^3[aifazi_status]^7 Session record — API unreachable")
        else
            print(("^1[aifazi_status]^7 Session record HTTP %d"):format(code))
        end
    end, "POST", json.encode({
        server_id   = tonumber(src),
        player_name = name,
        license     = ids.license,
        license2    = ids.license2,
        steam_hex   = ids.steam_hex,
        fivem_id    = ids.fivem_id,
        discord_id  = ids.discord_id,
        identifiers = ids.all or {},
    }), authHeader())
end

local function RecordLeave(src, reason)
    local ids = collectIdentifiers(src)
    PerformHttpRequest(API_BASE .. "/players/leave", function(code)
        if code == 200 then
            print(("^2[aifazi_status]^7 Session closed: %d"):format(tonumber(src)))
        elseif code == 0 then
            print("^3[aifazi_status]^7 Session close — API unreachable")
        else
            print(("^1[aifazi_status]^7 Session close HTTP %d"):format(code))
        end
    end, "POST", json.encode({
        server_id         = tonumber(src),
        player_name       = GetPlayerName(src) or "Unknown",
        license           = ids.license,
        license2          = ids.license2,
        identifiers       = ids.all or {},
        disconnect_reason = reason or "",
    }), authHeader())
end

local function PatchIdentifiers(src)
    local ids = collectIdentifiers(src)
    PerformHttpRequest(API_BASE .. "/whitelist/update-identifiers", function(code, body)
        if code == 200 and body then
            local ok, resp = pcall(json.decode, body)
            if ok and resp and resp.ok then
                print(("^2[aifazi_status]^7 Whitelist identifiers patched for %d"):format(tonumber(src)))
            end
        end
    end, "POST", json.encode({
        discord_id  = ids.discord_id,
        license     = ids.license,
        license2    = ids.license2,
        steam_hex   = ids.steam_hex,
        fivem_id    = ids.fivem_id,
        identifiers = ids.all or {},
    }), authHeader())
end

local function SyncSessions(players)
    local online = {}
    for _, p in ipairs(players or {}) do
        table.insert(online, {
            server_id  = p.server_id,
            name       = p.name,
            license    = p.license,
            license2   = p.license2,
            steam_hex  = p.steam,
            fivem_id   = p.fivem,
            discord_id = p.discord,
            identifiers = p.identifiers,
        })
    end
    PerformHttpRequest(API_BASE .. "/players/heartbeat-sync", function(code)
        if code ~= 200 and code ~= 0 then
            print(("^1[aifazi_status]^7 Session sync HTTP %d"):format(code))
        end
    end, "POST", json.encode({ players = online }), authHeader())
end

-- ── Ban fallback sync (v8) ────────────────────────────────────────────────────
-- The backend pushes website bans to txAdmin directly. If that fails
-- (txAdmin session, network), rows stay txadmin_synced=false and this poller
-- retries them via txAdmin's monitor exports. All calls are pcall-guarded so a
-- missing export can never crash the resource.
local function applyBanToTxAdmin(ban)
    local identifiers = ban.identifiers or {}
    local duration = ban.duration or "permanent"
    local netId = findOnlinePlayerByIdentifiers(identifiers)
    if netId then
        local ok, err = pcall(exports.monitor.banPlayer, exports.monitor, netId, ban.reason or "Banned via aifazi.net", duration)
        if ok and err ~= false then return true end
        return false, tostring(err)
    end
    return false, "player_offline"
end

local function applyUnbanToTxAdmin(ban)
    local ok, err = pcall(exports.monitor.removeBanByIdentifiers, exports.monitor, ban.identifiers or {})
    if ok and err ~= false then return true end
    return false, tostring(err)
end

local function SyncBans()
    PerformHttpRequest(API_BASE .. "/bans/pending-sync", function(code, body)
        if code ~= 200 or not body then return end
        local ok, entries = pcall(json.decode, body)
        if not ok or type(entries) ~= "table" or #entries == 0 then return end

        print(("^1[aifazi_status]^7 Fallback-syncing %d pending ban(s)"):format(#entries))
        for _, ban in ipairs(entries) do
            local applied, err = applyBanToTxAdmin(ban)
            PerformHttpRequest(API_BASE .. "/bans/mark-synced", function(c2)
                if c2 == 200 then
                    print(("^2[aifazi_status]^7 Ban fallback %s: %s"):format(
                        applied and "synced" or "FAILED",
                        ban.player_name or ban.identifier or "?"))
                end
            end, "POST", json.encode({
                ban_id = ban.id,
                ok     = applied,
                note   = applied and "lua_fallback" or (err or "failed"),
            }), authHeader())
        end
    end, "GET", "", authHeader())

    PerformHttpRequest(API_BASE .. "/bans/pending-unban", function(code, body)
        if code ~= 200 or not body then return end
        local ok, entries = pcall(json.decode, body)
        if not ok or type(entries) ~= "table" or #entries == 0 then return end

        for _, ban in ipairs(entries) do
            local applied, err = applyUnbanToTxAdmin(ban)
            PerformHttpRequest(API_BASE .. "/bans/mark-synced", function(c2)
                if c2 == 200 then
                    print(("^2[aifazi_status]^7 Unban fallback %s: %s"):format(
                        applied and "synced" or "FAILED",
                        ban.identifier or "?"))
                end
            end, "POST", json.encode({
                ban_id = ban.id,
                ok     = applied,
                note   = applied and "lua_fallback" or (err or "failed"),
            }), authHeader())
        end
    end, "GET", "", authHeader())
end

-- ── Player session tracking ───────────────────────────────────────────────────
local joinedAt = {}

-- ── Subscription / VIP sync (store) ───────────────────────────────────────────
-- Stripe subscriptions from aifazi.net are polled from /store/subscriptions/
-- pending-sync. Each active tier adds group principals + per-player KVP so
-- other resources can gate features (vehicle class, phone digits, plates,
-- weapon skins, auction access, garage/home slots, etc).
local function subscriptionKvpPrefix()
    return (Config and Config.SubscriptionKvpPrefix) or "aifazi_vip"
end

local function principalForIdentifiers(ids)
    for _, ident in ipairs(ids or {}) do
        if ident:find("^license:") or ident:find("^license2:") or ident:find("^discord:") or ident:find("^steam:") then
            return "identifier." .. ident
        end
    end
    return nil
end

-- Apply an ACTIVE subscription to an online player (groups + KVP).
local function applySubscription(src, ids, entry)
    local plan = entry.plan or {}
    local level = tonumber(plan.level) or 0
    if level < 1 then return false, "no level" end

    local principal = principalForIdentifiers(ids and ids.all or {})
    if principal then
        ExecuteCommand(("add_principal %s group.vip"):format(principal))
        ExecuteCommand(("add_principal %s group.vip%d"):format(principal, level))
    end

    local prefix = subscriptionKvpPrefix()
    SetPlayerResourceKvp(src, prefix .. "_level", tostring(level))
    SetPlayerResourceKvp(src, prefix .. "_plan", tostring(plan.slug or ""))
    SetPlayerResourceKvp(src, prefix .. "_expires", tostring(entry.current_period_end or ""))
    SetPlayerResourceKvp(src, prefix .. "_perks", json.encode(plan.perks or {}))
    print(("^2[aifazi_status]^7 VIP %s (level %d) applied to %d (%s)"):format(
        tostring(plan.slug or "?"), level, tonumber(src),
        principal or tostring(ids.discord_id or ids.steam_hex or "?")))
    return true, "applied"
end

-- Remove VIP state from a player (used when sub is canceled / expired).
local function clearSubscription(src, ids)
    local principal = principalForIdentifiers(ids and ids.all or {})
    if principal then
        ExecuteCommand(("remove_principal %s group.vip"):format(principal))
        for lv = 1, 6 do
            ExecuteCommand(("remove_principal %s group.vip%d"):format(principal, lv))
        end
    end
    local prefix = subscriptionKvpPrefix()
    for _, key in ipairs({ prefix .. "_level", prefix .. "_plan", prefix .. "_expires", prefix .. "_perks" }) do
        SetPlayerResourceKvp(src, key, "")
    end
    print(("^3[aifazi_status]^7 VIP cleared for %d"):format(tonumber(src)))
end

local function markSubscription(entry, ok, message)
    PerformHttpRequest(API_BASE .. "/store/subscriptions/mark-synced", function(code)
        if code == 200 then
            print(("^2[aifazi_status]^7 Subscription %s: %s (%s)"):format(
                ok and "synced" or "FAILED", tostring(entry.subscription_id or "?"), message))
        elseif code ~= 0 then
            print(("^1[aifazi_status]^7 Subscription mark HTTP %d"):format(code))
        end
    end, "POST", json.encode({
        subscription_id = entry.subscription_id,
        ok     = ok,
        note   = ok and "lua_synced" or message,
    }), authHeader())
end

local function SyncSubscriptions()
    PerformHttpRequest(API_BASE .. "/store/subscriptions/pending-sync", function(code, body)
        if code == 0 then
            print("^3[aifazi_status]^7 Subscription sync — API unreachable")
            return
        end
        if code ~= 200 or not body then return end
        local ok, entries = pcall(json.decode, body)
        if not ok or type(entries) ~= "table" or #entries == 0 then return end

        print(("^5[aifazi_status]^7 Syncing %d subscription change(s)"):format(#entries))
        for _, entry in ipairs(entries) do
            local src, ids = findOnlinePlayerByIdentifiers(entry.identifiers or {})
            if not src then
                markSubscription(entry, false, "player_offline")
            elseif entry.active then
                local applied, message = applySubscription(src, ids, entry)
                markSubscription(entry, applied, message)
            else
                clearSubscription(src, ids)
                markSubscription(entry, true, "cleared")
            end
        end
    end, "GET", "", authHeader())
end

-- Public exports for other resources to gate features by VIP level/plan.
exports("GetSubscriptionLevel", function(source)
    local lvl = GetPlayerResourceKvp(source, subscriptionKvpPrefix() .. "_level")
    return tonumber(lvl) or 0
end)

exports("GetSubscriptionPlan", function(source)
    return GetPlayerResourceKvp(source, subscriptionKvpPrefix() .. "_plan")
end)

exports("GetSubscriptionPerks", function(source)
    local raw = GetPlayerResourceKvp(source, subscriptionKvpPrefix() .. "_perks")
    if not raw or raw == "" then return {} end
    local ok, perks = pcall(json.decode, raw)
    if ok and type(perks) == "table" then return perks end
    return {}
end)

exports("IsSubscribed", function(source)
    return (tonumber(GetPlayerResourceKvp(source, subscriptionKvpPrefix() .. "_level")) or 0) > 0
end)

-- On disconnect, next poll applies the correct state to any new connection.
AddEventHandler('playerDropped', function(reason)
    local src = source
    RecordLeave(src, reason)
    joinedAt[tostring(src)] = nil
    sessionRecorded[tostring(src)] = nil
    clearPriority(src)
    Wait(1000)
    PushAll()
end)

AddEventHandler('playerJoining', function()
    local src = source
    RecordJoin(src)
    PatchIdentifiers(src)
end)

-- ── Build player list ─────────────────────────────────────────────────────────
local function GetPlayerList()
    local list = {}
    for _, id in ipairs(GetPlayers()) do
        local sid    = tostring(id)
        local joined = joinedAt[sid] or os.time()
        local ids = collectIdentifiers(id)
        table.insert(list, {
            server_id       = tonumber(id),
            name            = GetPlayerName(id) or "Unknown",
            ping            = GetPlayerPing(id) or 0,
            identifiers     = ids.all or {},
            license         = ids.license,
            license2        = ids.license2,
            fivem_license   = ids.fivem_license,
            discord         = ids.discord_id,
            steam           = ids.steam_hex,
            fivem           = ids.fivem_id,
            session_seconds = os.time() - joined,
        })
    end
    return list
end

-- ── Push status ───────────────────────────────────────────────────────────────
local function PushStatus(players)
    local maxPlayers = GetConvarInt("sv_maxclients", 48)
    PerformHttpRequest(API_BASE .. "/status", function(code)
        if code == 200 then
            print(("^2[aifazi_status]^7 Status OK  %d/%d players"):format(#players, maxPlayers))
        elseif code == 0 then
            print("^3[aifazi_status]^7 Status push — API unreachable")
        else
            print(("^1[aifazi_status]^7 Status push HTTP %d"):format(code))
        end
    end, "POST", json.encode({
        players_online = #players,
        max_players    = maxPlayers,
        server_name    = GetConvar("sv_hostname", "AIFAZI RP"),
    }), authHeader())
end

-- ── Push player list ──────────────────────────────────────────────────────────
local function PushPlayers(players)
    PerformHttpRequest(API_BASE .. "/players", function(code)
        if code ~= 200 and code ~= 0 then
            print(("^1[aifazi_status]^7 Players push HTTP %d"):format(code))
        end
    end, "POST", json.encode({ players = players }), authHeader())
end

-- ── Sync pending whitelist approvals → txAdmin ────────────────────────────────
-- When an admin approves a player on aifazi.net, the DB gets txadmin_synced=false.
-- This poller picks those up and adds them to txAdmin via its local API.
-- This runs on the FiveM server because Vercel cannot reach txAdmin (local/NATted).
local function SyncWhitelist()
    PerformHttpRequest(API_BASE .. "/whitelist/pending-sync", function(code, body)
        if code == 0 then
            print("^3[aifazi_status]^7 Whitelist sync — API unreachable")
            return
        end
        if code ~= 200 or not body then return end

        local ok, entries = pcall(json.decode, body)
        if not ok or type(entries) ~= "table" or #entries == 0 then return end

        print(("^2[aifazi_status]^7 Syncing %d pending whitelist approval(s) to txAdmin"):format(#entries))

        for _, entry in ipairs(entries) do
            local license = entry.license or entry.steam_hex or entry.fivem_id
            if license then
                -- Add to txAdmin whitelist via txAdmin's built-in export
                -- txAdmin exposes: exports.monitor:addToWhitelistApprovals(license)
                local addOk = exports.monitor:addToWhitelistApprovals(license)

                -- Mark as synced in the DB
                PerformHttpRequest(API_BASE .. "/whitelist/mark-synced", function(c2)
                    if c2 == 200 then
                        print(("^2[aifazi_status]^7 ✅ Whitelisted: %s (%s)"):format(
                            entry.discord_name or "?", license))
                    end
                end, "POST", json.encode({
                    app_id      = entry.id,
                    txadmin_ok  = addOk ~= false,  -- nil/true = ok
                    sync_source = "lua_poller",
                }), authHeader())
            end
        end
    end, "GET", "", authHeader())
end

-- ── Combined push ─────────────────────────────────────────────────────────────
function PushAll()
    local players = GetPlayerList()
    PushStatus(players)
    PushPlayers(players)
end

local function QueuePushAll(delay)
    CreateThread(function()
        Wait(delay or 1000)
        PushAll()
    end)
end

RegisterCommand("aifazi_refresh", function(src)
    if src ~= 0 then return end
    PushAll()
    print("^2[aifazi_status]^7 Manual status refresh sent")
end, true)

RegisterCommand("aifazi_sync", function(src)
    if src ~= 0 then return end
    SyncWhitelist()
    SyncApplicationActions()
    SyncBans()
    SyncSubscriptions()
    print("^5[aifazi_status]^7 Manual sync check requested")
end, true)

RegisterNetEvent("aifazi:refreshStatus", function()
    if source and source ~= 0 then return end
    PushAll()
end)

RegisterNetEvent("aifazi:syncNow", function()
    if source and source ~= 0 then return end
    SyncWhitelist()
    SyncApplicationActions()
    SyncBans()
    SyncSubscriptions()
end)
-- ── Whitelist + connect-session enforcement on playerConnecting ───────────────
-- Two gates run in parallel:
--   1. /playerConnecting  — whitelist + ban check (primary, always enforced)
--   2. /connect/session-check — verifies the player started from the website
--      connect page (fivem.aifazi.net/connect). Its token requirement is only
--      enforced when Config.RequireConnectSession = true.
local function gateResult(code, body, blockMsg)
    if code == 0 then
        if whitelistFailOpen() then return { allowed = true } end
        return { allowed = false, reason = "\n[AIFAZI RP] " .. blockMsg }
    end
    local ok, resp = pcall(json.decode, body or "")
    if not ok or type(resp) ~= "table" then
        if whitelistFailOpen() then return { allowed = true } end
        return { allowed = false, reason = "\n[AIFAZI RP] " .. blockMsg }
    end
    return resp
end

AddEventHandler('playerConnecting', function(name, setKickReason, deferrals)
    local src    = source
    deferrals.defer()
    Wait(0)
    deferrals.update("\n[AIFAZI RP] Checking whitelist…")

    local identifiers = collectIdentifiers(src)
    if not (identifiers.discord_id or identifiers.steam_hex or identifiers.fivem_license or identifiers.fivem_id) then
        deferrals.done("\n[AIFAZI RP] Could not verify your identity. Please connect via Steam or Discord.")
        return
    end

    local requireSession = (Config and Config.RequireConnectSession == true) or false
    local resolved = false
    local primary, session

    local function tryDecide()
        if resolved then return end
        if not primary then return end
        if requireSession and not session then return end
        resolved = true

        local allow = primary.allowed == true
        local reason = primary.reason
        local prioData = primary.priority

        if requireSession then
            allow = allow and session.allowed == true
            if not session.allowed and session.reason then reason = session.reason end
            prioData = session.priority or prioData
        end

        if allow then
            local prio = cachePriority(src, identifiers, prioData)
            local suffix = prio.active and (" priority=%s:%d"):format(prio.tier or "Priority", prio.level) or ""
            print(("^2[aifazi_status]^7 %s whitelisted%s"):format(name, suffix))
            joinedAt[tostring(src)] = os.time()
            deferrals.done()
            QueuePushAll(1000)
        else
            local msg = reason or "\n[AIFAZI RP] You are not whitelisted. Apply at: aifazi.net/whitelist"
            deferrals.done(msg)
            print(("^1[aifazi_status]^7 Blocked %s"):format(name))
        end
    end

    PerformHttpRequest(TXADMIN_BASE .. "/playerConnecting", function(code, body)
        if resolved then return end
        primary = gateResult(code, body,
            "Whitelist system is temporarily unavailable. Please try again soon.")
        tryDecide()
    end, "POST", json.encode({
        player_name = name,
        discord_id = identifiers.discord_id,
        steam_hex = identifiers.steam_hex,
        fivem_license = identifiers.fivem_license,
        fivem_id = identifiers.fivem_id,
    }), authHeader())

    PerformHttpRequest(API_BASE .. "/connect/session-check", function(code, body)
        if resolved then return end
        session = gateResult(code, body,
            "Connect session could not be verified. Please reconnect from fivem.aifazi.net/connect.")
        tryDecide()
    end, "POST", json.encode({
        player_name = name,
        fivem_license = identifiers.fivem_license,
        license2 = identifiers.license2,
        steam_hex = identifiers.steam_hex,
        fivem_id = identifiers.fivem_id,
        discord_id = identifiers.discord_id,
        identifiers = identifiers.all or {},
    }), authHeader())

    -- Timeout guard follows Config.WhitelistFailOpen.
    CreateThread(function()
        Wait(whitelistTimeout())
        if not resolved then
            resolved = true
            if whitelistFailOpen() then
                print("^3[aifazi_status]^7 Whitelist check timeout for " .. name .. " — fail-open")
                cachePriority(src, identifiers, nil)
                joinedAt[tostring(src)] = os.time()
                deferrals.done()
                QueuePushAll(1000)
            else
                print("^1[aifazi_status]^7 Whitelist check timeout for " .. name .. " — fail-closed")
                deferrals.done("\n[AIFAZI RP] Whitelist check timed out. Please try again soon.")
            end
        end
    end)
end)

-- ── Main loop ─────────────────────────────────────────────────────────────────
CreateThread(function()
    Wait(10000)
    print("^2[aifazi_status]^7 v9 started — event/manual status refresh, session tracking, sync on changes/manual refresh")

    for _, id in ipairs(GetPlayers()) do
        joinedAt[tostring(id)] = os.time()
    end

    PushAll()
    SyncWhitelist()
    SyncApplicationActions()
    SyncBans()
    SyncSubscriptions()

    if PUSH_INTERVAL and PUSH_INTERVAL > 0 then
        CreateThread(function()
            print(("^3[aifazi_status]^7 Status interval enabled (%d ms)"):format(PUSH_INTERVAL))
            while true do
                Wait(PUSH_INTERVAL)
                PushAll()
                SyncSessions(GetPlayerList())
            end
        end)
    else
        print("^3[aifazi_status]^7 Status interval disabled; using startup/connect/drop/manual refresh")
        -- Keep last-seen fresh even without an interval loop.
        CreateThread(function()
            while true do
                Wait(60000)
                local players = GetPlayers()
                if #players > 0 then SyncSessions(GetPlayerList()) end
            end
        end)
    end

    if APP_ACTION_INTERVAL and APP_ACTION_INTERVAL > 0 then
        CreateThread(function()
            print(("^5[aifazi_status]^7 Sync interval enabled (%d ms)"):format(APP_ACTION_INTERVAL))
            while true do
                Wait(APP_ACTION_INTERVAL)
                SyncWhitelist()
                SyncApplicationActions()
                SyncBans()
                SyncSubscriptions()
            end
        end)
    else
        print("^5[aifazi_status]^7 Sync interval disabled; using startup/manual refresh only")
    end

    local SUB_INTERVAL = (Config and Config.SubscriptionSyncInterval) or 30000
    if SUB_INTERVAL and SUB_INTERVAL > 0 then
        CreateThread(function()
            print(("^6[aifazi_status]^7 Subscription sync interval enabled (%d ms)"):format(SUB_INTERVAL))
            while true do
                Wait(SUB_INTERVAL)
                SyncSubscriptions()
            end
        end)
    end
end)

-- ── txAdmin event forwarding → website ────────────────────────────────────────
-- These are native Lua server events fired by txAdmin — always safe to listen to.
local function notifyBackend(event, payload)
    PerformHttpRequest(API_BASE .. "/txadmin-event", function(code)
        if code ~= 200 and code ~= 0 then
            print(("^3[aifazi_status]^7 txadmin-event [%s] HTTP %d"):format(event, code))
        end
    end, "POST", json.encode({ event = event, data = payload, ts = os.time() }), authHeader())
end

-- Ban placed in txAdmin → sync to website
AddEventHandler("txAdmin:events:playerBanned", function(data)
    print(("^1[aifazi_status]^7 txAdmin ban: %s — %s"):format(
        tostring(data.license or "?"), tostring(data.reason or "?")))
    notifyBackend("playerBanned", data)
end)

-- Ban lifted in txAdmin → sync to website
AddEventHandler("txAdmin:events:playerUnbanned", function(data)
    print(("^2[aifazi_status]^7 txAdmin unban: %s"):format(tostring(data.license or "?")))
    notifyBackend("playerUnbanned", data)
end)

-- txAdmin whitelist approved/removed in txAdmin panel → sync to website
AddEventHandler("txAdmin:events:whitelistPreApproval", function(data)
    notifyBackend("whitelistPreApproval", data)
end)

-- txAdmin whitelist player joined successfully → mark synced on website
AddEventHandler("txAdmin:events:playerWhitelisted", function(data)
    notifyBackend("playerWhitelisted", data)
end)

-- Server shutting down → push offline status immediately
AddEventHandler("txAdmin:events:serverShuttingDown", function()
    print("^3[aifazi_status]^7 Server shutting down — pushing offline status")
    local maxPlayers = GetConvarInt("sv_maxclients", 48)
    PerformHttpRequest(API_BASE .. "/status", function() end, "POST",
        json.encode({ players_online = 0, max_players = maxPlayers,
                      server_name = GetConvar("sv_hostname", "AIFAZI RP"),
                      force_offline = true }),
        authHeader())
end)
