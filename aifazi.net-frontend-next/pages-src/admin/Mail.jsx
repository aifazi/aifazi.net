'use client'
import React, { useEffect, useState } from 'react'
import MailSettings from './MailSettings'
import MailQueue from './MailQueue'
import MailTemplates from './MailTemplates'
import CdnSettings from './CdnSettings'
import { PageHeader } from './shared'
import { Icon } from './icons'

const TABS = [
  { key: 'settings',  label: 'Settings',  icon: 'dots' },
  { key: 'queue',     label: 'Queue',     icon: 'mail' },
  { key: 'templates', label: 'Templates', icon: 'clipboard' },
  { key: 'cdn',       label: 'CDN',       icon: 'database' },
]

export default function Mail({ initialTab = 'queue' }) {
  const [tab, setTab] = useState(initialTab)
  useEffect(() => setTab(initialTab), [initialTab])

  return (
    <div>
      <PageHeader
        eyebrow="ADMIN · DELIVERY"
        title="Mail & CDN"
        subtitle="Outgoing email settings, delivery queue, notification templates, and media delivery configuration."
      />

      <div style={{ display: 'flex', gap: 3, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, marginBottom: 24, maxWidth: 560 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.5,
            padding: '9px 16px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            background: tab === t.key ? 'var(--green)' : 'transparent',
            color: tab === t.key ? '#000' : 'var(--muted)', border: 'none', cursor: 'pointer', borderRadius: 8,
            transition: 'all 0.15s', fontWeight: tab === t.key ? 700 : 400,
          }}>
            <Icon name={t.icon} size={15} strokeWidth={1.8} />
            {t.label}
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
