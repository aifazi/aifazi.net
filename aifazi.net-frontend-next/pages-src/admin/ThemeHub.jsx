'use client'
import React, { useState } from 'react'
import ThemeLibrary from './ThemeLibrary'
import { AnnouncementsPanel } from './AdminPanels'
import { SiteSettings } from './SiteSettings'

const C = {
  bg:'var(--bg)', bg2:'var(--bg2)', bg3:'var(--bg3)', border:'var(--border)',
  text:'var(--text)', muted:'var(--muted)', green:'#00ff88', cyan:'#22d3ee',
}

const TABS = [
  { key:'themes',       label:'Themes',       icon:'🎨' },
  { key:'announcements',label:'Announcements', icon:'📢' },
  { key:'settings',     label:'Settings',      icon:'⚙️' },
]

const HEADLINE = {
  themes:       { eyebrow:'ADMIN · THEMES',       title:'Theme Library',      sub:'Site themes, framework styles, backgrounds and animations.' },
  announcements:{ eyebrow:'ADMIN · ANNOUNCEMENTS', title:'Announcements',       sub:'Site-wide banners, alerts and maintenance-style messages.' },
  settings:     { eyebrow:'ADMIN · SITE SETTINGS', title:'Site Settings',       sub:'Identity, social links and the maintenance page.' },
}

export default function ThemeHub({ initialTab = 'themes' }) {
  const [tab, setTab] = useState(TABS.some(t => t.key === initialTab) ? initialTab : 'themes')
  const head = HEADLINE[tab] || HEADLINE.themes

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily:"'JetBrains Mono','Fira Code',monospace", fontSize:9, color:C.cyan, letterSpacing:4, marginBottom:6 }}>{head.eyebrow}</div>
        <h2 style={{ fontFamily:"'JetBrains Mono','Fira Code',monospace", fontSize:24, fontWeight:800, margin:0, color:C.text, letterSpacing:1 }}>{head.title}</h2>
        <div style={{ fontFamily:"'Inter','Segoe UI',system-ui,sans-serif", fontSize:12, color:C.muted, marginTop:6 }}>{head.sub}</div>
      </div>

      {/* Segmented switch */}
      <div style={{ display:'flex', gap:3, background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, padding:4, marginBottom:24, maxWidth:460 }}>
        {TABS.map(t => {
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)} role="tab" aria-selected={active}
              style={{
                fontFamily:"'JetBrains Mono','Fira Code',monospace", fontSize:10, letterSpacing:1.5,
                padding:'9px 16px', flex:1, border:'none', cursor:'pointer', borderRadius:7,
                background: active ? C.green : 'transparent',
                color: active ? '#000' : C.muted, fontWeight: active ? 800 : 400,
                transition:'all 0.16s', display:'flex', alignItems:'center', justifyContent:'center', gap:7,
              }}>
              <span style={{ fontSize:12 }}>{t.icon}</span>{t.label}
            </button>
          )
        })}
      </div>

      {tab === 'themes'       && <ThemeLibrary />}
      {tab === 'announcements' && <AnnouncementsPanel />}
      {tab === 'settings'     && <SiteSettings />}
    </div>
  )
}
