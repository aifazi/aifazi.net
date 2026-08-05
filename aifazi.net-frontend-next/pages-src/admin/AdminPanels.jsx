'use client'
import React, { useState, useEffect, useCallback, Fragment } from 'react'
import api, { getRole, getUsername } from '@/lib/api'
import { getSupabase } from '@/lib/supabase'
import { useToast } from '../../components/Toast'
import { useDialog } from '../../components/Dialog'
import { useIsMobile, PageHeader } from './shared'
import { DateTimePicker } from '../../core/ui.jsx'
import { usePausableInterval } from '../../hooks/usePausableInterval'
import { EmptyState, Pagination } from './ui'
import { PAGE_ANIMATIONS } from '../../core/pageMotion.jsx'

const PAGE_CONFIG_KEYS = [
  'home', 'about', 'experience', 'services', 'projects', 'blog', 'forum', 'contact', 'tools',
  'whitelist', 'forms', 'profile', 'helpdesk', 'admin',
]

const emptyPageConfig = key => ({
  key,
  title: key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  subtitle: '',
  body: '',
  buttonLabel: '',
  buttonHref: '',
  visible: true,
  animation: 'fade-up',
})

export function PageContentPanel() {
  const toast = useToast()
  const [configs, setConfigs] = useState({})
  const [pageKey, setPageKey] = useState('whitelist')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const current = configs[pageKey] || emptyPageConfig(pageKey)

  useEffect(() => {
    let cancelled = false
    api.get('/content/page_configs')
      .then(r => { if (!cancelled) setConfigs(r.data || {}) })
      .catch(() => toast.error('Failed to load page configs', { title:'Pages' }))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const set = (key, value) => {
    setConfigs(prev => ({ ...prev, [pageKey]: { ...emptyPageConfig(pageKey), ...(prev[pageKey] || {}), [key]: value } }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const next = { ...configs, [pageKey]: current }
      await api.put('/content/page_configs', next)
      setConfigs(next)
      toast.success(`${current.title || pageKey} saved`, { title:'Pages' })
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save page config', { title:'Pages' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding:22, color:'var(--muted)', fontFamily:'var(--font-mono)' }}>Loading pages...</div>

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <PageHeader eyebrow="ADMIN - CONTENT" title="Page Editor" subtitle="Edit public/private page copy and animation presets from one place." />
      <div style={{ border:'1px solid var(--border)', background:'var(--bg2)', borderRadius:8, overflow:'hidden' }}>
        <div style={{ padding:16, borderBottom:'1px solid var(--border)', display:'flex', gap:10, justifyContent:'space-between', flexWrap:'wrap' }}>
          <select value={pageKey} onChange={e => setPageKey(e.target.value)}
            style={{ minWidth:260, background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:6, padding:'10px 12px', fontFamily:'var(--font-mono)' }}>
            {PAGE_CONFIG_KEYS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/${pageKey === 'home' ? '' : pageKey}`); toast.success('URL copied', { title:'Pages' }) }}
              style={{ background:'rgba(0,212,255,.08)', border:'1px solid rgba(0,212,255,.35)', color:'var(--cyan)', borderRadius:6, padding:'9px 13px', fontFamily:'var(--font-mono)', cursor:'pointer' }}>
              Copy URL
            </button>
            <button onClick={() => window.open(`/${pageKey === 'home' ? '' : pageKey}`, '_blank')}
              style={{ background:'rgba(0,212,255,.08)', border:'1px solid rgba(0,212,255,.35)', color:'var(--cyan)', borderRadius:6, padding:'9px 13px', fontFamily:'var(--font-mono)', cursor:'pointer' }}>
              Open Page
            </button>
            <button disabled={saving} onClick={save}
              style={{ background:'rgba(0,255,136,.12)', border:'1px solid rgba(0,255,136,.45)', color:'var(--green)', borderRadius:6, padding:'9px 16px', fontFamily:'var(--font-mono)', cursor:saving?'not-allowed':'pointer', opacity:saving ? 0.65 : 1 }}>
              {saving ? 'Saving...' : 'Save Page'}
            </button>
          </div>
        </div>
        <div style={{ padding:16, display:'grid', gap:12 }}>
          <label style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:2, color:'var(--muted)' }}>TITLE</label>
          <input value={current.title || ''} onChange={e => set('title', e.target.value)}
            style={{ background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:6, padding:'12px 13px', fontFamily:'var(--font-mono)' }} />
          <label style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:2, color:'var(--muted)' }}>SUBTITLE</label>
          <input value={current.subtitle || ''} onChange={e => set('subtitle', e.target.value)}
            style={{ background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:6, padding:'12px 13px', fontFamily:'var(--font-mono)' }} />
          <label style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:2, color:'var(--muted)' }}>BODY / HELPER CONTENT</label>
          <textarea rows={6} value={current.body || ''} onChange={e => set('body', e.target.value)}
            style={{ background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:6, padding:'12px 13px', fontFamily:'var(--font-mono)', resize:'vertical' }} />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
            <input value={current.buttonLabel || ''} onChange={e => set('buttonLabel', e.target.value)} placeholder="Button label"
              style={{ background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:6, padding:'12px 13px', fontFamily:'var(--font-mono)' }} />
            <input value={current.buttonHref || ''} onChange={e => set('buttonHref', e.target.value)} placeholder="/target-url"
              style={{ background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:6, padding:'12px 13px', fontFamily:'var(--font-mono)' }} />
            <select value={current.animation || 'none'} onChange={e => set('animation', e.target.value)}
              style={{ background:'var(--bg3)', border:'1px solid var(--border)', color:'var(--text)', borderRadius:6, padding:'12px 13px', fontFamily:'var(--font-mono)' }}>
              {PAGE_ANIMATIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
          <label style={{ display:'flex', alignItems:'center', gap:10, fontFamily:'var(--font-mono)', color:'var(--text)' }}>
            <input type="checkbox" checked={current.visible !== false} onChange={e => set('visible', e.target.checked)} />
            Visible / enabled
          </label>
        </div>
      </div>
    </div>
  )
}

// --- #4 Active Sessions -------------------------------------------------------
function ActiveSessionsPanel() {
  const toast = useToast()
  const { confirm } = useDialog()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [revoking, setRevoking] = useState(null)
  const [conflict, setConflict] = useState(false)
  const [conflictInfo, setConflictInfo] = useState([])

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get('/auth/sessions')
      setSessions(r.data?.sessions || [])
    } catch { setSessions([]) }
    finally { setLoading(false) }
  }

  // Heartbeat every 30s — registers this session + detects conflicts
  useEffect(() => {
    load()
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
    const s = Math.floor((Date.now() - new Date(d)) / 1000)
    if (s < 60) return `${s}s ago`
    if (s < 3600) return `${Math.floor(s/60)}m ago`
    if (s < 86400) return `${Math.floor(s/3600)}h ago`
    return new Date(d).toLocaleDateString()
  }

  return (
    <div style={{ background: 'var(--bg2)', border: `1px solid ${conflict ? 'rgba(248,113,113,0.5)' : 'var(--border)'}`, padding: 24, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: conflict ? 12 : 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: conflict ? '#f87171' : 'var(--muted)' }}>ACTIVE SESSIONS</div>
          {conflict && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, padding: '2px 8px', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', color: '#f87171', borderRadius: 4, letterSpacing: 1 }}>⚠️ CONFLICT</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => load()} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '4px 10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>↻ REFRESH</button>
          {sessions.length > 1 && <button onClick={() => revoke(null, true)} disabled={revoking === 'all'} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '4px 10px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', cursor: 'pointer' }}>{revoking === 'all' ? 'REVOKING…' : 'REVOKE ALL OTHERS'}</button>}
        </div>
      </div>

      {/* Conflict warning banner */}
      {conflict && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#f87171', lineHeight: 1.7, padding: '10px 14px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 4, marginBottom: 14 }}>
          ⚠️ <strong>{conflictInfo.length} other active session{conflictInfo.length > 1 ? 's' : ''} detected.</strong> Another device is currently logged in with the same account. If this wasn't you, revoke all other sessions immediately.
          {conflictInfo.map((s, i) => <div key={i} style={{ marginTop: 4, opacity: 0.8 }}>→ IP: {s.ip} · Last active: {ago(s.last_active)}</div>)}
        </div>
      )}

      {loading && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', padding: '8px 0' }}>Loading sessions…</div>}

      {!loading && sessions.length === 0 && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7 }}>
          No session history yet. Sessions are recorded on login and updated every 30 seconds.
        </div>
      )}

      {!loading && sessions.map((s, i) => (
        <div key={s.id || i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: i < sessions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
          <span style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>{s.current ? '🟢' : '💻'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>{s.ip || 'Unknown IP'}</span>
              {s.current && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, padding: '1px 6px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', color: 'var(--green)' }}>THIS SESSION</span>}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>{s.user_agent || 'Unknown browser'}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)' }}>
              Login: {s.created_at ? new Date(s.created_at).toLocaleString() : '—'} · Last active: {ago(s.last_active)}
            </div>
          </div>
          {!s.current && (
            <button onClick={() => revoke(s.id)} disabled={revoking === s.id} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 10px', background: 'transparent', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', cursor: 'pointer', flexShrink: 0, letterSpacing: 1 }}>
              {revoking === s.id ? '…' : 'REVOKE'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// --- Admin Profile (self-edit) ------------------------------------------------
function AdminProfilePanel() {
  const toast    = useToast()
  const isMobile = useIsMobile()
  const username = getUsername()

  // ── Username change ──────────────────────────────────────────────────────────
  const [unameForm, setUnameForm] = useState({ newUsername: '', currentPassword: '' })
  const [unameSaving, setUnameSaving] = useState(false)
  const [unameMsg, setUnameMsg] = useState(null) // { type: 'success'|'warn', text, envNote }

  const handleUsernameChange = async () => {
    if (!unameForm.newUsername.trim()) { toast.error('Enter a new username'); return }
    if (!unameForm.currentPassword)    { toast.error('Enter your current password to confirm'); return }
    setUnameSaving(true); setUnameMsg(null)
    try {
      const r = await api.put('/auth/me', { newUsername: unameForm.newUsername.trim(), currentPassword: unameForm.currentPassword })
      setUnameMsg({ type: 'warn', text: r.data?.message, envNote: r.data?.env_note, newUsername: r.data?.new_username })
      setUnameForm({ newUsername: '', currentPassword: '' })
      toast.success(`Display name updated to "${r.data?.new_username}"`, { title: '✅ Username Changed' })
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update username')
    } finally { setUnameSaving(false) }
  }

  // ── Password change ──────────────────────────────────────────────────────────
  const [form, setForm]   = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // ── 2FA state ────────────────────────────────────────────────────────────────
  const [twoFA, setTwoFA] = useState({
    enabled:    false,
    loading:    true,
    qr:         null,   // base64 QR image from /auth/2fa/setup
    secret:     null,   // raw TOTP secret (for manual entry)
    step:       null,   // null | 'setup' | 'confirm' | 'disable'
    code:       '',
    disablePw:  '',
    working:    false,
    error:      '',
  })
  const setTF = (patch) => setTwoFA(p => ({ ...p, ...patch }))

  useEffect(() => {
    api.get('/auth/2fa/status')
      .then(r => setTF({ enabled: !!r.data?.enabled, loading: false }))
      .catch(() => setTF({ loading: false }))
  }, [])

  const handleSetupStart = async () => {
    setTF({ step: 'setup', working: true, error: '' })
    try {
      const r = await api.post('/auth/2fa/setup')
      setTF({ qr: r.data?.qr_image, secret: r.data?.secret, working: false })
    } catch (err) {
      setTF({ error: err?.response?.data?.detail || 'Setup failed.', working: false, step: null })
    }
  }

  const handleConfirm = async () => {
    if (twoFA.code.replace(/\s/g, '').length !== 6) { setTF({ error: 'Enter the 6-digit code.' }); return }
    setTF({ working: true, error: '' })
    try {
      await api.post('/auth/2fa/confirm', { code: twoFA.code.replace(/\s/g, '') })
      setTF({ enabled: true, step: null, qr: null, secret: null, code: '', working: false })
      toast.success('Two-factor authentication is now active', { title: '🔐 2FA Enabled' })
    } catch (err) {
      setTF({ error: err?.response?.data?.detail || 'Invalid code.', working: false })
    }
  }

  const handleDisable = async () => {
    if (!twoFA.disablePw) { setTF({ error: 'Enter your current password to disable 2FA.' }); return }
    const codeClean = twoFA.code.replace(/\s/g, '')
    if (codeClean.length !== 6) { setTF({ error: 'Enter the 6-digit code from your authenticator app.' }); return }
    setTF({ working: true, error: '' })
    try {
      await api.post('/auth/2fa/disable', { password: twoFA.disablePw, code: codeClean })
      setTF({ enabled: false, step: null, disablePw: '', code: '', working: false })
      toast.success('Two-factor authentication has been disabled', { title: '2FA Disabled' })
    } catch (err) {
      setTF({ error: err?.response?.data?.detail || 'Incorrect password or invalid code.', working: false })
    }
  }

  const handleSave = async e => {
    e.preventDefault()
    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      toast.error('Passwords do not match', { title: 'Error' }); return
    }
    if (form.newPassword && form.newPassword.length < 8) {
      toast.error('New password must be at least 8 characters', { title: 'Error' }); return
    }
    setSaving(true)
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword })
      toast.success('Password updated successfully', { title: 'Saved' })
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) { toast.error(err.response?.data?.error || 'Update failed', { title: 'Error' }) }
    finally { setSaving(false) }
  }

  const T = { label: { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }, inp: { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none', boxSizing: 'border-box' } }

  return (
    <div style={{ maxWidth: 520, padding: isMobile ? 16 : 32 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 22 : 28, fontWeight: 700, marginBottom: 28 }}>My Profile</h2>

      {/* Account info */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 24, marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 16 }}>ACCOUNT INFO</div>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
          {[['USERNAME', username], ['ROLE', getRole()?.toUpperCase()], ['ACCESS', 'Admin Panel']].map(([label, value]) => (
            <Fragment key={label}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>{label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>{value}</span>
            </Fragment>
          ))}
        </div>
      </div>

      {/* Change username */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 24, marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 16 }}>CHANGE USERNAME</div>
        {/* Vercel env notice */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--yellow)', lineHeight: 1.7, padding: '8px 12px', background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 4, marginBottom: 16 }}>
          ⚠️ Your <strong>login username</strong> is controlled by the <code>ADMIN_USERNAME</code> environment variable in Vercel.<br />
          Changing it here updates your display name only. To change the login username, update <code>ADMIN_USERNAME</code> in Vercel → Settings → Environment Variables and redeploy.
        </div>
        {unameMsg && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: unameMsg.type === 'warn' ? 'var(--yellow)' : 'var(--green)', lineHeight: 1.8, padding: '8px 12px', background: unameMsg.type === 'warn' ? 'rgba(251,191,36,0.06)' : 'rgba(0,255,136,0.06)', border: `1px solid ${unameMsg.type === 'warn' ? 'rgba(251,191,36,0.3)' : 'rgba(0,255,136,0.3)'}`, borderRadius: 4, marginBottom: 14 }}>
            {unameMsg.text}<br />{unameMsg.envNote}
          </div>
        )}
        <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>NEW USERNAME</label>
        <input value={unameForm.newUsername} onChange={e => setUnameForm(p => ({ ...p, newUsername: e.target.value }))}
          placeholder="Enter new display name"
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none', marginBottom: 12 }} />
        <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>CURRENT PASSWORD (to confirm)</label>
        <input type="password" value={unameForm.currentPassword} onChange={e => setUnameForm(p => ({ ...p, currentPassword: e.target.value }))}
          placeholder="Your current password"
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none', marginBottom: 14 }} />
        <button onClick={handleUsernameChange} disabled={unameSaving}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, padding: '11px 22px', background: unameSaving ? 'var(--bg3)' : 'var(--cyan)', color: unameSaving ? 'var(--muted)' : '#000', border: 'none', cursor: unameSaving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
          {unameSaving ? 'UPDATING...' : 'UPDATE USERNAME'}
        </button>
      </div>

      {/* Change password */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 24, marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 16 }}>CHANGE PASSWORD</div>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={T.label}>Current Password</label><input type="password" value={form.currentPassword} onChange={e => set('currentPassword', e.target.value)} placeholder="" style={T.inp} required /></div>
          <div><label style={T.label}>New Password</label><input type="password" value={form.newPassword} onChange={e => set('newPassword', e.target.value)} placeholder="" style={T.inp} required minLength={8} /></div>
          <div><label style={T.label}>Confirm New Password</label><input type="password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} placeholder="" style={T.inp} required /></div>
          {form.newPassword && form.confirmPassword && form.newPassword !== form.confirmPassword && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ff4757' }}>❌ Passwords do not match</div>
          )}
          <button type="submit" disabled={saving} style={{ padding: '12px 24px', background: saving ? 'var(--bg3)' : 'var(--green)', color: saving ? 'var(--muted)' : '#000', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', alignSelf: 'flex-start' }}>
            {saving ? 'UPDATING...' : 'UPDATE PASSWORD'}
          </button>
        </form>
      </div>

      {/* ── 2FA Panel ─────────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg2)', border: `1px solid ${twoFA.enabled ? 'rgba(0,255,136,0.3)' : 'var(--border)'}`, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)' }}>TWO-FACTOR AUTHENTICATION</div>
          {!twoFA.loading && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '2px 10px', borderRadius: 12, background: twoFA.enabled ? 'rgba(0,255,136,0.12)' : 'rgba(255,71,87,0.1)', border: `1px solid ${twoFA.enabled ? 'rgba(0,255,136,0.35)' : 'rgba(255,71,87,0.3)'}`, color: twoFA.enabled ? 'var(--green)' : '#ff4757' }}>
              {twoFA.enabled ? '● ACTIVE' : '○ DISABLED'}
            </span>
          )}
        </div>

        {twoFA.loading && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', padding: '12px 0' }}>Loading 2FA status…</div>
        )}

        {/* Error */}
        {twoFA.error && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff4757', background: 'rgba(255,71,87,0.07)', border: '1px solid rgba(255,71,87,0.25)', padding: '10px 14px', marginBottom: 14, borderRadius: 4 }}>{twoFA.error}</div>
        )}

        {/* ── Idle: not enabled, no active step ── */}
        {!twoFA.loading && !twoFA.enabled && !twoFA.step && (
          <>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 16 }}>
              Add an extra layer of security. Each login will require a time-based code from your authenticator app (Google Authenticator, Authy, 1Password, etc.).
            </p>
            <button onClick={handleSetupStart} style={{ padding: '10px 20px', background: 'var(--green)', color: '#000', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, fontWeight: 700, border: 'none', cursor: 'pointer', borderRadius: 2 }}>
              ENABLE 2FA →
            </button>
          </>
        )}

        {/* ── Setup step: show QR code ── */}
        {!twoFA.loading && twoFA.step === 'setup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {twoFA.working && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>Generating QR code…</div>}
            {twoFA.qr && (
              <>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7, margin: 0 }}>
                  Scan this QR code with your authenticator app, then enter the 6-digit code below to confirm.
                </p>
                <div style={{ background: '#fff', padding: 12, borderRadius: 6, display: 'inline-block', alignSelf: 'flex-start' }}>
                  <img src={twoFA.qr} alt="2FA QR Code" style={{ display: 'block', width: 160, height: 160 }} />
                </div>
                {twoFA.secret && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7 }}>
                    Manual entry: <span style={{ color: 'var(--cyan)', letterSpacing: 2, userSelect: 'all' }}>{twoFA.secret}</span>
                  </div>
                )}
                <div>
                  <label style={T.label}>Confirm Code</label>
                  <input
                    type="text" inputMode="numeric" maxLength={7}
                    placeholder="000 000"
                    value={twoFA.code}
                    onChange={e => setTF({ code: e.target.value.replace(/[^0-9 ]/g, ''), error: '' })}
                    style={{ ...T.inp, textAlign: 'center', fontSize: 18, letterSpacing: 6, width: 160 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={handleConfirm} disabled={twoFA.working} style={{ padding: '10px 20px', background: twoFA.working ? 'var(--bg3)' : 'var(--green)', color: twoFA.working ? 'var(--muted)' : '#000', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, fontWeight: 700, border: 'none', cursor: twoFA.working ? 'not-allowed' : 'pointer', borderRadius: 2 }}>
                    {twoFA.working ? 'VERIFYING…' : 'CONFIRM & ACTIVATE'}
                  </button>
                  <button onClick={() => setTF({ step: null, qr: null, secret: null, code: '', error: '' })} style={{ padding: '10px 16px', background: 'transparent', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, border: '1px solid var(--border)', cursor: 'pointer', borderRadius: 2 }}>
                    CANCEL
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Enabled: show disable option ── */}
        {!twoFA.loading && twoFA.enabled && twoFA.step !== 'disable' && (
          <>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 16 }}>
              2FA is active on your account. Every login requires a code from your authenticator app.
            </p>
            <button onClick={() => setTF({ step: 'disable', error: '' })} style={{ padding: '10px 20px', background: 'transparent', color: '#ff4757', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, fontWeight: 700, border: '1px solid rgba(255,71,87,0.4)', cursor: 'pointer', borderRadius: 2 }}>
              DISABLE 2FA
            </button>
          </>
        )}

        {/* ── Disable confirmation ── */}
        {!twoFA.loading && twoFA.step === 'disable' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7, margin: 0 }}>
              Enter your current password and authenticator code to confirm removal of 2FA from your account.
            </p>
            <div>
              <label style={T.label}>Current Password</label>
              <input type="password" value={twoFA.disablePw} onChange={e => setTF({ disablePw: e.target.value, error: '' })} placeholder="" style={{ ...T.inp, maxWidth: 280 }} />
            </div>
            <div>
              <label style={T.label}>Authenticator Code</label>
              <input
                type="text" inputMode="numeric" pattern="[0-9 ]*" maxLength={7}
                placeholder="000 000"
                value={twoFA.code}
                onChange={e => setTF({ code: e.target.value.replace(/[^0-9 ]/g, ''), error: '' })}
                style={{ ...T.inp, maxWidth: 160, textAlign: 'center', fontSize: 16, letterSpacing: 6, fontFamily: 'var(--font-mono)' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleDisable} disabled={twoFA.working} style={{ padding: '10px 20px', background: twoFA.working ? 'var(--bg3)' : '#ff4757', color: twoFA.working ? 'var(--muted)' : '#fff', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, fontWeight: 700, border: 'none', cursor: twoFA.working ? 'not-allowed' : 'pointer', borderRadius: 2 }}>
                {twoFA.working ? 'DISABLING…' : 'CONFIRM DISABLE'}
              </button>
              <button onClick={() => setTF({ step: null, disablePw: '', code: '', error: '' })} style={{ padding: '10px 16px', background: 'transparent', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, border: '1px solid var(--border)', cursor: 'pointer', borderRadius: 2 }}>
                CANCEL
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── #4 Active Sessions ─────────────────────────────────────────────── */}
      <ActiveSessionsPanel />
    </div>
  )
}
const BANNER_STYLES = [
  { id: 'banner',   label: 'Strip',    icon: '▬', desc: 'Full-width bar' },
  { id: 'hero',     label: 'Hero',     icon: '◼', desc: 'Bold block' },
  { id: 'minimal',  label: 'Minimal',  icon: '▏', desc: 'Left border' },
  { id: 'floating', label: 'Float',    icon: '◱', desc: 'Corner card' },
  { id: 'pill',     label: 'Pill',     icon: '⬭', desc: 'Rounded chip' },
  { id: 'glass',    label: 'Glass',    icon: '◇', desc: 'Frost panel' },
  { id: 'outline',  label: 'Outline',  icon: '▣', desc: 'Fine frame' },
  { id: 'ticker',   label: 'Ticker',   icon: '▰', desc: 'News rail' },
]

const bannerDateMs = value => {
  if (!value) return null
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? null : ms
}
const isBannerExpired = (b, now = Date.now()) => {
  const ms = bannerDateMs(b.expires_at || b.expiresAt)
  return ms !== null && ms <= now
}
const isBannerScheduled = (b, now = Date.now()) => {
  const ms = bannerDateMs(b.scheduled_at || b.scheduledAt)
  return ms !== null && ms > now
}
const isBannerLiveNow = (b, now = Date.now()) =>
  b.active && !isBannerExpired(b, now) && !isBannerScheduled(b, now)
const toApiDate = value => {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toISOString()
}
const toLocalDateTimeInput = date => {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function BannerRow({ b, TYPES, onToggle, onRemove, onEdit, isEditing }) {
  const tc = TYPES.find(t => t.id === b.type) || TYPES[0]
  const sc = BANNER_STYLES.find(s => s.id === b.style) || BANNER_STYLES[0]
  const id = b._id || b.id
  const isScheduled = isBannerScheduled(b)
  const isExpired = isBannerExpired(b)
  const isExpiring  = !!(b.expires_at || b.expiresAt)
  const isLive = isBannerLiveNow(b)
  return (
    <div
      className="ann-row"
      style={{
        background: isEditing ? tc.color + '0c' : 'var(--bg2)',
        border: '1px solid ' + (isEditing ? tc.color + '55' : 'var(--border)'),
        borderRadius: 8, padding: '11px 14px', marginBottom: 7,
        display: 'flex', alignItems: 'center', gap: 10,
        transition: 'all 0.15s', cursor: 'default',
      }}
    >
      <div style={{ width: 3, height: 34, borderRadius: 2, flexShrink: 0,
        background: 'linear-gradient(180deg,' + tc.color + ',' + tc.color + '55)',
        boxShadow: b.active ? '0 0 6px ' + tc.glow : 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
          {b.message}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 7 }}>
          <span style={{ color: tc.color, background: tc.color + '18', border: '1px solid ' + tc.color + '44', padding: '1px 6px', borderRadius: 3, letterSpacing: 1 }}>
            {tc.icon} {tc.label.toUpperCase()}
          </span>
          {b.style && b.style !== 'banner' && (
            <span style={{ color: 'var(--cyan)', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)', padding: '1px 6px', borderRadius: 3 }}>
              {sc.icon} {sc.label.toUpperCase()}
            </span>
          )}
          {b.pinned && (
            <span style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 6px', borderRadius: 3 }}>📌 PINNED</span>
          )}
          {isScheduled && (
            <span style={{ color: '#a855f7', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', padding: '1px 6px', borderRadius: 3 }}>📅 SCHED</span>
          )}
          {isExpired ? (
            <span style={{ color: '#ff4757', background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', padding: '1px 6px', borderRadius: 3 }}>⏱ EXPIRED</span>
          ) : isExpiring && (
            <span style={{ color: '#00d4ff', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.25)', padding: '1px 6px', borderRadius: 3 }}>⏱ EXPIRES</span>
          )}
          {b.link && (
            <a href={b.link} target="_blank" rel="noreferrer"
              style={{ color: tc.color, textDecoration: 'none', borderBottom: '1px solid ' + tc.color + '55' }}>
              {b.linkLabel || 'link'}
            </a>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button onClick={() => onEdit(b)} title="Edit"
          style={{ padding: '5px 9px', borderRadius: 5, fontFamily: 'var(--font-mono)', fontSize: 11,
            background: isEditing ? 'rgba(0,212,255,0.15)' : 'transparent',
            color: isEditing ? 'var(--cyan)' : 'var(--muted)',
            border: '1px solid ' + (isEditing ? 'rgba(0,212,255,0.4)' : 'var(--border)'),
            cursor: 'pointer' }}>&#9998;</button>
        <button onClick={() => onToggle(id, b.active)}
          style={{ padding: '5px 9px', borderRadius: 5, fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 0.5,
            background: isLive ? 'rgba(0,255,136,0.1)' : isExpired ? 'rgba(255,71,87,0.08)' : 'transparent',
            color: isLive ? 'var(--green)' : isExpired ? '#ff4757' : 'var(--muted)',
            border: '1px solid ' + (isLive ? 'rgba(0,255,136,0.35)' : isExpired ? 'rgba(255,71,87,0.3)' : 'var(--border)'),
            cursor: 'pointer' }}>{isLive ? 'LIVE' : isExpired ? 'EXPIRED' : 'OFF'}</button>
        {b.pinned ? (
          <button title="Unpin to enable delete" disabled
            style={{ padding: '5px 9px', borderRadius: 5, fontFamily: 'var(--font-mono)', fontSize: 10,
              background: 'rgba(245,158,11,0.08)', color: '#f59e0b',
              border: '1px solid rgba(245,158,11,0.25)', cursor: 'not-allowed', opacity: 0.7 }}>📌</button>
        ) : (
          <button onClick={() => onRemove(id)} title="Delete"
            style={{ padding: '5px 9px', borderRadius: 5, fontFamily: 'var(--font-mono)', fontSize: 11,
              background: 'transparent', color: '#ff4757',
              border: '1px solid rgba(255,71,87,0.3)', cursor: 'pointer' }}>&#215;</button>
        )}
      </div>
    </div>
  )
}

function AnnouncementsPanel() {
  const toast    = useToast()
  const isMobile = useIsMobile()
  const [banners, setBanners] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [editId,  setEditId]  = useState(null)
  const [nowTick, setNowTick] = useState(Date.now())
  const [form, setForm]       = useState({ message: '', type: 'info', link: '', linkLabel: '', active: true, pinned: false, style: 'banner', scheduledAt: '', expiresAt: '' })

  const TYPES = [
    { id: 'info',    label: 'Info',    icon: '\u2139\ufe0f', color: '#00d4ff', glow: 'rgba(0,212,255,0.2)'  },
    { id: 'warning', label: 'Warning', icon: '\u26a0\ufe0f', color: '#ffd700', glow: 'rgba(255,215,0,0.2)'   },
    { id: 'success', label: 'Success', icon: '\u2705',        color: '#00ff88', glow: 'rgba(0,255,136,0.2)'  },
    { id: 'alert',   label: 'Alert',   icon: '\ud83d\udea8', color: '#ff4757', glow: 'rgba(255,71,87,0.2)'   },
  ]

  const fetchAll = () =>
    api.get('/admin/banners/all')
      .then(r => setBanners(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false))

  useEffect(() => {
    const sb = getSupabase()
    if (!sb) return

    fetchAll()

    // ── Supabase Realtime ─────────────────────────────────────────────────
    // Any admin on any device creates / edits / deletes a banner →
    // this panel refreshes instantly without a page reload.
    const channel = sb
      .channel('banners-admin-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'banners' },
        () => { fetchAll() }
      )
      .subscribe()

    // ── Realtime keeps this panel fresh; polling fallback (15s) is pausable
    // (see usePausableInterval below) and handles missing REPLICA IDENTITY.
    const clock = setInterval(() => setNowTick(Date.now()), 30_000)

    return () => {
      sb.removeChannel(channel)
      clearInterval(clock)
    }
  }, [])
  usePausableInterval(fetchAll, 15000)

  const set   = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const reset = () => {
    setForm({ message: '', type: 'info', link: '', linkLabel: '', active: true, pinned: false, style: 'banner', scheduledAt: '', expiresAt: '' })
    setEditId(null)
  }

  const submit = async e => {
    e.preventDefault()
    if (!form.message.trim()) return
    setSaving(true)
    const payload = {
      ...form,
      scheduledAt: toApiDate(form.scheduledAt),
      expiresAt: toApiDate(form.expiresAt),
    }
    try {
      if (editId) {
        const r = await api.put('/admin/banners/' + editId, payload)
        setBanners(b => b.map(x => (x._id || x.id) === editId ? r.data : x))
        toast.success('Banner updated', { title: 'Announcements' })
      } else {
        const r = await api.post('/admin/banners', payload)
        setBanners(b => [r.data, ...b])
        toast.success('Banner published', { title: 'Announcements' })
      }
      reset()
    } catch (err) { toast.error(err.response?.data?.error || 'Failed', { title: 'Error' }) }
    finally { setSaving(false) }
  }

  const toggle = async (id, active) => {
    try {
      await api.patch('/admin/banners/' + id, { active: !active })
      setBanners(b => b.map(x => (x._id || x.id) === id ? { ...x, active: !active } : x))
    } catch { toast.error('Failed to update', { title: 'Error' }) }
  }

  const remove = async id => {
    try {
      await api.delete('/admin/banners/' + id)
      setBanners(b => b.filter(x => (x._id || x.id) !== id))
      toast.success('Banner removed', { title: 'Announcements' })
      if (editId === id) reset()
    } catch { toast.error('Failed to delete', { title: 'Error' }) }
  }

  const startEdit = b => {
    setEditId(b._id || b.id)
    // DB returns snake_case (link_label, scheduled_at, expires_at) — map to form camelCase
    setForm({
      message:     b.message || '',
      type:        b.type || 'info',
      link:        b.link || '',
      linkLabel:   b.link_label || b.linkLabel || '',
      active:      b.active !== false,
      pinned:      !!b.pinned,
      style:       b.style || 'banner',
      scheduledAt: b.scheduled_at || b.scheduledAt || '',
      expiresAt:   b.expires_at   || b.expiresAt   || '',
    })
  }

  const activeType = TYPES.find(t => t.id === form.type) || TYPES[0]
  const now = nowTick
  const activeLive = banners.filter(b => isBannerLiveNow(b, now))
  const activeHid  = banners.filter(b => !isBannerLiveNow(b, now))

  const inp = {
    width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text)', padding: '10px 13px',
    fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none',
    boxSizing: 'border-box', transition: 'border-color 0.15s',
  }
  const lbl = {
    display: 'block', fontFamily: 'var(--font-mono)', fontSize: 8,
    letterSpacing: 2.5, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase',
  }

  return (
    <div style={{ maxWidth: 820, padding: isMobile ? '16px' : '28px 32px' }}>
      <style>{`
        @keyframes bnrAnnPulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes bnrAnnSlide { from{transform:translateX(-6px);opacity:0} to{transform:translateX(0);opacity:1} }
        .ann-inp:focus { border-color:var(--cyan)!important; box-shadow:0 0 0 2px rgba(0,212,255,0.1)!important; }
        .ann-row:hover { border-color:rgba(255,255,255,0.1)!important; background:var(--bg3)!important; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 3,
            color: 'var(--muted)', marginBottom: 4 }}>ADMIN &rarr; SITE</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 20 : 26,
            fontWeight: 700, margin: 0 }}>Announcements</h2>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, padding: '5px 12px', borderRadius: 99,
            background: activeLive.length ? 'rgba(0,255,136,0.1)' : 'var(--bg2)',
            border: '1px solid ' + (activeLive.length ? 'rgba(0,255,136,0.35)' : 'var(--border)'),
            color: activeLive.length ? 'var(--green)' : 'var(--muted)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {activeLive.length > 0 && (
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)',
                animation: 'bnrAnnPulse 2s infinite', display: 'inline-block' }} />
            )}
            {activeLive.length} LIVE
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '5px 12px',
            borderRadius: 99, background: 'var(--bg2)', border: '1px solid var(--border)',
            color: 'var(--muted)' }}>
            {banners.length} TOTAL
          </div>
        </div>
      </div>

      {/* ── Two-column grid ── */}
      <div style={{ display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 310px', gap: 20, alignItems: 'start' }}>

        {/* LEFT — form */}
        <div style={{
          background: 'var(--bg2)',
          border: '1px solid ' + (editId ? activeType.color + '55' : 'var(--border)'),
          borderRadius: 10, overflow: 'visible', transition: 'border-color 0.2s',
          position: 'relative',
        }}>
          {/* form header */}
          <div style={{
            padding: '13px 20px', borderBottom: '1px solid var(--border)',
            background: editId ? activeType.color + '0a' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 3, height: 18, borderRadius: 2,
                background: editId ? activeType.color : 'var(--muted)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2.5,
                color: editId ? activeType.color : 'var(--muted)' }}>
                {editId ? 'EDIT BANNER' : 'NEW BANNER'}
              </span>
            </div>
            {editId && (
              <button onClick={reset}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1,
                  padding: '4px 10px', borderRadius: 4, background: 'transparent',
                  border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>
                CANCEL
              </button>
            )}
          </div>

          <form onSubmit={submit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 15 }}>

            {/* type pills */}
            <div>
              <label style={lbl}>Type</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {TYPES.map(t => (
                  <button key={t.id} type="button" onClick={() => set('type', t.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                    borderRadius: 99, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 0.5,
                    background: form.type === t.id ? t.color + '1a' : 'var(--bg3)',
                    color: form.type === t.id ? t.color : 'var(--muted)',
                    border: '1px solid ' + (form.type === t.id ? t.color + '55' : 'var(--border)'),
                    cursor: 'pointer', transition: 'all 0.15s',
                    boxShadow: form.type === t.id ? '0 0 10px ' + t.glow : 'none',
                  }}>
                    <span>{t.icon}</span> {t.label.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* message */}
            <div>
              <label style={lbl}>Message</label>
              <textarea
                value={form.message}
                onChange={e => set('message', e.target.value)}
                placeholder="Site maintenance scheduled for Friday at 2AM UTC..."
                rows={3}
                className="ann-inp"
                style={{ ...inp, resize: 'vertical', minHeight: 70 }}
                required
              />
            </div>

            {/* link row */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>
              <div>
                <label style={lbl}>Link URL <span style={{ opacity: 0.45 }}>(opt.)</span></label>
                <input className="ann-inp" value={form.link}
                  onChange={e => set('link', e.target.value)}
                  placeholder="https://..." style={inp} />
              </div>
              <div>
                <label style={lbl}>Link Label</label>
                <input className="ann-inp" value={form.linkLabel}
                  onChange={e => set('linkLabel', e.target.value)}
                  placeholder="Learn more" style={inp} />
              </div>
            </div>

            {/* ── Display Style ── */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <label style={lbl}>Display Style</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(72px,1fr))', gap: 6 }}>
                {BANNER_STYLES.map(s => {
                  const on = form.style === s.id
                  return (
                    <button key={s.id} type="button" onClick={() => set('style', s.id)} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      padding: '9px 4px', borderRadius: 7, cursor: 'pointer', transition: 'all 0.15s',
                      background: on ? activeType.color + '18' : 'var(--bg3)',
                      border: '1px solid ' + (on ? activeType.color + '66' : 'var(--border)'),
                      color: on ? activeType.color : 'var(--muted)',
                      boxShadow: on ? '0 0 12px ' + activeType.glow : 'none',
                    }}>
                      <span style={{ fontSize: 17, lineHeight: 1 }}>{s.icon}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, letterSpacing: 1, fontWeight: on ? 700 : 400 }}>{s.label.toUpperCase()}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 6, color: on ? activeType.color + 'bb' : 'var(--border)', textAlign: 'center', lineHeight: 1.3 }}>{s.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Schedule & Expiry ── */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)', gap: 12, marginBottom: 10, overflow: 'visible' }}>
                <div style={{ minWidth: 0, position: 'relative' }}>
                  <label style={lbl}>📅 Schedule <span style={{ opacity: 0.4 }}>(auto-publish)</span></label>
                  <DateTimePicker
                    value={form.scheduledAt}
                    onChange={v => set('scheduledAt', v)}
                    placeholder="Publish immediately…"
                  />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)', marginTop: 4 }}>
                    Blank = publish immediately
                  </div>
                </div>
                <div style={{ minWidth: 0, position: 'relative' }}>
                  <label style={lbl}>⏱ Expires At <span style={{ opacity: 0.4 }}>(auto-hide)</span></label>
                  <DateTimePicker
                    value={form.expiresAt}
                    onChange={v => set('expiresAt', v)}
                    placeholder="Keep active forever…"
                    dropdownAlign={isMobile ? 'left' : 'right'}
                  />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)', marginTop: 4 }}>
                    Blank = keep active forever
                  </div>
                </div>
              </div>
              {/* Quick-expire shortcuts */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)', letterSpacing: 1, marginRight: 2 }}>QUICK EXPIRE:</span>
                {[['1h',1],['6h',6],['12h',12],['24h',24],['3d',72],['7d',168]].map(([label, hrs]) => (
                  <button key={label} type="button"
                    onClick={() => set('expiresAt', toLocalDateTimeInput(new Date(Date.now() + hrs * 3600000)))}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 7, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                      background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--cyan)', letterSpacing: 1,
                      transition: 'all 0.12s' }}>
                    {label}
                  </button>
                ))}
                {form.expiresAt && (
                  <button type="button" onClick={() => set('expiresAt', '')}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 7, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                      background: 'transparent', border: '1px solid rgba(255,71,87,0.3)', color: '#ff4757' }}>
                    ✕ clear
                  </button>
                )}
              </div>
            </div>

            {/* ── Pinned toggle ── */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none' }}
                onClick={() => set('pinned', !form.pinned)}>
                <div style={{ width: 38, height: 21, borderRadius: 11,
                  background: form.pinned ? '#f59e0b' : 'var(--bg3)',
                  border: '1px solid ' + (form.pinned ? '#f59e0b' : 'var(--border)'),
                  position: 'relative', transition: 'all 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: form.pinned ? 19 : 3,
                    width: 13, height: 13, borderRadius: '50%',
                    background: form.pinned ? '#fff' : 'var(--muted)',
                    transition: 'left 0.2s' }} />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
                    color: form.pinned ? '#f59e0b' : 'var(--text)' }}>
                    📌 PINNED — Cannot be dismissed
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)', marginTop: 2 }}>
                    Hides the close button · Delete button locked until unpinned
                  </div>
                </div>
              </label>
            </div>

            {/* live preview */}
            {form.message.trim() && (() => {
              const styleObj = BANNER_STYLES.find(s => s.id === form.style) || BANNER_STYLES[0]
              const isHero    = form.style === 'hero'
              const isMinimal = form.style === 'minimal'
              const isFloating = form.style === 'floating'
              const isPill    = form.style === 'pill'
              const isGlass   = form.style === 'glass'
              const isOutline = form.style === 'outline'
              const isTicker  = form.style === 'ticker'
              return (
                <div style={{
                  animation: 'bnrAnnSlide 0.25s ease both',
                  ...(isFloating ? {
                    alignSelf: 'flex-end', maxWidth: 320,
                    background: 'linear-gradient(135deg,' + activeType.color + '0e,var(--bg2))',
                    border: '1px solid ' + activeType.color + '44',
                    borderRadius: 12, padding: '12px 16px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                  } : isPill ? {
                    alignSelf: 'flex-start',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: activeType.color + '18', border: '1px solid ' + activeType.color + '55',
                    borderRadius: 99, padding: '6px 14px',
                    boxShadow: '0 0 16px ' + activeType.glow,
                  } : isMinimal ? {
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--bg)',
                    borderLeft: '3px solid ' + activeType.color,
                    padding: '10px 14px',
                  } : isHero ? {
                    display: 'flex', flexDirection: 'column', gap: 6,
                    background: 'linear-gradient(90deg,' + activeType.color + '18 0%, var(--bg) 70%)',
                    border: '1px solid ' + activeType.color + '44',
                    borderRadius: 8, padding: '18px 20px',
                  } : isGlass ? {
                    display: 'flex', alignItems: 'center',
                    background: 'linear-gradient(135deg,rgba(255,255,255,0.055),' + activeType.color + '12)',
                    border: '1px solid ' + activeType.color + '38',
                    borderRadius: 12, padding: '11px 14px',
                    boxShadow: '0 14px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.07)',
                    backdropFilter: 'blur(14px)',
                  } : isOutline ? {
                    display: 'flex', alignItems: 'center',
                    background: 'transparent',
                    border: '1px solid ' + activeType.color + '66',
                    outline: '1px solid rgba(255,255,255,0.035)',
                    borderRadius: 8, padding: '9px 12px',
                  } : isTicker ? {
                    display: 'flex', alignItems: 'center',
                    background: 'linear-gradient(90deg,var(--bg),' + activeType.color + '10,var(--bg))',
                    borderTop: '1px solid ' + activeType.color + '33',
                    borderBottom: '1px solid ' + activeType.color + '33',
                    borderRadius: 6, overflow: 'hidden',
                  } : {
                    display: 'flex', alignItems: 'center',
                    background: 'linear-gradient(90deg,' + activeType.color + '0f 0%,rgba(5,12,22,0.95) 22%)',
                    border: '1px solid ' + activeType.color + '28',
                    borderRadius: 7, overflow: 'hidden',
                  }),
                }}>
                  {!isPill && !isMinimal && !isHero && !isGlass && !isOutline && (
                    <div style={{ width: 3, alignSelf: 'stretch', flexShrink: 0,
                      background: 'linear-gradient(180deg,' + activeType.color + ',' + activeType.color + '66)' }} />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, ...(isHero ? {} : { margin: '0 10px', padding: isGlass || isOutline ? 0 : '9px 0', flexShrink: 0 }), ...(isPill ? { margin: 0, padding: 0 } : {}) }}>
                    <span style={{ padding: '3px 8px', borderRadius: isPill ? 99 : 4,
                      background: activeType.color + '18', border: '1px solid ' + activeType.color + '44',
                      color: activeType.color, fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1.5, fontWeight: 700 }}>
                      {activeType.icon} {activeType.label.toUpperCase()}
                    </span>
                    {form.style !== 'banner' && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 6, color: activeType.color + '99', letterSpacing: 1 }}>
                        {styleObj.icon} {styleObj.label.toUpperCase()}
                      </span>
                    )}
                    {form.pinned && <span style={{ fontSize: 10 }}>📌</span>}
                    {!isHero && !isPill && (
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: activeType.color, animation: 'bnrAnnPulse 2s infinite', display: 'inline-block' }} />
                    )}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    {isHero && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 3, color: activeType.color, marginBottom: 4, opacity: 0.8 }}>ANNOUNCEMENT</div>
                    )}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: isHero ? 13 : 11, color: 'var(--text)', lineHeight: 1.55,
                      ...(!isHero ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', padding: isMinimal || isPill ? 0 : '9px 0' } : {}) }}>
                      {form.message}
                    </span>
                  </div>
                  {form.link && form.linkLabel && (
                    <a href={form.link} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, fontFamily: 'var(--font-mono)', fontSize: 9, color: activeType.color, margin: '0 10px', textDecoration: 'none', borderBottom: '1px solid ' + activeType.color + '55' }}>
                      {form.linkLabel} &rarr;
                    </a>
                  )}
                  {!form.pinned && (
                    <span style={{ flexShrink: 0, padding: '0 13px', color: 'var(--muted)', fontSize: 14, cursor: 'default', opacity: 0.5 }}>&#215;</span>
                  )}
                </div>
              )
            })()}

            {/* submit */}
            <button
              type="submit"
              disabled={saving || !form.message.trim()}
              style={{
                alignSelf: 'flex-start',
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 22px', borderRadius: 7, border: 'none',
                background: saving ? 'var(--bg3)' : (editId ? activeType.color : 'var(--green)'),
                color: saving ? 'var(--muted)' : '#000',
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: (!form.message.trim() && !saving) ? 0.4 : 1,
                transition: 'all 0.15s',
                boxShadow: (!saving && form.message.trim())
                  ? '0 0 16px ' + (editId ? activeType.glow : 'rgba(0,255,136,0.28)')
                  : 'none',
              }}
            >
              {saving ? 'SAVING...' : editId ? '\u2713 UPDATE BANNER' : '\ud83d\udce2 PUBLISH BANNER'}
            </button>
          </form>
        </div>

        {/* RIGHT — list */}
        <div>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', fontFamily: 'var(--font-mono)',
              fontSize: 9, color: 'var(--muted)', letterSpacing: 2 }}>LOADING...</div>
          ) : banners.length === 0 ? (
            <div style={{ padding: '52px 20px', textAlign: 'center',
              background: 'var(--bg2)', borderRadius: 10,
              border: '1px dashed var(--border)' }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>\ud83d\udce2</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--muted)', letterSpacing: 2 }}>NO BANNERS YET</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8,
                color: 'var(--border)', marginTop: 6 }}>
                Publish one to show a site-wide announcement
              </div>
            </div>
          ) : (
            <>
              {activeLive.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 3,
                    color: 'var(--green)', marginBottom: 8,
                    display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%',
                      background: 'var(--green)', animation: 'bnrAnnPulse 2s infinite',
                      display: 'inline-block' }} />
                    LIVE ({activeLive.length})
                  </div>
                  {activeLive.map(b => (
                    <BannerRow key={b._id || b.id} b={b} TYPES={TYPES}
                      onToggle={toggle} onRemove={remove} onEdit={startEdit}
                      isEditing={editId === (b._id || b.id)} />
                  ))}
                </div>
              )}
              {activeHid.length > 0 && (
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 3,
                    color: 'var(--muted)', marginBottom: 8 }}>
                    HIDDEN ({activeHid.length})
                  </div>
                  {activeHid.map(b => (
                    <BannerRow key={b._id || b.id} b={b} TYPES={TYPES}
                      onToggle={toggle} onRemove={remove} onEdit={startEdit}
                      isEditing={editId === (b._id || b.id)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// --- Admin Root ---------------------------------------------------------------

function NewsletterPanel() {
  const [subs, setSubs]               = useState([])
  const [subsTotal, setSubsTotal]     = useState(0)
  const [subsPage, setSubsPage]       = useState(1)
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [broadcastOpen, setBroadcast] = useState(false)
  const [bSubject, setBSubject]       = useState('')
  const [bBody, setBBody]             = useState('')
  const [bSending, setBSending]       = useState(false)
  const [bPreview, setBPreview]       = useState(false)
  const toast    = useToast()
  const { confirm } = useDialog()

  const loadSubs = useCallback((page = 1) => {
    setLoading(true)
    api.get(`/newsletter/subscribers?page=${page}&page_size=50`)
      .then(r => { const d = r.data; const items = Array.isArray(d) ? d : (d?.items || []); setSubs(items); setSubsTotal(Array.isArray(d) ? items.length : (d?.total ?? items.length)); setSubsPage(page) })
      .catch(() => setSubs([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadSubs() }, [loadSubs])

  const handleDelete = async email => {
    const ok = await confirm({ title: 'Remove Subscriber', message: `Remove ${email} from the newsletter?`, variant: 'danger', confirmLabel: 'REMOVE' })
    if (!ok) return
    try { await api.delete(`/newsletter/unsubscribe`, { data: { email } }); setSubs(s => s.filter(x => x.email !== email)); toast.success('Removed') } catch { toast.error('Failed') }
  }

  const handleBroadcast = async () => {
    if (!bSubject.trim() || !bBody.trim()) return
    const activeSubs = subs.filter(s => (s.status || 'active') === 'active')
    const ok = await confirm({ title: `Send to ${activeSubs.length} subscribers`, message: `This will send "${bSubject}" to all ${activeSubs.length} active subscribers. This cannot be undone.`, confirmLabel: 'SEND NOW' })
    if (!ok) return
    setBSending(true)
    try {
      // Backend route is POST /newsletter/send and expects { subject, html, text }
      await api.post('/newsletter/send', { subject: bSubject, html: bBody, text: bBody })
      toast.success(`Broadcast sent to ${activeSubs.length} subscribers`, { title: '📬 Broadcast' })
      setBroadcast(false); setBSubject(''); setBBody('')
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to send', { title: 'Error' }) }
    finally { setBSending(false) }
  }

  const exportCSV = () => {
    const rows = [['Email', 'Status', 'Subscribed'].join(','), ...subs.map(s => [s.email, s.status || 'active', s.createdAt?.slice(0,10) || ''].join(','))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows], { type: 'text/csv' })); a.download = 'newsletter-subscribers.csv'; a.click()
  }

  const filtered = subs.filter(s => !search || s.email?.toLowerCase().includes(search.toLowerCase()))
  const activeSubs = subs.filter(s => (s.status || 'active') === 'active')

  const T = {
    card: { background: 'var(--bg2)', border: '1px solid var(--border)', padding: '18px 20px', marginBottom: 16 },
    inp: { background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12, padding: '8px 12px', outline: 'none' },
  }

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', letterSpacing: 4, marginBottom: 6 }}>COMMUNITY</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, margin: 0 }}>Newsletter</h2>
          <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 6 }}>{subs.length} total · {activeSubs.length} active</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setBroadcast(true)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, padding: '8px 16px', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.3)', color: 'var(--cyan)', cursor: 'pointer' }}>📢 BROADCAST</button>
          <button onClick={exportCSV} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, padding: '8px 16px', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', color: 'var(--green)', cursor: 'pointer' }}>⬇️ EXPORT CSV</button>
        </div>
      </div>

      {/* Broadcast Modal */}
      {broadcastOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setBroadcast(false)}>
          <div style={{ background: 'var(--bg)', border: '1px solid rgba(0,212,255,0.25)', width: '100%', maxWidth: 620, boxShadow: '0 0 60px rgba(0,212,255,0.08)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', background: 'var(--bg2)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 4 }}>NEWSLETTER BROADCAST</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>Sending to <span style={{ color: 'var(--green)' }}>{activeSubs.length} active subscribers</span></div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => setBPreview(p => !p)}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, padding: '5px 12px', cursor: 'pointer', background: bPreview ? 'rgba(0,212,255,0.1)' : 'var(--bg3)', border: `1px solid ${bPreview ? 'rgba(0,212,255,0.4)' : 'var(--border)'}`, color: bPreview ? 'var(--cyan)' : 'var(--muted)', borderRadius: 4 }}>
                  {bPreview ? '✏️ EDIT' : '👁 PREVIEW'}
                </button>
                <button onClick={() => setBroadcast(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
              </div>
            </div>
            {/* Body */}
            <div style={{ padding: 20, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {!bPreview ? (
                <>
                  <div>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>SUBJECT *</label>
                    <input value={bSubject} onChange={e => setBSubject(e.target.value)} placeholder="Monthly Update — April 2026"
                      style={{ ...T.inp, width: '100%', boxSizing: 'border-box', padding: '10px 12px' }} />
                  </div>
                  <div>
                    <label style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>BODY *</label>
                    <textarea value={bBody} onChange={e => setBBody(e.target.value)} rows={12} placeholder={'Hi there,\n\nHere is this month\'s update from aifazi.net...\n\nBest regards,\nTanvir'}
                      style={{ ...T.inp, width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.7, padding: '10px 12px' }} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', marginTop: 4 }}>
                      {bBody.trim().split(/\s+/).filter(Boolean).length} words · Plain text, line breaks preserved
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 24, fontFamily: 'var(--font-mono)', lineHeight: 1.8 }}>
                  <div style={{ fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 8 }}>EMAIL PREVIEW</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                    {bSubject || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>(no subject)</span>}
                  </div>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--text)', margin: 0, fontFamily: 'var(--font-mono)' }}>{bBody || <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>(no body)</span>}</pre>
                  <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 9, color: 'var(--muted)' }}>— Sent from aifazi.net</div>
                </div>
              )}
            </div>
            {/* Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
              <button onClick={() => setBroadcast(false)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '9px 18px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}>CANCEL</button>
              <button onClick={handleBroadcast} disabled={bSending || !bSubject.trim() || !bBody.trim()}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, fontWeight: 700, padding: '9px 22px',
                  background: bSending ? 'var(--bg3)' : 'rgba(0,212,255,0.12)', border: `1px solid ${bSending ? 'var(--border)' : 'rgba(0,212,255,0.4)'}`,
                  color: bSending ? 'var(--muted)' : 'var(--cyan)', cursor: bSending ? 'not-allowed' : 'pointer',
                  opacity: (!bSubject.trim() || !bBody.trim()) ? 0.4 : 1 }}>
                {bSending ? 'SENDING…' : `📢 SEND TO ${activeSubs.length}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={T.card}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by email" style={{ ...T.inp, width: '100%', boxSizing: 'border-box', marginBottom: 16 }} />
        {loading ? <div className="loader" /> : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            {search ? 'No results for that search.' : 'No subscribers yet.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            {filtered.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                  {s.email?.[0]?.toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</div>
                  {s.createdAt && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>Joined {new Date(s.createdAt).toLocaleDateString()}</div>}
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 2, padding: '3px 8px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.2)', color: 'var(--green)', flexShrink: 0 }}>{(s.status || 'ACTIVE').toUpperCase()}</span>
                <a href={`mailto:${s.email}`} title={`Email ${s.email}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 8px', background: 'transparent', border: '1px solid rgba(0,212,255,0.3)', color: 'var(--cyan)', textDecoration: 'none', flexShrink: 0 }}>✉️</a>
                <button onClick={() => handleDelete(s.email)} aria-label={`Delete ${s.email}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 8px', background: 'transparent', border: '1px solid rgba(255,71,87,0.3)', color: '#ff4757', cursor: 'pointer', flexShrink: 0 }}>🗑️</button>
              </div>
            ))}
          </div>
        )}
        <Pagination page={subsPage} total={subsTotal} pageSize={50}
          label={`${subsTotal} subscribers`} onChange={p => loadSubs(p)} />
      </div>
    </div>
  )
}

// --- Site Settings Panel ------------------------------------------------------
const MAINT_STYLES  = ['terminal','minimal','cyber','glitch','coming-soon','retro']
const MAINT_STATUSES = ['MAINTENANCE','UPDATING','COMING SOON','OFFLINE','UPGRADING']
const MAINT_BG_STYLES = ['grid','dots','radial','matrix','clean']
const STATUS_ACCENT = { MAINTENANCE:'#f59e0b', UPDATING:'#00d4ff', 'COMING SOON':'#a855f7', OFFLINE:'#ef4444', UPGRADING:'#00ff88' }

// --- Stats Panel --------------------------------------------------------------
function StatsPanel() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const isMobile = useIsMobile()

  const load = async () => {
    setLoading(true); setError(null)
    try { const r = await api.get('/admin/stats'); setData(r.data) }
    catch { setError('Failed to load stats.') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const fmt = n => (n ?? '').toLocaleString?.() ?? n
  const ago = d => { if (!d) return ''; const s = Math.floor((Date.now() - new Date(d)) / 1000); if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s/60)}m ago`; if (s < 86400) return `${Math.floor(s/3600)}h ago`; return `${Math.floor(s/86400)}d ago` }

  return (
    <div style={{ padding: isMobile ? 16 : 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', letterSpacing: 4, marginBottom: 6 }}>ANALYTICS</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 22 : 28, fontWeight: 700, margin: 0 }}>Site Statistics</h2>
        </div>
        <button onClick={load} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, padding: '8px 16px', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', color: 'var(--green)', cursor: 'pointer' }}>🔄 REFRESH</button>
      </div>

      {loading && <div className="loader" />}
      {error && <div style={{ color: '#ff4757', fontFamily: 'var(--font-mono)', fontSize: 12, padding: 24 }}>{error}</div>}

      {data && <>
        {/* Count tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total Posts',      value: fmt(data.counts?.posts?.total),         sub: `${fmt(data.counts?.posts?.published)} live  ${fmt(data.counts?.posts?.drafts)} drafts`, color: '#00d4ff' },
            { label: 'Forum Users',      value: fmt(data.counts?.users?.total),          sub: `${fmt(data.counts?.users?.verified)} verified  ${fmt(data.counts?.users?.banned)} banned`, color: '#00ff88' },
            { label: 'Forum Threads',    value: fmt(data.counts?.forum?.threads),        sub: `${fmt(data.counts?.forum?.replies)} replies`, color: '#a78bfa' },
            { label: 'Newsletter Subs',  value: fmt(data.counts?.newsletter?.total),     sub: `${fmt(data.counts?.newsletter?.active)} active`, color: '#ff6b35' },
            { label: 'Chat Messages',    value: fmt(data.counts?.chat?.messages),        sub: 'all time', color: '#ffd700' },
            { label: 'Contact Messages', value: fmt(data.counts?.contacts),              sub: 'total received', color: '#00d4ff' },
            { label: 'Media Files',      value: fmt(data.counts?.media),                 sub: 'uploaded', color: '#00ff88' },
            { label: 'Staff Members',    value: fmt(data.counts?.staff),                 sub: 'with access', color: '#a78bfa' },
          ].map(c => (
            <div key={c.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${c.color}, transparent)` }} />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 3, color: 'var(--muted)', marginBottom: 8 }}>{c.label.toUpperCase()}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 22 : 28, fontWeight: 800, color: c.color, lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 4 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Today vs This Week */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {[
            { title: 'TODAY', d: data.today,   color: '#00ff88' },
            { title: 'THIS WEEK', d: data.week, color: '#00d4ff' },
          ].map(({ title, d, color }) => (
            <div key={title} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '18px 20px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>{title}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[['Posts', d?.posts], ['Users', d?.users], ['Threads', d?.threads], ['Messages', d?.messages]].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: 'var(--muted)' }}>{k}</span>
                    <span style={{ color, fontWeight: 700 }}>{fmt(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Top Posts + Recent Users */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '18px 20px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>TOP POSTS BY VIEWS</div>
            {(data.topPosts || []).length === 0
              ? <EmptyState icon="📝" title="No posts yet" hint="Publish your first post to see it here." />
              : (data.topPosts || []).map((p, i) => (
              <div key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', width: 16, textAlign: 'center', flexShrink: 0 }}>#{i+1}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)', flexShrink: 0 }}>{fmt(p.views)}</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '18px 20px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>RECENT USERS</div>
            {(data.recent?.users || []).length === 0
              ? <EmptyState icon="👤" title="No users yet" hint="New registrations will appear here." />
              : (data.recent?.users || []).map(u => (
              <div key={u._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', flexShrink: 0 }}>{u.username?.[0]?.toUpperCase()}</div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', flex: 1 }}>{u.username}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)' }}>{ago(u.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent contacts */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '18px 20px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 14 }}>RECENT CONTACT MESSAGES</div>
          {(data.recent?.contacts || []).length === 0
            ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>No messages yet.</div>
            : (data.recent?.contacts || []).map(c => (
              <div key={c._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}  {c.subject || '(no subject)'}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)' }}>{c.email}</div>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>{ago(c.createdAt)}</span>
              </div>
            ))
          }
        </div>
      </>}
    </div>
  )
}

// --- Audit Log Panel ----------------------------------------------------------
function AuditPanel() {
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
    setLoading(true)
    try {
      const r = await api.get(`/admin/audit?page=${p}&limit=50`)
      setLogs(r.data.logs || []); setTotal(r.data.total || 0); setPage(p)
    } catch { toast.error('Failed to load audit log') }
    finally { setLoading(false) }
  }

  // #5 — Auth log loader
  const loadAuthLog = async (p = 1) => {
    setAuthLoading(true)
    try {
      // Endpoint lives under the audit router: /api/admin/audit/auth-log
      const r = await api.get(`/admin/audit/auth-log?page=${p}&limit=50`)
      setAuthLogs(r.data.logs || []); setAuthTotal(r.data.total || 0); setAuthPage(p)
    } catch {
      // Endpoint may not exist yet — show placeholder
      setAuthLogs([]); setAuthTotal(0)
    } finally { setAuthLoading(false) }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { if (auditTab === 'authlog') loadAuthLog() }, [auditTab])

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
  const ago = d => { if (!d) return ''; const s = Math.floor((Date.now() - new Date(d)) / 1000); if (s < 60) return `${s}s ago`; if (s < 3600) return `${Math.floor(s/60)}m ago`; if (s < 86400) return `${Math.floor(s/3600)}h ago`; return new Date(d).toLocaleDateString() }

  return (
    <div style={{ padding: isMobile ? 16 : 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', letterSpacing: 4, marginBottom: 6 }}>SYSTEM</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 22 : 28, fontWeight: 700, margin: 0 }}>Audit Log</h2>
          <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 6 }}>{total} total entries</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => load(page)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, padding: '8px 14px', background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.3)', color: 'var(--green)', cursor: 'pointer' }}>🔄 REFRESH</button>
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
          }} disabled={migrating} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, padding: '8px 14px', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.3)', color: 'var(--cyan)', cursor: 'pointer', opacity: migrating ? 0.5 : 1 }}>{migrating ? '⏳ MIGRATING' : '🛠 MIGRATE DB'}</button>
          <button onClick={purge} disabled={purging} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, padding: '8px 14px', background: 'transparent', border: '1px solid rgba(255,71,87,0.3)', color: '#ff4757', cursor: 'pointer', opacity: purging ? 0.5 : 1 }}>{purging ? 'PURGING' : '🗑️ PURGE OLD'}</button>
        </div>
      </div>

      {/* ── Migration SQL panel (shown when Supabase free tier blocks auto-migrate) ── */}
      {migrationSql && (
        <div style={{ margin: '16px 0', background: 'rgba(255,200,0,0.05)', border: '1px solid rgba(255,200,0,0.3)', borderRadius: 4, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: '#ffc800' }}>
              ⚠️ RUN THIS SQL IN SUPABASE → SQL EDITOR
            </span>
            <button
              onClick={() => { navigator.clipboard.writeText(migrationSql); toast.success('SQL copied!') }}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 10px', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', color: 'var(--cyan)', cursor: 'pointer' }}
            >📋 COPY SQL</button>
          </div>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text)', background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 3, overflow: 'auto', margin: 0, lineHeight: 1.6, maxHeight: 300 }}>
            {migrationSql}
          </pre>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 8 }}>
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
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, padding: '12px 20px',
              background: auditTab === t.key ? 'rgba(0,255,136,0.05)' : 'transparent',
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
                  {log.details && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}</div>}
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{ago(log.createdAt)}</span>
              </div>
            ))}
          </div>
          {total > 50 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button onClick={() => load(page - 1)} disabled={page <= 1} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', color: page <= 1 ? 'var(--muted)' : 'var(--text)', cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>← PREV</button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', padding: '7px 14px' }}>Page {page} of {Math.ceil(total/50)}</span>
              <button onClick={() => load(page + 1)} disabled={page >= Math.ceil(total/50)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', color: page >= Math.ceil(total/50) ? 'var(--muted)' : 'var(--text)', cursor: page >= Math.ceil(total/50) ? 'not-allowed' : 'pointer' }}>NEXT →</button>
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
                <span style={{ fontSize: 9, opacity: 0.6 }}>
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
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, padding: '1px 7px',
                        background: success ? 'rgba(0,255,136,0.1)' : 'rgba(255,71,87,0.1)',
                        border: `1px solid ${success ? 'rgba(0,255,136,0.35)' : 'rgba(255,71,87,0.35)'}`,
                        color: success ? 'var(--green)' : '#ff4757',
                        borderRadius: 3,
                      }}>
                        {evtLabel} · {success ? 'OK' : 'FAIL'}
                      </span>
                      {entry.role && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, padding: '1px 7px', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 3 }}>
                          {entry.role.toUpperCase()}
                        </span>
                      )}
                      {entry.ip && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)' }}>{entry.ip}</span>
                      )}
                    </div>
                    {entry.userAgent && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.userAgent}
                      </div>
                    )}
                    {entry.reason && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757', marginTop: 2 }}>
                        {entry.reason}
                      </div>
                    )}
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{ago(entry.createdAt)}</span>
                </div>
              )
            })}
          </div>
          {authTotal > 50 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button onClick={() => loadAuthLog(authPage - 1)} disabled={authPage <= 1} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', color: authPage <= 1 ? 'var(--muted)' : 'var(--text)', cursor: authPage <= 1 ? 'not-allowed' : 'pointer' }}>← PREV</button>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', padding: '7px 14px' }}>Page {authPage} of {Math.ceil(authTotal/50)}</span>
              <button onClick={() => loadAuthLog(authPage + 1)} disabled={authPage >= Math.ceil(authTotal/50)} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '7px 14px', background: 'transparent', border: '1px solid var(--border)', color: authPage >= Math.ceil(authTotal/50) ? 'var(--muted)' : 'var(--text)', cursor: authPage >= Math.ceil(authTotal/50) ? 'not-allowed' : 'pointer' }}>NEXT →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// --- Backup Panel -------------------------------------------------------------
function BackupPanel() {
  const [stats, setStats]       = useState(null)
  const [loading, setLoading]   = useState(true)
  const [downloading, setDownloading] = useState(false)
  const toast = useToast()
  const isMobile = useIsMobile()

  useEffect(() => {
    api.get('/admin/backup/stats').then(r => setStats(r.data)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const download = async () => {
    setDownloading(true)
    try {
      const r = await api.get('/admin/backup', { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      a.href = url; a.download = `aifazi-backup-${ts}.json`; a.click()
      URL.revokeObjectURL(url)
      toast.success('Backup downloaded successfully', { title: 'Backup' })
    } catch { toast.error('Backup failed', { title: 'Error' }) }
    finally { setDownloading(false) }
  }

  return (
    <div style={{ padding: isMobile ? 16 : 32, maxWidth: 640 }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', letterSpacing: 4, marginBottom: 6 }}>SYSTEM</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 22 : 28, fontWeight: 700, margin: 0 }}>Backup</h2>
        <p style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 6, lineHeight: 1.7 }}>Export a full JSON backup of all database collections. The file can be used to restore data or migrate to another server.</p>
      </div>

      {/* Collection stats */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--muted)', marginBottom: 16 }}>DATABASE SNAPSHOT</div>
        {loading ? <div className="loader" /> : stats ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              {Object.entries(stats.collections || {}).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--muted)', textTransform: 'capitalize' }}>{k}</span>
                  <span style={{ color: 'var(--green)', fontWeight: 700 }}>{(v || 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              Total records: <strong style={{ color: 'var(--green)' }}>{(stats.totalRecords || 0).toLocaleString()}</strong>
            </div>
          </>
        ) : <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>Could not load stats.</div>}
      </div>

      {/* Download button */}
      <button onClick={download} disabled={downloading} style={{
        width: '100%', padding: '16px 24px',
        background: downloading ? 'rgba(0,255,136,0.05)' : 'rgba(0,255,136,0.12)',
        border: `1px solid ${downloading ? 'rgba(0,255,136,0.2)' : 'rgba(0,255,136,0.5)'}`,
        color: downloading ? 'var(--muted)' : 'var(--green)',
        fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 2, fontWeight: 700,
        cursor: downloading ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        transition: 'all 0.2s',
      }}>
        <span style={{ fontSize: 18 }}>💾</span>
        {downloading ? 'GENERATING BACKUP' : 'DOWNLOAD FULL BACKUP (.json)'}
      </button>

      <div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', lineHeight: 1.8, padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        ✅ Backup includes: Posts  Forum Users  Threads  Replies  Contact Messages<br/>
        🔒 Passwords are excluded from the user export for security.<br/>
        🚨 Store your backup file securely  it contains sensitive data.
      </div>
    </div>
  )
}

export { AdminProfilePanel, AnnouncementsPanel, NewsletterPanel, StatsPanel, BackupPanel }
