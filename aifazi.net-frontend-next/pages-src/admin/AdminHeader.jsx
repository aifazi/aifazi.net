'use client'
import React, { useState, useEffect, useRef } from 'react'
import { Link } from '@/lib/router-compat'
import api from '@/lib/api'
import { getUsername, getRole } from '@/lib/api'
import { getSupabase } from '@/lib/supabase'
import { Icon, NAV_ICONS } from './icons'
import { usePausableInterval } from '../../hooks/usePausableInterval'

/* ─────────────────────────────────────────────────────────────────────────────
   Design tokens — CSS-variable-first with sensible dark fallbacks
   so the header adapts automatically to every site theme.
───────────────────────────────────────────────────────────────────────────── */
const C = {
  bg:      'var(--bg,      #0f0f18)',
  bg2:     'var(--bg2,     #16162a)',
  bg3:     'var(--card-bg, #1c1c30)',
  border:  'var(--border,  rgba(255,255,255,0.08))',
  border2: 'var(--border,  rgba(255,255,255,0.14))',
  text:    'var(--text,    #e4e4f0)',
  muted:   'var(--muted,   #7070a0)',
  accent:  'var(--accent,  #a78bfa)',
  green:   'var(--green,   #4ade80)',
  red:     'var(--red,     #f87171)',
  cyan:    'var(--cyan,    #22d3ee)',
  fontUi:  'var(--font-display, Inter, system-ui, sans-serif)',
  fontMono:'var(--font-mono,    JetBrains Mono, monospace)',
}
const ROLE_ACCENT = { admin:'var(--accent, #a78bfa)', moderator:'var(--cyan, #22d3ee)', editor:'var(--warning, #fb923c)', chat:'var(--yellow, #facc15)' }
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
@keyframes ahPulse{0%,100%{transform:scale(1);opacity:0.6}50%{transform:scale(2.4);opacity:0}}
@keyframes ahIn{from{opacity:0;transform:translateY(-8px) scale(0.98)}to{opacity:1;transform:none}}`

/* ── Live clock ── */
function LiveClock() {
  const [t, setT] = useState(new Date())
  usePausableInterval(() => setT(new Date()), 1000)
  const p = n => String(n).padStart(2, '0')
  const blink = t.getSeconds() % 2 === 0
  return (
    <span style={{ fontFamily: C.fontMono, fontSize: 12, color: C.muted, letterSpacing: 2, userSelect:'none' }}>
      {p(t.getHours())}
      <span style={{ opacity: blink ? 1 : 0.2, transition: 'opacity 0.12s' }}>:</span>
      {p(t.getMinutes())}
      <span style={{ opacity: blink ? 1 : 0.2, transition: 'opacity 0.12s' }}>:</span>
      {p(t.getSeconds())}
    </span>
  )
}

/* ── Pulse dot ── */
function Pulse({ color = '#4ade80' }) {
  return (
    <span style={{ position:'relative', display:'inline-flex', width:7, height:7, flexShrink:0 }}>
      <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:color, animation:'ahPulse 2s ease-in-out infinite', opacity:0.45 }} />
      <span style={{ borderRadius:'50%', width:7, height:7, background:color, display:'block' }} />
    </span>
  )
}

/* ── Header icon button ── */
function HBtn({ icon, label, onClick, danger, badge, active }) {
  const [hov, setHov] = useState(false)
  const on = hov || active
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ position:'relative', display:'flex', alignItems:'center', gap:6, padding:'6px 12px',
        borderRadius:8, cursor:'pointer', border:'none', fontSize:13, fontFamily:C.fontUi,
        background: on ? (danger ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.07)') : 'transparent',
        color: on ? (danger ? '#f87171' : C.text) : C.muted,
        transition:'all 0.14s ease', whiteSpace:'nowrap' }}>
      <Icon name={icon} size={15} strokeWidth={1.8} />
      {label && <span>{label}</span>}
      {badge > 0 && (
        <span style={{ position:'absolute', top:-3, right:-3, minWidth:16, height:16, borderRadius:8,
          background:'#ef4444', fontSize:9, color:'#fff', display:'flex', alignItems:'center',
          justifyContent:'center', fontWeight:700, padding:'0 3px', fontFamily:C.fontMono }}>
          {badge}
        </span>
      )}
    </button>
  )
}

/* ── Search modal ── */
const SEARCH_NAV = [
  { key:'home',          icon:'grid',     label:'Dashboard',      group:'Overview'   },
  { key:'content',       icon:'file',     label:'Content Hub',    group:'Content'    },
  { key:'media',         icon:'image',    label:'Media Library',  group:'Content'    },
  { key:'pages',         icon:'layout',   label:'Pages',          group:'Content'    },
  { key:'themes',        icon:'palette',  label:'Theme Library',  group:'Content'    },
  { key:'communications',icon:'mail',     label:'Communications', group:'Community'  },
  { key:'staff',         icon:'users',    label:'Staff',          group:'Community'  },
  { key:'chat',          icon:'chat',     label:'Live Chat',      group:'Community'  },
  { key:'db',            icon:'database', label:'DB Monitor',     group:'System'     },
  { key:'delivery',      icon:'send',     label:'Mail & CDN',     group:'System'     },
  { key:'backup',        icon:'database', label:'Backup',         group:'System'     },
  { key:'helpdesk',      icon:'lifebuoy', label:'Help Desk',      group:'Support'    },
  { key:'store',         icon:'cart',     label:'Store',          group:'Business'   },
  { key:'changelog',     icon:'clipboard',label:'Changelog',      group:'Manage'     },
]

function SearchModal({ onClose, setView }) {
  const [q, setQ] = useState('')
  const inputRef = useRef(null)
  const [cursor, setCursor] = useState(0)
  const [prevQ, setPrevQ] = useState(q)
  if (prevQ !== q) {
    setPrevQ(q)
    setCursor(0)
  }
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50) }, [])
  const results = q
    ? SEARCH_NAV.filter(n => n.label.toLowerCase().includes(q.toLowerCase()) || n.group.toLowerCase().includes(q.toLowerCase()))
    : SEARCH_NAV
  const handleKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && results[cursor]) { setView(results[cursor].key); onClose() }
    if (e.key === 'Escape') onClose()
  }
  const grouped = results.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = []
    acc[item.group].push(item)
    return acc
  }, {})
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, zIndex:99999, background:'rgba(0,0,0,0.65)',
        backdropFilter:'blur(4px)', display:'flex', alignItems:'flex-start',
        justifyContent:'center', paddingTop:90 }}>
      <div style={{ width:'100%', maxWidth:520, background:C.bg2, border:`1px solid ${C.border2}`,
        borderRadius:14, overflow:'hidden', boxShadow:'0 32px 80px rgba(0,0,0,0.85)',
        animation:'ahIn 0.16s ease', fontFamily:C.fontUi }} onKeyDown={handleKey}>
        {/* Input row */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'14px 16px', borderBottom:`1px solid ${C.border}` }}>
          <Icon name="search" size={16} style={{ opacity:0.4 }} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search pages and actions…"
            style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:14,
              color:C.text, fontFamily:C.fontUi }} />
          <kbd style={{ fontFamily:C.fontMono, fontSize:10, color:C.muted, padding:'2px 6px',
            background:C.bg3, border:`1px solid ${C.border}`, borderRadius:5 }}>ESC</kbd>
        </div>
        {/* Results */}
        <div style={{ maxHeight:360, overflowY:'auto', padding:'6px 0' }}>
          {results.length === 0
            ? <div style={{ padding:32, textAlign:'center', color:C.muted, fontSize:13, fontFamily:C.fontUi }}>No results</div>
            : Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <div style={{ padding:'6px 16px 3px', fontSize:10, fontWeight:600, letterSpacing:1,
                  color:'rgba(255,255,255,0.25)', textTransform:'uppercase', fontFamily:C.fontMono }}>{group}</div>
                {items.map(item => {
                  const idx = results.indexOf(item); const isCur = idx === cursor
                  return (
                    <button key={item.key} onClick={() => { setView(item.key); onClose() }}
                      onMouseEnter={() => setCursor(idx)}
                      style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'9px 16px',
                        background: isCur ? 'rgba(167,139,250,0.12)' : 'transparent',
                        border:'none', cursor:'pointer', color: isCur ? '#c4b5fd' : C.text,
                        transition:'background 0.1s', fontFamily:C.fontUi }}>
                      <Icon name={item.icon} size={16} style={{ flexShrink:0, width:20 }} />
                      <span style={{ fontSize:13 }}>{item.label}</span>
                      {isCur && <span style={{ marginLeft:'auto', fontSize:10, color:'#a78bfa',
                        padding:'1px 6px', background:'rgba(167,139,250,0.12)', borderRadius:4,
                        fontFamily:C.fontMono }}>↵ open</span>}
                    </button>
                  )
                })}
              </div>
            ))
          }
        </div>
        {/* Footer */}
        <div style={{ padding:'8px 16px', borderTop:`1px solid ${C.border}`, display:'flex',
          gap:16, background:C.bg }}>
          {[['↑↓','navigate'],['↵','open'],['ESC','close']].map(([k,l]) => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <kbd style={{ fontFamily:C.fontMono, fontSize:9, color:C.muted, padding:'1px 5px',
                background:C.bg3, border:`1px solid ${C.border}`, borderRadius:4 }}>{k}</kbd>
              <span style={{ fontSize:11, color:C.muted, fontFamily:C.fontUi }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Notification dropdown ── */
function NotifDropdown({ alerts, onDismiss, onClearAll }) {
  return (
    <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:320,
      background:C.bg2, border:`1px solid ${C.border2}`, borderRadius:12,
      boxShadow:'0 20px 60px rgba(0,0,0,0.7)', zIndex:300, overflow:'hidden',
      animation:'ahIn 0.14s ease', fontFamily:C.fontUi }}>
      <div style={{ padding:'12px 14px', borderBottom:`1px solid ${C.border}`,
        display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:13, fontWeight:600, color:C.text }}>Notifications</span>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {alerts.length > 0 && <span style={{ fontSize:11, fontFamily:C.fontMono, color:C.accent }}>{alerts.length} active</span>}
          {alerts.length > 0 && (
            <button onClick={onClearAll} style={{
              fontFamily:C.fontMono, fontSize:9, letterSpacing:1, padding:'3px 9px',
              background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.3)',
              color:C.red, borderRadius:5, cursor:'pointer', transition:'all 0.14s',
            }}>CLEAR ALL</button>
          )}
        </div>
      </div>
      {alerts.length === 0
        ? <div style={{ padding:'28px 14px', textAlign:'center', fontSize:13, color:C.muted }}>All clear ✓</div>
        : alerts.map((a, i) => (
          <div key={i} style={{ display:'flex', gap:10, padding:'11px 14px',
            borderBottom:`1px solid ${C.border}`, alignItems:'flex-start' }}>
            <span style={{ fontSize:16, flexShrink:0 }}>{a.icon}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:500, color:C.text, marginBottom:2 }}>{a.title}</div>
              <div style={{ fontSize:11, color:C.muted, lineHeight:1.5 }}>{a.msg}</div>
            </div>
            <button onClick={() => onDismiss(i)} style={{ background:'none', border:'none',
              color:C.muted, cursor:'pointer', fontSize:13, padding:2, flexShrink:0, opacity:0.6 }}>✕</button>
          </div>
        ))
      }
    </div>
  )
}

/* ── Breadcrumb ── */
const PAGE_LABELS = {
  home:'Dashboard', content:'Content Hub', posts:'Posts', editor:'New Post', media:'Media',
  themes:'Theme Library', theme:'Theme Library', framework:'Theme Library',
  communications:'Communications', contacts:'Contacts', staff:'Staff', forum:'Forum',
  chat:'Chat', newsletter:'Newsletter', db:'Database', delivery:'Mail & CDN', mail:'Mail',
  cdn:'CDN', backup:'Backup', audit:'Audit Log', settings:'Settings',
  siteSettings:'Settings', announcements:'Announcements', helpdesk:'Help Desk',
  stats:'Analytics', changelog:'Changelog',
}

function Breadcrumb({ view }) {
  const label = PAGE_LABELS[view] || view
  const seg = { fontSize:13, color:C.muted, fontFamily:C.fontUi }
  const div = { color:'rgba(255,255,255,0.2)', fontSize:13, margin:'0 4px' }
  return (
    <div style={{ display:'flex', alignItems:'center' }}>
      <Link to="/" style={{ ...seg, textDecoration:'none', transition:'color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.color = C.text}
        onMouseLeave={e => e.currentTarget.style.color = C.muted}>aifazi.net</Link>
      <span style={div}>/</span>
      <span style={seg}>Admin</span>
      <span style={div}>/</span>
      <span style={{ fontSize:13, color:C.text, fontWeight:500, fontFamily:C.fontUi }}>{label}</span>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────────────────────────────────────── */
export default function AdminHeader({ view, setView, onLogout, sidebarCollapsed, onToggleSidebar }) {
  const username = getUsername()
  const role = getRole()
  const [stats, setStats] = useState({ visitors:'—', posts:'—', msgs:'—' })

  // #16 — Persistent notifications: load from localStorage on mount,
  // sync with Supabase admin_notifications table via Realtime
  const STORAGE_KEY = 'admin_alerts_v1'
  const [alerts, setAlerts] = useState(() => {
    try {
      const saved = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
      return saved ? JSON.parse(saved) : [
        { icon: '🟢', title: 'All systems operational', msg: 'API, database, and CDN are running normally.', id: 'init' },
      ]
    } catch { return [{ icon: '🟢', title: 'All systems operational', msg: 'API, database, and CDN are running normally.', id: 'init' }] }
  })

  // Persist alerts to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts)) } catch {}
  }, [alerts])

  // Helper: push a new alert, deduplicating by title
  const pushAlert = (alert) => {
    setAlerts(prev => {
      const filtered = prev.filter(a => a.title !== alert.title)
      return [{ ...alert, id: Date.now().toString() }, ...filtered].slice(0, 12)
    })
  }

  // Supabase Realtime — listen for rows inserted into admin_notifications
  // Required SQL: CREATE TABLE IF NOT EXISTS admin_notifications (
  //   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  //   icon TEXT DEFAULT '🔔',
  //   title TEXT NOT NULL,
  //   msg TEXT,
  //   created_at TIMESTAMPTZ DEFAULT now()
  // );
  // ALTER TABLE admin_notifications REPLICA IDENTITY FULL;
  // ALTER PUBLICATION supabase_realtime ADD TABLE admin_notifications;
  useEffect(() => {
    const sb = getSupabase()
    if (!sb) return
    const channel = sb
      .channel('admin-notifications-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_notifications' }, payload => {
        const row = payload.new
        if (row) pushAlert({ icon: row.icon || '🔔', title: row.title, msg: row.msg || '', id: row.id })
      })
      .subscribe()
    return () => sb.removeChannel(channel)
  }, [])

  /* ── Listen for site-settings-updated and push a notification ── */
  useEffect(() => {
    const SETTING_LABELS = {
      globalTheme:        { icon:'🎨', title:'Theme changed',       fmt: v => `Global theme set to "${v}"` },
      menuStyle:          { icon:'🧩', title:'Menu style updated',   fmt: v => `Menu style → ${v}` },
      notifyStyle:        { icon:'🔔', title:'Notify style updated', fmt: v => `Notification style → ${v}` },
      dialogStyle:        { icon:'💬', title:'Dialog style updated', fmt: v => `Dialog style → ${v}` },
      loadingScreenStyle: { icon:'⏳', title:'Loading screen changed', fmt: v => `Loading screen → ${v}` },
      animationPreset:    { icon:'✨', title:'Animation preset changed', fmt: v => `Animation preset → ${v}` },
      headerStyle:        { icon:'🗂️', title:'Header style updated', fmt: v => `Header → ${v}` },
      footerStyle:        { icon:'📄', title:'Footer style updated', fmt: v => `Footer → ${v}` },
      lockTheme:          { icon:'🔒', title:'Theme lock toggled',   fmt: v => v ? 'Theme is now locked for all visitors' : 'Users can now choose their own theme' },
      siteTitle:          { icon:'🏷️', title:'Site title updated',   fmt: v => `New title: "${v}"` },
      maintenanceMode:    { icon:'🚧', title:'Maintenance mode',     fmt: v => v ? 'Site is now in maintenance mode' : 'Maintenance mode disabled' },
    }
    const handler = e => {
      const detail = e?.detail || {}
      // Direct alert push (e.g. concurrent session conflict)
      if (detail._adminAlert) {
        const a = detail._adminAlert
        pushAlert({ icon: a.icon, title: a.title, msg: a.msg })
        return
      }
      Object.entries(detail).forEach(([key, val]) => {
        const meta = SETTING_LABELS[key]
        if (!meta || val === undefined || val === null) return
        pushAlert({ icon: meta.icon, title: meta.title, msg: meta.fmt(val) })
      })
      const recognized = Object.keys(detail).filter(k => SETTING_LABELS[k])
      if (Object.keys(detail).length > 0 && recognized.length === 0) {
        pushAlert({ icon: '⚙️', title: 'Settings saved', msg: 'Site settings were updated by an admin.' })
      }
      if (Object.keys(detail).length === 0) {
        pushAlert({ icon: '⚙️', title: 'Settings saved', msg: 'Site settings were updated.' })
      }
    }
    window.addEventListener('site-settings-updated', handler)
    return () => window.removeEventListener('site-settings-updated', handler)
  }, [])
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifOpen,  setNotifOpen]  = useState(false)
  const notifRef = useRef(null)
  const accent = ROLE_ACCENT[role] || C.accent

  /* Stats polling — visitor_sessions is fail-closed (migration 022); the count
     is served ONLY by the backend API via service role. No anon-key fallback. */
  const loadVisitors = async () => {
    try {
      const v = await api.get('/admin/stats/visitors/live')
      if (typeof v?.data?.count === 'number') {
        setStats(p => ({ ...p, visitors: v.data.count }))
      }
    } catch {}
  }

  const loadGeneral = async () => {
    try {
      const s = await api.get('/admin/stats')
      if (s?.data) setStats(p => ({
        ...p,
        posts: s.data.counts?.posts?.total   ?? '—',
        msgs:  s.data.counts?.contacts        ?? '—',
      }))
    } catch {}
  }

  useEffect(() => {
    const run = async () => {
      await loadVisitors()
      await loadGeneral()
    }
    run()
  }, [])
  usePausableInterval(loadVisitors, 15000)
  usePausableInterval(loadGeneral, 30000)

  /* ⌘K shortcut */
  useEffect(() => {
    const h = e => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(o => !o) } }
    document.addEventListener('keydown', h); return () => document.removeEventListener('keydown', h)
  }, [])

  /* Close notif on outside click */
  useEffect(() => {
    const h = e => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])

  // Nav handled by Sidebar — no NAV_GROUPS needed in header

  return (
    <>
      <style>{FONTS}</style>

      {/* Accent stripe */}
      <div style={{ height:2, background:`linear-gradient(90deg,transparent,${accent},#22d3ee 50%,${accent},transparent)`, flexShrink:0 }} />

      {/* ── Main header bar ── */}
      <header style={{ height:56, background:C.bg2, borderBottom:`1px solid ${C.border}`,
        display:'flex', alignItems:'center', padding:'0 16px', gap:0, flexShrink:0,
        backdropFilter:'blur(10px)' }}>

        {/* Collapse toggle */}
        {onToggleSidebar && (
          <button onClick={onToggleSidebar} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{ display:'flex', alignItems:'center', justifyContent:'center', width:34, height:34,
              borderRadius:8, background:'transparent', border:'none', cursor:'pointer', color:C.muted,
              transition:'all 0.14s', flexShrink:0, marginRight:10 }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color=C.text }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color=C.muted }}>
            <Icon name={sidebarCollapsed ? 'panelClose' : 'panelOpen'} size={18} />
          </button>
        )}

        {/* Brand */}
        <div style={{ display:'flex', alignItems:'center', gap:10, paddingRight:16,
          borderRight:`1px solid ${C.border}`, alignSelf:'stretch', flexShrink:0 }}>
          <div style={{ width:32, height:32, borderRadius:9, background:`${accent}18`,
            border:`1px solid ${accent}40`, display:'flex', alignItems:'center',
            justifyContent:'center', fontSize:14 }}>
            <Icon name={role === 'moderator' ? 'shield' : 'zap'} size={18} filled />
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:accent, letterSpacing:1.2,
              textTransform:'uppercase', fontFamily:C.fontMono, lineHeight:1.2 }}>
              {role === 'moderator' ? 'Mod Panel' : 'Admin Panel'}
            </div>
            <div style={{ fontSize:10, color:C.muted, fontFamily:C.fontMono, letterSpacing:0.5 }}>
              {username}
            </div>
          </div>
        </div>

        {/* Breadcrumb */}
        <div style={{ paddingLeft:14, paddingRight:14, borderRight:`1px solid ${C.border}`,
          alignSelf:'stretch', display:'flex', alignItems:'center', flexShrink:0 }}>
          <Breadcrumb view={view} />
        </div>

        {/* Live stats — all 4 chips share the same card shape */}
        <div style={{ flex:1, display:'flex', justifyContent:'center', alignItems:'center', gap:4 }}>
          {[
            { label:'VISITORS', value:stats.visitors, color:C.cyan,   bg:'rgba(34,211,238,0.07)',  bd:'rgba(34,211,238,0.18)'  },
            { label:'POSTS',    value:stats.posts,    color:accent,   bg:'rgba(167,139,250,0.07)', bd:'rgba(167,139,250,0.18)' },
            { label:'MESSAGES', value:stats.msgs,     color:C.accent, bg:'rgba(167,139,250,0.07)', bd:'rgba(167,139,250,0.18)' },
          ].map(s => (
            <div key={s.label} style={{ display:'flex', flexDirection:'column', alignItems:'center',
              justifyContent:'center', padding:'4px 14px', height:40, minWidth:72,
              borderRadius:8, background:s.bg, border:`1px solid ${s.bd}` }}>
              <div style={{ fontSize:8, letterSpacing:1, color:C.muted, textTransform:'uppercase',
                fontFamily:C.fontMono, lineHeight:1, marginBottom:2 }}>{s.label}</div>
              <div style={{ fontSize:15, fontWeight:700, color:s.color, fontFamily:C.fontMono,
                lineHeight:1 }}>{s.value}</div>
            </div>
          ))}
          {/* LIVE chip — same height, same border style */}
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 12px', height:40,
            borderRadius:8, background:'rgba(74,222,128,0.07)', border:'1px solid rgba(74,222,128,0.22)' }}>
            <Pulse color={C.green} />
            <span style={{ fontSize:11, color:C.green, fontFamily:C.fontMono,
              fontWeight:700, letterSpacing:1.2 }}>LIVE</span>
          </div>
        </div>

        {/* Right actions */}
        <div style={{ display:'flex', alignItems:'center', gap:2, flexShrink:0 }}>
          <div style={{ padding:'6px 12px', borderRadius:8, background:'rgba(255,255,255,0.03)',
            border:`1px solid ${C.border}`, marginRight:4 }}>
            <LiveClock />
          </div>
          {/* Search button */}
          <button onClick={() => setSearchOpen(true)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8,
              background:'transparent', border:'none', cursor:'pointer', color:C.muted,
              fontSize:13, fontFamily:C.fontUi, transition:'all 0.14s' }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.06)'; e.currentTarget.style.color=C.text }}
            onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color=C.muted }}>
            <Icon name="search" size={15} strokeWidth={1.8} />
            <span>Search</span>
            <kbd style={{ fontSize:10, fontFamily:C.fontMono, color:C.muted, padding:'1px 6px',
              background:'rgba(255,255,255,0.06)', border:`1px solid ${C.border}`, borderRadius:5 }}>⌘K</kbd>
          </button>
          {/* Alerts */}
          <div ref={notifRef} style={{ position:'relative' }}>
            <HBtn icon="bell" label="Alerts" badge={alerts.length} active={notifOpen}
              onClick={() => setNotifOpen(o => !o)} />
            {notifOpen && <NotifDropdown alerts={alerts}
              onDismiss={i => setAlerts(p => p.filter((_,idx) => idx !== i))}
              onClearAll={() => setAlerts([])} />}
          </div>
          <div style={{ width:1, height:20, background:C.border2, margin:'0 4px' }} />
          <HBtn icon="external" label="View Site" onClick={() => window.open('/','_blank')} />
          <HBtn icon="logout" label="Sign out" onClick={onLogout} danger />
        </div>
      </header>

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} setView={setView} />}
    </>
  )
}
