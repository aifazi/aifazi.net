'use client'
import React, { useState } from 'react'
import { Icon, NAV_ICONS } from './icons'

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   All colours use CSS variables so the sidebar responds to theme changes.
   Supports a collapsed rail (icon-only) on desktop, drawer on mobile.
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const C = {
  bg:      'var(--bg)',
  bg2:     'var(--bg2)',
  bg3:     'var(--bg3)',
  border:  'var(--border)',
  text:    'var(--text)',
  muted:   'var(--muted)',
  accent:  'var(--accent, #a78bfa)',
  fontUi:  "var(--font-display, 'Inter','Segoe UI',system-ui,sans-serif)",
  fontMono:"var(--font-mono, 'JetBrains Mono','Fira Code',monospace)",
}

const ROLE_META = {
  admin:     { dot:'var(--green)',  bg:'color-mix(in srgb, var(--green) 10%, transparent)',     border:'color-mix(in srgb, var(--green) 28%, transparent)',    label:'Admin'     },
  moderator: { dot:'var(--cyan)',   bg:'color-mix(in srgb, var(--cyan) 10%, transparent)',     border:'color-mix(in srgb, var(--cyan) 28%, transparent)',    label:'Moderator' },
  editor:    { dot:'var(--orange)', bg:'rgba(255,107,53,0.10)',    border:'rgba(255,107,53,0.28)',   label:'Editor'    },
  chat:      { dot:'#facc15',       bg:'rgba(250,204,21,0.10)',    border:'rgba(250,204,21,0.28)',   label:'Chat'      },
}

const GROUP_LABELS = {
  OVERVIEW:'Overview', CONTENT:'Content', COMMUNITY:'Community',
  SYSTEM:'System', SUPPORT:'Support', MANAGE:'Manage', MAIN:'General',
  BUSINESS:'Business', FIVEM:'FiveM',
}

const NAV_ICON = item => NAV_ICONS[item.key] || NAV_ICONS[item.icon] || 'grid'

/* â”€â”€ Single nav item â”€â”€ */
function NavItem({ item, active, accentDot, onClick, collapsed }) {
  const [hov, setHov] = useState(false)
  const iconName = NAV_ICON(item)
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      title={collapsed ? item.label : undefined}
      style={{ position:'relative', display:'flex', alignItems:'center', gap:10,
        width:'100%', padding: collapsed ? '10px 0' : '8px 10px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius:8, background: active ? 'rgba(var(--green-rgb,0,255,136),0.08)' : hov ? 'rgba(255,255,255,0.04)' : 'transparent',
        border:'none', cursor:'pointer', color: active ? 'var(--green)' : hov ? C.text : C.muted,
        transition:'all 0.14s ease', marginBottom:1 }}>
      {/* Active bar */}
      {active && !collapsed && (
        <span style={{ position:'absolute', left:0, top:'18%', bottom:'18%', width:3,
          borderRadius:'0 3px 3px 0', background:accentDot, boxShadow:`0 0 8px ${accentDot}80` }} />
      )}
      {active && collapsed && (
        <span style={{ position:'absolute', left:0, top:'18%', bottom:'18%', width:2.5,
          borderRadius:'0 3px 3px 0', background:accentDot, boxShadow:`0 0 8px ${accentDot}80` }} />
      )}

      {/* Icon */}
      <Icon name={iconName} size={18} strokeWidth={active ? 2.1 : 1.7}
        style={{ filter: active || hov ? 'none' : 'grayscale(30%) opacity(0.55)', transition:'filter 0.14s' }} />

      {/* Label */}
      {!collapsed && (
        <span style={{ fontSize:13, fontWeight: active ? 500 : 400, flex:1, textAlign:'left',
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          letterSpacing:0.1, fontFamily:C.fontUi }}>
          {item.label}
        </span>
      )}

      {/* Badge */}
      {!collapsed && item.badge != null && (
        <span style={{ fontSize:10, padding:'2px 6px', borderRadius:20,
          background: active ? 'color-mix(in srgb, var(--green) 15%, transparent)' : 'rgba(255,255,255,0.06)',
          color: active ? 'var(--green)' : C.muted, fontFamily:C.fontMono,
          border:`1px solid ${active ? 'color-mix(in srgb, var(--green) 30%, transparent)' : C.border}`, flexShrink:0 }}>
          {item.badge}
        </span>
      )}

      {/* Collapsed badge â†’ dot */}
      {collapsed && item.badge != null && (
        <span style={{ position:'absolute', top:8, right:12, width:6, height:6, borderRadius:'50%',
          background:'var(--green)', boxShadow:'0 0 6px color-mix(in srgb, var(--green) 70%, transparent)' }} />
      )}
    </button>
  )
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   MAIN EXPORT
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export default function Sidebar({ view, setView, navItems, username, role, onLogout, isMobile, open, onClose, collapsed }) {
  const meta = ROLE_META[role] || ROLE_META.editor
  const initials = username ? username.slice(0, 2).toUpperCase() : '??'

  const grouped = navItems.reduce((acc, item) => {
    const g = item.group || 'MAIN'
    if (!acc[g]) acc[g] = []
    acc[g].push(item)
    return acc
  }, {})

  const width = collapsed ? 64 : 232

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
@keyframes ahIn{from{opacity:0;transform:translateY(-8px) scale(0.98)}to{opacity:1;transform:none}}`}</style>

      {/* Mobile backdrop */}
      {isMobile && open && (
        <div onClick={onClose}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:98, backdropFilter:'blur(2px)' }} />
      )}

      <aside style={{
        width, flexShrink:0,
        background:C.bg2,
        borderRight:`1px solid ${C.border}`,
        display:'flex', flexDirection:'column',
        ...(isMobile ? {
          position:'fixed', top:44, bottom:0,
          left: open ? 0 : -(width + 8), zIndex:99,
          transition:'left 0.26s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: open ? '4px 0 40px rgba(0,0,0,0.7)' : 'none',
        } : {
          position:'relative', height:'100%', overflow:'hidden', minHeight:0,
          flexShrink:0,
          transition:'width 0.24s cubic-bezier(0.4,0,0.2,1)',
        }),
      }}>

        {/* â”€â”€ User card â”€â”€ */}
        <div style={{ padding: collapsed ? '14px 0' : '14px 14px 12px', borderBottom:`1px solid ${C.border}` }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, justifyContent: collapsed ? 'center' : 'flex-start' }}>
            {/* Avatar */}
            <div style={{ width:36, height:36, borderRadius:10, background:meta.bg,
              border:`1px solid ${meta.border}`, display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:13, fontWeight:700, color:meta.dot,
              flexShrink:0, fontFamily:C.fontMono }}>
              {initials}
            </div>
            {!collapsed && (
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
            )}
          </div>
        </div>

        {/* â”€â”€ Navigation â”€â”€ */}
        <div style={{ flex:1, overflowY:'auto', overflowX:'visible', padding: collapsed ? '8px 0' : '8px 8px 4px',
          scrollbarWidth:'thin', scrollbarColor:`${C.border} transparent` }}>
          {Object.entries(grouped).map(([groupName, items]) => (
            <div key={groupName} style={{ marginBottom:6 }}>
              {!collapsed && (
                <div style={{ padding:'8px 10px 4px', fontSize:10, fontWeight:600, letterSpacing:0.8,
                  color:'rgba(255,255,255,0.2)', textTransform:'uppercase',
                  userSelect:'none', fontFamily:C.fontMono }}>
                  {GROUP_LABELS[groupName] || groupName}
                </div>
              )}
              {collapsed && (
                <div style={{ height:8, margin:'0 16px 4px', borderBottom:`1px solid ${C.border}`, opacity:0.5 }} />
              )}
              {items.map(item => (
                <NavItem key={item.key} item={item} active={view === item.key || item.aliases?.includes(view)}
                  accentDot={meta.dot} collapsed={collapsed} onClick={() => { setView(item.key); onClose?.() }} />
              ))}
            </div>
          ))}
        </div>

        {/* â”€â”€ Footer â”€â”€ */}
        <div style={{ borderTop:`1px solid ${C.border}`, padding:'6px 8px' }}>
          {!collapsed && (
            <div style={{ padding:'4px 10px 8px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:10, color:'rgba(255,255,255,0.18)', fontFamily:C.fontMono }}>aifazi.net</span>
              <span style={{ fontSize:10, color:'rgba(255,255,255,0.12)', fontFamily:C.fontMono }}>v2.0</span>
            </div>
          )}
          <button onClick={onLogout}
            style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'9px 10px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius:8, background:'transparent', border:'none', cursor:'pointer',
              color:'#f87171', fontFamily:C.fontUi, fontSize:13, fontWeight:400, transition:'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(248,113,113,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <Icon name="logout" size={17} strokeWidth={1.8} />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
