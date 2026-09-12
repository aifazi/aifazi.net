'use client'
import React, { useCallback, useEffect, useState } from 'react'
import api from '@/lib/api'
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
  fontSize: 10,
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  color: 'var(--muted, #8b949e)',
  marginBottom: 6,
}

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

function OAuthSettings() {
  const isMobile = useIsMobile()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [ldapPw, setLdapPw] = useState('') // only sent when non-empty
  const [newClient, setNewClient] = useState({ client_id: '', name: '', secret: '', redirect_uris: '', public: false })
  const [createdSecret, setCreatedSecret] = useState(null)
  const [showSecrets, setShowSecrets] = useState({})

  const flash = (type, text, ms = 7000) => {
    setMsg({ type, text })
    if (ms) setTimeout(() => setMsg(null), ms)
  }

  const load = useCallback(async () => {
    try {
      const r = await api.get('/admin/oauth')
      setCfg(r.data)
    } catch (e) {
      flash('err', e.response?.data?.detail || e.response?.data?.error || 'Failed to load OAuth settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await api.get('/admin/oauth')
        if (alive) setCfg(r.data)
      } catch (e) {
        if (alive) {
          setMsg({
            type: 'err',
            text: e.response?.data?.detail || e.response?.data?.error || 'Failed to load OAuth settings',
          })
        }
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const setLdap = (k, v) => setCfg(p => ({ ...p, lldap: { ...(p.ldap || {}), [k]: v } }))

  const saveLdap = async () => {
    setSaving(true)
    try {
      const body = { enabled: cfg.enabled, lldap: { ...cfg.ldap } }
      if (ldapPw) body.ldap.bind_password = ldapPw
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

  const testLdap = async () => {
    setTesting(true)
    try {
      // save first so test uses latest password
      const body = { lldap: { ...cfg.ldap } }
      if (ldapPw) body.ldap.bind_password = ldapPw
      await api.put('/admin/oauth', body)
      const r = await api.post('/admin/oauth/test-ldap')
      flash('ok', r.data.message || 'LLDAP OK')
      setLdapPw('')
      load()
    } catch (e) {
      flash('err', e.response?.data?.detail || 'LLDAP test failed')
    } finally {
      setTesting(false)
    }
  }

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

  const deleteClient = async (id) => {
    if (!confirm(`Delete OAuth client "${id}"?`)) return
    try {
      await api.delete(`/admin/oauth/clients/${id}`)
      flash('ok', `Client ${id} deleted`)
      load()
    } catch (e) {
      flash('err', e.response?.data?.detail || 'Delete failed')
    }
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--muted)' }}>Loading identity settings…</div>
  if (!cfg) return <div style={{ padding: 24, color: 'var(--red)' }}>Failed to load.</div>

  const ldap = cfg.ldap || {}
  const endpoints = cfg.endpoints || {}

  return (
    <div>
      <PageHeader
        title="Identity & OAuth"
        subtitle="LLDAP directory + OAuth2 clients for aifazi.net and third-party apps"
      />
      <Flash msg={msg} />

      {/* ── Status strip ─────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: 12, marginBottom: 22,
      }}>
        {[
          { label: 'DIRECTORY', value: cfg.ldap_healthy ? 'Connected' : 'Unreachable', color: cfg.ldap_healthy ? 'var(--green)' : 'var(--red)' },
          { label: 'OAUTH', value: cfg.enabled !== false ? 'Enabled' : 'Disabled', color: cfg.enabled !== false ? 'var(--cyan, #22d3ee)' : 'var(--muted)' },
          { label: 'CLIENTS', value: String((cfg.clients || []).length), color: '#b56cff' },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '14px 16px',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted)' }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: s.color, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── LLDAP ────────────────────────────────────────────────── */}
      <section style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 14, padding: isMobile ? 16 : 22, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Icon name="users" size={18} style={{ color: '#b56cff' }} />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>LLDAP Directory</h3>
          <span style={{
            marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10,
            padding: '4px 10px', borderRadius: 20,
            background: ldap.enabled ? 'rgba(63,185,80,.15)' : 'rgba(139,148,158,.15)',
            color: ldap.enabled ? 'var(--green)' : 'var(--muted)',
          }}>{ldap.enabled ? 'ON' : 'OFF'}</span>
        </div>

        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 14 }}>
          <input type="checkbox" checked={!!ldap.enabled} onChange={e => setLdap('enabled', e.target.checked)} />
          Enable LLDAP login / OAuth
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>LDAP URL</label>
            <input style={inputStyle} value={ldap.url || ''} onChange={e => setLdap('url', e.target.value)} placeholder="ldap://lldap:3890" />
          </div>
          <div>
            <label style={labelStyle}>Base DN</label>
            <input style={inputStyle} value={ldap.base_dn || ''} onChange={e => setLdap('base_dn', e.target.value)} placeholder="dc=aifazi,dc=net" />
          </div>
          <div>
            <label style={labelStyle}>Bind DN</label>
            <input style={inputStyle} value={ldap.bind_dn || ''} onChange={e => setLdap('bind_dn', e.target.value)} placeholder="uid=admin,ou=people,dc=aifazi,dc=net" />
          </div>
          <div>
            <label style={labelStyle}>Users OU (optional)</label>
            <input style={inputStyle} value={ldap.users_ou || ''} onChange={e => setLdap('users_ou', e.target.value)} placeholder="ou=people,dc=aifazi,dc=net" />
          </div>
          <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
            <label style={labelStyle}>
              Bind password {ldap.bind_password_set ? `(set — ${ldap.bind_password_masked || '••••'})` : '(not set)'}
            </label>
            <input style={inputStyle} type="password" value={ldapPw} onChange={e => setLdapPw(e.target.value)}
              placeholder={ldap.bind_password_set ? 'Leave blank to keep current password' : 'Enter bind password'} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={saveLdap} disabled={saving}
            style={{
              padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#b56cff,#9333ea)', color: '#fff', fontWeight: 600, fontSize: 13,
            }}>
            {saving ? 'Saving…' : 'Save LLDAP'}
          </button>
          <button type="button" onClick={testLdap} disabled={testing}
            style={{
              padding: '10px 18px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontWeight: 600, fontSize: 13,
            }}>
            {testing ? 'Testing…' : 'Test connection'}
          </button>
        </div>

        <div style={{
          marginTop: 16, padding: 12, borderRadius: 10,
          background: 'var(--bg)', border: '1px solid var(--border)',
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.7,
        }}>
          <div>First-party login: <span style={{ color: 'var(--cyan)' }}>{endpoints.ldap_login}</span></div>
          <div>Authorize: <span style={{ color: 'var(--cyan)' }}>{endpoints.authorize}</span></div>
          <div>Token: <span style={{ color: 'var(--cyan)' }}>{endpoints.token}</span></div>
          <div>Discovery: <span style={{ color: 'var(--cyan)' }}>{endpoints.discovery}</span></div>
        </div>
      </section>

      {/* ── Clients ──────────────────────────────────────────────── */}
      <section style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 14, padding: isMobile ? 16 : 22, marginBottom: 20,
      }}>
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
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                    {(c.redirect_uris || []).join(' · ') || 'no redirect URIs'}
                    {c.public ? ' · public' : ''}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)' }}>
                  {c.has_secret ? (showSecrets[c.client_id] ? c.secret_masked : c.secret_masked) : 'no secret'}
                </div>
                <button type="button" onClick={() => deleteClient(c.client_id)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--red, #f85149)',
                    background: 'transparent', color: 'var(--red, #f85149)', cursor: 'pointer', fontSize: 12,
                  }}>Delete</button>
              </div>
            ))}
          </div>
        )}

        {createdSecret && (
          <div style={{
            marginBottom: 16, padding: 14, borderRadius: 12,
            border: '1px solid rgba(63,185,80,.4)', background: 'rgba(63,185,80,.1)',
          }}>
            <div style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 6 }}>Client created — copy secret now</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all' }}>
              client_id: {createdSecret.client_id}<br />
              secret: {createdSecret.secret || '(public client — none)'}
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', marginBottom: 12 }}>NEW CLIENT</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Client ID</label>
              <input style={inputStyle} value={newClient.client_id} onChange={e => setNewClient(p => ({ ...p, client_id: e.target.value }))} placeholder="my-app" />
            </div>
            <div>
              <label style={labelStyle}>Display name</label>
              <input style={inputStyle} value={newClient.name} onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))} placeholder="My App" />
            </div>
            <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
              <label style={labelStyle}>Redirect URIs (one per line)</label>
              <textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
                value={newClient.redirect_uris}
                onChange={e => setNewClient(p => ({ ...p, redirect_uris: e.target.value }))}
                placeholder="https://app.example.com/callback" />
            </div>
            <div>
              <label style={labelStyle}>Secret (optional — auto-generated if empty)</label>
              <input style={inputStyle} type="password" value={newClient.secret} onChange={e => setNewClient(p => ({ ...p, secret: e.target.value }))} />
            </div>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'end', cursor: 'pointer' }}>
              <input type="checkbox" checked={newClient.public} onChange={e => setNewClient(p => ({ ...p, public: e.target.checked }))} />
              Public client (SPA / PKCE, no secret)
            </label>
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

      {/* ── How to integrate ─────────────────────────────────────── */}
      <section style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 14, padding: isMobile ? 16 : 22,
      }}>
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
}

export default OAuthSettings
