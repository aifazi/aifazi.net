'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { Link } from '@/lib/router-compat'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = 'var(--green)'
const C = 'var(--cyan)'
const R = 'var(--red)'
const O = 'var(--orange)'

const STATUS_META = {
  operational: { label: 'ALL SYSTEMS OPERATIONAL', color: G, icon: '🟢' },
  degraded:    { label: 'PARTIAL OUTAGE',         color: O, icon: '🟠' },
  outage:      { label: 'MAJOR OUTAGE',           color: R, icon: '🔴' },
}

function ServiceRow({ s }) {
  const isUp = s.status === 'up'
  const isUnknown = s.status === 'unknown'
  const statusColor = isUnknown ? 'var(--muted)' : isUp ? G : R
  const statusLabel = isUnknown ? 'NO DATA' : isUp ? 'OPERATIONAL' : 'DOWN'
  const barColor = isUnknown ? 'var(--border)' : isUp ? G : R
  const uptime = s.uptime_24h == null ? '—' : `${s.uptime_24h}%`

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', background: 'var(--bg2)', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: statusColor, animation: isUp ? 'dotPulse 2s infinite' : 'none' }}>●</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 140 }}>{s.label}</span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
          {s.latency_ms != null ? `${s.latency_ms}ms` : '—'}
        </span>
        <span style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: 2, padding: '4px 12px', borderRadius: 999,
          background: `${statusColor}1a`, border: `1px solid ${statusColor}55`, color: statusColor, fontWeight: 700,
        }}>{statusLabel}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180, height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${s.uptime_24h ?? 0}%`, background: barColor, borderRadius: 2 }} />
        </div>
        <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>
          {uptime} UPTIME · 24H
        </span>
      </div>
      {s.detail && s.status !== 'up' && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: R, marginTop: 10 }}>{s.detail}</div>
      )}
    </div>
  )
}

export default function StatusPage() {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    api.get('/monitor/status')
      .then(r => setStatus(r.data))
      .catch(() => setError('Could not load status.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(); const iv = setInterval(load, 30000); return () => clearInterval(iv) }, [])

  const meta = status ? (STATUS_META[status.overall] || STATUS_META.degraded) : null
  const updated = status?.generated_at ? new Date(status.generated_at).toLocaleString() : ''

  return (
    <div style={{ minHeight: '100vh', padding: '60px 20px 80px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 4, color: C, marginBottom: 10 }}>AIFAZI.NET · SYSTEM STATUS</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 800, color: 'var(--text)', margin: '0 0 8px' }}>
            {loading ? 'Checking systems…' : meta?.label}
          </h1>
          <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)' }}>
            {updated ? `Updated ${updated}` : 'Live monitoring'}
          </p>
        </div>

        {/* Overall pill */}
        {!loading && meta && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 22px', borderRadius: 999,
              background: `${meta.color}12`, border: `1px solid ${meta.color}45`, color: meta.color,
              fontFamily: MONO, fontSize: 10, letterSpacing: 2, fontWeight: 700,
            }}>
              <span style={{ fontSize: 14 }}>{meta.icon}</span>{meta.label}
            </div>
          </div>
        )}

        {/* Services */}
        {loading ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="store-skeleton" style={{ height: 76, borderRadius: 12 }} />
            ))}
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 40, color: R, fontFamily: MONO, fontSize: 12 }}>{error}</div>
        ) : (
          <div>
            {(status?.services || []).map(s => <ServiceRow key={s.name} s={s} />)}
            <div style={{ textAlign: 'center', marginTop: 28 }}>
              <Link to="/" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: C, textDecoration: 'none' }}>← BACK TO SITE</Link>
            </div>
          </div>
        )}

        <style>{`
          @keyframes dotPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        `}</style>
      </div>
    </div>
  )
}
