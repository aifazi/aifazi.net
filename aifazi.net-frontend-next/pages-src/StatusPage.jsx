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

const TYPE_ICONS = { website: '🌐', keyword: '🔍', ping: '📡', port: '🔌', cron: '⏰', dns: '🌍' }

function fmtDur(s) {
  if (s == null) return '—'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`
  return `${(s / 86400).toFixed(1)}d`
}
const timeAgo = ts => {
  if (!ts) return ''
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function UptimePill({ label, value, barColor }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 96 }}>
      <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 3, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${value ?? 0}%`, background: barColor, borderRadius: 2 }} />
        </div>
        <span style={{ fontFamily: MONO, fontSize: 9, color: value == null ? 'var(--muted)' : 'var(--text)', minWidth: 44, textAlign: 'right' }}>
          {value == null ? '—' : `${value}%`}
        </span>
      </div>
    </div>
  )
}

function ServiceRow({ s }) {
  const isUp = s.status === 'up'
  const isUnknown = s.status === 'unknown'
  const statusColor = isUnknown ? 'var(--muted)' : isUp ? G : R
  const statusLabel = isUnknown ? 'NO DATA' : isUp ? 'OPERATIONAL' : 'DOWN'
  const barColor = isUnknown ? 'var(--border)' : isUp ? G : R

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', background: 'var(--bg2)', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, flexShrink: 0 }}>{s.custom ? (TYPE_ICONS[s.type] || '🛰️') : '🔹'}</span>
        <span style={{ fontSize: 10, color: statusColor, animation: isUp ? 'dotPulse 2s infinite' : 'none' }}>●</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 140 }}>
          {s.label}
          {s.custom && <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 1, marginLeft: 8, padding: '2px 7px', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.25)', color: C, borderRadius: 99 }}>{s.type.toUpperCase()}</span>}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
          {s.latency_avg_ms != null ? `${s.latency_avg_ms}ms avg` : '—'}
        </span>
        <span style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: 2, padding: '4px 12px', borderRadius: 999,
          background: `${statusColor}1a`, border: `1px solid ${statusColor}55`, color: statusColor, fontWeight: 700,
        }}>{statusLabel}</span>
      </div>
      <div style={{ display: 'flex', gap: 24, marginTop: 12, flexWrap: 'wrap' }}>
        <UptimePill label="24H" value={s.uptime_24h} barColor={barColor} />
        <UptimePill label="7D" value={s.uptime_7d} barColor={barColor} />
        <UptimePill label="30D" value={s.uptime_30d} barColor={barColor} />
        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 1 }}>
          <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 1, color: 'var(--muted)' }}>
            {s.last_checked ? `LAST CHECK ${timeAgo(s.last_checked)}` : 'NO CHECKS YET'}
          </span>
        </div>
      </div>
      {s.detail && s.status !== 'up' && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: R, marginTop: 10 }}>{s.detail}</div>
      )}
    </div>
  )
}

function IncidentsSection({ incidents }) {
  if (!incidents || incidents.length === 0) return null
  return (
    <div style={{ marginTop: 34 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: O, marginBottom: 14 }}>⚠ RECENT INCIDENTS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {incidents.map((inc, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg2)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12 }}>{inc.ongoing ? '🔴' : '🔶'}</span>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{inc.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>
                {inc.start ? new Date(inc.start).toLocaleString() : ''}
                {inc.end && inc.end !== inc.start ? ` → ${new Date(inc.end).toLocaleTimeString()}` : ''}
              </div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: inc.ongoing ? R : 'var(--muted)', fontWeight: 700 }}>
              {inc.ongoing ? 'ONGOING' : `${fmtDur(inc.duration_s)} DOWN`}
            </div>
          </div>
        ))}
      </div>
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
  const svcs = status?.services || []
  const upCount = svcs.filter(s => s.status === 'up').length
  const downCount = svcs.filter(s => s.status === 'down').length

  return (
    <div style={{ minHeight: '100vh', padding: '60px 20px 80px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>
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

        {/* Overall pill + counters */}
        {!loading && meta && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 28, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 22px', borderRadius: 999,
              background: `${meta.color}12`, border: `1px solid ${meta.color}45`, color: meta.color,
              fontFamily: MONO, fontSize: 10, letterSpacing: 2, fontWeight: 700,
            }}>
              <span style={{ fontSize: 14 }}>{meta.icon}</span>{meta.label}
            </div>
            {!error && (
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: 'var(--muted)' }}>
                {upCount}/{svcs.length} UP{downCount > 0 ? ` · ${downCount} DOWN` : ''}
              </div>
            )}
          </div>
        )}

        {/* Services */}
        {loading ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="store-skeleton" style={{ height: 84, borderRadius: 12 }} />
            ))}
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 40, color: R, fontFamily: MONO, fontSize: 12 }}>{error}</div>
        ) : (
          <div>
            {svcs.map(s => <ServiceRow key={s.name} s={s} />)}
            <IncidentsSection incidents={status?.incidents} />
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
