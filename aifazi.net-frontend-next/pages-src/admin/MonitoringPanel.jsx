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

function StatusTab() {
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

  const latest = {}
  const byService = {}
  for (const c of checks) {
    if (!byService[c.service]) byService[c.service] = []
    byService[c.service].push(c)
    if (!latest[c.service]) latest[c.service] = c
  }

  const last24h = checks.filter(c => c.checked_at && Date.now() - new Date(c.checked_at).getTime() < 24 * 3600 * 1000)
  const uptime24 = last24h.length ? Math.round((last24h.filter(c => c.status === 'up').length / last24h.length) * 100) : 0

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

function SettingsTab() {
  const toast = useToast()
  const [cfg, setCfg] = useState(null)
  const [emails, setEmails] = useState('')
  const [threshold, setThreshold] = useState(2)
  const [enabled, setEnabled] = useState({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/monitor/settings').then(r => {
      const d = r.data
      setCfg(d)
      setEmails(d.alert_emails || '')
      setThreshold(d.alert_threshold ?? 2)
      const e = {}
      ;(d.enabled_services || []).forEach(n => { e[n] = true })
      setEnabled(e)
    }).catch(() => toast.error('Could not load monitor settings')).finally(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const list = Object.keys(enabled).filter(k => enabled[k])
      const res = await api.put('/monitor/settings', { alert_emails: emails, alert_threshold: threshold, enabled_services: list })
      toast.success('Settings saved')
      setCfg(res.data)
    } catch { toast.error('Save failed') } finally { setSaving(false) }
  }

  if (loading) return <div className="loader" />
  if (!cfg) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontFamily: MONO, fontSize: 12 }}>No settings.</div>

  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: C, marginBottom: 16 }}>MONITOR SETTINGS</div>

      {/* Alert emails */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--bg2)', marginBottom: 12 }}>
        <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>ALERT EMAILS</label>
        <input value={emails} onChange={e => setEmails(e.target.value)} placeholder="admin@example.com, other@example.com"
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: 13, padding: '10px 12px', borderRadius: 8, outline: 'none' }} />
        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 6 }}>Comma-separated. Sent via your configured email provider (Resend/Brevo/SMTP).</div>
      </div>

      {/* Threshold */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--bg2)', marginBottom: 12 }}>
        <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>ALERT AFTER (CONSECUTIVE FAILURES)</label>
        <input type="number" min="1" max="10" value={threshold} onChange={e => setThreshold(Number(e.target.value) || 2)}
          style={{ width: 80, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '8px 10px', borderRadius: 8, outline: 'none' }} />
        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 6 }}>Avoids noisy alerts from single transient blips. Default 2.</div>
      </div>

      {/* Enabled services */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--bg2)', marginBottom: 12 }}>
        <label style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 10 }}>MONITORED SERVICES</label>
        <div style={{ display: 'grid', gap: 8 }}>
          {(cfg.available_services || []).map(s => (
            <label key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text)' }}>
              <input type="checkbox" checked={!!enabled[s.name]} onChange={e => setEnabled(prev => ({ ...prev, [s.name]: e.target.checked }))}
                style={{ accentColor: 'var(--green)', width: 16, height: 16 }} />
              {s.label}
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{s.name}</span>
            </label>
          ))}
        </div>
      </div>

      <button onClick={save} disabled={saving} style={{
        fontFamily: MONO, fontSize: 10, letterSpacing: 2, padding: '10px 24px', cursor: 'pointer',
        background: saving ? 'var(--bg3)' : 'var(--green)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 700,
      }}>{saving ? 'SAVING…' : 'SAVE SETTINGS'}</button>
    </div>
  )
}

function ErrorsTab() {
  const toast = useToast()
  const [errors, setErrors] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/monitor/errors?limit=50').then(r => setErrors(r.data || [])).catch(() => toast.error('Could not load errors')).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loader" />
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: C, marginBottom: 16 }}>RECENT ERRORS</div>
      {errors.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontFamily: MONO, fontSize: 12 }}>No errors captured yet.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {errors.map(e => (
            <div key={e.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', background: 'var(--bg2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: MONO, fontSize: 9, padding: '2px 8px', borderRadius: 999, background: `${R}1a`, border: `1px solid ${R}55`, color: R, fontWeight: 700 }}>{e.error_type || 'Error'}</span>
                <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{e.source}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>×{e.count}</span>
                <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)' }}>{e.last_seen ? new Date(e.last_seen).toLocaleString() : ''}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text)', marginTop: 6 }}>{e.message}</div>
              {(e.endpoint || e.url) && <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>{e.endpoint || e.url}</div>}
              {e.stack && <pre style={{ fontSize: 9, color: 'var(--muted)', background: 'var(--bg3)', padding: 8, borderRadius: 6, marginTop: 6, overflow: 'auto', maxHeight: 120 }}>{e.stack.slice(0, 600)}</pre>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MonitoringPanel() {
  const [tab, setTab] = useState('status')
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        {[['status', '📊 Status'], ['settings', '⚙️ Settings'], ['errors', '🚨 Errors']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: 2, padding: '8px 16px', cursor: 'pointer',
            background: tab === k ? 'var(--green)' : 'transparent', color: tab === k ? '#000' : 'var(--muted)',
            border: `1px solid ${tab === k ? 'var(--green)' : 'var(--border)'}`, borderRadius: 8, fontWeight: 700,
          }}>{l}</button>
        ))}
      </div>
      {tab === 'status' ? <StatusTab /> : tab === 'settings' ? <SettingsTab /> : <ErrorsTab />}
    </div>
  )
}
