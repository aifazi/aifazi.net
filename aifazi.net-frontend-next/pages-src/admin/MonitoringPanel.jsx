'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { useToast } from '../../components/Toast'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = 'var(--green)'
const C = 'var(--cyan)'
const R = 'var(--red)'
const O = 'var(--orange)'

const STATUS_COLOR = { up: G, down: R, unknown: 'var(--muted)' }
const STATUS_LABEL = { up: 'OPERATIONAL', down: 'DOWN', unknown: 'NO DATA' }

export default function MonitoringPanel() {
  const toast = useToast()
  const [checks, setChecks] = useState([])
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = () => {
    api.get('/monitor/checks?limit=100').then(r => setChecks(r.data || [])).catch(() => toast.error('Could not load monitor history')).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const runNow = async () => {
    setRunning(true)
    try {
      await api.post('/monitor/run')
      await load()
      toast.success('Checks completed')
    } catch { toast.error('Run failed') } finally { setRunning(false) }
  }

  // Group latest per service
  const latest = {}
  const byService = {}
  for (const c of checks) {
    if (!byService[c.service]) byService[c.service] = []
    byService[c.service].push(c)
    if (!latest[c.service]) latest[c.service] = c
  }

  const last24h = checks.filter(c => c.checked_at && Date.now() - new Date(c.checked_at).getTime() < 24 * 3600 * 1000)
  const uptime24 = last24h.length
    ? Math.round((last24h.filter(c => c.status === 'up').length / last24h.length) * 100)
    : 0

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: C }}>SERVICE MONITOR</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
            Uptime (24h): <strong style={{ color: uptime24 >= 99 ? G : O }}>{uptime24}%</strong> · {last24h.length} checks
          </div>
        </div>
        <button onClick={runNow} disabled={running} style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: 2, padding: '9px 18px', cursor: 'pointer',
          background: running ? 'var(--bg3)' : 'var(--green)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 700,
        }}>{running ? 'RUNNING…' : '↻ RUN CHECK NOW'}</button>
      </div>

      {loading ? <div className="loader" /> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {Object.keys(latest).map(service => {
            const c = latest[service]
            const color = STATUS_COLOR[c.status] || 'var(--muted)'
            const rows = byService[service] || []
            const up = rows.filter(r => r.status === 'up').length
            const pct = rows.length ? Math.round((up / rows.length) * 100) : 0
            return (
              <div key={service} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', background: 'var(--bg2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, color }}>●</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1 }}>{c.label || service}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{c.latency_ms != null ? `${c.latency_ms}ms` : '—'}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, padding: '3px 10px', borderRadius: 999, background: `${color}1a`, border: `1px solid ${color}55`, color, fontWeight: 700 }}>
                    {STATUS_LABEL[c.status] || c.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
                  <div style={{ flex: 1, height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{pct}% · {rows.length} checks</span>
                </div>
                {c.detail && c.status !== 'up' && <div style={{ fontFamily: MONO, fontSize: 10, color: R, marginTop: 8 }}>{c.detail}</div>}
                {c.checked_at && <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 6 }}>Last: {new Date(c.checked_at).toLocaleString()}</div>}
              </div>
            )
          })}
          {Object.keys(latest).length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontFamily: MONO, fontSize: 12 }}>
              No checks yet. Run a check or wait for the cron.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
