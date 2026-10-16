'use client'
import Image from 'next/image'
import { useState, useEffect, Fragment } from 'react'
import api, { getRole, getUsername } from '@/lib/api'
import { useToast } from '../../../components/Toast'
import { useIsMobile } from '../shared'
import { Input } from '../../../core/ui.jsx'
import { ActiveSessionsPanel } from './ActiveSessionsPanel'

// Split out of AdminPanels.jsx - admin self-edit profile.
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
  const [form, setForm]   = useState({ currentPassword: '', newPassword: '', confirmPassword: '', currentCode: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // ── 2FA state ────────────────────────────────────────────────────────────────
  const [twoFA, setTwoFA] = useState({
    enabled:    false,
    loading:    true,
    qr:         null,   // base64 QR image from /auth/2fa/setup
    secret:     null,   // raw TOTP secret (for manual entry)
    step:       null,   // null | 'setup' | 'confirm' | 'disable' | 'regen'
    code:       '',
    disablePw:  '',
    regenPw:    '',
    recoveryCodes: null, // shown exactly once, from enable/regenerate response
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
    setTF({ step: 'setup', working: true, error: '', recoveryCodes: null })
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
      const r = await api.post('/auth/2fa/confirm', { code: twoFA.code.replace(/\s/g, '') })
      setTF({ enabled: true, step: null, qr: null, secret: null, code: '', working: false, recoveryCodes: r.data?.recovery_codes || null })
      toast.success('Two-factor authentication is now active', { title: '🔐 2FA Enabled' })
    } catch (err) {
      setTF({ error: err?.response?.data?.detail || 'Invalid code.', working: false })
    }
  }

  const handleDisable = async () => {
    if (!twoFA.disablePw) { setTF({ error: 'Enter your current password to disable 2FA.' }); return }
    const codeClean = twoFA.code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(codeClean) && !/^[A-Za-z2-7]{12}$/.test(codeClean)) { setTF({ error: 'Enter your 6-digit authenticator code or a recovery code.' }); return }
    setTF({ working: true, error: '' })
    try {
      await api.post('/auth/2fa/disable', { password: twoFA.disablePw, code: codeClean })
      setTF({ enabled: false, step: null, disablePw: '', code: '', working: false, recoveryCodes: null })
      toast.success('Two-factor authentication has been disabled', { title: '2FA Disabled' })
    } catch (err) {
      setTF({ error: err?.response?.data?.detail || 'Incorrect password or invalid code.', working: false })
    }
  }

  const handleRegenCodes = async () => {
    if (!twoFA.regenPw) { setTF({ error: 'Enter your current password to regenerate recovery codes.' }); return }
    const codeClean = twoFA.code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(codeClean) && !/^[A-Za-z2-7]{12}$/.test(codeClean)) { setTF({ error: 'Enter your 6-digit authenticator code or a recovery code.' }); return }
    setTF({ working: true, error: '' })
    try {
      const r = await api.post('/auth/2fa/recovery-codes', { password: twoFA.regenPw, code: codeClean })
      setTF({ step: null, regenPw: '', code: '', working: false, recoveryCodes: r.data?.recovery_codes || null })
      toast.success('New recovery codes generated', { title: '🔐 Recovery Codes' })
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
    const codeClean = twoFA.enabled ? form.currentCode.replace(/\s/g, '') : ''
    if (twoFA.enabled && !/^\d{6}$/.test(codeClean) && !/^[A-Za-z2-7]{12}$/.test(codeClean)) {
      toast.error('Enter your 6-digit authenticator code or a recovery code', { title: '2FA Required' }); return
    }
    setSaving(true)
    try {
      await api.post('/auth/change-password', { current_password: form.currentPassword, new_password: form.newPassword, code: codeClean })
      toast.success('Password updated successfully', { title: 'Saved' })
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '', currentCode: '' })
    } catch (err) { toast.error(err.response?.data?.error || 'Update failed', { title: 'Error' }) }
    finally { setSaving(false) }
  }

  const T = { label: { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }, inp: { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none', boxSizing: 'border-box' } }

  return (
    <div style={{ maxWidth: 520, padding: isMobile ? 16 : 32 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 22 : 28, fontWeight: 700, marginBottom: 28 }}>My Profile</h2>

      {/* Account info */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 24, marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--muted)', marginBottom: 16 }}>ACCOUNT INFO</div>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
          {[['USERNAME', username], ['ROLE', getRole()?.toUpperCase()], ['ACCESS', 'Admin Panel']].map(([label, value]) => (
            <Fragment key={label}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 1 }}>{label}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>{value}</span>
            </Fragment>
          ))}
        </div>
      </div>

      {/* Change username */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 24, marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--muted)', marginBottom: 16 }}>CHANGE USERNAME</div>
        {/* Vercel env notice */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--yellow)', lineHeight: 1.7, padding: '8px 12px', background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 4, marginBottom: 16 }}>
          ⚠️ Your <strong>login username</strong> is controlled by the <code>ADMIN_USERNAME</code> environment variable in Vercel.<br />
          Changing it here updates your display name only. To change the login username, update <code>ADMIN_USERNAME</code> in Vercel → Settings → Environment Variables and redeploy.
        </div>
        {unameMsg && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: unameMsg.type === 'warn' ? 'var(--yellow)' : 'var(--green)', lineHeight: 1.8, padding: '8px 12px', background: unameMsg.type === 'warn' ? 'rgba(251,191,36,0.06)' : 'color-mix(in srgb, var(--green) 6%, transparent)', border: `1px solid ${unameMsg.type === 'warn' ? 'rgba(251,191,36,0.3)' : 'color-mix(in srgb, var(--green) 30%, transparent)'}`, borderRadius: 4, marginBottom: 14 }}>
            {unameMsg.text}<br />{unameMsg.envNote}
          </div>
        )}
        <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>NEW USERNAME</label>
        <Input value={unameForm.newUsername} onChange={v => setUnameForm(p => ({ ...p, newUsername: v }))}
          placeholder="Enter new display name"
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none', marginBottom: 12 }} />
        <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>CURRENT PASSWORD (to confirm)</label>
        <Input type="password" value={unameForm.currentPassword} onChange={v => setUnameForm(p => ({ ...p, currentPassword: v }))}
          placeholder="Your current password"
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none', marginBottom: 14 }} />
        <button onClick={handleUsernameChange} disabled={unameSaving}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '11px 22px', background: unameSaving ? 'var(--bg3)' : 'var(--cyan)', color: unameSaving ? 'var(--muted)' : '#000', border: 'none', cursor: unameSaving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
          {unameSaving ? 'UPDATING...' : 'UPDATE USERNAME'}
        </button>
      </div>

      {/* Change password */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: 24, marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--muted)', marginBottom: 16 }}>CHANGE PASSWORD</div>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label style={T.label}>Current Password</label><Input type="password" value={form.currentPassword} onChange={v => set('currentPassword', v)} placeholder="" style={T.inp} required /></div>
          <div><label style={T.label}>New Password</label><Input type="password" value={form.newPassword} onChange={v => set('newPassword', v)} placeholder="" style={T.inp} required minLength={8} /></div>
          <div><label style={T.label}>Confirm New Password</label><Input type="password" value={form.confirmPassword} onChange={v => set('confirmPassword', v)} placeholder="" style={T.inp} required /></div>
          {twoFA.enabled && (
            <div><label style={T.label}>2FA Code</label><Input value={form.currentCode} onChange={v => set('currentCode', v.replace(/[^A-Za-z0-9 \-]/g, ''))} placeholder="6-digit code or recovery code" style={T.inp} autoComplete="one-time-code" /></div>
          )}
          {form.newPassword && form.confirmPassword && form.newPassword !== form.confirmPassword && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff4757' }}>❌ Passwords do not match</div>
          )}
          <button type="submit" disabled={saving} style={{ padding: '12px 24px', background: saving ? 'var(--bg3)' : 'var(--green)', color: saving ? 'var(--muted)' : '#000', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', alignSelf: 'flex-start' }}>
            {saving ? 'UPDATING...' : 'UPDATE PASSWORD'}
          </button>
        </form>
      </div>

      {/* ── 2FA Panel ─────────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg2)', border: `1px solid ${twoFA.enabled ? 'color-mix(in srgb, var(--green) 30%, transparent)' : 'var(--border)'}`, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--muted)' }}>TWO-FACTOR AUTHENTICATION</div>
          {!twoFA.loading && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, padding: '2px 10px', borderRadius: 12, background: twoFA.enabled ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'rgba(255,71,87,0.1)', border: `1px solid ${twoFA.enabled ? 'color-mix(in srgb, var(--green) 35%, transparent)' : 'rgba(255,71,87,0.3)'}`, color: twoFA.enabled ? 'var(--green)' : '#ff4757' }}>
              {twoFA.enabled ? '● ACTIVE' : '○ DISABLED'}
            </span>
          )}
        </div>

        {twoFA.loading && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', padding: '12px 0' }}>Loading 2FA status…</div>
        )}

        {/* Error */}
        {twoFA.error && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#ff4757', background: 'rgba(255,71,87,0.07)', border: '1px solid rgba(255,71,87,0.25)', padding: '10px 14px', marginBottom: 14, borderRadius: 4 }}>{twoFA.error}</div>
        )}

        {/* ── Idle: not enabled, no active step ── */}
        {!twoFA.loading && !twoFA.enabled && !twoFA.step && (
          <>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 16 }}>
              Add an extra layer of security. Each login will require a time-based code from your authenticator app (Google Authenticator, Authy, 1Password, etc.).
            </p>
            <button onClick={handleSetupStart} style={{ padding: '10px 20px', background: 'var(--green)', color: '#000', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700, border: 'none', cursor: 'pointer', borderRadius: 2 }}>
              ENABLE 2FA →
            </button>
          </>
        )}

        {/* ── Setup step: show QR code ── */}
        {!twoFA.loading && twoFA.step === 'setup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {twoFA.working && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>Generating QR code…</div>}
            {twoFA.qr && (
              <>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.7, margin: 0 }}>
                  Scan this QR code with your authenticator app, then enter the 6-digit code below to confirm.
                </p>
                <div style={{ background: '#fff', padding: 12, borderRadius: 6, display: 'inline-block', alignSelf: 'flex-start' }}>
                  <Image unoptimized width={160} height={160} src={twoFA.qr} alt="2FA QR Code" style={{ display: 'block', width: 160, height: 160 }} />
                </div>
                {twoFA.secret && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.7 }}>
                    Manual entry: <span style={{ color: 'var(--cyan)', letterSpacing: 2, userSelect: 'all' }}>{twoFA.secret}</span>
                  </div>
                )}
                <div>
                  <label style={T.label}>Confirm Code</label>
                  <Input
                    inputMode="numeric" maxLength={7}
                    placeholder="000 000"
                    value={twoFA.code}
                    onChange={v => setTF({ code: v.replace(/[^0-9 ]/g, ''), error: '' })}
                    style={{ ...T.inp, textAlign: 'center', fontSize: 18, letterSpacing: 6, width: 160 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={handleConfirm} disabled={twoFA.working} style={{ padding: '10px 20px', background: twoFA.working ? 'var(--bg3)' : 'var(--green)', color: twoFA.working ? 'var(--muted)' : '#000', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700, border: 'none', cursor: twoFA.working ? 'not-allowed' : 'pointer', borderRadius: 2 }}>
                    {twoFA.working ? 'VERIFYING…' : 'CONFIRM & ACTIVATE'}
                  </button>
                  <button onClick={() => setTF({ step: null, qr: null, secret: null, code: '', error: '' })} style={{ padding: '10px 16px', background: 'transparent', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, border: '1px solid var(--border)', cursor: 'pointer', borderRadius: 2 }}>
                    CANCEL
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Enabled: show disable option ── */}
        {!twoFA.loading && twoFA.enabled && twoFA.step !== 'disable' && twoFA.step !== 'regen' && (
          <>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.7, marginBottom: 16 }}>
              2FA is active on your account. Every login requires a code from your authenticator app.
            </p>

            {twoFA.recoveryCodes && (
              <div style={{ border: '1px solid color-mix(in srgb, var(--cyan) 40%, transparent)', background: 'color-mix(in srgb, var(--cyan) 8%, transparent)', padding: 16, marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--cyan)', marginBottom: 8 }}>BACKUP RECOVERY CODES — SAVE THESE NOW</div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.7, margin: '0 0 10px' }}>
                  Each code can be used once to sign in if you lose your authenticator. Store them somewhere safe — they won&apos;t be shown again.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
                  {twoFA.recoveryCodes.map(c => (
                    <div key={c} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1.5, background: 'var(--bg2)', border: '1px solid var(--border)', padding: '8px 10px', borderRadius: 4, color: 'var(--text)', userSelect: 'all' }}>{c}</div>
                  ))}
                </div>
                <button onClick={() => setTF({ recoveryCodes: null })} style={{ marginTop: 12, padding: '8px 14px', background: 'transparent', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, border: '1px solid var(--border)', cursor: 'pointer', borderRadius: 2 }}>
                  I&apos;VE SAVED THESE
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={() => setTF({ step: 'disable', error: '' })} style={{ padding: '10px 20px', background: 'transparent', color: '#ff4757', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700, border: '1px solid rgba(255,71,87,0.4)', cursor: 'pointer', borderRadius: 2 }}>
                DISABLE 2FA
              </button>
              <button onClick={() => setTF({ step: 'regen', error: '', code: '' })} style={{ padding: '10px 20px', background: 'transparent', color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700, border: '1px solid color-mix(in srgb, var(--cyan) 45%, transparent)', cursor: 'pointer', borderRadius: 2 }}>
                REGENERATE RECOVERY CODES
              </button>
            </div>
          </>
        )}

        {/* ── Regenerate recovery codes confirmation ── */}
        {!twoFA.loading && twoFA.step === 'regen' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.7, margin: 0 }}>
              Generate a new set of recovery codes? Your current codes will be invalidated. Enter your password and an authenticator (or recovery) code to confirm.
            </p>
            <div>
              <label style={T.label}>Current Password</label>
              <Input type="password" value={twoFA.regenPw} onChange={v => setTF({ regenPw: v, error: '' })} placeholder="" style={{ ...T.inp, maxWidth: 280 }} />
            </div>
            <div>
              <label style={T.label}>Authenticator / Recovery Code</label>
              <Input
                pattern="[A-Za-z0-9 \-]*" maxLength={23}
                placeholder="000 000  ·  XXXX-XXXX-XXXX"
                value={twoFA.code}
                onChange={v => setTF({ code: v.replace(/[^A-Za-z0-9 \-]/g, ''), error: '' })}
                style={{ ...T.inp, maxWidth: 260, textAlign: 'center', fontSize: 14, letterSpacing: 3, fontFamily: 'var(--font-mono)' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleRegenCodes} disabled={twoFA.working} style={{ padding: '10px 20px', background: twoFA.working ? 'var(--bg3)' : 'var(--cyan)', color: twoFA.working ? 'var(--muted)' : '#000', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700, border: 'none', cursor: twoFA.working ? 'not-allowed' : 'pointer', borderRadius: 2 }}>
                {twoFA.working ? 'GENERATING…' : 'GENERATE NEW CODES'}
              </button>
              <button onClick={() => setTF({ step: null, regenPw: '', code: '', error: '' })} style={{ padding: '10px 16px', background: 'transparent', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, border: '1px solid var(--border)', cursor: 'pointer', borderRadius: 2 }}>
                CANCEL
              </button>
            </div>
          </div>
        )}

        {/* ── Disable confirmation ── */}
        {!twoFA.loading && twoFA.step === 'disable' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.7, margin: 0 }}>
              Enter your current password and authenticator code to confirm removal of 2FA from your account.
            </p>
            <div>
              <label style={T.label}>Current Password</label>
              <Input type="password" value={twoFA.disablePw} onChange={v => setTF({ disablePw: v, error: '' })} placeholder="" style={{ ...T.inp, maxWidth: 280 }} />
            </div>
            <div>
              <label style={T.label}>Authenticator / Recovery Code</label>
              <Input
                pattern="[A-Za-z0-9 \-]*" maxLength={23}
                placeholder="000 000  ·  XXXX-XXXX-XXXX"
                value={twoFA.code}
                onChange={v => setTF({ code: v.replace(/[^A-Za-z0-9 \-]/g, ''), error: '' })}
                style={{ ...T.inp, maxWidth: 260, textAlign: 'center', fontSize: 14, letterSpacing: 3, fontFamily: 'var(--font-mono)' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleDisable} disabled={twoFA.working} style={{ padding: '10px 20px', background: twoFA.working ? 'var(--bg3)' : '#ff4757', color: twoFA.working ? 'var(--muted)' : '#fff', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700, border: 'none', cursor: twoFA.working ? 'not-allowed' : 'pointer', borderRadius: 2 }}>
                {twoFA.working ? 'DISABLING…' : 'CONFIRM DISABLE'}
              </button>
              <button onClick={() => setTF({ step: null, disablePw: '', code: '', error: '' })} style={{ padding: '10px 16px', background: 'transparent', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1, border: '1px solid var(--border)', cursor: 'pointer', borderRadius: 2 }}>
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

export { AdminProfilePanel }
