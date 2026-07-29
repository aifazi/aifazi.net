--[[
╔══════════════════════════════════════════════════════════════════╗
║  aifazi_status / server.lua  v6.0                               ║
║                                                                  ║
║  ROLES:                                                          ║
║  1. Heartbeat → backend (startup, connect/drop, manual refresh)  ║
║  2. txAdmin events → backend  (txAdmin panel → website sync)     ║
║  3. Fallback Lua polling  (only if backend can't reach txAdmin)  ║
║                                                                  ║
║  NOTE: Website → txAdmin sync is now handled DIRECTLY by the     ║
║  FastAPI backend via txadmin_service.py → txadmin.aifazi.net.    ║
║  Lua polling is kept as a fallback only.                         ║
╚══════════════════════════════════════════════════════════════════╝
]]

local startTime = os.time()
local function uptime()  return os.time() - startTime end
local function srvName() return GetConvar("sv_hostname", "AIFAZI RP") end
local function maxP()    return GetConvarInt("sv_maxclients", 48) end

local function resourceCount()
    local n = 0
    for i = 0, GetNumResources() - 1 do
        local r = GetResourceByFindIndex(i)
        if r and GetResourceState(r) == "started" then n = n + 1 end
    end
    return n
end

local function getIds(src)
    local ids = { license=nil, discord=nil, steam=nil, fivem=nil }
    for i = 0, GetNumPlayerIdentifiers(src) - 1 do
        local id = GetPlayerIdentifier(src, i) or ""
        if     id:sub(1,8)  == "license:" then ids.license = id
        elseif id:sub(1,8)  == "discord:" then ids.discord = id:sub(9)
        elseif id:sub(1,6)  == "steam:"   then ids.steam   = id
        elseif id:sub(1,6)  == "fivem:"   then ids.fivem   = id:sub(7)
        end
    end
    return ids
end

local BACKEND  = Config.BackendUrl
local SECRET   = Config.Secret
local TX_PASS  = GetConvar("txadmin_password", "")
local TX_USER  = GetConvar("txadmin_username", "wtftanveer")
local TX_PORT  = GetConvar("txadmin_port", "40120")
local TX_URL   = "http://localhost:" .. TX_PORT

local function backendHeaders()
    return { ["Content-Type"] = "application/json", ["X-FiveM-Token"] = SECRET }
end

local function httpPost(url, payload, label, cb)
    PerformHttpRequest(url, function(code, body)
        if cb then cb(code, body) end
        if code == 403 then print("^1[aifazi] 403 on " .. label .. " — check fivem_api_secret") end
    end, "POST", json.encode(payload), backendHeaders())
end

-- ═══════════════════════════════════════════════════════════════
-- 1. HEARTBEAT (status + players on change/manual refresh)
-- ═══════════════════════════════════════════════════════════════
local function buildHeartbeat()
    local players = {}
    for _, src in ipairs(GetPlayers()) do
        local s = tonumber(src); local ids = getIds(s)
        players[#players+1] = {
            server_id = s, name = GetPlayerName(s) or "?",
            license = ids.license, discord = ids.discord, ping = GetPlayerPing(s),
        }
    end
    return {
        server_name    = srvName(), players_online = #players,
        max_players    = maxP(),    uptime_seconds = uptime(),
        resource_count = resourceCount(), players = players,
    }
end

CreateThread(function()
    Wait(Config.StartupDelay or 8000)
    print("^2[aifazi]^7 Status bridge ready → " .. BACKEND)
    httpPost(BACKEND .. "/api/fivem/status", buildHeartbeat(), "startup-hb")
    if (Config.StatusInterval or 0) <= 0 then
        print("^3[aifazi]^7 Status interval disabled; using startup/connect/drop/manual refresh only")
        return
    end
    while true do
        Wait(Config.StatusInterval)
        httpPost(BACKEND .. "/api/fivem/status", buildHeartbeat(), "heartbeat")
    end
end)

local function pushStatusRefresh(label)
    httpPost(BACKEND .. "/api/fivem/status", buildHeartbeat(), label or "manual-refresh")
end

RegisterCommand("aifazi_refresh", function(src)
    if src ~= 0 then return end
    pushStatusRefresh("console-refresh")
    print("^2[aifazi]^7 Manual status refresh sent")
end, true)

RegisterNetEvent("aifazi:refreshStatus", function()
    if source and source ~= 0 then return end
    pushStatusRefresh("event-refresh")
end)

-- push on connect/disconnect for instant count updates
AddEventHandler("playerConnecting", function() Wait(2000); httpPost(BACKEND .. "/api/fivem/status", buildHeartbeat(), "connect-hb") end)
AddEventHandler("playerDropped",    function() Wait(500);  httpPost(BACKEND .. "/api/fivem/status", buildHeartbeat(), "drop-hb") end)

-- push offline instantly on shutdown
AddEventHandler("txAdmin:events:serverShuttingDown", function()
    print("^3[aifazi]^7 Shutdown detected — pushing offline to website")
    local payload = buildHeartbeat()
    payload.force_offline = true
    payload.players_online = 0
    httpPost(BACKEND .. "/api/fivem/status", payload, "shutdown-offline")
end)

-- ═══════════════════════════════════════════════════════════════
-- 2. TXADMIN → WEBSITE  (real-time event forwarding)
--    The backend updates the DB immediately when these arrive,
--    so the website whitelist list updates in real time.
-- ═══════════════════════════════════════════════════════════════
local function forwardEvent(eventName, data)
    httpPost(BACKEND .. "/api/fivem/txadmin-event",
        { event = eventName, data = data, ts = os.time() },
        "txevent:" .. eventName
    )
end

AddEventHandler("txAdmin:events:whitelistPreApproval", function(data)
    -- Admin approved/removed someone directly in txAdmin panel
    local action = data and data.action or "?"
    local id     = data and data.identifier or "?"
    local admin  = data and data.adminName or "txAdmin"
    print(("^2[aifazi]^7 txAdmin whitelist %s: %s by %s"):format(action, id, admin))
    forwardEvent("whitelistPreApproval", data)
end)

AddEventHandler("txAdmin:events:playerWhitelisted", function(data)
    -- A player passed the whitelist check on join
    print("^2[aifazi]^7 txAdmin: player joined through whitelist — " .. tostring(data and data.license or "?"))
    forwardEvent("playerWhitelisted", data)
end)

AddEventHandler("txAdmin:events:whitelistRequest", function(data)
    -- A player was rejected and their request logged
    forwardEvent("whitelistRequest", data)
end)

AddEventHandler("txAdmin:events:whitelistPlayer", function(data)
    forwardEvent("whitelistPlayer", data)
end)

-- ═══════════════════════════════════════════════════════════════
-- 3. FALLBACK LUA POLLING  (Website → txAdmin)
--    This runs only if TXADMIN_PASSWORD is set AND the backend
--    signals it needs Lua help (backend can't reach txAdmin).
--    Primary path: backend calls txAdmin directly via HTTPS.
-- ═══════════════════════════════════════════════════════════════
local txCookie   = nil
local txCsrf     = nil
local txExpiry   = 0
local isLogging  = false
local loginQueue = {}

local function txLogin(cb)
    if TX_PASS == "" then if cb then cb(false) end; return end
    if isLogging then loginQueue[#loginQueue+1] = cb; return end
    isLogging = true
    PerformHttpRequest(
        TX_URL .. "/auth/password",
        function(code, body, headers)
            isLogging = false
            local ok, resp = pcall(json.decode, body or "")
            if code == 200 and ok and resp and not resp.logout and resp.csrfToken then
                local raw = (headers and (headers["set-cookie"] or headers["Set-Cookie"])) or ""
                local ck  = raw:match("^([^;]+)")
                if ck and ck ~= "" then
                    txCookie = ck; txCsrf = resp.csrfToken; txExpiry = os.time() + 82800
                    print("^2[aifazi]^7 Fallback txAdmin login OK")
                    if cb then cb(true) end
                    for _, q in ipairs(loginQueue) do q(true) end
                    loginQueue = {}
                    return
                end
            end
            print(("^1[aifazi]^7 Fallback txAdmin login FAILED (HTTP %d)"):format(code or 0))
            txCookie = nil; txCsrf = nil
            if cb then cb(false) end
            for _, q in ipairs(loginQueue) do q(false) end
            loginQueue = {}
        end,
        "POST", json.encode({username=TX_USER, password=TX_PASS}),
        {["Content-Type"]="application/json"}
    )
end

local function txReq(method, path, payload, cb, retry)
    if not txCookie or not txCsrf or os.time() >= txExpiry then
        if retry then if cb then cb(false, nil) end; return end
        txLogin(function(ok) if ok then txReq(method, path, payload, cb, true) else if cb then cb(false, nil) end end end)
        return
    end
    PerformHttpRequest(
        TX_URL .. path,
        function(code, body)
            local ok, resp = pcall(json.decode, body or "")
            if ok and resp and resp.logout then
                txCookie=nil; txCsrf=nil
                if not retry then
                    txLogin(function(lok) if lok then txReq(method,path,payload,cb,true) else if cb then cb(false,nil) end end end)
                else if cb then cb(false,nil) end end
                return
            end
            if cb then cb(code==200 or code==201, resp) end
        end,
        method, payload and json.encode(payload) or "",
        {["Content-Type"]="application/json", ["Cookie"]=txCookie, ["x-txadmin-csrftoken"]=txCsrf}
    )
end

-- Fallback poll (manual/event by default; interval only if Config.SyncInterval > 0)
local function fallbackPoll()
    if TX_PASS == "" then return end
    PerformHttpRequest(
        BACKEND .. "/api/fivem/whitelist/pending-sync",
        function(code, body)
            if code ~= 200 then return end
            local ok, entries = pcall(json.decode, body or "")
            if not ok or type(entries) ~= "table" or #entries == 0 then return end
            print(("^5[aifazi]^7 Fallback poll: %d entries need syncing"):format(#entries))
            for i, entry in ipairs(entries) do
                if type(entry) == "table" and entry.license then
                    local lic = entry.license
                    CreateThread(function()
                        Wait((i-1)*800)
                        txReq("POST", "/whitelist/approvals/add", {identifier=lic}, function(addOk, resp)
                            local errStr = ""
                            if resp then errStr = tostring(resp.msg or resp.error or "") end
                            local isAlready = errStr:lower():find("exist") or errStr:lower():find("already")
                            if addOk or isAlready then
                                PerformHttpRequest(BACKEND.."/api/fivem/whitelist/mark-synced",
                                    function() end, "POST",
                                    json.encode({license=lic, success=true}), backendHeaders())
                                print("^2[aifazi]^7 Fallback synced: " .. lic)
                            end
                        end)
                    end)
                end
            end
        end,
        "GET", "", backendHeaders()
    )
end

CreateThread(function()
    if TX_PASS == "" then
        print("^3[aifazi]^7 Fallback Lua sync disabled (txadmin_password not set)")
        return
    end
    Wait((Config.StartupDelay or 8000) + 10000)
    txLogin(function() end)
    fallbackPoll()
    if (Config.SyncInterval or 0) <= 0 then
        print("^5[aifazi]^7 Fallback Lua sync is manual/event-only")
        return
    end
    print(("^5[aifazi]^7 Fallback Lua polling enabled (%d ms interval)"):format(Config.SyncInterval))
    while true do
        Wait(Config.SyncInterval)
        fallbackPoll()
    end
end)

RegisterCommand("aifazi_sync", function(src)
    if src ~= 0 then return end
    fallbackPoll()
    print("^5[aifazi]^7 Manual fallback sync check requested")
end, true)

RegisterNetEvent("aifazi:syncNow", function()
    if source and source ~= 0 then return end
    fallbackPoll()
end)

-- ═══════════════════════════════════════════════════════════════
-- 4. WEBSITE-ONLY CONNECT GATE
--    Direct IP/cfx joins are blocked. The player must click Connect
--    on fivem.aifazi.net, which creates a short website session.
--    The backend also checks approved whitelist + active bans.
-- ═══════════════════════════════════════════════════════════════

AddEventHandler("playerConnecting", function(name, setKickReason, deferrals)
    local src = source
    local ids = getIds(src)
    local identifiers = {}
    for i = 0, GetNumPlayerIdentifiers(src) - 1 do
        identifiers[#identifiers+1] = GetPlayerIdentifier(src, i)
    end

    deferrals.defer()
    Wait(0)
    deferrals.update("Checking website connect session...")

    local payload = {
        player_name = name,
        fivem_license = ids.license,
        steam_hex = ids.steam,
        fivem_id = ids.fivem and ("fivem:" .. ids.fivem) or nil,
        discord_id = ids.discord,
        identifiers = identifiers,
    }

    PerformHttpRequest(
        BACKEND .. "/api/fivem/connect/session-check",
        function(code, body)
            local ok, data = pcall(json.decode, body or "")
            if code == 200 and ok and data and data.allowed then
                print(("^2[aifazi]^7 Website connect approved for %s (user: %s)"):format(name, data.username or "?"))
                deferrals.done()
                return
            end

            local reason = "Connect from fivem.aifazi.net/connect first. Direct IP/cfx joins are blocked."
            if ok and data and data.reason then reason = data.reason end
            print(("^1[aifazi]^7 Website connect denied for %s: %s"):format(name, reason))
            deferrals.done(reason)
        end,
        "POST", json.encode(payload), backendHeaders()
    )
end)

-- ═══════════════════════════════════════════════════════════════
-- STARTUP
-- ═══════════════════════════════════════════════════════════════
print("^2[aifazi]^7 v6.0 loaded — backend=" .. BACKEND)
