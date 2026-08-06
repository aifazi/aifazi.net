'use client'
/**
 * FiveMStatus.jsx
 * Smart server status widget with 4 visual states:
 *   ONLINE | DEGRADED | OFFLINE | MAINTENANCE
 *
 * Usage:
 *   import FiveMStatus from '@/components/FiveMStatus'
 *   <FiveMStatus />              // compact widget
 *   <FiveMStatus expanded />     // expanded with uptime / resources
 *   <FiveMStatus adminMode />    // shows dev override controls (admin only)
 */
import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from './Toast'

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  online:      { color: 'var(--green)',  label: 'ONLINE',      pulse: true,  glow: 'color-mix(in srgb, var(--green) 35%, transparent)' },
  degraded:    { color: 'var(--orange)', label: 'DEGRADED',    pulse: true,  glow: 'color-mix(in srgb, var(--orange) 35%, transparent)' },
  offline:     { color: 'var(--red)',    label: 'OFFLINE',     pulse: false, glow: 'color-mix(in srgb, var(--red) 20%, transparent)' },
  maintenance: { color: 'var(--cyan)',   label: 'MAINTENANCE', pulse: false, glow: 'color-mix(in srgb, var(--cyan) 30%, transparent)' },
  loading:     { color: 'var(--muted)',  label: 'LOADING…',    pulse: true,  glow: 'transparent'           },
}

const POLL_INTERVAL_MS = 30000   // re-fetch every 30 s

// ── Tiny icon helpers ─────────────────────────────────────────────────────────
function Dot({ color, pulse }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, flexShrink: 0,
      boxShadow: `0 0 8px ${color}`,
      animation: pulse ? 'statusDot 1.8s ease-in-out infinite' : 'none',
    }} />
  )
}

function StatBlock({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 2, marginTop: 3 }}>
        {label}
      </div>
    </div>
  )
}
export default function FiveMStatus({ expanded = false, adminMode = false }) {
  const toast = useToast()
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [overriding, setOverriding] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/fivem/status')
      setData(res.data)
    } catch {
      setData(prev => prev ? { ...prev, _fetchError: true } : null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const timer = setInterval(fetchStatus, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [fetchStatus])

  const setOverride = async (override) => {
    setOverriding(true)
    try {
      await api.patch('/fivem/dev-override', { override })
      await fetchStatus()
    } catch (e) {
      toast.error(e?.response?.data?.detail || e.message || 'Override failed', { title: 'FiveM Override' })
    } finally {
      setOverriding(false)
    }
  }

  const status = loading ? 'loading' : (data?.status || 'offline')
  const cfg    = STATUS_CONFIG[status] || STATUS_CONFIG.offline

  // ── Bar colour ─────────────────────────────────────────────────────────────
  const barGradient =
    status === 'online'      ? 'linear-gradient(90deg, var(--green), var(--cyan))' :
    status === 'degraded'    ? 'linear-gradient(90deg, var(--orange), color-mix(in srgb, var(--orange) 60%, white))' :
    status === 'maintenance' ? 'linear-gradient(90deg, var(--cyan), var(--purple))' :
                               'linear-gradient(90deg, var(--red), color-mix(in srgb, var(--red) 60%, black))'

  return (
    <div style={{
      background: 'var(--bg2)', border: `1px solid ${cfg.color}33`,
      borderRadius: 4, overflow: 'hidden',
      boxShadow: `0 0 20px ${cfg.glow}`,
      transition: 'box-shadow 0.4s ease, border-color 0.4s ease',
    }}>
      {/* Accent bar */}
      <div style={{ height: 2, background: barGradient }} />

      {/* Main row */}
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* Dot + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto' }}>
          <Dot color={cfg.color} pulse={cfg.pulse} />
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: cfg.color }}>
              {cfg.label}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1, marginTop: 2, maxWidth: 280 }}>
              {loading ? 'Fetching server data…' : (data?.display_message || 'Unknown')}
            </div>
          </div>
        </div>

        {/* Player count pill */}
        {!loading && data && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 3,
            background: `${cfg.color}12`, border: `1px solid ${cfg.color}33`,
            flexShrink: 0,
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: cfg.color }}>
              {data.players_online}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>
              / {data.max_players} PLAYERS
            </span>
          </div>
        )}

        {/* Last seen label */}
        {!loading && data?.last_seen_label && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1, flexShrink: 0 }}>
            {data.last_seen_label}
          </div>
        )}
      </div>
      {/* Expanded stats */}
      {expanded && !loading && data && (
        <div style={{ padding: '0 18px 14px' }}>
          <div style={{ height: 1, background: 'var(--border)', marginBottom: 14 }} />
          <div style={{ display: 'flex', gap: 0 }}>
            <StatBlock label="UPTIME"      value={data.uptime_label || '—'}      color={cfg.color} />
            <div style={{ width: 1, background: 'var(--border)' }} />
            <StatBlock label="RESOURCES"   value={data.resource_count || '—'}    color="var(--cyan)" />
            <div style={{ width: 1, background: 'var(--border)' }} />
            <StatBlock label="PEAK TODAY"  value={data.peak_players  || 0}       color="var(--orange)" />
            <div style={{ width: 1, background: 'var(--border)' }} />
            <StatBlock label="MAX SLOTS"   value={data.max_players   || 48}      color="var(--muted)" />
          </div>
          {data.server_name && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1, textAlign: 'center', marginTop: 10 }}>
              {data.server_name}
            </div>
          )}
        </div>
      )}

      {/* Admin: dev override panel */}
      {adminMode && !loading && (
        <div style={{ padding: '0 18px 14px' }}>
          {!expanded && <div style={{ height: 1, background: 'var(--border)', marginBottom: 12 }} />}
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 8 }}>
            DEV OVERRIDE {data?.dev_override ? <span style={{ color: 'var(--orange)' }}>({data.dev_override.toUpperCase()})</span> : <span style={{ color: '#2a3a48' }}>INACTIVE</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { label: '⚡ FORCE ONLINE',    value: 'force_online', color: '#00ff88' },
              { label: '🔧 MAINTENANCE',      value: 'maintenance',  color: '#00d4ff' },
              { label: '✕ CLEAR OVERRIDE',   value: null,           color: '#4a6070' },
            ].map(({ label, value, color }) => {
              const active = data?.dev_override === value
              return (
                <button key={label}
                  onClick={() => setOverride(value)}
                  disabled={overriding || active}
                  style={{
                    flex: '1 1 0', padding: '7px 10px', cursor: active || overriding ? 'default' : 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
                    background: active ? `${color}20` : 'transparent',
                    border: `1px solid ${active ? color : 'var(--border)'}`,
                    color: active ? color : 'var(--muted)',
                    borderRadius: 4, transition: 'all 0.2s',
                    opacity: overriding ? 0.5 : 1,
                  }}
                  onMouseEnter={e => { if (!active && !overriding) { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' } }}
                >
                  {overriding ? '…' : label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes statusDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(1.4); }
        }
      `}</style>
    </div>
  )
}
