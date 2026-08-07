'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { useToast } from '../../components/Toast'
import { useDialog } from '../../components/Dialog'
import { useNow } from '../../hooks/useNow'
import { Modal, EmptyState } from './ui'

const MONO = "var(--font-mono,'JetBrains Mono',monospace)"
const G = 'var(--green)'
const C = 'var(--cyan)'
const R = 'var(--red)'
const O = 'var(--orange)'

const STATUS_COLOR = { up: G, down: R, unknown: 'var(--muted)' }
const STATUS_LABEL = { up: 'OPERATIONAL', down: 'DOWN', unknown: 'NO DATA' }

const TYPES = [
  { id: 'website',  label: 'Website',  icon: '🌐', desc: 'HTTP(S) endpoint or page — alerts when it stops responding' },
  { id: 'keyword',  label: 'Keyword',  icon: '🔍', desc: 'Page content — alerts when a keyword appears or disappears' },
  { id: 'ping',     label: 'Ping',     icon: '📡', desc: 'Server / device reachability (ICMP, TCP fallback)' },
  { id: 'port',     label: 'Port',     icon: '🔌', desc: 'TCP port — SMTP, POP3, FTP, game servers, etc.' },
  { id: 'cron',     label: 'Cron Job', icon: '⏰', desc: 'Scheduled job — alerts if it fails or goes missing' },
  { id: 'dns',      label: 'DNS',      icon: '🌍', desc: 'DNS record — catches unauthorised changes early' },
]

const emptyForm = { name: '', type: 'website', target: '', port: '', expected: '', mode: 'contains', interval_seconds: 60, enabled: true }

function MonitorsTab() {
  const toast = useToast()
  const { confirm } = useDialog()
  const [monitors, setMonitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)   // null closed, {} = new, object = edit
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(null)

  const load = () => {
    api.get('/monitor/checks/config').then(r => setMonitors(r.data || [])).catch(() => toast.error('Could not load monitors'))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const set = k => v => setForm(f => ({ ...f, [k]: v }))

  const openNew = () => { setForm(emptyForm); setEditing({}) }
  const openEdit = m => { setForm({ name: m.name, type: m.type, target: m.target, port: m.port ?? '', expected: m.expected || '', mode: m.mode || 'contains', interval_seconds: m.interval_seconds || 60, enabled: m.enabled }); setEditing(m) }

  const save = async () => {
    if (!form.name.trim() || !form.target.trim()) { toast.error('Name and target are required'); return }
    setSaving(true)
    try {
      const payload = { ...form, port: form.type === 'port' && form.port ? Number(form.port) : null, interval_seconds: Number(form.interval_seconds) || 60 }
      if (editing?.id) await api.put(`/monitor/checks/config/${editing.id}`, payload)
      else await api.post('/monitor/checks/config', payload)
      toast.success(editing?.id ? 'Monitor updated' : 'Monitor created')
      setEditing(null)
      load()
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed') } finally { setSaving(false) }
  }

  const remove = async m => {
    const ok = await confirm({ title: 'Delete Monitor', message: `Delete "${m.name}"? Its check history will also be removed.`, variant: 'danger', confirmLabel: 'DELETE' })
    if (!ok) return
    try { await api.delete(`/monitor/checks/config/${m.id}`); toast.success('Monitor deleted'); load() }
    catch { toast.error('Delete failed') }
  }

  const test = async m => {
    setTesting(m.id)
    try {
      const r = await api.post(`/monitor/checks/${m.id}/run`)
      toast.success(`${m.name}: ${r.data.status.toUpperCase()} — ${r.data.detail || ''} (${r.data.latency_ms}ms)`, { title: 'Monitor test' })
    } catch (e) { toast.error(e.response?.data?.detail || 'Test failed') } finally { setTesting(null) }
  }

  const typeMeta = id => TYPES.find(t => t.id === id) || TYPES[0]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 3, color: C, marginBottom: 4 }}>CUSTOM MONITORS</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Website, keyword, ping, port, cron job and DNS checks — run on each monitor tick, alerts on consecutive failures.</div>
        </div>
        <button onClick={openNew} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '10px 18px', background: G, color: '#000', border: 'none', cursor: 'pointer', borderRadius: 8, fontWeight: 700 }}>+ ADD MONITOR</button>
      </div>

      {loading ? <div className="loader" />
        : monitors.length === 0 ? <EmptyState icon="🛰️" title="No custom monitors yet" hint="Add a website, port, cron job or DNS monitor to start tracking it." />
        : monitors.map(m => {
          const meta = typeMeta(m.type)
          const st = m.latest?.status || 'unknown'
          const color = STATUS_COLOR[st]
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <div style={{ width: 34, height: 34, borderRadius: 8, background: `${color}14`, border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{meta.icon}</div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{m.name}</span>
                  <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 1, padding: '2px 7px', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.25)', color: C, borderRadius: 99 }}>{meta.label.toUpperCase()}</span>
                  {!m.enabled && <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 1, padding: '2px 7px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 99 }}>PAUSED</span>}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.type === 'port' ? `${m.target}:${m.port}` : m.type === 'keyword' ? `${m.target} → "${m.expected}"` : m.type === 'dns' ? `${m.target}${m.expected ? ` → ${m.expected}` : ''}` : m.target}
                  {m.type === 'cron' && ` · every ${m.interval_seconds}s`}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, color, fontWeight: 700 }}>{STATUS_LABEL[st]}</div>
                {m.latest && <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--muted)', marginTop: 2 }}>{m.latest.latency_ms}ms · {m.latest.checked_at ? new Date(m.latest.checked_at).toLocaleTimeString() : ''}</div>}
                {m.latest?.detail && m.latest.status !== 'up' && <div style={{ fontFamily: MONO, fontSize: 8, color: R, marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.latest.detail}</div>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => test(m)} disabled={testing === m.id} style={smallBtn()} title="Test now">{testing === m.id ? '…' : '⚡'}</button>
                <button onClick={() => openEdit(m)} style={smallBtn()} title="Edit">✏️</button>
                <button onClick={() => remove(m)} style={{ ...smallBtn(), color: R }} title="Delete">🗑</button>
              </div>
            </div>
          )
        })}

      {/* Add / edit form */}
      <Modal open={!!editing} onClose={() => setEditing(null)} width={560} title={editing?.id ? 'Edit Monitor' : 'Add Monitor'}>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>TYPE</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
              {TYPES.map(t => (
                <button key={t.id} onClick={() => set('type')(t.id)} style={{
                  fontFamily: MONO, fontSize: 10, textAlign: 'left', padding: '10px 12px', cursor: 'pointer', borderRadius: 8,
                  background: form.type === t.id ? `${C}18` : 'transparent', color: form.type === t.id ? C : 'var(--muted)',
                  border: `1px solid ${form.type === t.id ? `${C}55` : 'var(--border)'}`,
                }}>
                  <div style={{ fontSize: 14, marginBottom: 4 }}>{t.icon} {t.label}</div>
                  <div style={{ fontSize: 8, color: 'var(--muted)', lineHeight: 1.5, fontWeight: 400 }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={lbl}>NAME</label><input value={form.name} onChange={e => set('name')(e.target.value)} placeholder="My server / My page / DB backup job" style={inp} /></div>
            <div><label style={lbl}>TARGET</label><input value={form.target} onChange={e => set('target')(e.target.value)} placeholder={form.type === 'port' ? 'host' : form.type === 'cron' ? 'job name (e.g. cron-cleanup)' : form.type === 'dns' ? 'example.com' : 'https://...'} style={inp} /></div>
          </div>
          {form.type === 'port' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>PORT</label><input type="number" min={1} max={65535} value={form.port} onChange={e => set('port')(e.target.value)} placeholder="443 / 25 / 3306" style={inp} /></div>
            </div>
          )}
          {(form.type === 'keyword' || form.type === 'dns') && (
            <div style={{ display: 'grid', gridTemplateColumns: form.type === 'keyword' ? '2fr 1fr' : '1fr', gap: 12 }}>
              <div><label style={lbl}>{form.type === 'keyword' ? 'KEYWORD' : 'EXPECTED IP (optional)'}</label>
                <input value={form.expected} onChange={e => set('expected')(e.target.value)} placeholder={form.type === 'keyword' ? 'e.g. "We are online"' : 'e.g. 1.2.3.4 (alert if it changes)'} style={inp} /></div>
              {form.type === 'keyword' && (
                <div><label style={lbl}>MODE</label>
                  <select value={form.mode} onChange={e => set('mode')(e.target.value)} style={inp}>
                    <option value="contains">Alert when MISSING</option>
                    <option value="not_contains">Alert when PRESENT</option>
                  </select>
                </div>
              )}
            </div>
          )}
          {form.type === 'cron' && (
            <div><label style={lbl}>EXPECTED MAX GAP (seconds)</label><input type="number" min={5} value={form.interval_seconds} onChange={e => set('interval_seconds')(e.target.value)} style={inp} /></div>
          )}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontFamily: MONO, fontSize: 10, color: 'var(--muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.enabled} onChange={e => set('enabled')(e.target.checked)} /> Enabled
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setEditing(null)} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '10px 18px', background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', cursor: 'pointer', borderRadius: 8, flex: 1 }}>CANCEL</button>
            <button onClick={save} disabled={saving} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, padding: '10px 18px', background: G, color: '#000', border: 'none', cursor: 'pointer', borderRadius: 8, flex: 1, fontWeight: 800 }}>{saving ? 'SAVING…' : '✓ SAVE MONITOR'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function smallBtn() {
  return { background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', borderRadius: 6, padding: '6px 8px', fontSize: 12 }
}
const lbl = { fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }
const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: MONO, fontSize: 12, padding: '10px 12px', outline: 'none', borderRadius: 6 }


function StatusTab() {
  const toast = useToast()
  const now = useNow()
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

  const last24h = checks.filter(c => c.checked_at && now - new Date(c.checked_at).getTime() < 24 * 3600 * 1000)
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 10, flexWrap: 'wrap' }}>
        {[['status', '📊 Status'], ['monitors', '🛰️ Monitors'], ['settings', '⚙️ Settings'], ['errors', '🚨 Errors']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: 2, padding: '8px 16px', cursor: 'pointer',
            background: tab === k ? 'var(--green)' : 'transparent', color: tab === k ? '#000' : 'var(--muted)',
            border: `1px solid ${tab === k ? 'var(--green)' : 'var(--border)'}`, borderRadius: 8, fontWeight: 700,
          }}>{l}</button>
        ))}
      </div>
      {tab === 'status' ? <StatusTab /> : tab === 'monitors' ? <MonitorsTab /> : tab === 'settings' ? <SettingsTab /> : <ErrorsTab />}
    </div>
  )
}
