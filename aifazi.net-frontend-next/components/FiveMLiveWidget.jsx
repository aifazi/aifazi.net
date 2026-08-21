'use client'
import { useEffect, useState, useRef } from 'react'
import api from '@/lib/api'

export default function FiveMLiveWidget({ compact = false }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const timerRef = useRef(null)

  const load = async () => {
    try {
      // Prefer FiveM live overview; fallback to monitor status for non-FiveM pages
      const res = await api.get('/fivem/status/overview').catch(() => api.get('/monitor/status'))
      setData(res.data)
      setErr(null)
    } catch (e) {
      setErr(e?.response?.data?.detail || 'offline')
    }
  }

  useEffect(() => {
    load()
    timerRef.current = setInterval(load, 30000)
    return () => clearInterval(timerRef.current)
  }, [])

  const fivem = data?.status && typeof data.status === 'object' ? data.status : null
  const isUp = !err && data && (data.status === 'ok' || data.overall === 'ok' || fivem?.status === 'online' || !data.status)
  const ping = data?.checks?.find(c => c.name === 'ping' || c.id === 'ping')
  const playersOnline = fivem?.players_online ?? fivem?.players_count ?? (Array.isArray(data?.players) ? data.players.length : null)

  if (compact) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: isUp ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'color-mix(in srgb, var(--red) 10%, transparent)', border: `1px solid ${isUp ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'color-mix(in srgb, var(--red) 30%, transparent)'}` }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: isUp ? 'var(--green)' : 'var(--red)', boxShadow: `0 0 6px ${isUp ? 'var(--green)' : 'var(--red)'}`, animation: 'pulse 2s infinite' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, color: isUp ? 'var(--green)' : 'var(--red)' }}>{isUp ? 'LIVE' : 'OFFLINE'}</span>
        {playersOnline != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{playersOnline} players</span>}
        {playersOnline == null && ping?.latency_ms && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>{ping.latency_ms}ms</span>}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 560 }}>
      <div style={{ background: 'color-mix(in srgb, var(--bg2) 92%, var(--bg) 8%)', border: `1px solid ${isUp ? 'color-mix(in srgb, var(--green) 18%, transparent)' : 'var(--border)'}`, borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>STATUS</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: isUp ? 'var(--green)' : 'var(--red)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: isUp ? 'var(--green)' : 'var(--red)', boxShadow: `0 0 8px ${isUp ? 'var(--green)' : 'var(--red)'}`, animation: 'pulse 2s infinite' }} />
          {isUp ? 'ONLINE' : 'OFFLINE'}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>{err ? String(err).slice(0, 40) : 'All systems operational'}</div>
      </div>
      <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>{playersOnline != null ? 'PLAYERS' : 'PING'}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{playersOnline != null ? `${playersOnline}/${fivem?.max_players || 128}` : ping?.latency_ms ? `${ping.latency_ms}ms` : '—'}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>{playersOnline != null ? (isUp ? 'online' : 'offline') : ping?.status || 'checking'}</div>
      </div>
      <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>UPTIME</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--cyan)' }}>{data?.uptime_human || data?.uptime || '—'}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>since last deploy</div>
      </div>
    </div>
  )
}
