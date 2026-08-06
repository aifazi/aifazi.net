'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useFiveMRoute } from '@/lib/fivemRoutes'

const G = 'var(--green)'
const C = 'var(--cyan)'

export default function FiveMStatus() {
  const [status, setStatus] = useState<any>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/fivem/status/overview')
      .then(r => {
        const d = r.data || {}
        setStatus(d.status)
        setPlayers(Array.isArray(d.players) ? d.players : [])
        setHistory(Array.isArray(d.history) ? d.history : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const online = status?.status === 'online'
  const playerCount = status?.players_online ?? status?.players_count ?? players.length
  const homeHref = useFiveMRoute('/')

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '80px 24px' }}>
        <a href={homeHref} style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 1 }}>&#8592; BACK TO FIVEM</a>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: 2, marginTop: 16, background: `linear-gradient(135deg, ${G}, ${C})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          SERVER STATUS
        </h1>

        {/* Status badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '10px 20px', borderRadius: 10, background: online ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'color-mix(in srgb, var(--red) 10%, transparent)', border: `1px solid ${online ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'color-mix(in srgb, var(--red) 30%, transparent)'}` }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: online ? G : 'var(--red)', display: 'inline-block', animation: online ? 'pulse 2s infinite' : 'none' }} />
          <span style={{ fontSize: 13, color: online ? G : 'var(--red)', letterSpacing: 1, fontWeight: 700 }}>
            {loading ? 'LOADING...' : online ? `ONLINE` : 'OFFLINE'}
          </span>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginTop: 24 }}>
          <div style={{ padding: 20, borderRadius: 10, background: 'color-mix(in srgb, var(--text) 3%, transparent)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 2 }}>PLAYERS</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: C, marginTop: 4 }}>{playerCount}/{status?.max_players || 128}</div>
          </div>
          <div style={{ padding: 20, borderRadius: 10, background: 'color-mix(in srgb, var(--text) 3%, transparent)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 2 }}>UPTIME</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: G, marginTop: 4 }}>{status?.uptime_label || '—'}</div>
          </div>
          <div style={{ padding: 20, borderRadius: 10, background: 'color-mix(in srgb, var(--text) 3%, transparent)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: 2 }}>LAST HEARTBEAT</div>
            <div style={{ fontSize: 14, color: 'var(--text)', marginTop: 8 }}>{status?.last_seen_label || (status?.last_seen ? new Date(status.last_seen).toLocaleTimeString() : '—')}</div>
          </div>
        </div>

        {/* Player list */}
        {playerCount > 0 && (
          <div style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 12, letterSpacing: 2, color: C, marginBottom: 12 }}>ONLINE PLAYERS ({playerCount})</h2>
            <div style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {players.map((p: any, i: number) => (
                <div key={i} style={{ padding: '8px 16px', background: i % 2 ? 'color-mix(in srgb, var(--text) 2%, transparent)' : 'transparent', borderBottom: '1px solid var(--border)', fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{p.name || p.username || `Player ${i+1}`}</span>
                  <span style={{ color: 'var(--muted)' }}>{p.ping ? `${p.ping}ms` : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History chart area */}
        {history.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 12, letterSpacing: 2, color: C, marginBottom: 12 }}>PEAK PLAYERS (24H)</h2>
            <div style={{ padding: 20, borderRadius: 10, background: 'color-mix(in srgb, var(--text) 3%, transparent)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14, color: G, fontWeight: 700 }}>
                {Math.max(...history.map((h: any) => h.players_online ?? h.players_count ?? 0))} peak
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                Avg: {history.length > 0 ? Math.round(history.reduce((a: number, h: any) => a + (h.players_online ?? h.players_count ?? 0), 0) / history.length) : 0} players
              </div>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
    </div>
  )
}
