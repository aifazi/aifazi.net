'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { EditableText } from '../context/EditContext'

const STATUSES = [
  { key: 'available',    label: 'Available for Work',  color: 'var(--green)', pulse: true  },
  { key: 'busy',         label: 'Currently Busy',      color: 'var(--orange)', pulse: false },
  { key: 'project',      label: 'In a Project',        color: 'var(--cyan)', pulse: true  },
  { key: 'unavailable',  label: 'Not Available',       color: 'var(--red)', pulse: false },
]

function StatusLabel({ status }) {
  return (
    <EditableText
      contentKey={`status.${status.key}.label`}
      defaultValue={status.label}
    />
  )
}

// ── Admin control widget (shown only to admins in admin panel) ────────────────
export function StatusAdmin() {
  const [current, setCurrent] = useState('available')
  useEffect(() => {
    setCurrent(localStorage.getItem('site-status') || 'available')
  }, [])
  const [saving, setSaving]   = useState(false)

  const set = async (key) => {
    setSaving(true)
    // Save to localStorage as a simple solution (no backend needed)
    localStorage.setItem('site-status', key)
    // Optionally persist to backend via content API
    try {
      await api.patch('/content/status', { status: key })
    } catch {
      // Backend endpoint optional — localStorage fallback works
    }
    setCurrent(key)
    setSaving(false)
    window.dispatchEvent(new CustomEvent('status-change', { detail: key }))
  }

  return (
    <div style={{ padding: 20, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 12 }}>
        AVAILABILITY STATUS
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STATUSES.map(s => (
          <button
            key={s.key}
            onClick={() => set(s.key)}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', background: current === s.key ? `color-mix(in srgb, ${s.color} 10%, transparent)` : 'var(--bg3)',
              border: `1px solid ${current === s.key ? s.color : 'var(--border)'}`,
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: s.color,
              flexShrink: 0, animation: current === s.key && s.pulse ? 'statusPulse 1.5s infinite' : 'none',
            }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: current === s.key ? s.color : 'var(--muted)', letterSpacing: 1 }}>
              {s.label.toUpperCase()}
            </span>
            {current === s.key && (
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: s.color }}>● ACTIVE</span>
            )}
          </button>
        ))}
      </div>
      <style>{`@keyframes statusPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.3)} }`}</style>
    </div>
  )
}

// ── Public badge (shown in hero / navbar) ─────────────────────────────────────
export default function StatusBadge({ size = 'sm' }) {
  const [statusKey, setStatusKey] = useState('available')

  useEffect(() => {
    setStatusKey(localStorage.getItem('site-status') || 'available')
  }, [])

  useEffect(() => {
    const handler = (e) => setStatusKey(e.detail || 'available')
    window.addEventListener('status-change', handler)
    return () => window.removeEventListener('status-change', handler)
  }, [])

  const status = STATUSES.find(s => s.key === statusKey) || STATUSES[0]

  if (size === 'lg') return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '6px 14px',
      background: `color-mix(in srgb, ${status.color} 10%, transparent)`,
      border: `1px solid color-mix(in srgb, ${status.color} 40%, transparent)`,
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: status.color,
        animation: status.pulse ? 'statusPulse 1.5s infinite' : 'none',
        flexShrink: 0,
      }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: status.color, letterSpacing: 2, textTransform: 'uppercase' }}>
        <StatusLabel status={status} />
      </span>
      <style>{`@keyframes statusPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.4)} }`}</style>
    </div>
  )

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }} title={status.label}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: status.color,
        animation: status.pulse ? 'statusPulse 1.5s infinite' : 'none',
      }} />
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: status.color, letterSpacing: 1, textTransform: 'uppercase' }}>
        <StatusLabel status={status} />
      </span>
      <style>{`@keyframes statusPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.4)} }`}</style>
    </div>
  )
}
