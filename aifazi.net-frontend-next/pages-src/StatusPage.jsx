'use client'
import { useState, useEffect, useMemo } from 'react'
import api from '@/lib/api'
import { Link } from '@/lib/router-compat'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = 'var(--green)'
const C = 'var(--cyan)'
const R = 'var(--red)'
const O = 'var(--orange)'
const Y = '#ffd700'

const STATUS_META = {
  operational: { label: 'ALL SYSTEMS OPERATIONAL', color: G, icon: '🟢', sub: 'Everything is running normally.' },
  degraded:    { label: 'PARTIAL OUTAGE',         color: O, icon: '🟠', sub: 'Some services are experiencing issues.' },
  outage:      { label: 'MAJOR OUTAGE',           color: R, icon: '🔴', sub: 'Core services are currently unavailable.' },
}

const TYPE_ICONS = { website: '🌐', keyword: '🔍', ping: '📡', port: '🔌', cron: '⏰', dns: '🌍' }

const REFRESH_MS = 30000

function fmtDur(s) {
  if (s == null) return '—'
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`
  return `${(s / 86400).toFixed(1)}d`
}

const timeAgo = ts => {
  if (!ts) return 'never'
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function avg(nums) {
  const v = (nums || []).filter(n => n != null)
  if (!v.length) return null
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length)
}

function UptimeBar({ value, barColor }) {
  const ok = value != null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, value ?? 0))}%`, background: barColor, borderRadius: 3 }} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 9, color: ok ? 'var(--text)' : 'var(--muted)', minWidth: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {ok ? `${value}%` : '—'}
      </span>
    </div>
  )
}

function ServiceRow({ s, mounted }) {
  const isUp = s.status === 'up'
  const isUnknown = s.status === 'unknown'
  const statusColor = isUnknown ? 'var(--muted)' : isUp ? G : R
  const statusLabel = isUnknown ? 'NO DATA' : isUp ? 'OPERATIONAL' : 'DOWN'
  const barColor = isUnknown ? 'var(--border)' : isUp ? G : R

  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', background: 'var(--bg2)',
      marginBottom: 12, transition: 'border-color 0.3s',
      ...(!isUp && !isUnknown ? { borderColor: `${R}55`, background: `linear-gradient(180deg, ${R}08, var(--bg2))` } : {}),
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: `${statusColor}14`, border: `1px solid ${statusColor}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
        }}>{s.custom ? (TYPE_ICONS[s.type] || '🛰️') : '🔹'}</div>

        <div style={{ flex: 1, minWidth: 170 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{s.label}</span>
            {s.custom && (
              <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 1, padding: '2px 8px', background: `${C}0f`, border: `1px solid ${C}30`, color: C, borderRadius: 99 }}>
                {String(s.type || 'monitor').toUpperCase()}
              </span>
            )}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>{s.latency_avg_ms != null ? `avg ${s.latency_avg_ms}ms` : 'no latency data'}</span>
            {s.latency_ms != null && <span>last {s.latency_ms}ms</span>}
            <span>checked {mounted ? timeAgo(s.last_checked) : ''}</span>
          </div>
        </div>

        <span style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: 2, padding: '5px 14px', borderRadius: 999, whiteSpace: 'nowrap',
          background: `${statusColor}1a`, border: `1px solid ${statusColor}55`, color: statusColor, fontWeight: 700,
        }}>
          {!isUp && !isUnknown && <span style={{ animation: 'dotPulse 1.6s infinite', marginRight: 6 }}>●</span>}
          {statusLabel}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px 22px', marginTop: 16 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>UPTIME · 24H</div>
          <UptimeBar value={s.uptime_24h} barColor={barColor} />
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>UPTIME · 7 DAYS</div>
          <UptimeBar value={s.uptime_7d} barColor={barColor} />
        </div>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>UPTIME · 30 DAYS</div>
          <UptimeBar value={s.uptime_30d} barColor={barColor} />
        </div>
      </div>

      {s.detail && s.status !== 'up' && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: R, marginTop: 12, padding: '10px 12px', background: `${R}0a`, border: `1px solid ${R}2e`, borderRadius: 8, wordBreak: 'break-word' }}>
          {s.detail}
        </div>
      )}
    </div>
  )
}

function IncidentTimeline({ incidents, mounted }) {
  if (!incidents || incidents.length === 0) return null
  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: O }}>INCIDENT HISTORY</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>LAST 30 DAYS</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <div style={{ position: 'relative', paddingLeft: 26 }}>
        <div style={{ position: 'absolute', left: 8, top: 6, bottom: 6, width: 1, background: 'var(--border)' }} />
        {incidents.map((inc, i) => (
          <div key={i} style={{ position: 'relative', marginBottom: 14 }}>
            <span style={{
              position: 'absolute', left: -23, top: 12, width: 9, height: 9, borderRadius: '50%',
              background: inc.ongoing ? R : O, boxShadow: inc.ongoing ? `0 0 0 4px ${R}22` : 'none',
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: `1px solid ${inc.ongoing ? `${R}55` : 'var(--border)'}`, borderRadius: 12, background: 'var(--bg2)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12 }}>{inc.ongoing ? '🔴' : '🔶'}</span>
              <div style={{ flex: 1, minWidth: 170 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{inc.label}</div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>
                  {mounted && inc.start ? new Date(inc.start).toLocaleString() : ''}
                  {mounted && inc.end && inc.end !== inc.start ? ` → ${new Date(inc.end).toLocaleTimeString()}` : ''}
                </div>
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: inc.ongoing ? R : 'var(--muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {inc.ongoing ? '◌ ONGOING' : `${fmtDur(inc.duration_s)} DOWN`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function StatusPage({ initialData = null }) {
  const [status, setStatus] = useState(initialData)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!initialData)
  const [mounted, setMounted] = useState(false)
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000)
  const [nowTs, setNowTs] = useState(() => Date.now())

  const load = () => {
    api.get('/monitor/status')
      .then(r => setStatus(r.data))
      .catch(() => setError('Could not load status. The status API may be temporarily unavailable.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const mountTick = setTimeout(() => setMounted(true), 0)
    if (!initialData) load()
    const iv = setInterval(load, REFRESH_MS)
    const tick = setInterval(() => setCountdown(c => (c > 0 ? c - 1 : REFRESH_MS / 1000)), 1000)
    const clock = setInterval(() => setNowTs(Date.now()), 1000)
    return () => { clearTimeout(mountTick); clearInterval(iv); clearInterval(tick); clearInterval(clock) }
  }, [])

  const meta = status ? (STATUS_META[status.overall] || STATUS_META.degraded) : null
  const updated = mounted && status?.generated_at ? new Date(status.generated_at).toLocaleString() : ''
  const updatedAgo = mounted && status?.generated_at ? timeAgo(status.generated_at) : ''
  const svcs = useMemo(() => status?.services || [], [status])
  const upCount = svcs.filter(s => s.status === 'up').length
  const downCount = svcs.filter(s => s.status === 'down').length
  const unknownCount = svcs.filter(s => s.status === 'unknown').length
  const avgLatency = avg(svcs.map(s => s.latency_avg_ms))
  const uptime30 = avg(svcs.map(s => s.uptime_30d))
  const core = svcs.filter(s => !s.custom)
  const custom = svcs.filter(s => s.custom)
  const incidents = useMemo(() => status?.incidents || [], [status])
  const ongoing = incidents.filter(i => i.ongoing).length

  const refreshNow = () => { setCountdown(REFRESH_MS / 1000); load() }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 90 }}>
      {/* Top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'color-mix(in srgb, var(--bg) 88%, transparent)', backdropFilter: 'blur(18px)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: 3, color: 'var(--text)' }}>AIFAZI<span style={{ color: C }}>·STATUS</span></span>
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>AUTO-REFRESH {mounted ? countdown : REFRESH_MS / 1000}s</span>
          <button onClick={refreshNow} style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '6px 12px', cursor: 'pointer',
            background: 'transparent', color: C, border: `1px solid ${C}45`, borderRadius: 8, fontWeight: 700,
          }}>↻ REFRESH</button>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px' }}>
        {/* Hero banner */}
        <div style={{
          marginTop: 36, borderRadius: 18, padding: '34px 28px', textAlign: 'center',
          border: `1px solid ${meta ? `${meta.color}40` : 'var(--border)'}`,
          background: meta
            ? `linear-gradient(180deg, ${meta.color}14, color-mix(in srgb, ${meta.color} 4%, var(--bg2)))`
            : 'var(--bg2)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 4, color: C, marginBottom: 12 }}>LIVE SYSTEM STATUS</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
            {meta && <span style={{ fontSize: 34, lineHeight: 1 }}>{meta.icon}</span>}
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 4vw, 34px)', fontWeight: 800, margin: 0, color: meta?.color || 'var(--text)', textShadow: meta ? `0 0 24px ${meta.color}44` : 'none' }}>
              {loading ? 'CHECKING SYSTEMS…' : meta?.label}
            </h1>
          </div>
          {meta && <p style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', margin: '10px 0 0' }}>{meta.sub}</p>}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px 26px', marginTop: 22, flexWrap: 'wrap', fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>
            <span><strong style={{ color: G, fontSize: 13 }}>{upCount}</strong> operational</span>
            {downCount > 0 && <span><strong style={{ color: R, fontSize: 13 }}>{downCount}</strong> down</span>}
            {unknownCount > 0 && <span><strong style={{ color: 'var(--muted)', fontSize: 13 }}>{unknownCount}</strong> no data</span>}
            <span><strong style={{ color: 'var(--text)', fontSize: 13 }}>{avgLatency ?? '—'}ms</strong> avg response</span>
            <span><strong style={{ color: 'var(--text)', fontSize: 13 }}>{uptime30 ?? '—'}%</strong> 30-day uptime</span>
          </div>
        </div>

        {/* Updated line */}
        <div style={{ textAlign: 'center', fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 14 }}>
          {updated ? `UPDATED ${updated} · ${updatedAgo}` : 'LIVE MONITORING'}
          {ongoing > 0 && <span style={{ color: R, fontWeight: 700 }}> · {ongoing} INCIDENT{ongoing > 1 ? 'S' : ''} ONGOING</span>}
        </div>

        {/* Services */}
        {loading ? (
          <div style={{ display: 'grid', gap: 12, marginTop: 32 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="store-skeleton" style={{ height: 108, borderRadius: 14 }} />
            ))}
          </div>
        ) : error ? (
          <div style={{ marginTop: 32, textAlign: 'center', padding: 44, color: R, fontFamily: MONO, fontSize: 12, border: `1px dashed ${R}55`, borderRadius: 14 }}>
            {error}
            <div style={{ marginTop: 14 }}>
              <button onClick={refreshNow} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '8px 18px', cursor: 'pointer', background: 'transparent', color: C, border: `1px solid ${C}45`, borderRadius: 8 }}>↻ TRY AGAIN</button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: 'var(--text)' }}>MONITORED SERVICES</span>
              <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{svcs.length} TOTAL</span>
            </div>
            {core.map((s, i) => <ServiceRow key={s.name || i} s={s} mounted={mounted} />)}

            {custom.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '30px 0 16px' }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: C }}>CUSTOM CHECKS</span>
                  <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
                {custom.map((s, i) => <ServiceRow key={s.name || i} s={s} mounted={mounted} />)}
              </>
            )}

            <IncidentTimeline incidents={incidents} mounted={mounted} />

            {/* About block */}
            <div style={{ marginTop: 40, border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px', background: 'var(--bg2)' }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: C, marginBottom: 10 }}>ABOUT THIS PAGE</div>
              <p style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, margin: 0 }}>
                This page reflects the health of the core aifazi.net platform — the website, API, database,
                email delivery, game servers and scheduled jobs. Checks run continuously around the clock and
                the status is refreshed automatically every 30 seconds. Uptime percentages cover the last 24
                hours, 7 days and 30 days. When a service misses its consecutive-failure threshold you will be
                alerted, and every outage is recorded here as an incident.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 22, marginTop: 30, flexWrap: 'wrap', fontFamily: MONO, fontSize: 10, letterSpacing: 1 }}>
              <Link to="/" style={{ color: C, textDecoration: 'none' }}>← BACK TO SITE</Link>
              <Link to="https://store.aifazi.net" style={{ color: Y, textDecoration: 'none' }}>STORE</Link>
              <Link to="https://fivem.aifazi.net" style={{ color: G, textDecoration: 'none' }}>FIVEM</Link>
            </div>
          </div>
        )}

        <style>{`
          @keyframes dotPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.25; } }
        `}</style>
      </div>
    </div>
  )
}
