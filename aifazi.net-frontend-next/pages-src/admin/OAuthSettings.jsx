'use client'
import React, { useCallback, useEffect, useState } from 'react'
import api from '@/lib/api'
import { Checkbox, Input, TextArea } from '@/core/forms'
import { useDialog } from '../../components/Dialog'
import { S, useIsMobile, PageHeader } from './shared'
import { Icon } from './icons'

const inputStyle = {
  width: '100%',
  background: 'var(--bg, #0b0f14)',
  border: '1px solid var(--border, #1e2a38)',
  borderRadius: 10,
  padding: '10px 12px',
  color: 'var(--text, #c9d1d9)',
  fontSize: 13,
  fontFamily: 'var(--font-mono, monospace)',
  outline: 'none',
}

const labelStyle = {
  display: 'block',
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 11,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  color: 'var(--muted, #8b949e)',
  marginBottom: 6,
}

const btnPrimary = {
  padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: 'linear-gradient(135deg,#b56cff,#9333ea)', color: '#fff', fontWeight: 600, fontSize: 13,
}

const btnGhost = {
  padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
  border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontWeight: 600, fontSize: 13,
}

const sectionStyle = (isMobile) => ({
  background: 'var(--bg2)', border: '1px solid var(--border)',
  borderRadius: 14, padding: isMobile ? 16 : 22, marginBottom: 20,
})

function Flash({ msg }) {
  if (!msg) return null
  const color = msg.type === 'ok' ? 'var(--green, #3fb950)' : msg.type === 'warn' ? 'var(--yellow, #d29922)' : 'var(--red, #f85149)'
  return (
    <div style={{
      marginBottom: 14, padding: '10px 14px', borderRadius: 10,
      border: `1px solid ${color}55`, background: `${color}18`, color,
      fontSize: 13, fontWeight: 500,
    }}>{msg.text}</div>
  )
}

// Human-readable causes for login failure reasons (auth_logs.reason).
// authentik_error=* codes come from the OIDC callback (routers/authentik_oidc.py).
const ERROR_MAP = {
  '1': 'Authentik returned an error instead of a code — check the provider/application config in Authentik.',
  state: 'Login session expired or cookies blocked — retry; if it persists, check the callback domain vs SITE_URL.',
  2: 'Token exchange failed (bad secret, unknown client, or redirect mismatch) — verify the client secret and callback URL in the Upstream IdP tab.',
  3: 'Userinfo fetch failed — Authentik answered but the profile call failed. Check the provider scopes/claims.',
  db: 'Database write failed during sign-in — check Supabase connectivity.',
  banned: 'Account is disabled locally. Re-enable it in the Users tab to restore access.',
  link: 'Account-link session expired — restart linking from the site Profile page.',
  missing: 'Link target user no longer exists locally.',
  email_unverified: 'The matching local account has an unverified email — verify it first, then retry.',
}

function explainFailure(reason) {
  if (!reason) return 'Sign-in failed (no reason recorded).'
  const m = String(reason).match(/^authentik_error=(.+)$/)
  if (m) return ERROR_MAP[m[1]] || `Authentik error "${m[1]}" — see the Upstream IdP tab.`
  return reason
}

function StepList({ steps }) {
  if (!steps || steps.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
      {steps.map((s, i) => (
        <div key={i} style={{
          display: 'flex', gap: 10, alignItems: 'flex-start',
          padding: '9px 12px', borderRadius: 10,
          background: 'var(--bg)', border: '1px solid var(--border)',
          fontSize: 12, lineHeight: 1.5,
        }}>
          <span style={{ color: s.ok ? 'var(--green, #3fb950)' : 'var(--red, #f85149)', fontWeight: 700 }}>
            {s.ok ? '✓' : '✗'}
          </span>
          <div style={{ flex: 1 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>{s.name}</span>
            {s.detail ? <span style={{ color: 'var(--muted)' }}> — {s.detail}</span> : null}
            {!s.ok && s.hint ? <div style={{ color: 'var(--yellow, #d29922)', marginTop: 2 }}>→ {s.hint}</div> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function SourceBadge({ source }) {
  const isPortal = source === 'portal'
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
      padding: '2px 8px', borderRadius: 12,
      background: isPortal ? 'rgba(34,211,238,.12)' : 'rgba(139,148,158,.12)',
      border: `1px solid ${isPortal ? 'rgba(34,211,238,.4)' : 'var(--border)'}`,
      color: isPortal ? 'var(--cyan, #22d3ee)' : 'var(--muted)',
    }}>{isPortal ? 'PORTAL' : source === 'env' ? 'ENV' : 'DEFAULT'}</span>
  )
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'directory', label: 'Directory' },
  { id: 'upstream', label: 'Upstream IdP' },
  { id: 'social', label: 'Social' },
  { id: 'clients', label: 'Clients' },
  { id: 'users', label: 'Users' },
  { id: 'activity', label: 'Activity' },
]

function OAuthSettings() {
  const isMobile = useIsMobile()
  const dialog = useDialog()
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [busy, setBusy] = useState(null) // action key for the new buttons
  const [msg, setMsg] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [ldapPw, setLdapPw] = useState('') // only sent when non-empty
  const [ldapTest, setLdapTest] = useState(null) // staged probe result
  const [newClient, setNewClient] = useState({ client_id: '', name: '', secret: '', redirect_uris: '', public: false })
  const [createdSecret, setCreatedSecret] = useState(null)
  const [editing, setEditing] = useState(null) // {client_id, name, redirect_uris, public}
  const [loadError, setLoadError] = useState(null)
  const [idUsers, setIdUsers] = useState(null)
  const [idLoading, setIdLoading] = useState(true)
  const [userFilter, setUserFilter] = useState('all')
  const [health, setHealth] = useState(null)
  const [signals, setSignals] = useState(null)
  const [verifyRes, setVerifyRes] = useState(null)
  const [provTest, setProvTest] = useState({}) // id -> {ok, detail, hint}
  const [upDraft, setUpDraft] = useState({}) // upstream form; empty = unchanged
  const [activity, setActivity] = useState({ logs: [], loading: false, showAll: false })

  const flash = (type, text, ms = 7000) => {
    setMsg({ type, text })
    if (ms) setTimeout(() => setMsg(null), ms)
  }

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text)
      flash('ok', `✅ Copied ${label || 'to clipboard'}.`, 2500)
    } catch (e) {
      flash('err', 'Copy failed — select the text manually.')
    }
  }

  const load = useCallback(async () => {
    try {
      const r = await api.get('/admin/oauth')
      setCfg(r.data)
      setLoadError(null)
    } catch (e) {
      const text = e.response?.data?.detail || e.response?.data?.error
        || (e.response?.status === 403
          ? '403 Forbidden — the API rejected the request. Sign out/in as admin, then hard-refresh. If it continues, redeploy the backend (Coolify) so /api/admin/oauth exists.'
          : 'Failed to load OAuth settings')
      setLoadError(text)
      flash('err', text)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadIdUsers = useCallback(async () => {
    setIdLoading(true)
    try {
      const r = await api.get('/admin/identity/users')
      setIdUsers(r.data)
    } catch (e) {
      flash('err', e.response?.data?.detail || 'Failed to load identity users')
    } finally {
      setIdLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(loadIdUsers, 0)
    return () => clearTimeout(t)
  }, [loadIdUsers])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await api.get('/admin/oauth')
        if (alive) {
          setCfg(r.data)
          setLoadError(null)
        }
      } catch (e) {
        if (alive) {
          const text = e.response?.data?.detail || e.response?.data?.error
            || (e.response?.status === 403
              ? '403 Forbidden — sign out/in as admin, then hard-refresh. If it continues, redeploy the backend so /api/admin/oauth is available.'
              : 'Failed to load OAuth settings')
          setLoadError(text)
          setMsg({ type: 'err', text })
        }
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  // NOTE: fixed p.ldap → p.lldap (was silently dropping the other LDAP fields locally).
  const setLdap = (k, v) => setCfg(p => ({ ...p, lldap: { ...(p.lldap || {}), [k]: v } }))

  // Social provider form drafts (secrets only sent when typed)
  const [provDraft, setProvDraft] = useState({})
  const setProv = (id, k, v) => setProvDraft(p => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }))

  const saveProvider = async (id, body) => {
    setSaving(true)
    try {
      const d = body || provDraft[id] || {}
      const r = await api.put(`/admin/oauth/providers/${id}`, {
        enabled: d.enabled !== false,
        client_id: d.client_id || '',
        client_secret: d.client_secret || '',
        redirect_uri: d.redirect_uri || '',
        api_key: d.api_key || '',
      })
      setCfg(r.data)
      setProvDraft(p => ({ ...p, [id]: {} }))
      flash('ok', `✅ ${id} settings saved. Portal values now override env vars.`)
    } catch (e) {
      flash('err', e.response?.data?.detail || `Failed to save ${id}`)
    } finally {
      setSaving(false)
    }
  }

  const testProvider = async (id) => {
    setBusy(`test-${id}`)
    try {
      const r = await api.post(`/admin/oauth/providers/${id}/test`)
      setProvTest(p => ({ ...p, [id]: r.data }))
      flash(r.data.ok ? 'ok' : 'err',
        r.data.ok ? `✅ ${id}: ${r.data.detail}` : `❌ ${id}: ${r.data.detail} ${r.data.hint || ''}`)
    } catch (e) {
      const text = e.response?.data?.detail || `Failed to test ${id}`
      setProvTest(p => ({ ...p, [id]: { ok: false, detail: text } }))
      flash('err', text)
    } finally {
      setBusy(null)
    }
  }

  // Copy the currently-effective (possibly env-sourced) non-secret values into
  // portal storage so they become editable here. Secrets must be pasted.
  const importEnv = async (p) => {
    const ok = await dialog.confirm({
      title: `Store ${p.label} in the portal?`,
      message: 'Copies the current client ID / redirect URI into portal storage (overrides env). Secrets are never copied — paste them manually.',
      variant: 'warning',
      confirmLabel: 'STORE IN PORTAL',
    })
    if (!ok) return
    await saveProvider(p.id, { enabled: p.enabled, client_id: p.client_id || '', redirect_uri: p.redirect_uri || '' })
  }

  const saveLdap = async () => {
    setSaving(true)
    try {
      const body = { enabled: cfg.enabled, lldap: { ...cfg.lldap } }
      if (ldapPw) body.lldap.bind_password = ldapPw
      const r = await api.put('/admin/oauth', body)
      setCfg(r.data)
      setLdapPw('')
      flash('ok', '✅ LLDAP settings saved.')
    } catch (e) {
      flash('err', e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // Tests the values in the form WITHOUT saving — staged steps show the failing layer.
  const testLdap = async () => {
    setTesting(true)
    setLdapTest(null)
    try {
      const draft = { ...(cfg.lldap || {}) }
      if (ldapPw) draft.bind_password = ldapPw
      const r = await api.post('/admin/oauth/test-ldap', { lldap: draft })
      setLdapTest(r.data)
      if (r.data.ok) {
        flash('ok', r.data.message || 'LLDAP OK')
        load()
      } else {
        flash('err', r.data.message || 'LLDAP test failed — see steps below')
      }
    } catch (e) {
      flash('err', e.response?.data?.detail || 'LLDAP test failed')
    } finally {
      setTesting(false)
    }
  }

  const runHealth = async () => {
    setBusy('health')
    try {
      const r = await api.get('/admin/oauth/health')
      setHealth(r.data)
      const bad = []
      if (r.data.lldap?.status === 'error') bad.push('Directory')
      if (r.data.upstream?.status === 'error') bad.push('Upstream IdP')
      Object.entries(r.data.providers || {}).forEach(([id, s]) => { if (s.status === 'error') bad.push(id) })
      flash(bad.length ? 'warn' : 'ok',
        bad.length ? `⚠️ Issues in: ${bad.join(', ')} — open each tab for steps.` : '✅ All checks passed.')
    } catch (e) {
      flash('err', e.response?.data?.detail || 'Health check failed')
    } finally {
      setBusy(null)
    }
  }

  const toggleSiteOauth = async () => {
    const enable = cfg.enabled === false
    const ok = await dialog.confirm({
      title: `${enable ? 'Enable' : 'DISABLE'} all OAuth login flows?`,
      message: enable
        ? 'Re-enable LLDAP, Authentik, social and OAuth-client login flows site-wide.'
        : 'Disable LLDAP, Authentik, social and OAuth-client login flows site-wide. Password login is unaffected.',
      variant: enable ? 'warning' : 'danger',
      confirmLabel: enable ? 'ENABLE ALL' : 'DISABLE ALL',
    })
    if (!ok) return
    try {
      const r = await api.put('/admin/oauth', { enabled: enable })
      setCfg(r.data)
      flash('ok', `✅ Site-wide OAuth ${enable ? 'enabled' : 'disabled'}.`)
    } catch (e) {
      flash('err', e.response?.data?.detail || 'Failed to toggle')
    }
  }

  // ── Upstream IdP (Authentik) ──
  const setUp = (k, v) => setUpDraft(p => ({ ...p, [k]: v }))

  const saveUpstream = async () => {
    setBusy('upstream-save')
    try {
      const r = await api.put('/admin/oauth/upstream', {
        issuer: upDraft.issuer || '',
        client_id: upDraft.client_id || '',
        client_secret: upDraft.client_secret || '',
        redirect_uri: upDraft.redirect_uri || '',
        api_token: upDraft.api_token || '',
      })
      setCfg(p => ({ ...p, upstream: r.data }))
      setUpDraft({})
      flash('ok', '✅ Upstream IdP saved. Portal values now override env vars — no redeploy needed.')
    } catch (e) {
      flash('err', e.response?.data?.detail || 'Failed to save upstream')
    } finally {
      setBusy(null)
    }
  }

  const verifyUpstream = async () => {
    setBusy('upstream-verify')
    setVerifyRes(null)
    try {
      const r = await api.post('/admin/oauth/upstream/verify')
      setVerifyRes(r.data)
      flash(r.data.ok ? 'ok' : 'err',
        r.data.ok ? '✅ Upstream IdP verified (discovery, JWKS, authorize).' : '❌ Upstream verify failed — see steps below.')
    } catch (e) {
      flash('err', e.response?.data?.detail || 'Verify failed')
    } finally {
      setBusy(null)
    }
  }

  const loadSignals = useCallback(async () => {
    try {
      const r = await api.get('/admin/oauth/upstream/signals')
      setSignals(r.data)
    } catch (e) {
      setSignals({ error: e.response?.data?.detail || 'Failed to load signals' })
    }
  }, [])

  const loadActivity = useCallback(async (showAll) => {
    setActivity(a => ({ ...a, loading: true }))
    try {
      const r = await api.get('/admin/audit/auth-log?page=1&limit=50')
      setActivity({ logs: r.data.logs || [], loading: false, showAll: !!showAll })
    } catch (e) {
      flash('err', e.response?.data?.detail || 'Failed to load sign-in activity')
      setActivity(a => ({ ...a, loading: false }))
    }
  }, [])

  const createClient = async () => {
    if (!newClient.client_id || !newClient.name) { flash('err', 'client_id and name are required'); return }
    const uris = newClient.redirect_uris.split('\n').map(s => s.trim()).filter(Boolean)
    try {
      const r = await api.post('/admin/oauth/clients', {
        client_id: newClient.client_id,
        name: newClient.name,
        secret: newClient.secret,
        redirect_uris: uris,
        public: newClient.public,
      })
      setCreatedSecret(r.data)
      setNewClient({ client_id: '', name: '', secret: '', redirect_uris: '', public: false })
      flash('ok', 'Client created. Copy the secret now — it will be masked.')
      load()
    } catch (e) {
      flash('err', e.response?.data?.detail || 'Create failed')
    }
  }

  const saveClientEdit = async () => {
    if (!editing) return
    const uris = editing.redirect_uris.split('\n').map(s => s.trim()).filter(Boolean)
    try {
      await api.put(`/admin/oauth/clients/${editing.client_id}`, {
        client_id: editing.client_id,
        name: editing.name,
        secret: '',
        redirect_uris: uris,
        public: editing.public,
      })
      setEditing(null)
      flash('ok', `✅ Client ${editing.client_id} updated.`)
      load()
    } catch (e) {
      flash('err', e.response?.data?.detail || 'Update failed')
    }
  }

  const rotateClient = async (id) => {
    const ok = await dialog.confirm({
      title: `Rotate secret for "${id}"?`,
      message: 'Generates a new secret shown ONCE. The old secret stops working immediately — update every app using it first.',
      variant: 'danger',
      confirmLabel: 'ROTATE NOW',
    })
    if (!ok) return
    setBusy(`rotate-${id}`)
    try {
      const r = await api.post(`/admin/oauth/clients/${id}/rotate`)
      setCreatedSecret(r.data)
      flash('ok', 'Secret rotated. Copy it now — the old one is dead.')
      load()
    } catch (e) {
      flash('err', e.response?.data?.detail || 'Rotate failed')
    } finally {
      setBusy(null)
    }
  }

  const deleteClient = async (id) => {
    if (!(await dialog.confirm({ title: 'Delete OAuth Client', message: `Delete OAuth client "${id}"?`, variant: 'danger', confirmLabel: 'DELETE' }))) return
    try {
      await api.delete(`/admin/oauth/clients/${id}`)
      flash('ok', `Client ${id} deleted`)
      load()
    } catch (e) {
      flash('err', e.response?.data?.detail || 'Delete failed')
    }
  }

  const toggleIdentity = async (u, enable) => {
    const ok = await dialog.confirm({
      title: `${enable ? 'Enable' : 'Disable'} ${u.username}?`,
      message: enable
        ? 'Re-activate this identity.'
        : 'Deactivate this identity. The user will not be able to sign in.',
      variant: enable ? 'warning' : 'danger',
      confirmLabel: enable ? 'ENABLE' : 'DISABLE',
    })
    if (!ok) return
    try {
      const r = await api.post(`/admin/identity/users/${u.id}/${enable ? 'enable' : 'disable'}`, { confirm: true })
      flash('ok', `✅ ${u.username} ${enable ? 'enabled' : 'disabled'}.${r.data?.warning ? ` ${r.data.warning}` : ''}`)
      loadIdUsers()
    } catch (e) {
      flash('err', e.response?.data?.detail || 'Failed to update identity')
    }
  }

  // Refresh contextual data when entering tabs that show it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tab-driven async refetch is intentional
    if (tab === 'overview' || tab === 'activity') loadActivity(tab === 'activity')
    if (tab === 'upstream' && !signals) loadSignals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  if (loading) return <div style={{ padding: 24, color: 'var(--muted)' }}>Loading identity settings…</div>
  if (!cfg) {
    return (
      <div>
        <PageHeader
          title="Identity & OAuth"
          subtitle="LLDAP directory + OAuth2 clients for aifazi.net and third-party apps"
        />
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--red, #f85149)',
          borderRadius: 14, padding: 24,
        }}>
          <div style={{ fontWeight: 700, color: 'var(--red, #f85149)', marginBottom: 8 }}>
            Could not load Identity settings
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 14 }}>
            {loadError || 'The API returned an error. Sign in as admin and try again.'}
            <br />
            If this persists after a backend deploy, open DevTools → Network and check{' '}
            <code style={{ fontFamily: 'var(--font-mono)' }}>/api/admin/oauth</code>.
          </div>
          <button type="button" onClick={() => { setLoading(true); setLoadError(null); load() }}
            style={{
              padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#b56cff,#9333ea)', color: '#fff', fontWeight: 600,
            }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const ldap = cfg.lldap || {}
  const up = cfg.upstream || {}
  const upSrc = up.sources || {}
  const endpoints = cfg.endpoints || {}
  const failures = (activity.logs || []).filter(l => !l.success)

  const statusColor = (s) => s === 'ok' || s === 'Connected' ? 'var(--green)'
    : s === 'error' || s === 'Unreachable' ? 'var(--red)'
    : s === 'disabled' || s === 'Disabled' ? 'var(--muted)'
    : 'var(--yellow, #d29922)'

  const ldapEnabled = ldap.enabled !== false
  const dirStatus = !ldapEnabled ? 'Disabled'
    : health ? (health.lldap?.status === 'ok' ? 'Connected' : health.lldap?.status === 'disabled' ? 'Disabled' : 'Unreachable')
    : (cfg.lldap_healthy ? 'Connected' : 'Unreachable')
  const upStatus = health?.upstream
    ? (health.upstream.status === 'ok' ? 'Connected' : health.upstream.status === 'unconfigured' ? 'Not configured' : 'Error')
    : (up.configured ? 'Saved — not verified' : 'Not configured')

  const providerStatus = (p) => {
    if (!(provDraft[p.id]?.enabled ?? p.enabled)) return 'Disabled'
    const h = health?.providers?.[p.id]
    if (h) return h.status === 'ok' ? 'Verified' : h.status === 'disabled' ? 'Disabled' : h.status === 'unconfigured' ? 'Not configured' : 'Error'
    return p.configured ? 'Saved' : 'Not configured'
  }

  const filteredUsers = (idUsers?.users || []).filter(u => {
    if (userFilter === 'linked') return !!u.authentik_linked
    if (userFilter === 'local') return !u.authentik_linked
    if (userFilter === 'disabled') return !u.active
    return true
  })

  const copyBtn = (text, label) => (
    <button type="button" onClick={() => copyText(text, label)}
      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--cyan, #22d3ee)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', marginLeft: 8 }}>
      Copy
    </button>
  )

  const renderOverview = () => (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: 12, marginBottom: 14,
      }}>
        {[
          { label: 'DIRECTORY', value: dirStatus },
          { label: 'UPSTREAM IDP', value: upStatus },
          { label: 'CLIENTS', value: String((cfg.clients || []).length) },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)' }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: statusColor(s.value), marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: 12, marginBottom: 22,
      }}>
        {(cfg.providers || []).map(p => (
          <div key={p.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)' }}>{p.label.toUpperCase()}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: statusColor(providerStatus(p)), marginTop: 4 }}>{providerStatus(p)}</div>
          </div>
        ))}
      </div>

      <section style={sectionStyle(isMobile)}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Doctor — run all checks</h3>
          <button type="button" onClick={runHealth} disabled={busy === 'health'} style={btnPrimary}>
            {busy === 'health' ? 'Checking…' : 'Run all checks'}
          </button>
          <button type="button" onClick={toggleSiteOauth}
            style={{ ...btnGhost, borderColor: 'var(--red, #f85149)', color: 'var(--red, #f85149)', marginLeft: 'auto' }}>
            {cfg.enabled === false ? 'Enable all OAuth' : 'Disable all OAuth'}
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
          Probes the directory, upstream IdP and every configured social provider. Site-wide toggle affects all OAuth/LLDAP/social flows (password login unaffected).
          {health?.generated_at ? ` Last run: ${health.generated_at}` : ' Not run yet — statuses above come from saved config.'}
        </div>
        {health && (
          <div>
            {(health.lldap?.steps || []).length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ ...labelStyle, marginBottom: 4 }}>Directory</div>
                <StepList steps={health.lldap.steps} />
              </div>
            )}
            {(health.upstream?.steps || []).length > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ ...labelStyle, marginBottom: 4 }}>Upstream IdP</div>
                <StepList steps={health.upstream.steps} />
              </div>
            )}
            {Object.entries(health.providers || {}).filter(([, s]) => s.status === 'error').map(([id, s]) => (
              <div key={id} style={{ marginTop: 10 }}>
                <div style={{ ...labelStyle, marginBottom: 4 }}>{id}</div>
                <div style={{ fontSize: 12, color: 'var(--red)' }}>✗ {s.detail}</div>
                {s.hint ? <div style={{ fontSize: 12, color: 'var(--yellow, #d29922)' }}>→ {s.hint}</div> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={sectionStyle(isMobile)}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Recent sign-in failures</h3>
          <button type="button" onClick={() => setTab('activity')} style={{ ...btnGhost, marginLeft: 'auto', padding: '6px 12px', fontSize: 12 }}>Open Activity</button>
        </div>
        {activity.loading ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
        ) : failures.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>No failed sign-ins in the last 50 attempts. 🎉</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {failures.slice(0, 6).map((l, i) => (
              <div key={l._id || i} style={{ padding: '9px 12px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ color: 'var(--red, #f85149)', fontWeight: 700 }}>{l.username || 'unknown'}</span>
                <span style={{ color: 'var(--muted)' }}> · {l.createdAt ? new Date(l.createdAt).toLocaleString() : ''}</span>
                <div style={{ marginTop: 2 }}>{explainFailure(l.reason)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )

  const renderDirectory = () => (
    <section style={sectionStyle(isMobile)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Icon name="users" size={18} style={{ color: '#b56cff' }} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>LLDAP Directory</h3>
        <span style={{
          marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11,
          padding: '4px 10px', borderRadius: 20,
          background: ldap.enabled ? 'rgba(63,185,80,.15)' : 'rgba(139,148,158,.15)',
          color: ldap.enabled ? 'var(--green)' : 'var(--muted)',
        }}>{ldap.enabled ? 'ON' : 'OFF'}</span>
      </div>

      <Checkbox style={{ marginBottom: 14 }} checked={!!ldap.enabled} onChange={checked => setLdap('enabled', checked)} label="Enable LLDAP login / OAuth" />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>LDAP URL</label>
          <Input style={inputStyle} value={ldap.url || ''} onChange={v => setLdap('url', v)} placeholder="ldap://lldap:3890" />
        </div>
        <div>
          <label style={labelStyle}>Base DN</label>
          <Input style={inputStyle} value={ldap.base_dn || ''} onChange={v => setLdap('base_dn', v)} placeholder="dc=aifazi,dc=net" />
        </div>
        <div>
          <label style={labelStyle}>Bind DN</label>
          <Input style={inputStyle} value={ldap.bind_dn || ''} onChange={v => setLdap('bind_dn', v)} placeholder="uid=admin,ou=people,dc=aifazi,dc=net" />
        </div>
        <div>
          <label style={labelStyle}>Users OU (optional)</label>
          <Input style={inputStyle} value={ldap.users_ou || ''} onChange={v => setLdap('users_ou', v)} placeholder="ou=people,dc=aifazi,dc=net" />
        </div>
        <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
          <label style={labelStyle}>
            Bind password {ldap.bind_password_set ? `(set — ${ldap.bind_password_masked || '••••'})` : '(not set)'}
          </label>
          <Input style={inputStyle} type="password" value={ldapPw} onChange={v => setLdapPw(v)}
            placeholder={ldap.bind_password_set ? 'Leave blank to keep current password' : 'Enter bind password'} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={saveLdap} disabled={saving} style={btnPrimary}>
          {saving ? 'Saving…' : 'Save LLDAP'}
        </button>
        <button type="button" onClick={testLdap} disabled={testing} style={btnGhost}>
          {testing ? 'Testing…' : 'Test connection'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
        Test probes the values above without saving — staged steps show exactly which layer fails.
      </div>
      {ldapTest && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: ldapTest.ok ? 'var(--green)' : 'var(--red)' }}>
            {ldapTest.ok ? `✅ ${ldapTest.message}` : `❌ ${ldapTest.message}`}
          </div>
          <StepList steps={ldapTest.steps} />
        </div>
      )}

      <div style={{
        marginTop: 16, padding: 12, borderRadius: 10,
        background: 'var(--bg)', border: '1px solid var(--border)',
        fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 2,
      }}>
        <div>First-party login: <span style={{ color: 'var(--cyan)' }}>{endpoints.ldap_login}</span>{endpoints.ldap_login ? copyBtn(endpoints.ldap_login, 'login path') : null}</div>
        <div>Authorize: <span style={{ color: 'var(--cyan)' }}>{endpoints.authorize}</span>{endpoints.authorize ? copyBtn(endpoints.authorize, 'authorize path') : null}</div>
        <div>Token: <span style={{ color: 'var(--cyan)' }}>{endpoints.token}</span>{endpoints.token ? copyBtn(endpoints.token, 'token path') : null}</div>
        <div>Discovery: <span style={{ color: 'var(--cyan)' }}>{endpoints.discovery}</span>{endpoints.discovery ? copyBtn(endpoints.discovery, 'discovery path') : null}</div>
      </div>
    </section>
  )

  const renderUpstream = () => (
    <div>
      <section style={sectionStyle(isMobile)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Icon name="shield" size={18} style={{ color: '#b56cff' }} />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Upstream IdP — Authentik</h3>
          <span style={{
            marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11,
            padding: '4px 10px', borderRadius: 20,
            background: up.configured ? 'rgba(63,185,80,.15)' : 'rgba(139,148,158,.15)',
            color: up.configured ? 'var(--green)' : 'var(--muted)',
          }}>{up.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>
          Portal values override Coolify env vars — rotate secrets here, no redeploy needed.
          The secret itself cannot be verified without a real login; watch last-success + failures instead.
        </p>
        {!up.api_token_set && (
          <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(210,153,34,.4)', background: 'rgba(210,153,34,.08)', fontSize: 13, color: 'var(--yellow, #d29922)' }}>
            No admin API token — user disable/enable syncs locally only. Paste the token below to enable Authentik-side sync.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Issuer <SourceBadge source={upSrc.issuer} /></label>
            <Input style={inputStyle} value={upDraft.issuer ?? ''} onChange={v => setUp('issuer', v)}
              placeholder={up.issuer || 'https://auth.aifazi.net'} />
          </div>
          <div>
            <label style={labelStyle}>Client ID <SourceBadge source={upSrc.client_id} /></label>
            <Input style={inputStyle} value={upDraft.client_id ?? ''} onChange={v => setUp('client_id', v)}
              placeholder={up.client_id || 'aifazi-net'} />
          </div>
          <div>
            <label style={labelStyle}>Client secret {up.client_secret_set ? `(set — ${up.client_secret_masked || '••••'})` : '(not set)'} <SourceBadge source={upSrc.client_secret} /></label>
            <Input style={inputStyle} type="password" value={upDraft.client_secret ?? ''} onChange={v => setUp('client_secret', v)}
              placeholder={up.client_secret_set ? 'Leave blank to keep' : 'Paste provider secret'} />
          </div>
          <div>
            <label style={labelStyle}>Admin API token {up.api_token_set ? `(set — ${up.api_token_masked || '••••'})` : '(not set)'} <SourceBadge source={upSrc.api_token} /></label>
            <Input style={inputStyle} type="password" value={upDraft.api_token ?? ''} onChange={v => setUp('api_token', v)}
              placeholder={up.api_token_set ? 'Leave blank to keep' : 'Authentik API token'} />
          </div>
          <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
            <label style={labelStyle}>Callback / redirect URI (must match Authentik exactly) <SourceBadge source={upSrc.redirect_uri} /></label>
            <Input style={inputStyle} value={upDraft.redirect_uri ?? ''} onChange={v => setUp('redirect_uri', v)}
              placeholder={up.redirect_uri || 'https://api.aifazi.net/api/auth/authentik/callback'} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={saveUpstream} disabled={busy === 'upstream-save'} style={btnPrimary}>
            {busy === 'upstream-save' ? 'Saving…' : 'Save Upstream IdP'}
          </button>
          <button type="button" onClick={verifyUpstream} disabled={busy === 'upstream-verify'} style={btnGhost}>
            {busy === 'upstream-verify' ? 'Verifying…' : 'Verify'}
          </button>
          {up.issuer ? (
            <a href={`${up.issuer}/if/admin`} target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: 'var(--cyan, #22d3ee)', marginLeft: 'auto' }}>
              Open Authentik admin ↗
            </a>
          ) : null}
        </div>
        {verifyRes && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: verifyRes.ok ? 'var(--green)' : 'var(--red)' }}>
              {verifyRes.ok ? '✅ Discovery, JWKS and authorize all pass.' : '❌ Verify failed — see steps.'}
            </div>
            <StepList steps={verifyRes.steps} />
          </div>
        )}

        <div style={{
          marginTop: 16, padding: 12, borderRadius: 10,
          background: 'var(--bg)', border: '1px solid var(--border)',
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 2,
        }}>
          <div>Callback to register in Authentik:{' '}
            <span style={{ color: 'var(--cyan)' }}>{up.redirect_uri || 'https://api.aifazi.net/api/auth/authentik/callback'}</span>
            {copyBtn(up.redirect_uri || 'https://api.aifazi.net/api/auth/authentik/callback', 'callback URL')}
          </div>
          <div style={{ lineHeight: 1.6 }}>Strict match — scheme, host, path and trailing slash must be identical on both sides.</div>
        </div>
      </section>

      <section style={sectionStyle(isMobile)}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Secret health signals</h3>
          <button type="button" onClick={loadSignals} style={{ ...btnGhost, marginLeft: 'auto', padding: '6px 12px', fontSize: 12 }}>Refresh</button>
        </div>
        {!signals ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
        ) : signals.error ? (
          <div style={{ color: 'var(--red)', fontSize: 13 }}>{signals.error}</div>
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.9 }}>
            <div>Last successful Authentik login:{' '}
              <strong style={{ color: signals.last_success_at ? 'var(--green)' : 'var(--yellow, #d29922)' }}>
                {signals.last_success_at ? `${signals.last_success_user} · ${new Date(signals.last_success_at).toLocaleString()}` : 'none recorded — rotate the secret, then log in once to establish a baseline'}
              </strong>
            </div>
            <div style={{ color: 'var(--muted)' }}>Recently-linked local accounts: {signals.linked_recent}</div>
            {(signals.recent_logins || []).length > 0 && (
              <div style={{ marginTop: 8 }}>
                {(signals.recent_logins || []).map((l, i) => (
                  <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                    ✅ {l.user} · {l.action} · {l.at ? new Date(l.at).toLocaleString() : ''}
                  </div>
                ))}
              </div>
            )}
            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
              If logins suddenly fail after a rotation, the new secret does not match Authentik — re-paste it above and check the Activity tab.
            </div>
          </div>
        )}
      </section>
    </div>
  )

  const renderSocial = () => (
    <section style={sectionStyle(isMobile)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Icon name="shield" size={18} style={{ color: '#22d3ee' }} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Social login platforms</h3>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>
        Sign-in buttons on aifazi.net. Portal values override Coolify/Vercel env vars. Test verifies credentials server-to-server — no user login needed.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {(cfg.providers || []).map(p => {
          const d = provDraft[p.id] || {}
          const isSteam = p.id === 'steam'
          const t = provTest[p.id]
          return (
            <div key={p.id} style={{
              padding: 16, borderRadius: 12,
              background: 'var(--bg)', border: '1px solid var(--border)',
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <strong style={{ fontSize: 14 }}>{p.label}</strong>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, padding: '3px 10px', borderRadius: 20,
                  background: p.configured ? 'rgba(63,185,80,.15)' : 'rgba(248,81,73,.15)',
                  color: p.configured ? 'var(--green)' : 'var(--red)',
                }}>{p.configured ? 'Configured' : 'Not configured'}</span>
                <SourceBadge source={p.from_env ? 'env' : 'portal'} />
                <a href={p.docs} target="_blank" rel="noreferrer"
                  style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--cyan, #22d3ee)' }}>
                  Developer docs ↗
                </a>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 10 }}>
                {!isSteam && (
                  <>
                    <div>
                      <label style={labelStyle}>Client ID</label>
                      <Input style={inputStyle} value={d.client_id ?? p.client_id ?? ''}
                        onChange={v => setProv(p.id, 'client_id', v)}
                        placeholder={p.client_id_set ? '•••• (set)' : 'OAuth app client id'} />
                    </div>
                    <div>
                      <label style={labelStyle}>
                        Client secret {p.secret_set ? `(set — ${p.secret_masked || '••••'})` : ''}
                      </label>
                      <Input style={inputStyle} type="password" value={d.client_secret || ''}
                        onChange={v => setProv(p.id, 'client_secret', v)}
                        placeholder={p.secret_set ? 'Leave blank to keep' : 'OAuth app secret'} />
                    </div>
                    <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                      <label style={labelStyle}>Redirect URI (must match the OAuth app)</label>
                      <Input style={inputStyle} value={d.redirect_uri ?? p.redirect_uri ?? ''}
                        onChange={v => setProv(p.id, 'redirect_uri', v)}
                        placeholder={p.redirect_hint} />
                    </div>
                  </>
                )}
                {isSteam && (
                  <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                    <label style={labelStyle}>
                      Steam Web API key {p.secret_set ? `(set — ${p.secret_masked || '••••'})` : ''}
                    </label>
                    <Input style={inputStyle} type="password" value={d.api_key || ''}
                      onChange={v => setProv(p.id, 'api_key', v)}
                      placeholder={p.secret_set ? 'Leave blank to keep' : 'From steamcommunity.com/dev/apikey'} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                      Callback: {p.redirect_hint}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <Checkbox
                  checked={d.enabled ?? p.enabled}
                  onChange={checked => setProv(p.id, 'enabled', checked)}
                  label="Enabled" />
                <button type="button" onClick={() => saveProvider(p.id)} disabled={saving} style={btnPrimary}>
                  Save {p.label}
                </button>
                {p.configured && (
                  <button type="button" onClick={() => testProvider(p.id)} disabled={busy === `test-${p.id}`} style={btnGhost}>
                    {busy === `test-${p.id}` ? 'Testing…' : 'Test'}
                  </button>
                )}
                {p.from_env && (
                  <button type="button" onClick={() => importEnv(p)} disabled={saving}
                    style={{ ...btnGhost, padding: '8px 14px', fontSize: 12 }}>
                    Store env values in portal
                  </button>
                )}
              </div>
              {t && (
                <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: t.ok ? 'var(--green)' : 'var(--red)' }}>
                  {t.ok ? `✅ ${t.detail}` : `❌ ${t.detail}`}
                  {!t.ok && t.hint ? <div style={{ color: 'var(--yellow, #d29922)', fontWeight: 400 }}>→ {t.hint}</div> : null}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )

  const renderClients = () => (
    <div>
      <section style={sectionStyle(isMobile)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Icon name="shield" size={18} style={{ color: '#22d3ee' }} />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>OAuth2 Clients</h3>
        </div>

        {(cfg.clients || []).length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 12, marginBottom: 16 }}>
            No OAuth clients yet. Add one below for apps that need “Sign in with aifazi”.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {cfg.clients.map(c => (
              <div key={c.client_id} style={{
                display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center',
                padding: '12px 14px', borderRadius: 12,
                background: 'var(--bg)', border: '1px solid var(--border)',
              }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>{c.client_id}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                    {(c.redirect_uris || []).join(' · ') || 'no redirect URIs'}
                    {c.public ? ' · public' : ''}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)' }}>
                  {c.has_secret ? c.secret_masked : 'no secret'}
                </div>
                {!c.public && (
                  <button type="button" onClick={() => rotateClient(c.client_id)} disabled={busy === `rotate-${c.client_id}`}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: '1px solid var(--yellow, #d29922)',
                      background: 'transparent', color: 'var(--yellow, #d29922)', cursor: 'pointer', fontSize: 12,
                    }}>Rotate secret</button>
                )}
                <button type="button" onClick={() => setEditing({
                  client_id: c.client_id, name: c.name,
                  redirect_uris: (c.redirect_uris || []).join('\n'), public: !!c.public,
                })}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 12,
                  }}>Edit</button>
                <button type="button" onClick={() => deleteClient(c.client_id)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--red, #f85149)',
                    background: 'transparent', color: 'var(--red, #f85149)', cursor: 'pointer', fontSize: 12,
                  }}>Delete</button>
              </div>
            ))}
          </div>
        )}

        {editing && (
          <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)' }}>
            <div style={{ ...labelStyle, marginBottom: 10 }}>EDITING {editing.client_id} (secret unchanged — use Rotate to change it)</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Display name</label>
                <Input style={inputStyle} value={editing.name} onChange={v => setEditing(e => ({ ...e, name: v }))} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 10 }}>
                <Checkbox checked={editing.public} onChange={checked => setEditing(e => ({ ...e, public: checked }))} label="Public client (SPA / PKCE, no secret)" />
              </div>
              <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                <label style={labelStyle}>Redirect URIs (one per line)</label>
                <TextArea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                  value={editing.redirect_uris}
                  onChange={v => setEditing(e => ({ ...e, redirect_uris: v }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={saveClientEdit} style={btnPrimary}>Save changes</button>
              <button type="button" onClick={() => setEditing(null)} style={btnGhost}>Cancel</button>
            </div>
          </div>
        )}

        {createdSecret && (
          <div style={{
            marginBottom: 16, padding: 14, borderRadius: 12,
            border: '1px solid rgba(63,185,80,.4)', background: 'rgba(63,185,80,.1)',
          }}>
            <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 6 }}>Copy secret now — shown once</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all' }}>
              client_id: {createdSecret.client_id}<br />
              secret: {createdSecret.secret || '(public client — none)'}
              {createdSecret.secret ? copyBtn(createdSecret.secret, 'client secret') : null}
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 12 }}>NEW CLIENT</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Client ID</label>
              <Input style={inputStyle} value={newClient.client_id} onChange={v => setNewClient(p => ({ ...p, client_id: v }))} placeholder="my-app" />
            </div>
            <div>
              <label style={labelStyle}>Display name</label>
              <Input style={inputStyle} value={newClient.name} onChange={v => setNewClient(p => ({ ...p, name: v }))} placeholder="My App" />
            </div>
            <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
              <label style={labelStyle}>Redirect URIs (one per line)</label>
              <TextArea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                value={newClient.redirect_uris}
                onChange={v => setNewClient(p => ({ ...p, redirect_uris: v }))}
                placeholder="https://app.example.com/callback" />
            </div>
            <div>
              <label style={labelStyle}>Secret (optional — auto-generated if empty)</label>
              <Input style={inputStyle} type="password" value={newClient.secret} onChange={v => setNewClient(p => ({ ...p, secret: v }))} />
            </div>
            <Checkbox style={{ alignSelf: 'end' }} checked={newClient.public} onChange={checked => setNewClient(p => ({ ...p, public: checked }))} label="Public client (SPA / PKCE, no secret)" />
          </div>
          <button type="button" onClick={createClient}
            style={{
              padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#22d3ee,#0891b2)', color: '#041016', fontWeight: 700, fontSize: 13,
            }}>
            Create client
          </button>
        </div>
      </section>

      <section style={sectionStyle(isMobile)}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>Integrate an app</h3>
        <pre style={{
          margin: 0, padding: 14, borderRadius: 10, overflow: 'auto',
          background: 'var(--bg)', border: '1px solid var(--border)',
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', lineHeight: 1.6,
        }}>{`# 1) Browser → authorize (PKCE)
GET ${endpoints.authorize || '/api/auth/oauth/authorize'}
  ?client_id=YOUR_ID
  &redirect_uri=https://app.example.com/callback
  &response_type=code
  &scope=openid%20profile%20email
  &state=xyz
  &code_challenge=CHALLENGE
  &code_challenge_method=S256

# 2) App backend → token
POST ${endpoints.token || '/api/auth/oauth/token'}
  grant_type=authorization_code
  &code=...
  &redirect_uri=https://app.example.com/callback
  &client_id=YOUR_ID
  &client_secret=...
  &code_verifier=...

# 3) Profile
GET ${endpoints.userinfo || '/api/auth/oauth/userinfo'}
Authorization: Bearer ACCESS_TOKEN`}</pre>
      </section>
    </div>
  )

  const renderUsers = () => (
    <section style={sectionStyle(isMobile)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <Icon name="users" size={18} style={{ color: '#b56cff' }} />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Identity Users</h3>
        {idUsers && !idUsers.authentik_admin && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
            padding: '3px 10px', borderRadius: 8,
            background: 'rgba(210,153,34,.12)', border: '1px solid rgba(210,153,34,.4)',
            color: 'var(--yellow, #d29922)',
          }}>LOCAL MODE — NO ADMIN API TOKEN</span>
        )}
        <select value={userFilter} onChange={e => setUserFilter(e.target.value)}
          style={{ ...inputStyle, width: 'auto', marginLeft: 'auto', padding: '6px 10px', fontSize: 12 }}>
          <option value="all">All users</option>
          <option value="linked">Authentik-linked</option>
          <option value="local">Local-only</option>
          <option value="disabled">Disabled</option>
        </select>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
        Local users with Authentik linkage status.
        {!idUsers?.authentik_admin && (
          <> Disable/enable syncs locally only — <button type="button" onClick={() => setTab('upstream')}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: 'var(--cyan, #22d3ee)', textDecoration: 'underline' }}>
            paste the admin API token in the Upstream IdP tab
          </button> to sync Authentik-side.</>
        )}
      </div>
      {idLoading ? (
        <div style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>Loading users…</div>
      ) : filteredUsers.length === 0 ? (
        <div style={{ padding: 16, color: 'var(--muted)', fontSize: 13 }}>No users match this filter.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredUsers.map(u => (
            <div key={u.id} style={{
              display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
              padding: '10px 14px', borderRadius: 12,
              background: 'var(--bg)', border: '1px solid var(--border)',
            }}>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{u.username}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
                  {u.email || 'no email'} · {u.role}
                  {u.last_seen ? ` · seen ${new Date(u.last_seen).toLocaleDateString()}` : ''}
                </div>
              </div>
              <span style={{ fontSize: 12 }}>{u.authentik_linked ? '🔗 Authentik' : '👤 Local'}</span>
              <span style={{ fontSize: 12, color: u.active ? 'var(--green)' : 'var(--red)' }}>
                {u.active ? '✅ Active' : '🚫 Disabled'}
              </span>
              {u.active ? (
                <button type="button" onClick={() => toggleIdentity(u, false)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--red, #f85149)',
                    background: 'transparent', color: 'var(--red, #f85149)', cursor: 'pointer', fontSize: 12,
                  }}>Disable</button>
              ) : (
                <button type="button" onClick={() => toggleIdentity(u, true)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--green, #3fb950)',
                    background: 'transparent', color: 'var(--green, #3fb950)', cursor: 'pointer', fontSize: 12,
                  }}>Enable</button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )

  const renderActivity = () => {
    const rows = activity.showAll ? activity.logs : failures
    return (
      <section style={sectionStyle(isMobile)}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Sign-in activity</h3>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {failures.length} failure{failures.length === 1 ? '' : 's'} in the last {(activity.logs || []).length} attempts
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => loadActivity(!activity.showAll)} style={{ ...btnGhost, padding: '6px 12px', fontSize: 12 }}>
              {activity.showAll ? 'Failures only' : 'Show all'}
            </button>
            <button type="button" onClick={() => loadActivity(activity.showAll)} style={{ ...btnGhost, padding: '6px 12px', fontSize: 12 }}>Refresh</button>
          </div>
        </div>
        {activity.loading ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            {activity.showAll ? 'No sign-in attempts recorded yet.' : 'No failures — all recent sign-ins succeeded. 🎉'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((l, i) => (
              <div key={l._id || i} style={{ padding: '9px 12px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: l.success ? 'var(--green)' : 'var(--red, #f85149)' }}>
                  {l.success ? '✅' : '❌'} {l.username || 'unknown'}
                </span>
                <span style={{ color: 'var(--muted)' }}>
                  {' '}· {l.createdAt ? new Date(l.createdAt).toLocaleString() : ''}{l.ip ? ` · ${l.ip}` : ''}
                </span>
                {!l.success && <div style={{ marginTop: 2 }}>{explainFailure(l.reason)}</div>}
                {l.success && l.reason ? <div style={{ marginTop: 2, color: 'var(--muted)' }}>{l.reason}</div> : null}
              </div>
            ))}
          </div>
        )}
      </section>
    )
  }

  return (
    <div>
      <PageHeader
        title="Identity & OAuth"
        subtitle="LLDAP directory + OAuth2 clients for aifazi.net and third-party apps"
      />
      <Flash msg={msg} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            style={{
              padding: '8px 16px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              border: `1px solid ${tab === t.id ? '#b56cff' : 'var(--border)'}`,
              background: tab === t.id ? 'rgba(181,108,255,.15)' : 'transparent',
              color: tab === t.id ? '#d8b4fe' : 'var(--muted)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && renderOverview()}
      {tab === 'directory' && renderDirectory()}
      {tab === 'upstream' && renderUpstream()}
      {tab === 'social' && renderSocial()}
      {tab === 'clients' && renderClients()}
      {tab === 'users' && renderUsers()}
      {tab === 'activity' && renderActivity()}
    </div>
  )
}

export default OAuthSettings
