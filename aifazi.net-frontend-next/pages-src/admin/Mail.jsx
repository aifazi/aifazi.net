'use client'
import React, { useEffect, useState } from 'react'
import MailSettings from './MailSettings'
import MailQueue from './MailQueue'
import MailTemplates from './MailTemplates'
import CdnSettings from './CdnSettings'

const C = {
  bg:'var(--bg)', bg2:'var(--bg2)', border:'var(--border)',
  text:'var(--text)', muted:'var(--muted)', cyan:'#22d3ee',
}

const TABS = [
  { key:'settings',  label:'Settings',  icon:'⚙️' },
  { key:'queue',     label:'Queue',     icon:'📬' },
  { key:'templates', label:'Templates', icon:'✉️' },
  { key:'cdn',       label:'CDN',       icon:'☁️' },
]

export default function Mail({ initialTab = 'queue' }) {
  const [tab, setTab] = useState(initialTab)
  useEffect(() => setTab(initialTab), [initialTab])

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <div style={{ fontFamily:"'JetBrains Mono','Fira Code',monospace", fontSize:9, color:C.cyan, letterSpacing:4, marginBottom:6 }}>ADMIN · DELIVERY</div>
        <h2 style={{ fontFamily:"'JetBrains Mono','Fira Code',monospace", fontSize:24, fontWeight:800, margin:0, color:C.text, letterSpacing:1 }}>Mail & CDN</h2>
        <div style={{ fontFamily:"'Inter','Segoe UI',system-ui,sans-serif", fontSize:12, color:C.muted, marginTop:6 }}>
          Outgoing email settings, delivery queue, notification templates, and media delivery configuration.
        </div>
      </div>

      <div style={{ display:'flex', gap:2, background:C.bg2, border:`1px solid ${C.border}`, borderRadius:6, padding:3, marginBottom:24 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            fontFamily:"'JetBrains Mono','Fira Code',monospace", fontSize:10, letterSpacing:1.5,
            padding:'8px 16px', flex:1,
            background: tab===t.key ? '#22d3ee22' : 'transparent',
            color: tab===t.key ? C.cyan : C.muted, border:'none', cursor:'pointer', borderRadius:4,
            transition:'all 0.15s',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'settings'  && <MailSettings />}
      {tab === 'queue'     && <MailQueue />}
      {tab === 'templates' && <MailTemplates />}
      {tab === 'cdn'       && <CdnSettings />}
    </div>
  )
}
