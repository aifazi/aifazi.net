'use client'
import React, { useState, useEffect } from 'react'
import api from '@/lib/api'
import { Checkbox, Select } from '../../core/ui.jsx'
import { S, useIsMobile, PageHeader } from './shared'

function MailSettings() {
  const [cfg, setCfg]               = useState(null)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [testing, setTesting]       = useState(false)
  const [testTo, setTestTo]         = useState('')
  const [msg, setMsg]               = useState(null)      // { type:'ok'|'err'|'warn', text }
  const [outTab, setOutTab]         = useState('brevo')   // 'brevo' | 'resend' | 'smtp'
  const [activeSection, setActiveSection] = useState('outgoing')
  const [smtpBlocked, setSmtpBlocked]     = useState(false)
  const [emailLog, setEmailLog]           = useState([])  // recent send attempts
  const [showLog, setShowLog]             = useState(false)
  const [verifyStatus, setVerifyStatus]   = useState(null) // null | 'ok' | 'err'

  const flash = (type, text, duration = 7000) => {
    setMsg({ type, text })
    if (duration) setTimeout(() => setMsg(null), duration)
  }

  const fetchMailConfig = async () => {
    try {
      const r = await api.get('/admin/email')
      setCfg(r.data)
      setOutTab(r.data.outgoingProvider || 'brevo')
    } catch (e) {
      flash('err', e.response?.data?.error || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMailConfig() }, [])

  const set = (field, val) => setCfg(p => ({ ...p, [field]: val }))

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/admin/email', { ...cfg, outgoingProvider: outTab })
      flash('ok', '✅ Settings saved. Changes are live immediately.')
    } catch (e) { flash('err', e.response?.data?.error || 'Save failed.') }
    finally { setSaving(false) }
  }

  const testConn = async () => {
    setTesting(true)
    setSmtpBlocked(false)
    setVerifyStatus(null)
    try {
      const res = await api.post('/admin/email/test-outgoing', { ...cfg, outgoingProvider: outTab })
      flash('ok', res.data.message)
      setVerifyStatus('ok')
      setEmailLog(p => [{ time: new Date().toLocaleTimeString(), type: 'verify', status: 'ok', msg: res.data.message }, ...p.slice(0, 19)])
    } catch (e) {
      const data = e.response?.data || {}
      if (data.smtpBlocked) setSmtpBlocked(true)
      flash('err', data.error || 'Connection test failed.')
      setVerifyStatus('err')
      setEmailLog(p => [{ time: new Date().toLocaleTimeString(), type: 'verify', status: 'err', msg: data.error || 'Failed' }, ...p.slice(0, 19)])
    } finally { setTesting(false) }
  }

  const sendTest = async () => {
    if (!testTo) { flash('err', 'Enter a recipient email.'); return }
    setTesting(true)
    try {
      const res = await api.post('/admin/email/send-test', { to: testTo })
      flash('ok', res.data.message)
      setEmailLog(p => [{ time: new Date().toLocaleTimeString(), type: 'send', status: 'ok', to: testTo, msg: res.data.message }, ...p.slice(0, 19)])
    } catch (e) {
      const errMsg = e.response?.data?.error || 'Test email failed.'
      flash('err', errMsg)
      setEmailLog(p => [{ time: new Date().toLocaleTimeString(), type: 'send', status: 'err', to: testTo, msg: errMsg }, ...p.slice(0, 19)])
    } finally { setTesting(false) }
  }

  const testIncoming = async () => {
    setTesting(true)
    try {
      const res = await api.post('/admin/email/test-incoming', cfg)
      flash('ok', res.data.message)
    } catch (e) { flash('err', e.response?.data?.error || 'Connection failed.') }
    finally { setTesting(false) }
  }

  const SMTP_PRESETS = {
    gmail:     { smtpHost: 'smtp.gmail.com',                          smtpPort: 465, smtpEncryption: 'ssl',      note: '⚠️ Cloud hosts block Gmail SMTP. Use Brevo or Resend instead.' },
    outlook:   { smtpHost: 'smtp-mail.outlook.com',                   smtpPort: 587, smtpEncryption: 'starttls', note: 'Use your full Outlook email as username.' },
    office365: { smtpHost: 'smtp.office365.com',                      smtpPort: 587, smtpEncryption: 'starttls', note: 'Use your O365 email and password.' },
    yahoo:     { smtpHost: 'smtp.mail.yahoo.com',                     smtpPort: 465, smtpEncryption: 'ssl',      note: 'Generate an App Password in Yahoo account settings.' },
    sendgrid:  { smtpHost: 'smtp.sendgrid.net',                       smtpPort: 587, smtpEncryption: 'starttls', note: 'Username: apikey  Password: your SendGrid API key.' },
    mailgun:   { smtpHost: 'smtp.mailgun.org',                        smtpPort: 587, smtpEncryption: 'starttls', note: 'Use Mailgun SMTP credentials from your domain settings.' },
    ses:       { smtpHost: 'email-smtp.us-east-1.amazonaws.com',      smtpPort: 587, smtpEncryption: 'starttls', note: 'Use SES SMTP credentials (not your AWS access key).' },
    zoho:      { smtpHost: 'smtp.zoho.com',                           smtpPort: 465, smtpEncryption: 'ssl',      note: 'Use your Zoho email and app-specific password.' },
    custom:    { smtpHost: '', smtpPort: 587, smtpEncryption: 'starttls', note: '' },
  }
  const [preset, setPreset]       = useState('custom')
  const [presetNote, setPresetNote] = useState('')

  const applyPreset = (key) => {
    const p = SMTP_PRESETS[key]
    setPreset(key)
    setPresetNote(p.note)
    setCfg(c => ({ ...c, smtpHost: p.smtpHost, smtpPort: p.smtpPort, smtpEncryption: p.smtpEncryption }))
  }

  if (loading) return (
    <div style={{ padding: '60px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--cyan)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 3 }}>LOADING MAIL CONFIG...</div>
    </div>
  )
  if (!cfg) return null

  // -- Shared style tokens ----------------------------------------------------
  const T = {
    label:    { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' },
    inp:      { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none', boxSizing: 'border-box', borderRadius: 10, transition: 'border-color 0.15s, box-shadow 0.15s' },
    inpFocus: { borderColor: 'var(--cyan)' },
    card:     { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '22px' },
    btn:      (variant = 'primary') => ({
      padding: '11px 22px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
      cursor: testing || saving ? 'not-allowed' : 'pointer', border: 'none', borderRadius: 8,
      background: variant === 'primary' ? 'var(--cyan)' : variant === 'danger' ? '#ff4757' : variant === 'ghost' ? 'transparent' : '#1e2d45',
      color: variant === 'ghost' ? 'var(--muted)' : variant === 'secondary' ? 'var(--text)' : '#000',
      ...(variant === 'ghost' ? { border: '1px solid var(--border)' } : {}),
      opacity: testing || saving ? 0.6 : 1,
      transition: 'opacity 0.15s',
      whiteSpace: 'nowrap',
    }),
    tabBtn:   (active) => ({
      padding: '10px 18px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
      cursor: 'pointer', border: 'none', borderRadius: 8,
      background: active ? 'var(--cyan)' : 'transparent',
      color: active ? '#000' : 'var(--muted)',
      transition: 'all 0.15s',
    }),
    provBtn:  (active) => ({
      flex: 1, padding: '14px 10px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
      cursor: 'pointer', transition: 'all 0.15s', borderRadius: 8,
      background: active ? 'var(--cyan)' : 'var(--bg3)',
      color: active ? '#000' : 'var(--muted)',
      border: `1px solid ${active ? 'var(--cyan)' : 'var(--border)'}`,
      fontWeight: active ? 700 : 400,
    }),
    statusDot: (status) => ({
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 6,
      background: status === 'ok' ? '#00ff88' : status === 'err' ? '#ff4757' : '#475569',
      boxShadow: status === 'ok' ? '0 0 6px #00ff8888' : status === 'err' ? '0 0 6px #ff475788' : 'none',
    }),
  }

  const providerInfo = {
    brevo:  { icon: '📨', name: 'Brevo',  desc: 'HTTP API  300/day free  No port issues', color: '#0082ff', link: 'https://app.brevo.com' },
    resend: { icon: '📬',  name: 'Resend', desc: 'HTTP API  3,000/month free  Developer-friendly', color: '#00ff88', link: 'https://resend.com' },
    smtp:   { icon: '📡', name: 'SMTP',   desc: 'Any SMTP server  May be blocked on cloud hosts', color: '#94a3b8', link: null },
  }

  return (
    <div style={{ maxWidth: 780, paddingBottom: 60 }}>

      {/* -- Page header ------------------------------------------------------- */}
      <PageHeader
        eyebrow="ADMIN · MAIL SETTINGS"
        title="Email Configuration"
        subtitle="Configure outgoing & incoming providers. Live reload — no server restart needed."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {verifyStatus && (
              <div style={{ display: 'flex', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, color: verifyStatus === 'ok' ? '#00ff88' : '#ff4757' }}>
                <span style={T.statusDot(verifyStatus)} />
                {verifyStatus === 'ok' ? 'VERIFIED' : 'FAILED'}
              </div>
            )}
            <button onClick={() => setShowLog(p => !p)} style={{ ...T.btn('ghost'), fontSize: 9 }}>
              {showLog ? 'HIDE LOG' : `📋 LOG${emailLog.length ? ` (${emailLog.length})` : ''}`}
            </button>
          </div>
        }
      />

      {/* -- Email send log ---------------------------------------------------- */}
      {showLog && (
        <div style={{ ...T.card, marginBottom: 20, background: 'var(--bg)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 3, marginBottom: 12 }}>RECENT ACTIVITY LOG</div>
          {emailLog.length === 0 ? (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#334155', textAlign: 'center', padding: '20px 0' }}>No activity yet this session.</div>
          ) : emailLog.map((entry, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: i < emailLog.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'flex-start' }}>
              <span style={T.statusDot(entry.status)} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', minWidth: 60 }}>{entry.time}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', minWidth: 50, letterSpacing: 1 }}>{entry.type.toUpperCase()}</span>
              {entry.to && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#475569', minWidth: 100 }}>{entry.to}</span>}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: entry.status === 'ok' ? '#64748b' : '#ff475788', flex: 1, lineHeight: 1.5 }}>{entry.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* -- Flash message ----------------------------------------------------- */}
      {msg && (
        <div style={{
          padding: '14px 18px', marginBottom: smtpBlocked ? 8 : 20,
          background: msg.type === 'ok' ? '#00ff8811' : msg.type === 'warn' ? '#ffd70011' : '#ff475711',
          border: `1px solid ${msg.type === 'ok' ? '#00ff8844' : msg.type === 'warn' ? '#ffd70044' : '#ff475744'}`,
          borderLeft: `3px solid ${msg.type === 'ok' ? '#00ff88' : msg.type === 'warn' ? '#ffd700' : '#ff4757'}`,
          fontFamily: 'var(--font-mono)', fontSize: 12,
          color: msg.type === 'ok' ? '#00ff88' : msg.type === 'warn' ? '#ffd700' : '#ff6b7a',
          lineHeight: 1.6,
        }}>
          {msg.text}
        </div>
      )}

      {/* -- SMTP blocked banner ----------------------------------------------- */}
      {smtpBlocked && (
        <div style={{ marginBottom: 20, padding: '18px 20px', background: 'var(--bg2)', border: '1px solid #ffd70033', borderLeft: '3px solid #ffd700' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ffd700', letterSpacing: 2, marginBottom: 8 }}>⚠️ HOST BLOCKS ALL SMTP PORTS</div>
          <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, marginBottom: 14 }}>
            Your server cannot reach the SMTP host on any port  this is a hosting firewall restriction, not a credentials issue.<br/>
            <strong style={{ color: '#94a3b8' }}>Brevo and Resend both use HTTPS (port 443)  never blocked.</strong> Both have generous free tiers.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => { setOutTab('brevo'); setSmtpBlocked(false) }} style={{ ...T.btn('primary'), background: '#0082ff' }}>
              ? SWITCH TO BREVO
            </button>
            <button onClick={() => { setOutTab('resend'); setSmtpBlocked(false) }} style={{ ...T.btn('secondary') }}>
              ? SWITCH TO RESEND
            </button>
            <a href="https://resend.com" target="_blank" rel="noreferrer" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ffd700', letterSpacing: 1, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
              resend.com (free) ?
            </a>
          </div>
        </div>
      )}

      {/* -- Section tabs ------------------------------------------------------ */}
      <div style={{ display: 'flex', gap: 3, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, marginBottom: 24, width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
        {[
          ['outgoing',      'Outgoing'],
          ['incoming',      'Incoming'],
          ['identity',      'Identity'],
          ['notifications', 'Notifications'],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setActiveSection(k)} style={T.tabBtn(activeSection === k)}>
            {label.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------------
          OUTGOING
      ------------------------------------------------------------------------ */}
      {activeSection === 'outgoing' && (
        <div>

          {/* Provider cards */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
            {['brevo', 'resend', 'smtp'].map(p => {
              const info = providerInfo[p]
              const active = outTab === p
              return (
                <div key={p} onClick={() => { setOutTab(p); setSmtpBlocked(false) }} style={{
                  flex: 1, minWidth: 160, padding: '16px', cursor: 'pointer',
                  background: active ? `${info.color}11` : 'var(--bg3)',
                  border: `1px solid ${active ? info.color : 'var(--border)'}`,
                  transition: 'all 0.15s', position: 'relative',
                }}>
                  {active && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: info.color }} />}
                  <div style={{ fontSize: 20, marginBottom: 8 }}>{info.icon}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: active ? info.color : 'var(--fg)', marginBottom: 4, letterSpacing: 1 }}>{info.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#475569', lineHeight: 1.6 }}>{info.desc}</div>
                  {info.link && <a href={info.link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: info.color, textDecoration: 'none', display: 'block', marginTop: 6 }}>Get free key ?</a>}
                </div>
              )
            })}
          </div>

          {/* -- BREVO -------------------------------------------------------- */}
          {outTab === 'brevo' && (
            <div style={T.card}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#0082ff', letterSpacing: 3, marginBottom: 16 }}>ℹ️ BREVO API CONFIGURATION</div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7, marginBottom: 20, padding: '12px 14px', background: '#0082ff08', border: '1px solid #0082ff22' }}>
                Brevo sends via their HTTP API  no SMTP port required. Works on all cloud hosts.<br/>
                <strong style={{ color: '#64748b' }}>Free tier:</strong> 300 emails/day  Unlimited contacts
                <a href="https://app.brevo.com" target="_blank" rel="noreferrer" style={{ color: '#0082ff', marginLeft: 8, textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 10 }}>Sign up free ?</a>
              </div>
              <div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <label style={T.label}>API Key <span style={{ color: '#ff4757' }}>*</span></label>
                  {cfg.brevoApiKey && cfg.brevoApiKey.includes('') ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ ...T.inp, flex: 1, color: '#475569', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#00ff88', fontSize: 10 }}>✓</span>
                        <span style={{ letterSpacing: 2 }}>{cfg.brevoApiKey}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#475569', marginLeft: 4 }}>SAVED</span>
                      </div>
                      <button type="button" onClick={() => set('brevoApiKey', '')} style={{ ...T.btn('ghost'), padding: '11px 14px', fontSize: 9 }}>
                        CHANGE
                      </button>
                    </div>
                  ) : (
                    <input type="password" value={cfg.brevoApiKey || ''} onChange={e => set('brevoApiKey', e.target.value)}
                      placeholder="xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      style={T.inp} autoComplete="new-password" autoFocus />
                  )}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5 }}>
                    Brevo Dashboard 🖥️ SMTP &amp; API ? API Keys ? Create a new API key (not SMTP credentials)
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={T.label}>From Email <span style={{ color: '#ff4757' }}>*</span></label>
                    <input type="email" value={cfg.brevoFromEmail || ''} onChange={e => set('brevoFromEmail', e.target.value)}
                      placeholder="noreply@yourdomain.com"
                      style={{ ...T.inp, borderColor: cfg.brevoFromEmail?.includes('smtp-brevo.com') ? '#ff4757' : undefined }} />
                    {cfg.brevoFromEmail?.includes('smtp-brevo.com') && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757', marginTop: 5, lineHeight: 1.5 }}>
                        ? This is a Brevo relay address, not a sender. Use your real email e.g. noreply@yourdomain.com or your own Gmail.
                      </div>
                    )}
                    {!cfg.brevoFromEmail?.includes('smtp-brevo.com') && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5 }}>Must be verified in Brevo ? Senders &amp; Domains</div>
                    )}
                  </div>
                  <div>
                    <label style={T.label}>From Name</label>
                    <input value={cfg.brevoFromName || ''} onChange={e => set('brevoFromName', e.target.value)}
                      placeholder="T.Tanvir Community" style={T.inp} />
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 16, padding: '12px 14px', background: '#ff475708', border: '1px solid #ff475722' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#ff4757', letterSpacing: 2, marginBottom: 4 }}>⚠️ SENDER VERIFICATION REQUIRED</div>
                <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                  Brevo requires your From Email to be a verified sender. Go to{' '}
                  <a href="https://app.brevo.com/senders" target="_blank" rel="noreferrer" style={{ color: '#0082ff', textDecoration: 'none' }}>Brevo ? Senders &amp; Domains</a>
                  {' '}and add your email or domain. Gmail addresses may be rejected  use a domain email for best results.
                </div>
              </div>
            </div>
          )}

          {/* -- RESEND ------------------------------------------------------- */}
          {outTab === 'resend' && (
            <div style={T.card}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#00ff88', letterSpacing: 3, marginBottom: 16 }}>ℹ️ RESEND API CONFIGURATION</div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7, marginBottom: 20, padding: '12px 14px', background: '#00ff8808', border: '1px solid #00ff8822' }}>
                Resend is a modern email API built for developers. Uses HTTPS  works on all hosts.<br/>
                <strong style={{ color: '#64748b' }}>Free tier:</strong> 3,000 emails/month  100/day  1 custom domain
                <a href="https://resend.com" target="_blank" rel="noreferrer" style={{ color: '#00ff88', marginLeft: 8, textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 10 }}>Sign up free ?</a>
              </div>
              <div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <label style={T.label}>API Key <span style={{ color: '#ff4757' }}>*</span></label>
                  {cfg.resendApiKey && cfg.resendApiKey.includes('') ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ ...T.inp, flex: 1, color: '#475569', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#00ff88', fontSize: 10 }}>✓</span>
                        <span style={{ letterSpacing: 2 }}>{cfg.resendApiKey}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#475569', marginLeft: 4 }}>SAVED</span>
                      </div>
                      <button type="button" onClick={() => set('resendApiKey', '')} style={{ ...T.btn('ghost'), padding: '11px 14px', fontSize: 9 }}>
                        CHANGE
                      </button>
                    </div>
                  ) : (
                    <input type="password" value={cfg.resendApiKey || ''} onChange={e => set('resendApiKey', e.target.value)}
                      placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      style={T.inp} autoComplete="new-password" autoFocus />
                  )}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5 }}>
                    resend.com ? API Keys ? Create API Key
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={T.label}>From Email <span style={{ color: '#ff4757' }}>*</span></label>
                    <input type="email" value={cfg.resendFromEmail || ''} onChange={e => set('resendFromEmail', e.target.value)}
                      placeholder="noreply@yourdomain.com" style={T.inp} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5 }}>Must match a verified domain in Resend</div>
                  </div>
                  <div>
                    <label style={T.label}>From Name</label>
                    <input value={cfg.resendFromName || ''} onChange={e => set('resendFromName', e.target.value)}
                      placeholder="T.Tanvir Community" style={T.inp} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* -- SMTP --------------------------------------------------------- */}
          {outTab === 'smtp' && (
            <div style={T.card}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#94a3b8', letterSpacing: 3, marginBottom: 16 }}>?🖥️ SMTP CONFIGURATION</div>
              <div style={{ padding: '10px 14px', background: '#ffd70008', border: '1px solid #ffd70022', marginBottom: 20, fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
                ? Most cloud hosts (Render, Railway, Vercel, etc.) block outbound SMTP ports 587 &amp; 465. If Test Connection fails, switch to Brevo or Resend.
              </div>

              {/* Quick presets */}
              <div style={{ marginBottom: 20 }}>
                <label style={T.label}>QUICK SETUP</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {Object.keys(SMTP_PRESETS).map(k => (
                    <button key={k} onClick={() => applyPreset(k)} style={{
                      padding: '6px 12px', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1,
                      cursor: 'pointer', transition: 'all 0.1s',
                      background: preset === k ? '#1e2d45' : 'transparent',
                      color: preset === k ? 'var(--fg)' : '#334155',
                      border: `1px solid ${preset === k ? 'var(--border)' : 'var(--border)'}`,
                    }}>
                      {k.toUpperCase()}
                    </button>
                  ))}
                </div>
                {presetNote && (
                  <div style={{ padding: '8px 12px', background: presetNote.startsWith('⚠️') ? '#ff475708' : '#ffd70008', border: `1px solid ${presetNote.startsWith('⚠️') ? '#ff475722' : '#ffd70022'}`, fontSize: 11, color: presetNote.startsWith('⚠️') ? '#ff6b7a' : '#ffd700', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
                    {presetNote}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 140px', gap: 10 }}>
                  <div>
                    <label style={T.label}>SMTP Host <span style={{ color: '#ff4757' }}>*</span></label>
                    <input value={cfg.smtpHost || ''} onChange={e => set('smtpHost', e.target.value)}
                      placeholder="smtp.example.com" style={T.inp} />
                  </div>
                  <div>
                    <label style={T.label}>Port</label>
                    <input type="number" value={cfg.smtpPort || 587} onChange={e => set('smtpPort', parseInt(e.target.value))} style={T.inp} />
                  </div>
                  <div>
                    <label style={T.label}>Encryption</label>
                    <Select value={cfg.smtpEncryption || 'starttls'} onChange={v => set('smtpEncryption', v)}
                      options={[['starttls','STARTTLS'],['ssl','SSL/TLS'],['none','None']]} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={T.label}>Username <span style={{ color: '#ff4757' }}>*</span></label>
                    <input value={cfg.smtpUsername || ''} onChange={e => set('smtpUsername', e.target.value)}
                      placeholder="your@email.com" style={T.inp} autoComplete="username" />
                  </div>
                  <div>
                    <label style={T.label}>Password <span style={{ color: '#ff4757' }}>*</span></label>
                    <input type="password" value={cfg.smtpPassword || ''} onChange={e => set('smtpPassword', e.target.value)}
                      placeholder="App password or SMTP password" style={T.inp} autoComplete="new-password" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={T.label}>From Name</label>
                    <input value={cfg.smtpFromName || ''} onChange={e => set('smtpFromName', e.target.value)}
                      placeholder="T.Tanvir Community" style={T.inp} />
                  </div>
                  <div>
                    <label style={T.label}>From Email</label>
                    <input type="email" value={cfg.smtpFromEmail || ''} onChange={e => set('smtpFromEmail', e.target.value)}
                      placeholder="noreply@yourdomain.com" style={T.inp} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* -- Actions ------------------------------------------------------ */}
          <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={testConn} disabled={testing} style={T.btn('ghost')}>
              {testing ? '⏳ TESTING...' : '🔌 TEST CONNECTION'}
            </button>
            <button onClick={save} disabled={saving} style={T.btn('primary')}>
              {saving ? 'SAVING...' : 'SAVE OUTGOING SETTINGS'}
            </button>
            {verifyStatus === 'ok' && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#00ff88', letterSpacing: 2 }}>
                ? CONNECTED
              </span>
            )}
          </div>

          {/* -- Send test email ----------------------------------------------- */}
          <div style={{ marginTop: 16, ...T.card, background: 'var(--bg)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 3, marginBottom: 12 }}>SEND TEST EMAIL</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={testTo} onChange={e => setTestTo(e.target.value)} type="email"
                placeholder="Send a test email to..." style={{ ...T.inp, flex: 1 }} />
              <button onClick={sendTest} disabled={testing || !testTo} style={{ ...T.btn('secondary'), opacity: !testTo ? 0.4 : 1 }}>
                📤 SEND TEST
              </button>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 8 }}>
              Uses your saved provider config to send a real test email.
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------------
          INCOMING
      ------------------------------------------------------------------------ */}
      {activeSection === 'incoming' && (
        <div style={T.card}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 3, marginBottom: 4 }}>INCOMING MAIL SERVER (IMAP / POP3)</div>
          <div style={{ fontSize: 12, color: '#475569', marginBottom: 20, lineHeight: 1.6 }}>
            Fetch replies and contact messages from your mailbox. Optional  only needed if you want to read emails in the admin panel.
          </div>

          {/* Enable toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginBottom: 20, padding: '14px', background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div style={{
              width: 36, height: 20, borderRadius: 10, position: 'relative', cursor: 'pointer',
              background: cfg.incomingEnabled ? 'var(--cyan)' : '#1e2d45', transition: 'background 0.2s',
            }} onClick={() => set('incomingEnabled', !cfg.incomingEnabled)}>
              <div style={{
                position: 'absolute', top: 3, left: cfg.incomingEnabled ? 18 : 3,
                width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
              }} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg)', letterSpacing: 1 }}>ENABLE INCOMING MAIL</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>Fetch emails via IMAP/POP3</div>
            </div>
          </label>

          <div style={{ opacity: cfg.incomingEnabled ? 1 : 0.4, pointerEvents: cfg.incomingEnabled ? 'auto' : 'none' }}>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={T.label}>Protocol</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['imap', 'pop3'].map(p => (
                    <button key={p} onClick={() => set('incomingProtocol', p)} style={T.provBtn((cfg.incomingProtocol || 'imap') === p)}>
                      {p.toUpperCase()}
                    </button>
                  ))}
                </div>
                {cfg.incomingProtocol === 'pop3' && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#ffd70008', border: '1px solid #ffd70022', fontSize: 11, color: '#ffd700', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
                    ? POP3 deletes messages from server after download. Use IMAP to keep mail accessible across devices.
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 140px', gap: 10 }}>
                <div>
                  <label style={T.label}>Host <span style={{ color: '#ff4757' }}>*</span></label>
                  <input value={cfg.incomingHost || ''} onChange={e => set('incomingHost', e.target.value)}
                    placeholder={cfg.incomingProtocol === 'imap' ? 'imap.gmail.com' : 'pop.gmail.com'} style={T.inp} />
                </div>
                <div>
                  <label style={T.label}>Port</label>
                  <input type="number" value={cfg.incomingPort || 993} onChange={e => set('incomingPort', parseInt(e.target.value))} style={T.inp} />
                </div>
                <div>
                  <label style={T.label}>Encryption</label>
                  <Select value={cfg.incomingEncryption || 'ssl'} onChange={v => set('incomingEncryption', v)}
                    options={[['ssl','SSL/TLS'],['starttls','STARTTLS'],['none','None']]} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={T.label}>Username / Email <span style={{ color: '#ff4757' }}>*</span></label>
                  <input value={cfg.incomingUsername || ''} onChange={e => set('incomingUsername', e.target.value)}
                    placeholder="your@email.com" style={T.inp} />
                </div>
                <div>
                  <label style={T.label}>Password <span style={{ color: '#ff4757' }}>*</span></label>
                  <input type="password" value={cfg.incomingPassword || ''} onChange={e => set('incomingPassword', e.target.value)}
                    placeholder="" style={T.inp} autoComplete="new-password" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={T.label}>Mailbox Folder</label>
                  <input value={cfg.incomingFolder || 'INBOX'} onChange={e => set('incomingFolder', e.target.value)} style={T.inp} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 24 }}>
                  <Checkbox
                    checked={!!cfg.incomingDeleteAfterFetch}
                    onChange={v => set('incomingDeleteAfterFetch', v)}
                    label="DELETE AFTER FETCH"
                    style={{ color: 'var(--muted)', fontSize: 10, letterSpacing: 1 }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
              <button onClick={testIncoming} disabled={testing} style={T.btn('ghost')}>
                {testing ? '⏳ TESTING...' : '🔌 TEST CONNECTION'}
              </button>
              <button onClick={save} disabled={saving} style={T.btn('primary')}>
                {saving ? 'SAVING...' : 'SAVE INCOMING SETTINGS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------------
          IDENTITY
      ------------------------------------------------------------------------ */}
      {activeSection === 'identity' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={T.card}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 3, marginBottom: 16 }}>SITE IDENTITY</div>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label style={T.label}>Site Name</label>
                <input value={cfg.siteName || ''} onChange={e => set('siteName', e.target.value)}
                  placeholder="T.Tanvir Community" style={T.inp} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5 }}>Appears in email subject lines and footers</div>
              </div>
              <div>
                <label style={T.label}>Site URL</label>
                <input value={cfg.siteUrl || ''} onChange={e => set('siteUrl', e.target.value)}
                  placeholder="https://aifazi.net" style={T.inp} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5 }}>Used to generate links in verification and reset emails</div>
              </div>
              <div>
                <label style={T.label}>Global Reply-To Address</label>
                <input type="email" value={cfg.replyTo || ''} onChange={e => set('replyTo', e.target.value)}
                  placeholder="support@yourdomain.com" style={T.inp} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5 }}>When set, all emails include this Reply-To header</div>
              </div>
            </div>
          </div>
          <div style={T.card}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 3, marginBottom: 16 }}>ADMIN NOTIFICATIONS EMAIL</div>
            <div>
              <label style={T.label}>Send Admin Alerts To</label>
              <input type="email" value={cfg.adminNotifyEmail || ''} onChange={e => set('adminNotifyEmail', e.target.value)}
                placeholder="admin@yourdomain.com" style={T.inp} />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5 }}>Receives all system alerts  contact form submissions, new users, login alerts etc.</div>
            </div>
          </div>
          <button onClick={save} disabled={saving} style={{ ...T.btn('primary'), alignSelf: 'flex-start' }}>
            {saving ? 'SAVING...' : 'SAVE IDENTITY SETTINGS'}
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------------
          NOTIFICATIONS
      ------------------------------------------------------------------------ */}
      {activeSection === 'notifications' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={T.card}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 3, marginBottom: 16 }}>USER EMAIL TRIGGERS</div>
            <div style={{ display: 'grid', gap: 2 }}>
              {[
                ['notifyNewForumUser',   '○', 'Welcome email on new forum registration',  'Sends welcome + verification email to new members'],
                ['notifyStaffAdded',     '○', 'Staff invite email when adding staff',      'Sends credentials email when you create a staff account'],
              ].map(([field, icon, label, desc]) => (
                <label key={field} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, cursor: 'pointer', padding: '14px', background: cfg[field] ? '#00ff8806' : 'transparent', border: '1px solid transparent', borderColor: cfg[field] ? '#00ff8820' : 'transparent', transition: 'all 0.15s', marginBottom: 4 }}
                  onClick={() => set(field, !cfg[field])}>
                  <div style={{
                    width: 36, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0, marginTop: 2,
                    background: cfg[field] ? 'var(--cyan)' : '#1e2d45', transition: 'background 0.2s',
                  }}>
                    <div style={{ position: 'absolute', top: 3, left: cfg[field] ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--fg)', marginBottom: 2 }}>{icon} {label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#475569', lineHeight: 1.5 }}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div style={T.card}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 3, marginBottom: 16 }}>ADMIN ALERT TRIGGERS</div>
            <div style={{ display: 'grid', gap: 2 }}>
              {[
                ['notifyContactForm',    '○', 'Contact form submission alert',    'Admin receives an email when someone submits the contact form'],
                ['notifyNewForumThread', '○', 'New forum thread alert',           'Admin receives an email when a new thread is posted'],
                ['notifyNewsletter',     '○', 'Newsletter subscription alert',    'Admin receives an email when someone subscribes'],
                ['notifyLoginAlert',     '○', 'Admin login alert',               'Admin receives an email on every admin panel login'],
              ].map(([field, icon, label, desc]) => (
                <label key={field} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, cursor: 'pointer', padding: '14px', background: cfg[field] ? '#00ff8806' : 'transparent', border: '1px solid transparent', borderColor: cfg[field] ? '#00ff8820' : 'transparent', transition: 'all 0.15s', marginBottom: 4 }}
                  onClick={() => set(field, !cfg[field])}>
                  <div style={{
                    width: 36, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0, marginTop: 2,
                    background: cfg[field] ? 'var(--cyan)' : '#1e2d45', transition: 'background 0.2s',
                  }}>
                    <div style={{ position: 'absolute', top: 3, left: cfg[field] ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--fg)', marginBottom: 2 }}>{icon} {label}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#475569', lineHeight: 1.5 }}>{desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button onClick={save} disabled={saving} style={{ ...T.btn('primary'), alignSelf: 'flex-start' }}>
            {saving ? 'SAVING...' : 'SAVE NOTIFICATION SETTINGS'}
          </button>
        </div>
      )}
    </div>
  )
}

// --- Admin Profile (self-edit) ------------------------------------------------

export default MailSettings
