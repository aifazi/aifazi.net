'use client'
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { useToast } from '../../../components/Toast'
import { useDialog } from '../../../components/Dialog'
import { useNow } from '../../../hooks/useNow'

// Split out of AdminPanels.jsx - active-sessions list (used by AdminProfilePanel).
function ActiveSessionsPanel() {
  const toast = useToast()
  const { confirm } = useDialog()
  const now = useNow()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [revoking, setRevoking] = useState(null)
  const [conflict, setConflict] = useState(false)
  const [conflictInfo, setConflictInfo] = useState([])

  const load = async () => {
    try {
      const r = await api.get('/auth/sessions')
      setSessions(r.data?.sessions || [])
    } catch { setSessions([]) }
    finally { setLoading(false) }
  }

  // Heartbeat every 30s — registers this session + detects conflicts
  useEffect(() => {
    const run = async () => { await load() }
    run()
    const beat = async () => {
      try {
        const r = await api.post('/auth/sessions/heartbeat')
        if (r.data?.conflict && r.data?.concurrent_sessions > 0) {
          setConflict(true)
          setConflictInfo(r.data.others || [])
          // Push a notification via the site-settings-updated bus so AdminHeader picks it up
          window.dispatchEvent(new CustomEvent('site-settings-updated', {
            detail: { _adminAlert: { icon: '⚠️', title: 'Concurrent session detected', msg: `Another device is logged in as ${window.__adminUser || 'admin'}. Review active sessions.` } }
          }))
        } else {
          setConflict(false)
          setConflictInfo([])
        }
        load()
      } catch { /* silent */ }
    }
    beat()
    const interval = setInterval(beat, 30000)
    return () => clearInterval(interval)
  }, [])

  const revoke = async (sessionId, revokeAll = false) => {
    const msg = revokeAll ? 'Sign out all other sessions?' : 'Sign out this session?'
    const ok = await confirm({ title: revokeAll ? 'Revoke All Other Sessions' : 'Revoke Session', message: msg, variant: 'danger', confirmLabel: 'REVOKE' })
    if (!ok) return
    setRevoking(revokeAll ? 'all' : sessionId)
    try {
      if (revokeAll) await api.delete('/auth/sessions')
      else           await api.delete(`/auth/sessions/${sessionId}`)
      toast.success(revokeAll ? 'All other sessions revoked' : 'Session revoked', { title: '🔐 Sessions' })
      setConflict(false); setConflictInfo([])
      load()
    } catch (err) { toast.error(err?.response?.data?.detail || 'Failed to revoke') }
    finally { setRevoking(null) }
  }

  const ago = d => {
    if (!d) return '—'
    const s = Math.floor((now - new Date(d)) / 1000)
    if (s < 60) return `${s}s ago`
    if (s < 3600) return `${Math.floor(s/60)}m ago`
    if (s < 86400) return `${Math.floor(s/3600)}h ago`
    return new Date(d).toLocaleDateString()
  }

  return (
    <div style={{ background: 'var(--bg2)', border: `1px solid ${conflict ? 'rgba(248,113,113,0.5)' : 'var(--border)'}`, padding: 24, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: conflict ? 12 : 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: conflict ? '#f87171' : 'var(--muted)' }}>ACTIVE SESSIONS</div>
          {conflict && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 8px', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', color: '#f87171', borderRadius: 4, letterSpacing: 1 }}>⚠️ CONFLICT</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => load()} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '4px 10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>↻ REFRESH</button>
          {sessions.length > 1 && <button onClick={() => revoke(null, true)} disabled={revoking === 'all'} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '4px 10px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', cursor: 'pointer' }}>{revoking === 'all' ? 'REVOKING…' : 'REVOKE ALL OTHERS'}</button>}
        </div>
      </div>

      {/* Conflict warning banner */}
      {conflict && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#f87171', lineHeight: 1.7, padding: '10px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 4, marginBottom: 14 }}>
          ⚠️ <strong>{conflictInfo.length} other active session{conflictInfo.length > 1 ? 's' : ''} detected.</strong> Another device is currently logged in with the same account. If this wasn&apos;t you, revoke all other sessions immediately.
          {conflictInfo.map((s, i) => <div key={i} style={{ marginTop: 4, opacity: 0.8 }}>→ IP: {s.ip} · Last active: {ago(s.last_active)}</div>)}
        </div>
      )}

      {loading && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', padding: '8px 0' }}>Loading sessions…</div>}

      {!loading && sessions.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
          No session history yet. Sessions are recorded on login and updated every 30 seconds.
        </div>
      )}

      {!loading && sessions.map((s, i) => (
        <div key={s.id || i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: i < sessions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
          <span style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>{s.current ? '🟢' : '💻'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>{s.ip || 'Unknown IP'}</span>
              {s.current && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '1px 6px', background: 'color-mix(in srgb, var(--green) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', color: 'var(--green)' }}>THIS SESSION</span>}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>{s.user_agent || 'Unknown browser'}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
              Login: {s.created_at ? new Date(s.created_at).toLocaleString() : '—'} · Last active: {ago(s.last_active)}
            </div>
          </div>
          {!s.current && (
            <button onClick={() => revoke(s.id)} disabled={revoking === s.id} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '4px 10px', background: 'transparent', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', cursor: 'pointer', flexShrink: 0, letterSpacing: 1 }}>
              {revoking === s.id ? '…' : 'REVOKE'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

export { ActiveSessionsPanel }
