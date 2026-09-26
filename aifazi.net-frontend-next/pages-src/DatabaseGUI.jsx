'use client'
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useDialog } from "../core/dialog.jsx";
import { useNotify } from "../core/notify.jsx";
import { Checkbox, Select } from "../core/ui.jsx";
import Clickable from "../core/Clickable.jsx";
import { getAuthToken } from "../lib/api";
import api from "../lib/api";  // <- use the internal axios proxy (handles /api prefix + auth token)
import {
  ROLE_META, useToasts, ToastContainer, Btn, StatCard, MiniChart, FeedRow,
  UserActionsModal, EditModal, CollectionBrowser, ExportPanel, QueryPanel, MaintenancePanel,
  ago, fmt, ap, authCfg,
} from './dbGuiParts'
import { DbHealthTab, NewsletterTab, AuditLogTab, SessionsTab } from './dbGuiTabs'

// API_URL is intentionally empty - all requests go through the Next.js /api proxy
// which stamps X-Internal-Token and injects the Authorization header automatically.
const API_URL = "";

export default function DatabaseGUI({ _preloadToken = "", readOnly: readOnlyProp = undefined }) {
  // #23 — The read-only gate must never trust localStorage (aifazi_effective_role
  // / aifazi_permissions are client-editable). Resolve the role from the signed
  // in-memory token first (set only from a verified login), and fall back to the
  // server-verified /auth/me response. Until it resolves, default SAFE (readOnly).
  const [serverRole, setServerRole] = useState(() => {
    const token = getAuthToken()
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        return payload?.role || null
      } catch { return null }
    }
    return null
  })
  const [roleReady, setRoleReady] = useState(() => (getAuthToken() ? true : null))
  useEffect(() => {
    if (roleReady) return
    let active = true
    ;(async () => {
      try {
        const r = await api.get('/auth/me', { headers: getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : undefined })
        if (active && r.data?.role) setServerRole(r.data.role)
      } catch {}
      finally { if (active) setRoleReady(true) }
    })()
    return () => { active = false }
  }, [roleReady])
  const role = serverRole || (readOnlyProp ? 'moderator' : null)
  const readOnly = readOnlyProp ?? (roleReady ? (role === 'editor' || role === 'moderator') : true)
  // P2 — SECURITY WARNING: the pasted admin token must live in sessionStorage
  // ONLY, never localStorage (localStorage survives browser restarts and is
  // readable by any script on the origin forever). It is wiped when this
  // panel unmounts so a walked-away-untabbed admin tab never keeps it.
  const DB_TOKEN_KEY = 'db_gui_token'
  const [token, setTokenState] = useState(() => {
    if (_preloadToken) return _preloadToken
    try { return sessionStorage.getItem(DB_TOKEN_KEY) || getAuthToken() || '' } catch { return getAuthToken() || '' }
  })
  const setToken = (t) => {
    setTokenState(t || '')
    try {
      if (t) sessionStorage.setItem(DB_TOKEN_KEY, t)
      else sessionStorage.removeItem(DB_TOKEN_KEY)
    } catch {}
  }
  useEffect(() => () => {
    try { sessionStorage.removeItem(DB_TOKEN_KEY) } catch {}
  }, [])
  const [tokenInput, setTokenInput] = useState("");
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [lastUpdate, setLastUpdate] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab]   = useState("overview");
  const [pulse, setPulse]           = useState(false);
  const intervalRef                 = useRef(null);
  const toast                       = useToasts();

  const fetchStats = useCallback(async (t = token) => {
    if (!t) return;
    setLoading(true); setError("");
    try {
      const res = await api.get(ap(`/api/admin/stats`), authCfg(t));
      const data = res.data;
      setStats(data); setLastUpdate(new Date());
      setPulse(true); setTimeout(()=>setPulse(false), 600);
    } catch(e) { setError(e?.response?.data?.error || e.message); }
    finally { setLoading(false); }
  }, [token, setStats]);

  useEffect(()=>{ if(token) void (async () => { await fetchStats() })() }, [token]);
  useEffect(()=>{
    clearInterval(intervalRef.current);
    if (autoRefresh && token) intervalRef.current = setInterval(()=>fetchStats(), 30000);
    return ()=>clearInterval(intervalRef.current);
  }, [autoRefresh, token, fetchStats]);

  if (!token) return (
    <div style={{ minHeight: _preloadToken ? "auto" : "100vh", background: _preloadToken ? "transparent" : "var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-mono,monospace)", padding: 24 }}>
      <div style={{ background:"var(--bg2)", border:"1px solid var(--border)", borderRadius:10, padding:"44px 40px", width:"100%", maxWidth:400 }}>
        <div style={{ fontSize: 11, letterSpacing:4, color:"var(--green,var(--green))", marginBottom:10 }}>{'// AIFAZI.NET'}</div>
        <div style={{ fontSize:24, fontWeight:700, color:"var(--text)", marginBottom:6 }}>DB Monitor</div>
        <div style={{ fontSize:11, color:"var(--muted)", marginBottom:28, lineHeight:1.7 }}>Paste your admin JWT token to connect. Stored in memory only - clears on refresh.</div>
        <input type="password" value={tokenInput} onChange={e=>setTokenInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&tokenInput&&setToken(tokenInput)}
          placeholder="eyJhbGciOiJIUzI1NiIs..." autoFocus
          style={{ width:"100%", background:"var(--bg)", border:"1px solid var(--border)", borderRadius:5, color:"var(--text)", fontFamily:"var(--font-mono,monospace)", fontSize:12, padding:"12px 14px", outline:"none", marginBottom:14, boxSizing:"border-box" }} />
        <button onClick={()=>tokenInput&&setToken(tokenInput)} disabled={!tokenInput}
          style={{ width:"100%", padding:13, background:tokenInput?"var(--green,var(--green))":"var(--bg2)", color:tokenInput?"#000":"var(--border)", fontFamily:"var(--font-mono,monospace)", fontSize:11, letterSpacing:3, fontWeight:700, border:"none", cursor:tokenInput?"pointer":"not-allowed" }}>
          CONNECT
        </button>
      </div>
    </div>
  );

  const s = stats;
  const ALL_TABS = [
    {id:"overview",   label:"[=] Overview"},
    {id:"activity",   label:"[*] Activity"},
    {id:"browser",    label:"[B] Browser"},
    {id:"charts",     label:"[C] Charts"},
    {id:"export",     label:"[E] Export",     writeOnly: true},
    {id:"query",      label:"[Q] Query",      writeOnly: true},
    {id:"maintenance",label:"[M] Maintenance",writeOnly: true},
    {id:"sessions",   label:"[S] Sessions"},
    {id:"newsletter", label:"[N] Newsletter"},
    {id:"dbhealth",   label:"[H] DB Health"},
    {id:"system",     label:"[~] System"},
    {id:"audit",      label:"[A] Audit Log"},
  ];
  const TABS = readOnly ? ALL_TABS.filter(t => !t.writeOnly) : ALL_TABS;

  return (
    <div style={{ minHeight: _preloadToken ? "auto" : "100vh", background: _preloadToken ? "transparent" : "var(--bg)", color:"var(--text)", fontFamily:"var(--font-mono,monospace)" }}>

      {/* #19 - Read-only mode banner (only once the role has resolved) */}
      {readOnly && roleReady !== null && (
        <div style={{
          padding: '8px 24px', background: 'color-mix(in srgb, var(--cyan) 7%, transparent)',
          borderBottom: '1px solid color-mix(in srgb, var(--cyan) 20%, transparent)',
          display: 'flex', alignItems: 'center', gap: 10,
          fontFamily: 'monospace', fontSize: 11, color: 'var(--cyan)', letterSpacing: 2,
        }}>
          <span>LOCK</span>
          <span>READ-ONLY MODE - Query, Maintenance and Export tabs are hidden for your role ({role?.toUpperCase()}). Contact an admin for write access.</span>
        </div>
      )}

      {/* Role still resolving — skeleton instead of role-gated UI */}
      {roleReady === null && (
        <div style={{ padding: '8px 24px', borderBottom: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>
          RESOLVING ACCESS…
        </div>
      )}

      {/* Header - hidden when embedded inside Admin panel */}
      {!_preloadToken && (
      <div style={{ background:"var(--bg)", borderBottom:"1px solid #0f1a26", padding:"12px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:18 }}>
          <div>
            <span style={{ fontSize: 11, letterSpacing:4, color:"var(--green,var(--green))" }}>AIFAZI.NET</span>
            <span style={{ marginLeft:12, fontSize:13, fontWeight:700, color:"var(--text)", letterSpacing:2 }}>DATABASE MONITOR</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <div style={{
              width:7, height:7, borderRadius:"50%",
              background:loading?"var(--orange,var(--orange))":error?"var(--red,var(--red))":"var(--green,var(--green))",
              boxShadow:`0 0 ${pulse?"10px":"4px"} ${loading?"var(--orange,var(--orange))":error?"var(--red,var(--red))":"var(--green,var(--green))"}`,
              transition:"all 0.3s",
            }} />
            <span style={{ fontSize: 11, color:"var(--border)" }}>
              {loading?"SYNCING...":error?"ERROR":lastUpdate?`SYNCED ${ago(lastUpdate)}`:"IDLE"}
            </span>
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <Checkbox checked={autoRefresh} onChange={setAutoRefresh} label="AUTO 30s"
            style={{ fontSize: 11, color:"var(--border)", padding:"5px 8px" }} />
          <button onClick={()=>fetchStats()} disabled={loading}
            style={{ padding:"5px 12px", background:"transparent", color:"var(--cyan,var(--cyan))", border:"1px solid #1e2d45", cursor:loading?"not-allowed":"pointer", fontSize: 11, letterSpacing:2 }}>REFRESH</button>
          <button onClick={()=>{setToken("");setStats(null);}}
            style={{ padding:"5px 12px", background:"transparent", color:"var(--red,var(--red))", border:"1px solid #1e2d45", cursor:"pointer", fontSize: 11, letterSpacing:2 }}>DISCONNECT</button>
        </div>
      </div>
      )}

      {/* Compact status bar when embedded */}
      {_preloadToken && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 16px", borderBottom:"1px solid #0f1a26", background:"var(--bg)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:loading?"var(--orange,var(--orange))":error?"var(--red,var(--red))":"var(--green,var(--green))", boxShadow:`0 0 6px ${loading?"var(--orange,var(--orange))":error?"var(--red,var(--red))":"var(--green,var(--green))"}`, transition:"all 0.3s" }} />
            <span style={{ fontSize: 11, fontFamily:"var(--font-mono,monospace)", color:"var(--muted)", letterSpacing:2 }}>
              {loading?"SYNCING...":error?"ERROR":lastUpdate?`LAST SYNC ${ago(lastUpdate)}`:"IDLE"}
            </span>
          </div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            <Checkbox checked={autoRefresh} onChange={setAutoRefresh} label="AUTO"
              style={{ fontSize: 11, color:"var(--border)", padding:"4px 7px" }} />
            <button onClick={()=>fetchStats()} disabled={loading} style={{ padding:"3px 10px", background:"transparent", color:"var(--cyan,var(--cyan))", border:"1px solid #1e2d45", cursor:loading?"not-allowed":"pointer", fontSize: 11, letterSpacing:1, fontFamily:"var(--font-mono,monospace)" }}>REFRESH</button>
          </div>
        </div>
      )}

      {error && <div style={{ background:"color-mix(in srgb, var(--red) 8%, transparent)", borderBottom:"1px solid color-mix(in srgb, var(--red) 25%, transparent)", color:"var(--red,var(--red))", padding:"10px 24px", fontSize:11 }}>WARN {error}</div>}

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:"1px solid var(--border)", padding:"0 20px", overflowX:"auto" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
            padding:"11px 16px", background:"transparent",
            color:activeTab===t.id?"var(--primary,var(--cyan,var(--cyan)))":"var(--muted)",
            borderBottom:activeTab===t.id?"2px solid var(--primary,var(--cyan,var(--cyan)))":"2px solid transparent",
            border:"none", cursor:"pointer", fontSize: 11, letterSpacing:2, fontFamily:"var(--font-mono,monospace)",
            marginBottom:-1, whiteSpace:"nowrap",
          }}>{t.label.toUpperCase()}</button>
        ))}
      </div>

      <div style={{ padding:24, maxWidth:1500 }}>

        {/* -- OVERVIEW -- */}
        {activeTab==="overview" && s && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:10, marginBottom:28 }}>
              <StatCard icon="[P]" label="POSTS"       value={s.counts?.posts?.total}       sub={`${s.counts?.posts?.published||0} published · ${s.counts?.posts?.drafts||0} drafts`}       color="var(--green,var(--green))" trend={s.today?.posts} />
              <StatCard icon="[U]" label="USERS"        value={s.counts?.users?.total}       sub={`${s.counts?.users?.verified||0} verified · ${s.counts?.users?.banned||0} banned`}         color="var(--cyan,var(--cyan))" trend={s.today?.users} />
              <StatCard icon="[T]" label="THREADS"      value={s.counts?.forum?.threads}     sub={`${fmt(s.counts?.forum?.replies||0)} replies`}                                              color="var(--orange,var(--orange))" trend={s.today?.threads} />
              <StatCard icon="[C]" label="CHAT MSGS"    value={s.counts?.chat?.messages}     sub={`${s.counts?.chat?.rooms||0} rooms`}                                                        color="var(--yellow,#ffd700)" trend={s.today?.messages} />
              <StatCard icon="[@]" label="CONTACTS"     value={s.counts?.contacts}           sub="Contact form submissions"                                                                   color="var(--purple,#a78bfa)" trend={s.today?.contacts} />
              <StatCard icon="[N]" label="NEWSLETTER"   value={s.counts?.newsletter?.total}  sub={`${s.counts?.newsletter?.active||0} active`}                                                color="var(--green,var(--green))" />
              <StatCard icon="[M]" label="MEDIA FILES"  value={s.counts?.media}              sub="Uploaded files"                                                                             color="var(--muted)" />
              <StatCard icon="[S]" label="STAFF"        value={s.counts?.staff}              sub="Team members"                                                                               color="var(--cyan,var(--cyan))" />
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
              <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:20 }}>
                <div style={{ fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:14 }}>TOP POSTS BY VIEWS</div>
                {(s.topPosts||[]).length===0
                  ? <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)" }}>No posts yet</div>
                  : (s.topPosts||[]).map((p,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #0a1016", gap:12 }}>
                      <div style={{ flex:1, overflow:"hidden" }}>
                        <div style={{ color:"var(--muted)", fontSize:12, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.title}</div>
                        <div style={{ color:"var(--border)", fontSize: 11, marginTop:2 }}>{p.category}</div>
                      </div>
                      <span style={{ color:"var(--green,var(--green))", fontSize:11, flexShrink:0 }}>{fmt(p.views)}v</span>
                    </div>
                  ))
                }
              </div>
              <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:20 }}>
                <div style={{ fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:14 }}>FORUM CATEGORIES</div>
                {(s.categories||[]).length===0
                  ? <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)" }}>No categories yet</div>
                  : (s.categories||[]).map((c,i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"9px 0", borderBottom:"1px solid #0a1016" }}>
                      <span style={{ color:"var(--muted)", fontSize:12 }}>{c.icon} {c.name}</span>
                      <span style={{ color:"var(--cyan,var(--cyan))", fontSize:11 }}>{fmt(c.threadCount)} threads</span>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        )}

        {/* -- ACTIVITY -- */}
        {activeTab==="activity" && s && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:16 }}>
            {[
              {title:"LATEST POSTS",     key:"posts",      icon:"[P]", color:"var(--green,var(--green))",
               render:p=><FeedRow icon="[P]" title={p.title} sub={`${p.published?"YES":"DRAFT"} · ${p.views||0}v · ${p.category||""}`} time={ago(p.createdAt)} color="var(--green,var(--green))" />},
              {title:"NEW USERS",        key:"users",      icon:"[U]", color:"var(--cyan,var(--cyan))",
               render:u=><FeedRow icon="[U]" title={u.username} sub={`${u.email} · ${u.role} · ${u.emailVerified?"YES":"NO"}`} time={ago(u.createdAt)} color="var(--cyan,var(--cyan))" />},
              {title:"LATEST THREADS",   key:"threads",    icon:"[T]", color:"var(--orange,var(--orange))",
               render:t=><FeedRow icon="[T]" title={t.title} sub={`by ${t.author?.username||"?"} · ${t.views||0}v · ${t.replyCount||0} replies`} time={ago(t.createdAt)} color="var(--orange,var(--orange))" />},
              {title:"CHAT MESSAGES",    key:"messages",   icon:"[C]", color:"var(--yellow,#ffd700)",
               render:m=><FeedRow icon="[C]" title={`${m.sender}: ${(m.content||"[file]").slice(0,50)}`} sub={`in ${m.room?.name||"?"}`} time={ago(m.createdAt)} color="var(--yellow,#ffd700)" />},
              {title:"CONTACT FORMS",    key:"contacts",   icon:"[@]", color:"var(--purple,#a78bfa)",
               render:c=><FeedRow icon="[@]" title={`${c.name} - ${c.subject||"No subject"}`} sub={c.email} time={ago(c.createdAt)} color="var(--purple,#a78bfa)" />},
              {title:"NEWSLETTER SUBS",  key:"newsletter", icon:"[N]", color:"var(--green,var(--green))",
               render:s=><FeedRow icon="[N]" title={s.email} sub={s.active?"YES Active":"NO Unsubscribed"} time={ago(s.createdAt)} color="var(--green,var(--green))" />},
            ].map(({title, key, render}) => (
              <div key={key} style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:"18px 16px" }}>
                <div style={{ fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:12 }}>{title}</div>
                {(s.recent?.[key]||[]).length===0
                  ? <div style={{ fontFamily:"var(--font-mono,monospace)", fontSize: 11, color:"var(--border)", padding:"12px 0" }}>NO DATA YET</div>
                  : (s.recent?.[key]||[]).map((item, i) => <div key={i}>{render(item)}</div>)
                }
              </div>
            ))}
          </div>
        )}

        {activeTab==="browser" && (
          <div style={{ background:"var(--bg)", border:"1px solid #0f1a26", padding:24 }}>
            <CollectionBrowser token={token} toast={toast} />
          </div>
        )}

        {/* -- CHARTS -- */}
        {activeTab==="charts" && s && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24 }}>
              <MiniChart data={s.charts?.dailyPosts||[]} color="var(--green,var(--green))" label="POSTS - LAST 30 DAYS" />
            </div>
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24 }}>
              <MiniChart data={s.charts?.dailyUsers||[]} color="var(--cyan,var(--cyan))" label="NEW USERS - LAST 30 DAYS" />
            </div>
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24, gridColumn:"1/-1" }}>
              <div style={{ fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:16 }}>THIS WEEK</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                {[
                  {label:"POSTS",    value:s.week?.posts,    color:"var(--green,var(--green))"},
                  {label:"NEW USERS",value:s.week?.users,    color:"var(--cyan,var(--cyan))"},
                  {label:"THREADS",  value:s.week?.threads,  color:"var(--orange,var(--orange))"},
                  {label:"CHAT MSG", value:s.week?.messages, color:"var(--yellow,#ffd700)"},
                ].map(({label,value,color}) => (
                  <div key={label} style={{ textAlign:"center", padding:"20px 12px", background:"var(--bg)", border:`1px solid ${color}18` }}>
                    <div style={{ fontSize:32, fontWeight:900, color, marginBottom:6 }}>{fmt(value)}</div>
                    <div style={{ fontSize: 11, color:"var(--border)", letterSpacing:2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* -⬇ EXPORT -- */}
        {activeTab==="export" && (
          <ExportPanel token={token} toast={toast} stats={s} />
        )}

        {/* -- QUERY -- */}
        {activeTab==="query" && (
          <QueryPanel token={token} toast={toast} />
        )}

        {/* -- MAINTENANCE -- */}
        {activeTab==="maintenance" && (
          <MaintenancePanel token={token} toast={toast} onRefresh={() => fetchStats()} />
        )}

        {/* -- SESSIONS & IP BANS -- */}
        {activeTab==="sessions" && (
          <SessionsTab token={token} toast={toast} />
        )}

        {/* -- NEWSLETTER -- */}
        {activeTab==="newsletter" && (
          <NewsletterTab token={token} toast={toast} />
        )}

        {/* -- DB HEALTH -- */}
        {activeTab==="dbhealth" && (
          <DbHealthTab token={token} toast={toast} />
        )}

        {/* -- SYSTEM -- */}
        {activeTab==="system" && (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24 }}>
              <div style={{ fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:16 }}>CONNECTION</div>
              {[
                ["API URL",       API_URL||"(same origin)"],
                ["Auto Refresh",  autoRefresh?"Every 30s":"Disabled"],
                ["Last Sync",     lastUpdate?lastUpdate.toLocaleTimeString():"Never"],
                ["Status",        error?"WARN Error":loading?"Syncing...":"* Connected"],
              ].map(([label,val]) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #0a1016" }}>
                  <span style={{ fontSize: 11, color:"var(--muted)", letterSpacing:1 }}>{label.toUpperCase()}</span>
                  <span style={{ fontSize: 11, color:"var(--muted)" }}>{val}</span>
                </div>
              ))}
            </div>
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24 }}>
              <div style={{ fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:16 }}>DATABASE TOTALS</div>
              {s && Object.entries({
                "Forum Users":   s.counts?.users?.total||0,
                "Posts":         s.counts?.posts?.total||0,
                "Threads":       s.counts?.forum?.threads||0,
                "Replies":       s.counts?.forum?.replies||0,
                "Chat Messages": s.counts?.chat?.messages||0,
                "Newsletter":    s.counts?.newsletter?.total||0,
                "Media Files":   s.counts?.media||0,
                "Contacts":      s.counts?.contacts||0,
                "Staff":         s.counts?.staff||0,
              }).map(([label,count]) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid #0a1016" }}>
                  <span style={{ fontSize: 11, color:"var(--muted)", letterSpacing:1 }}>{label.toUpperCase()}</span>
                  <span style={{ fontSize:11, color:"var(--green,var(--green))", fontWeight:700 }}>{fmt(count)}</span>
                </div>
              ))}
            </div>
            <div style={{ background:"var(--bg2)", border:"1px solid #0f1a26", padding:24, gridColumn:"1/-1" }}>
              <div style={{ fontSize: 11, letterSpacing:3, color:"var(--border)", marginBottom:16 }}>QUICK ACTIONS</div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                <Btn label="[R] REFRESH STATS"  color="var(--cyan,var(--cyan))" onClick={()=>fetchStats()} disabled={loading} />
                <Btn label={autoRefresh?"LIVE PAUSE AUTO-REFRESH":"[>] ENABLE AUTO-REFRESH"} color="var(--yellow,#ffd700)" onClick={()=>setAutoRefresh(p=>!p)} />
                <Btn label="[X] DISCONNECT" danger onClick={()=>{setToken("");setStats(null);}} />
              </div>
            </div>
          </div>
        )}

        {!s && !loading && !error && (
          <div style={{ textAlign:"center", padding:80, color:"var(--border)", fontSize:11, letterSpacing:3 }}>LOADING DATA...</div>
        )}

        {/* -- AUDIT LOG -- */}
        {activeTab==="audit" && (
          <AuditLogTab token={token} toast={toast} />
        )}
      </div>
    </div>
  );
}
export { CollectionBrowser, SessionsTab, MaintenancePanel, AuditLogTab, DbHealthTab }
