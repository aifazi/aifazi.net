'use client'
import React, { useState } from 'react'

/* ─────────────────────────────────────────────────────────────────────────────
   All colours now use CSS variables so the sidebar responds to theme changes.
   The hardcoded C.* palette has been removed — globals.css drives everything.
───────────────────────────────────────────────────────────────────────────── */
const C = {
  bg:      'var(--bg)',
  bg2:     'var(--bg2)',
  bg3:     'var(--bg3)',
  border:  'var(--border)',
  text:    'var(--text)',
  muted:   'var(--muted)',
  fontUi:  "var(--font-display, 'Inter','Segoe UI',system-ui,sans-serif)",
  fontMono:"var(--font-mono, 'JetBrains Mono','Fira Code',monospace)",
}

const ROLE_META = {
  admin:     { dot:'var(--green)',  bg:'rgba(0,255,136,0.10)',     border:'rgba(0,255,136,0.28)',    label:'Admin'     },
  moderator: { dot:'var(--cyan)',   bg:'rgba(0,212,255,0.10)',     border:'rgba(0,212,255,0.28)',    label:'Moderator' },
  editor:    { dot:'var(--orange)', bg:'rgba(255,107,53,0.10)',    border:'rgba(255,107,53,0.28)',   label:'Editor'    },
  chat:      { dot:'#facc15',       bg:'rgba(250,204,21,0.10)',    border:'rgba(250,204,21,0.28)',   label:'Chat'      },
}

const GROUP_LABELS = {
  OVERVIEW:'Overview', CONTENT:'Content', COMMUNITY:'Community',
  SYSTEM:'System', SUPPORT:'Support', MANAGE:'Manage', MAIN:'General',
  FIVEM:'FiveM',
}

/* ── Single nav item ── */
function NavItem({ item, active, accentDot, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px 10px',
        borderRadius:8, background: active ? 'rgba(var(--green-rgb,0,255,136),0.08)' : hov ? 'rgba(255,255,255,0.04)' : 'transparent',
        border:'none', cursor:'pointer', color: active ? 'var(--green)' : hov ? C.text : C.muted,
        transition:'all 0.14s ease', position:'relative', marginBottom:1 }}>

      {/* Active bar */}
      {active && (
        <span style={{ position:'absolute', left:0, top:'18%', bottom:'18%', width:3,
          borderRadius:'0 3px 3px 0', background:accentDot, boxShadow:`0 0 8px ${accentDot}80` }} />
      )}

      {/* Icon */}
      <span style={{ fontSize:15, lineHeight:1, flexShrink:0, width:22, textAlign:'center',
        filter: active || hov ? 'none' : 'grayscale(40%) opacity(0.55)',
        transition:'filter 0.14s' }}>
        {item.icon}
      </span>

      {/* Label */}
      <span style={{ fontSize:13, fontWeight: active ? 500 : 400, flex:1, textAlign:'left',
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        letterSpacing:0.1, fontFamily:C.fontUi }}>
        {item.label}
      </span>

      {/* Badge */}
      {item.badge != null && (
        <span style={{ fontSize:10, padding:'2px 6px', borderRadius:20,
          background: active ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.06)',
          color: active ? 'var(--green)' : C.muted, fontFamily:C.fontMono,
          border:`1px solid ${active ? 'rgba(0,255,136,0.3)' : C.border}`, flexShrink:0 }}>
          {item.badge}
        </span>
      )}
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────────────────────────────────────── */
export default function Sidebar({ view, setView, navItems, username, role, onLogout, isMobile, open, onClose }) {
  const meta = ROLE_META[role] || ROLE_META.editor
  const initials = username ? username.slice(0, 2).toUpperCase() : '??'

  const grouped = navItems.reduce((acc, item) => {
    const g = item.group || 'MAIN'
    if (!acc[g]) acc[g] = []
    acc[g].push(item)
    return acc
  }, {})

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap')`}</style>

      {/* Mobile backdrop */}
      {isMobile && open && (
        <div onClick={onClose}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:98, backdropFilter:'blur(2px)' }} />
      )}

      <aside style={{
        width:232, flexShrink:0,
        background:C.bg2,
        borderRight:`1px solid ${C.border}`,
        display:'flex', flexDirection:'column',
        ...(isMobile ? {
          position:'fixed', top:44, bottom:0,
          left: open ? 0 : -240, zIndex:99,
          transition:'left 0.26s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: open ? '4px 0 40px rgba(0,0,0,0.7)' : 'none',
        } : {
          position:'relative', height:'100%', overflow:'hidden', minHeight:0,
          flexShrink:0,
        }),
      }}>

        {/* ── User card ── */}
        <div style={{ padding:'14px 14px 12px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {/* Avatar */}
            <div style={{ width:36, height:36, borderRadius:10, background:meta.bg,
              border:`1px solid ${meta.border}`, display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:13, fontWeight:700, color:meta.dot,
              flexShrink:0, fontFamily:C.fontMono }}>
              {initials}
            </div>
            <div style={{ minWidth:0, flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, color:C.text, overflow:'hidden',
                textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:C.fontUi }}>
                {username}
              </div>
              {/* Role pill */}
              <div style={{ display:'inline-flex', alignItems:'center', gap:5, marginTop:3,
                padding:'2px 8px', borderRadius:20, background:meta.bg, border:`1px solid ${meta.border}` }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background:meta.dot,
                  flexShrink:0, boxShadow:`0 0 5px ${meta.dot}` }} />
                <span style={{ fontSize:10, fontWeight:500, color:meta.dot,
                  fontFamily:C.fontMono, letterSpacing:0.5 }}>{meta.label}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Navigation ── */}
        <div style={{ flex:1, overflowY:'auto', padding:'8px 8px 4px',
          scrollbarWidth:'thin', scrollbarColor:`${C.border} transparent` }}>
          {Object.entries(grouped).map(([groupName, items]) => (
            <div key={groupName} style={{ marginBottom:6 }}>
              <div style={{ padding:'8px 10px 4px', fontSize:10, fontWeight:600, letterSpacing:0.8,
                color:'rgba(255,255,255,0.2)', textTransform:'uppercase',
                userSelect:'none', fontFamily:C.fontMono }}>
                {GROUP_LABELS[groupName] || groupName}
              </div>
              {items.map(item => (
                <NavItem key={item.key} item={item} active={view === item.key || item.aliases?.includes(view)}
                  accentDot={meta.dot} onClick={() => { setView(item.key); onClose?.() }} />
              ))}
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{ borderTop:`1px solid ${C.border}`, padding:'6px 8px' }}>
          <div style={{ padding:'4px 10px 8px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:10, color:'rgba(255,255,255,0.18)', fontFamily:C.fontMono }}>aifazi.net</span>
            <span style={{ fontSize:10, color:'rgba(255,255,255,0.12)', fontFamily:C.fontMono }}>v2.0</span>
          </div>
          <button onClick={onLogout}
            style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'9px 10px',
              borderRadius:8, background:'transparent', border:'none', cursor:'pointer',
              color:'#f87171', fontFamily:C.fontUi, fontSize:13, fontWeight:400, transition:'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span style={{ fontSize:15, flexShrink:0, width:22, textAlign:'center' }}>🚪</span>
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
