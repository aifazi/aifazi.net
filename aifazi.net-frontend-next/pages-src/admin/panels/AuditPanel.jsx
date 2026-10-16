'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { useToast } from '../../../components/Toast'
import { useDialog } from '../../../components/Dialog'
import { useIsMobile } from '../shared'
import { useNow } from '../../../hooks/useNow'

// Split out of AdminPanels.jsx - audit log viewer (currently not wired into Dashboard; preserved).
function AuditPanel() {
  const now = useNow()
  const [auditTab, setAuditTab] = useState('actions') // 'actions' | 'authlog'
  // ── Actions log state ──────────────────────────────────────────────────────
  const [logs, setLogs]       = useState([])
  const [total, setTotal]     = useState(0)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [purging, setPurging] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrationSql, setMigrationSql] = useState('')   // shown when auto-migrate fails
  // ── Auth log state (#5) ────────────────────────────────────────────────────
  const [authLogs, setAuthLogs]       = useState([])
  const [authTotal, setAuthTotal]     = useState(0)
  const [authPage, setAuthPage]       = useState(1)
  const [authLoading, setAuthLoading] = useState(false)

  const toast = useToast()
  const { confirm } = useDialog()
  const isMobile = useIsMobile()

  const load = async (p = 1) => {
    try {
      const r = await api.get(`/admin/audit?page=${p}&limit=50`)
      setLogs(r.data.logs || []); setTotal(r.data.total || 0); setPage(p)
    } catch { toast.error('Failed to load audit log') }
    finally { setLoading(false) }
  }

  // #5 — Auth log loader
  const loadAuthLog = async (p = 1) => {
    try {
      // Endpoint lives under the audit router: /api/admin/audit/auth-log
      const r = await api.get(`/admin/audit/auth-log?page=${p}&limit=50`)
      setAuthLogs(r.data.logs || []); setAuthTotal(r.data.total || 0); setAuthPage(p)
    } catch {
      // Endpoint may not exist yet — show placeholder
      setAuthLogs([]); setAuthTotal(0)
    } finally { setAuthLoading(false) }
  }

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [])
  useEffect(() => {
    if (auditTab === 'authlog') { const run = async () => { await loadAuthLog() }; run() }
  }, [auditTab])

  const purge = async () => {
    const ok = await confirm({ title: 'Purge Audit Logs', message: 'This will permanently delete all audit logs older than 90 days. This cannot be undone.', variant: 'danger', confirmLabel: 'PURGE' })
    if (!ok) return
    setPurging(true)
    try {
      const r = await api.delete('/admin/audit?olderThanDays=90')
      toast.success(`Purged ${r.data.deleted} logs`, { title: 'Audit' }); load()
    } catch { toast.error('Purge failed') }
    finally { setPurging(false) }
  }

  const ICON = a => a?.includes('delete') ? '🗑️' : a?.includes('login') ? '🔑' : a?.includes('create') ? '➕' : a?.includes('ban') ? '🚫' : a?.includes('update') ? '✏️' : '📋'
  const ago = d => { if (!d) return ''; const s = Math.floor((now - new Date(d)) / 1000); if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s/60)}m ago`; if (s < 86400) return `${Math.floor(s/3600)}h ago`; return new Date(d).toLocaleDateString() }

  return (
    <div style={{ padding: isMobile ? 16 : 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: 4, marginBottom: 6 }}>SYSTEM</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 22 : 28, fontWeight: 700, margin: 0 }}>Audit Log</h2>
          <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 6 }}>{total} total entries</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => load(page)} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '8px 14px', background: 'color-mix(in srgb, var(--green) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', color: 'var(--green)', cursor: 'pointer' }}>🔄 REFRESH</button>
          <button onClick={async () => {
            setMigrating(true); setMigrationSql('')
            try {
              const r = await api.get('/admin/audit/migrate')
              if (r.data.sql) {
                // Auto-migrate failed (Supabase free tier) — show SQL to user
                setMigrationSql(r.data.sql)
                toast.error('Auto-migration unavailable — copy the SQL below and run it in Supabase SQL Editor', { title: 'Migration' })
              } else {
                toast.success(r.data.message || 'Migration complete', { title: 'Migration' })
                setMigrationSql('')
              }
              load(); loadAuthLog()
            } catch { toast.error('Migration request failed') }
            finally { setMigrating(false) }
          }} disabled={migrating} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '8px 14px', background: 'color-mix(in srgb, var(--cyan) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)', color: 'var(--cyan)', cursor: 'pointer', opacity: migrating ? 0.5 : 1 }}>{migrating ? '⏳ MIGRATING' : '🛠 MIGRATE DB'}</button>
          <button onClick={purge} disabled={purging} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '8px 14px', background: 'transparent', border: '1px solid color-mix(in srgb, var(--red) 30%, transparent)', color: '#ff4757', cursor: 'pointer', opacity: purging ? 0.5 : 1 }}>{purging ? 'PURGING' : '🗑️ PURGE OLD'}</button>
        </div>
      </div>

      {/* ── Migration SQL panel (shown when Supabase free tier blocks auto-migrate) ── */}
      {migrationSql && (
        <div style={{ margin: '16px 0', background: 'rgba(255,200,0,0.05)', border: '1px solid rgba(255,200,0,0.3)', borderRadius: 4, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: '#ffc800' }}>
              ⚠️ RUN THIS SQL IN SUPABASE → SQL EDITOR
            </span>
            <button
              onClick={() => { navigator.clipboard.writeText(migrationSql); toast.success('SQL copied!') }}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 10px', background: 'color-mix(in srgb, var(--cyan) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--cyan) 30%, transparent)', color: 'var(--cyan)', cursor: 'pointer' }}
            >📋 COPY SQL</button>
          </div>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 3, overflow: 'auto', margin: 0, lineHeight: 1.6, maxHeight: 300 }}>
            {migrationSql}
          </pre>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
            Go to <span style={{ color: 'var(--cyan)' }}>supabase.com → your project → SQL Editor</span> → paste and run. Then click 🛠 MIGRATE DB again to verify.
          </div>
        </div>
      )}

      {/* ── #5 Tab switcher: Admin Actions | Auth Log ──────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 0, background: 'var(--bg2)' }}>
        {[
          { key: 'actions', label: '📋 ADMIN ACTIONS' },
          { key: 'authlog', label: '🔑 AUTH LOG'       },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setAuditTab(t.key)}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '12px 20px',
              background: auditTab === t.key ? 'color-mix(in srgb, var(--green) 5%, transparent)' : 'transparent',
              color: auditTab === t.key ? 'var(--green)' : 'var(--muted)',
              border: 'none',
              borderBottom: auditTab === t.key ? '2px solid var(--green)' : '2px solid transparent',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Admin Actions log ─────────────────────────────────────────────── */}
      {auditTab === 'actions' && (
        <>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderTop: 'none' }}>
            {loading ? <div style={{ padding: 40 }}><div className="loader" /></div>
              : logs.length === 0 ? <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>No audit logs found.</div>
              : logs.map((log, i) => (
              <div key={log._id || i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{ICON(log.action)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', marginBottom: 3 }}>
                    <span style={{ color: 'var(--green)' }}>{log.actor || 'system'}</span>
                    {'  '}
                    <span>{(log.action || '').replace(/_/g, ' ')}</span>
                    {log.target && <span style={{ color: 'var(--muted)' }}> › {log.target}</span>}
                  </div>
                  {log.details && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}</div>}
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{ago(log.createdAt)}</span>
              </div>
            ))}
          </div>
          {total > 50 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button onClick={() => load(page - 1)} disabled={page <= 1} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', color: page <= 1 ? 'var(--muted)' : 'var(--text)', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>← PREV</button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', padding: '7px 14px' }}>Page {page} of {Math.ceil(total/50)}</span>
              <button onClick={() => load(page + 1)} disabled={page >= Math.ceil(total/50)} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', color: page >= Math.ceil(total/50) ? 'var(--muted)' : 'var(--text)', cursor: page >= Math.ceil(total/50) ? 'not-allowed' : 'pointer' }}>NEXT →</button>
            </div>
          )}
        </>
      )}

      {/* ── #5 Auth Log tab ───────────────────────────────────────────────── */}
      {auditTab === 'authlog' && (
        <>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderTop: 'none' }}>
            {authLoading ? (
              <div style={{ padding: 40 }}><div className="loader" /></div>
            ) : authLogs.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.8 }}>
                No auth log entries found yet.<br />
                <span style={{ fontSize: 11, opacity: 0.6 }}>
                  Entries appear here after the first login attempt. If tables are missing, visit{' '}
                  <code style={{ color: 'var(--cyan)' }}>/api/admin/audit/migrate</code>.
                </span>
              </div>
            ) : authLogs.map((entry, i) => {
              const success = entry.success !== false
              // Derive event type from reason field (backend stores reason, not event)
              const reason = (entry.reason || '').toLowerCase()
              const evtLabel = reason.includes('2fa') ? '2FA'
                : reason.includes('refresh') ? 'REFRESH'
                : reason.includes('logout') ? 'LOGOUT'
                : reason.includes('suspended') ? 'BANNED'
                : success ? 'LOGIN' : 'FAILED'
              const evtIcon = evtLabel === '2FA' ? '🔐'
                : evtLabel === 'REFRESH' ? '♻️'
                : evtLabel === 'LOGOUT' ? '🚪'
                : evtLabel === 'BANNED' ? '🚫'
                : success ? '🔑' : '❌'
              return (
                <div key={entry._id || i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{evtIcon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', fontWeight: 700 }}>
                        {entry.username || '—'}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '1px 7px',
                        background: success ? 'color-mix(in srgb, var(--green) 10%, transparent)' : 'color-mix(in srgb, var(--red) 10%, transparent)',
                        border: `1px solid ${success ? 'color-mix(in srgb, var(--green) 35%, transparent)' : 'color-mix(in srgb, var(--red) 35%, transparent)'}`,
                        color: success ? 'var(--green)' : '#ff4757',
                        borderRadius: 3,
                      }}>
                        {evtLabel} · {success ? 'OK' : 'FAIL'}
                      </span>
                      {entry.role && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '1px 7px', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 3 }}>
                          {entry.role.toUpperCase()}
                        </span>
                      )}
                      {entry.ip && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)' }}>{entry.ip}</span>
                      )}
                    </div>
                    {entry.userAgent && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.userAgent}
                      </div>
                    )}
                    {entry.reason && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff4757', marginTop: 2 }}>
                        {entry.reason}
                      </div>
                    )}
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{ago(entry.createdAt)}</span>
                </div>
              )
            })}
          </div>
          {authTotal > 50 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button onClick={() => loadAuthLog(authPage - 1)} disabled={authPage <= 1} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', color: authPage <= 1 ? 'var(--muted)' : 'var(--text)', cursor: authPage <= 1 ? 'not-allowed' : 'pointer' }}>← PREV</button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', padding: '7px 14px' }}>Page {authPage} of {Math.ceil(authTotal/50)}</span>
              <button onClick={() => loadAuthLog(authPage + 1)} disabled={authPage >= Math.ceil(authTotal/50)} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', color: authPage >= Math.ceil(authTotal/50) ? 'var(--muted)' : 'var(--text)', cursor: authPage >= Math.ceil(authTotal/50) ? 'not-allowed' : 'pointer' }}>NEXT →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export { AuditPanel }
