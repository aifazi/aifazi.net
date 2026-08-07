'use client'
import React, { useState, useEffect } from 'react'
import api, { refreshCdnConfig } from '@/lib/api'
import { Select } from '../../core/ui.jsx'
import { S, useIsMobile, PageHeader } from './shared'
import { Icon } from './icons'

// -- Masked secret field renderer ------------------------------------------
const SecretField = ({ label, placeholder, help, value, onChange, T }) => {
  const val = value || ''
  const isMaskedVal = val && (val.includes('') || val.includes('...'))
  return (
    <div>
      <label style={T.label}>{label} <span style={{ color: '#ff4757' }}>*</span></label>
      {isMaskedVal ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ ...T.inp, flex: 1, color: '#475569', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#00ff88', fontSize: 10 }}>✓</span>
            <span style={{ letterSpacing: 2 }}>{val}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#475569', marginLeft: 4 }}>SAVED</span>
          </div>
          <button type="button" onClick={() => onChange('')} style={{ ...T.btn('ghost'), padding: '11px 14px', fontSize: 9 }}>CHANGE</button>
        </div>
      ) : (
        <input type="password" value={val} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} style={T.inp} autoComplete="new-password" />
      )}
      {help && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5, lineHeight: 1.6 }}>{help}</div>}
    </div>
  )
}

function CdnSettings() {
  const [cfg, setCfg]           = useState(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [testing, setTesting]   = useState(false)
  const [msg, setMsg]           = useState(null)
  const [testStatus, setTestStatus] = useState(null)  // null | 'ok' | 'err'
  const [activeSection, setActiveSection] = useState('provider')
  const [activityLog, setActivityLog]     = useState([])
  const [showLog, setShowLog]             = useState(false)

  const flash = (type, text, dur = 7000) => {
    setMsg({ type, text })
    if (dur) setTimeout(() => setMsg(null), dur)
  }

  useEffect(() => {
    api.get('/admin/cdn')
      .then(r => { setCfg(r.data); })
      .catch(e => flash('err', e.response?.data?.error || 'Failed to load CDN settings'))
      .finally(() => setLoading(false))
  }, [])

  const set = (field, val) => setCfg(p => ({ ...p, [field]: val }))

  const save = async () => {
    setSaving(true)
    try {
      await api.put('/admin/cdn', cfg)
      refreshCdnConfig()  // ← invalidate CDN config cache so MediaLibrary &
                          //   cdnUrl() across the whole app pick up new settings
      flash('ok', '✅ CDN settings saved. New uploads will use the active provider immediately.')
      setActivityLog(p => [{ time: new Date().toLocaleTimeString(), type: 'save', status: 'ok', msg: `Saved  provider: ${cfg.provider}` }, ...p.slice(0, 19)])
    } catch (e) {
      flash('err', e.response?.data?.error || 'Save failed.')
    } finally { setSaving(false) }
  }

  const testConn = async () => {
    setTesting(true)
    setTestStatus(null)
    try {
      const r = await api.post('/admin/cdn/test', cfg)
      flash('ok', r.data.message)
      setTestStatus('ok')
      setActivityLog(p => [{ time: new Date().toLocaleTimeString(), type: 'test', status: 'ok', msg: r.data.message }, ...p.slice(0, 19)])
    } catch (e) {
      const errText = e.response?.data?.error || 'Connection test failed.'
      flash('err', errText)
      setTestStatus('err')
      setActivityLog(p => [{ time: new Date().toLocaleTimeString(), type: 'test', status: 'err', msg: errText }, ...p.slice(0, 19)])
    } finally { setTesting(false) }
  }

  if (loading) return (
    <div style={{ padding: '60px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--green)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 3 }}>LOADING CDN CONFIG...</div>
    </div>
  )
  if (!cfg) return null

  // -- Style tokens (mirrors MailSettings) ------------------------------------
  const T = {
    label: { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' },
    inp:   { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '11px 14px', fontFamily: 'var(--font-mono)', fontSize: 12, outline: 'none', boxSizing: 'border-box', borderRadius: 10, transition: 'border-color 0.15s, box-shadow 0.15s' },
    card:  { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '22px' },
    btn: (variant = 'primary') => ({
      padding: '11px 22px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
      cursor: testing || saving ? 'not-allowed' : 'pointer', border: 'none', borderRadius: 8,
      background: variant === 'primary' ? 'var(--green)' : variant === 'danger' ? '#ff4757' : variant === 'ghost' ? 'transparent' : '#1e2d45',
      color: variant === 'ghost' ? 'var(--muted)' : variant === 'secondary' ? 'var(--text)' : '#000',
      ...(variant === 'ghost' ? { border: '1px solid var(--border)' } : {}),
      opacity: testing || saving ? 0.6 : 1, transition: 'opacity 0.15s', whiteSpace: 'nowrap',
    }),
    tabBtn: (active) => ({
      padding: '10px 18px', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
      cursor: 'pointer', border: 'none', borderRadius: 8,
      background: active ? 'var(--green)' : 'transparent',
      color: active ? '#000' : 'var(--muted)',
      transition: 'all 0.15s',
    }),
    statusDot: (status) => ({
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 6,
      background: status === 'ok' ? '#00ff88' : status === 'err' ? '#ff4757' : '#475569',
      boxShadow: status === 'ok' ? '0 0 6px #00ff8888' : status === 'err' ? '0 0 6px #ff475788' : 'none',
    }),
  }

  // -- Provider catalogue -----------------------------------------------------
  const PROVIDERS = {
    cloudinary: {
      icon: '☁️', name: 'Cloudinary', color: '#3448c5',
      badge: 'Free 25GB', badgeColor: '#3448c5',
      desc: 'Image/video CDN  Free 25 GB  Transformations API  Global edge',
      link: 'https://cloudinary.com/users/register/free',
      customDomainNote: 'Custom CNAME requires a Cloudinary paid plan. For a free workaround, proxy via Cloudflare Workers (see DNS guide below).',
    },
    r2: {
      icon: '○', name: 'Cloudflare R2', color: '#f6821f',
      badge: 'Free 10 GB', badgeColor: '#f6821f',
      desc: 'Zero-egress fees  S3-compatible  Custom domain via Cloudflare  10 GB/mo free',
      link: 'https://dash.cloudflare.com/?to=/:account/r2',
      customDomainNote: 'Add your domain to Cloudflare, then go to R2 bucket ? Settings ? Custom Domains and enter your subdomain (e.g. cdn.aifazi.net).',
    },
    b2: {
      icon: '○', name: 'Backblaze B2', color: '#e05c2c',
      badge: 'Free 10 GB', badgeColor: '#e05c2c',
      desc: 'Free 10 GB storage  S3-compatible  Free bandwidth via Cloudflare CDN',
      link: 'https://www.backblaze.com/sign-up/cloud-storage',
      customDomainNote: 'Enable the Cloudflare-Backblaze bandwidth partnership: Add B2 download URL to Cloudflare and proxy it. Then set your subdomain as the custom domain.',
    },
    imagekit: {
      icon: '🖼️', name: 'ImageKit', color: '#009ef7',
      badge: 'Free 20 GB/mo', badgeColor: '#009ef7',
      desc: 'Image & video CDN  Free 20 GB bandwidth/month  Custom domains on free plan',
      link: 'https://imagekit.io/registration/',
      customDomainNote: 'Go to ImageKit Dashboard ? URL Endpoints ? Add Custom Domain. CNAME your subdomain to the endpoint hostname shown there.',
    },
    bunny: {
      icon: '○', name: 'BunnyCDN', color: '#fac517',
      badge: '~$0.01/GB', badgeColor: '#e0a800',
      desc: 'Ultra-fast edge CDN  Pay-as-you-go (~$0.01/GB)  Custom domain included',
      link: 'https://bunny.net/signup/',
      customDomainNote: 'In the BunnyCDN dashboard, create a Pull Zone and set a Custom Domain. CNAME your subdomain to <pullzone>.b-cdn.net.',
    },
  }

  const activeProvider = PROVIDERS[cfg.provider] || PROVIDERS.cloudinary

  return (
    <div style={{ maxWidth: 820, paddingBottom: 60 }}>

      {/* -- Header ---------------------------------------------------------- */}
      <PageHeader
        eyebrow="ADMIN · CDN SETTINGS"
        title="CDN & File Storage"
        subtitle="Choose your file upload provider, configure credentials, and map a custom delivery domain. Live reload — no server restart needed."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {testStatus && (
              <div style={{ display: 'flex', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, color: testStatus === 'ok' ? '#00ff88' : '#ff4757' }}>
                <span style={T.statusDot(testStatus)} />{testStatus === 'ok' ? 'CONNECTED' : 'FAILED'}
              </div>
            )}
            <button onClick={() => setShowLog(p => !p)} style={{ ...T.btn('ghost'), fontSize: 9, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="clipboard" size={14} />{showLog ? 'HIDE LOG' : `LOG${activityLog.length ? ` (${activityLog.length})` : ''}`}
            </button>
          </div>
        }
      />

      {/* -- Activity log ---------------------------------------------------- */}
      {showLog && (
        <div style={{ ...T.card, marginBottom: 20, background: 'var(--bg)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 3, marginBottom: 12 }}>ACTIVITY LOG</div>
          {activityLog.length === 0
            ? <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#334155', textAlign: 'center', padding: '20px 0' }}>No activity yet this session.</div>
            : activityLog.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: i < activityLog.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'flex-start' }}>
                <span style={T.statusDot(e.status)} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', minWidth: 60 }}>{e.time}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', minWidth: 44, letterSpacing: 1 }}>{e.type.toUpperCase()}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: e.status === 'ok' ? '#64748b' : '#ff4757aa', flex: 1, lineHeight: 1.5 }}>{e.msg}</span>
              </div>
            ))
          }
        </div>
      )}

      {/* -- Flash message --------------------------------------------------- */}
      {msg && (
        <div style={{
          padding: '14px 18px', marginBottom: 20,
          background: msg.type === 'ok' ? '#00ff8811' : '#ff475711',
          border: `1px solid ${msg.type === 'ok' ? '#00ff8844' : '#ff475744'}`,
          borderLeft: `3px solid ${msg.type === 'ok' ? '#00ff88' : '#ff4757'}`,
          fontFamily: 'var(--font-mono)', fontSize: 12,
          color: msg.type === 'ok' ? '#00ff88' : '#ff6b7a', lineHeight: 1.6,
        }}>{msg.text}</div>
      )}

      {/* -- Section tabs ---------------------------------------------------- */}
      <div style={{ display: 'flex', gap: 3, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, marginBottom: 24, width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
        {[['provider','Provider'],['credentials','Credentials'],['domain','Custom Domain'],['guide','Setup Guide']].map(([k, label]) => (
          <button key={k} onClick={() => setActiveSection(k)} style={T.tabBtn(activeSection === k)}>
            {label.toUpperCase()}
          </button>
        ))}
      </div>

      {/* --------------------------------------------------------------------
          PROVIDER SELECTION
      -------------------------------------------------------------------- */}
      {activeSection === 'provider' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 28 }}>
            {Object.entries(PROVIDERS).map(([key, info]) => {
              const active = cfg.provider === key
              return (
                <div key={key} onClick={() => set('provider', key)} style={{
                  padding: 18, cursor: 'pointer', position: 'relative', borderRadius: 12,
                  background: active ? `${info.color}11` : 'var(--bg3)',
                  border: `1px solid ${active ? info.color : 'var(--border)'}`,
                  transition: 'all 0.15s',
                }}>
                  {active && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: info.color, borderRadius: '12px 12px 0 0' }} />}
                  <div style={{ fontSize: 22, marginBottom: 8 }}>{info.icon}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: active ? info.color : 'var(--text)', letterSpacing: 1 }}>{info.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, padding: '2px 7px', background: `${info.badgeColor}22`, color: info.badgeColor, border: `1px solid ${info.badgeColor}44` }}>{info.badge}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#475569', lineHeight: 1.6 }}>{info.desc}</div>
                  {info.link && (
                    <a href={info.link} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: info.color, textDecoration: 'none', display: 'block', marginTop: 8 }}>
                      Get free account ?
                    </a>
                  )}
                </div>
              )
            })}
          </div>

          {/* Active provider summary */}
          <div style={{ padding: '16px 20px', background: `${activeProvider.color}0d`, border: `1px solid ${activeProvider.color}33`, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 24 }}>{activeProvider.icon}</span>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: activeProvider.color, letterSpacing: 2, marginBottom: 2 }}>ACTIVE PROVIDER: {activeProvider.name.toUpperCase()}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#475569' }}>
                Custom domain: <span style={{ color: cfg.customDomain ? '#00ff88' : '#ff4757' }}>{cfg.customDomain || 'not set'}</span>
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button onClick={testConn} disabled={testing || saving} style={{ ...T.btn('secondary'), padding: '9px 18px' }}>
                {testing ? 'TESTING...' : '⚡ TEST CONNECTION'}
              </button>
              <button onClick={() => setActiveSection('credentials')} style={{ ...T.btn('primary'), padding: '9px 18px' }}>
                CONFIGURE ?
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------
          CREDENTIALS
      -------------------------------------------------------------------- */}
      {activeSection === 'credentials' && (
        <div style={T.card}>
          {/* -- Cloudinary ----------------------------------------------- */}
          {cfg.provider === 'cloudinary' && (
            <>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#3448c5', letterSpacing: 3, marginBottom: 16 }}>🏞️ CLOUDINARY CREDENTIALS</div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7, marginBottom: 20, padding: '12px 14px', background: '#3448c511', border: '1px solid #3448c522' }}>
                Find these in Cloudinary Dashboard ? Settings ? Access Keys. The <strong style={{ color: '#94a3b8' }}>Cloud Name</strong> is shown on the Dashboard home.
                <a href="https://console.cloudinary.com/settings/api-keys" target="_blank" rel="noreferrer" style={{ color: '#3448c5', marginLeft: 8, textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 10 }}>Open API Keys ?</a>
              </div>
              <div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <label style={T.label}>Cloud Name <span style={{ color: '#ff4757' }}>*</span></label>
                  <input value={cfg.cloudinaryCloudName || ''} onChange={e => set('cloudinaryCloudName', e.target.value)} placeholder="mycloud" style={T.inp} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={T.label}>API Key <span style={{ color: '#ff4757' }}>*</span></label>
                    <input value={cfg.cloudinaryApiKey || ''} onChange={e => set('cloudinaryApiKey', e.target.value)} placeholder="123456789012345" style={T.inp} />
                  </div>
                  <SecretField label="API Secret" placeholder="" help="Never share this. Shown once in Cloudinary." value={cfg.cloudinaryApiSecret} onChange={v => set('cloudinaryApiSecret', v)} T={T} />
                </div>
                <div>
                  <label style={T.label}>Upload Folder</label>
                  <input value={cfg.cloudinaryFolder || ''} onChange={e => set('cloudinaryFolder', e.target.value)} placeholder="portfolio" style={T.inp} />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5 }}>Folder path inside your Cloudinary media library.</div>
                </div>
              </div>
            </>
          )}

          {/* -- Cloudflare R2 -------------------------------------------- */}
          {cfg.provider === 'r2' && (
            <>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#f6821f', letterSpacing: 3, marginBottom: 16 }}>⚡ CLOUDFLARE R2 CREDENTIALS</div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7, marginBottom: 20, padding: '12px 14px', background: '#f6821f11', border: '1px solid #f6821f22' }}>
                Cloudflare Dashboard ? R2 ? Manage R2 API Tokens. Create a token with <strong style={{ color: '#94a3b8' }}>Object Read & Write</strong> permission.
                <a href="https://dash.cloudflare.com/?to=/:account/r2/api-tokens" target="_blank" rel="noreferrer" style={{ color: '#f6821f', marginLeft: 8, textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 10 }}>Open R2 Tokens ?</a>
              </div>
              <div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <label style={T.label}>Account ID <span style={{ color: '#ff4757' }}>*</span></label>
                  <input value={cfg.r2AccountId || ''} onChange={e => set('r2AccountId', e.target.value)} placeholder="abcdef1234567890abcdef1234567890" style={T.inp} />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5 }}>Found in Cloudflare Dashboard ? right sidebar &quot;Account ID&quot;</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={T.label}>Access Key ID <span style={{ color: '#ff4757' }}>*</span></label>
                    <input value={cfg.r2AccessKeyId || ''} onChange={e => set('r2AccessKeyId', e.target.value)} placeholder="R2 access key ID" style={T.inp} />
                  </div>
                  <SecretField label="Secret Access Key" placeholder="R2 secret key" help="Shown once on token creation." value={cfg.r2SecretAccessKey} onChange={v => set('r2SecretAccessKey', v)} T={T} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={T.label}>Bucket Name <span style={{ color: '#ff4757' }}>*</span></label>
                    <input value={cfg.r2BucketName || ''} onChange={e => set('r2BucketName', e.target.value)} placeholder="my-portfolio" style={T.inp} />
                  </div>
                  <div>
                    <label style={T.label}>Public Bucket URL</label>
                    <input value={cfg.r2PublicUrl || ''} onChange={e => set('r2PublicUrl', e.target.value)} placeholder="https://pub-xxx.r2.dev" style={T.inp} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5 }}>Enable Public Access on the bucket, or use a custom domain below.</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* -- Backblaze B2 --------------------------------------------- */}
          {cfg.provider === 'b2' && (
            <>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#e05c2c', letterSpacing: 3, marginBottom: 16 }}>💾 BACKBLAZE B2 CREDENTIALS</div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7, marginBottom: 20, padding: '12px 14px', background: '#e05c2c11', border: '1px solid #e05c2c22' }}>
                Backblaze Dashboard ? App Keys ? Add a New Application Key. Select your bucket and allow <strong style={{ color: '#94a3b8' }}>Read &amp; Write</strong>.
                <a href="https://secure.backblaze.com/app_keys.htm" target="_blank" rel="noreferrer" style={{ color: '#e05c2c', marginLeft: 8, textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 10 }}>Open App Keys ?</a>
              </div>
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={T.label}>Key ID (applicationKeyId) <span style={{ color: '#ff4757' }}>*</span></label>
                    <input value={cfg.b2KeyId || ''} onChange={e => set('b2KeyId', e.target.value)} placeholder="0012345abc..." style={T.inp} />
                  </div>
                  <SecretField label="Application Key" placeholder="K001xxxxxxxxxxxx" help="Shown once on key creation." value={cfg.b2AppKey} onChange={v => set('b2AppKey', v)} T={T} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={T.label}>Bucket Name <span style={{ color: '#ff4757' }}>*</span></label>
                    <input value={cfg.b2BucketName || ''} onChange={e => set('b2BucketName', e.target.value)} placeholder="my-portfolio" style={T.inp} />
                  </div>
                  <div>
                    <label style={T.label}>Bucket ID</label>
                    <input value={cfg.b2BucketId || ''} onChange={e => set('b2BucketId', e.target.value)} placeholder="abc123def456..." style={T.inp} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={T.label}>Region <span style={{ color: '#ff4757' }}>*</span></label>
                    <Select value={cfg.b2Region || 'us-west-004'} onChange={v => set('b2Region', v)}
                      options={['us-west-004','us-east-005','eu-central-003','ap-southeast-001']} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5 }}>Shown in Bucket ? Bucket Settings ? Endpoint.</div>
                  </div>
                  <div>
                    <label style={T.label}>Download URL</label>
                    <input value={cfg.b2DownloadUrl || ''} onChange={e => set('b2DownloadUrl', e.target.value)} placeholder="https://f004.backblazeb2.com" style={T.inp} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5 }}>Found in Bucket Details page.</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* -- ImageKit ------------------------------------------------- */}
          {cfg.provider === 'imagekit' && (
            <>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#009ef7', letterSpacing: 3, marginBottom: 16 }}>🖼️ IMAGEKIT CREDENTIALS</div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7, marginBottom: 20, padding: '12px 14px', background: '#009ef711', border: '1px solid #009ef722' }}>
                ImageKit Dashboard ? Developer Options ? API Keys.
                <a href="https://imagekit.io/dashboard/developer/api-keys" target="_blank" rel="noreferrer" style={{ color: '#009ef7', marginLeft: 8, textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 10 }}>Open API Keys ?</a>
              </div>
              <div style={{ display: 'grid', gap: 16 }}>
                <div>
                  <label style={T.label}>URL Endpoint <span style={{ color: '#ff4757' }}>*</span></label>
                  <input value={cfg.imagekitUrlEndpoint || ''} onChange={e => set('imagekitUrlEndpoint', e.target.value)} placeholder="https://ik.imagekit.io/yourid" style={T.inp} />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5 }}>Found in ImageKit Dashboard ? URL Endpoints.</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={T.label}>Public Key <span style={{ color: '#ff4757' }}>*</span></label>
                    <input value={cfg.imagekitPublicKey || ''} onChange={e => set('imagekitPublicKey', e.target.value)} placeholder="public_xxxxxxxxxxxx" style={T.inp} />
                  </div>
                  <SecretField label="Private Key" placeholder="private_xxxxxxxxxxxx" help="Keep secret  used for authenticated uploads." value={cfg.imagekitPrivateKey} onChange={v => set('imagekitPrivateKey', v)} T={T} />
                </div>
                <div>
                  <label style={T.label}>Upload Folder</label>
                  <input value={cfg.imagekitFolder || ''} onChange={e => set('imagekitFolder', e.target.value)} placeholder="/portfolio" style={T.inp} />
                </div>
              </div>
            </>
          )}

          {/* -- BunnyCDN ------------------------------------------------- */}
          {cfg.provider === 'bunny' && (
            <>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#fac517', letterSpacing: 3, marginBottom: 16 }}>🐰 BUNNYCDN CREDENTIALS</div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7, marginBottom: 20, padding: '12px 14px', background: '#fac51711', border: '1px solid #fac51722' }}>
                Bunny Dashboard ? Storage ? your zone ? FTP &amp; API Access. The Access Key is at the top of that page.
                <a href="https://dash.bunny.net/storage" target="_blank" rel="noreferrer" style={{ color: '#fac517', marginLeft: 8, textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 10 }}>Open Storage ?</a>
              </div>
              <div style={{ display: 'grid', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={T.label}>Storage Zone Name <span style={{ color: '#ff4757' }}>*</span></label>
                    <input value={cfg.bunnyStorageZone || ''} onChange={e => set('bunnyStorageZone', e.target.value)} placeholder="my-portfolio-zone" style={T.inp} />
                  </div>
                  <SecretField label="Storage Access Key" placeholder="xxxx-xxxx-xxxx-xxxx" help="Shown in Storage ? FTP & API Access." value={cfg.bunnyAccessKey} onChange={v => set('bunnyAccessKey', v)} T={T} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={T.label}>Storage Region</label>
                    <Select value={cfg.bunnyStorageRegion || 'de'} onChange={v => set('bunnyStorageRegion', v)}
                      options={[['de','DE  Frankfurt'],['ny','NY  New York'],['la','LA  Los Angeles'],['sg','SG  Singapore'],['syd','SYD  Sydney']]} />
                  </div>
                  <div>
                    <label style={T.label}>Pull Zone URL</label>
                    <input value={cfg.bunnyPullZoneUrl || ''} onChange={e => set('bunnyPullZoneUrl', e.target.value)} placeholder="https://myzone.b-cdn.net" style={T.inp} />
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5 }}>Pull Zone ? hostname of the zone linked to your storage zone.</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* -- Test + Save bar ------------------------------------------- */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={testConn} disabled={testing || saving} style={T.btn('secondary')}>
              {testing ? '⚡ TESTING...' : '⚡ TEST CONNECTION'}
            </button>
            <button onClick={save} disabled={saving || testing} style={T.btn('primary')}>
              {saving ? 'SAVING...' : '💾 SAVE SETTINGS'}
            </button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------
          CUSTOM DOMAIN
      -------------------------------------------------------------------- */}
      {activeSection === 'domain' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={T.card}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--green)', letterSpacing: 3, marginBottom: 16 }}>🌐 CUSTOM DELIVERY DOMAIN</div>
            <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.7, marginBottom: 20, padding: '12px 14px', background: '#00ff8808', border: '1px solid #00ff8822' }}>
              Once you have configured a CNAME or proxy (see Setup Guide), enter your custom CDN subdomain here.
              All new uploads will be served from this domain. Existing Media Library URLs are not retroactively rewritten.
            </div>
            <div>
              <label style={T.label}>Custom CDN Domain</label>
              <input value={cfg.customDomain || ''} onChange={e => set('customDomain', e.target.value)}
                placeholder="https://cdn.aifazi.net"
                style={{ ...T.inp, borderColor: cfg.customDomain ? 'var(--green)' : undefined }} />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#334155', marginTop: 5, lineHeight: 1.6 }}>
                Include the scheme (https://). Leave blank to use the provider&apos;s default URL.
              </div>
            </div>

            {/* Live preview */}
            {cfg.customDomain && (
              <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 2, marginBottom: 8 }}>URL PREVIEW</div>
                <div style={{ color: '#475569' }}>Before: <span style={{ color: '#ff4757' }}>https://res.cloudinary.com/mycloud/image/upload/portfolio/file.jpg</span></div>
                <div style={{ color: '#475569', marginTop: 4 }}>After:&nbsp;&nbsp;<span style={{ color: '#00ff88' }}>{cfg.customDomain.replace(/\/$/, '')}/image/upload/portfolio/file.jpg</span></div>
              </div>
            )}

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#475569', marginTop: 16, lineHeight: 1.8, padding: '10px 14px', background: '#ffd70008', border: '1px solid #ffd70022' }}>
              <span style={{ color: '#ffd700' }}>ℹ️ {activeProvider.name} note: </span>{activeProvider.customDomainNote}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={save} disabled={saving || testing} style={T.btn('primary')}>
              {saving ? 'SAVING...' : '💾 SAVE DOMAIN'}
            </button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------------
          SETUP GUIDE
      -------------------------------------------------------------------- */}
      {activeSection === 'guide' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Quick links */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {Object.entries(PROVIDERS).map(([key, info]) => (
              <a key={key} href={info.link} target="_blank" rel="noreferrer" style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                background: cfg.provider === key ? `${info.color}15` : 'var(--bg3)',
                border: `1px solid ${cfg.provider === key ? info.color : 'var(--border)'}`,
                textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 10, color: info.color, transition: 'all 0.15s',
              }}>
                {info.icon} {info.name} ?
              </a>
            ))}
          </div>

          {/* Per-provider step-by-step */}
          {[
            { key: 'cloudinary', color: '#3448c5', icon: '○', title: 'Cloudinary Setup', steps: [
              'Sign up at cloudinary.com (free  25 GB storage, 25 GB bandwidth/month)',
              'Dashboard ? Settings ? Access Keys ? copy Cloud Name, API Key, API Secret',
              'Paste credentials in the Credentials tab and click Save',
              'Custom domain: Requires paid plan, OR proxy via a Cloudflare Worker that rewrites the origin URL',
              'Test the connection to confirm uploads work',
            ]},
            { key: 'r2', color: '#f6821f', icon: '○', title: 'Cloudflare R2 Setup', steps: [
              'Sign in to Cloudflare Dashboard ? R2 ? Create a bucket',
              'Enable "Public Access" on the bucket (Settings tab)',
              'R2 ? Manage R2 API Tokens ? Create token (Read & Write on your bucket)',
              'Copy Account ID from the right sidebar of any Cloudflare page',
              'Custom domain: Bucket ? Settings ? Custom Domains ? Add domain (must be on Cloudflare)',
              'Run: npm install @aws-sdk/client-s3 in your backend folder',
              'Paste credentials, enter your public bucket URL or custom domain, Save & Test',
            ]},
            { key: 'b2', color: '#e05c2c', icon: '○', title: 'Backblaze B2 Setup', steps: [
              'Sign up at backblaze.com (free 10 GB storage)',
              'Create a bucket  set "File Access" to Public',
              'App Keys ? Add Application Key ? select bucket ? Read & Write',
              'Copy keyID (applicationKeyId) and applicationKey (shown once!)',
              'Free bandwidth: Add your B2 download domain to Cloudflare and enable proxy (orange cloud)',
              'Run: npm install @aws-sdk/client-s3 in your backend folder',
              'Paste credentials, set region and download URL, Save & Test',
            ]},
            { key: 'imagekit', color: '#009ef7', icon: '○', title: 'ImageKit Setup', steps: [
              'Sign up at imagekit.io (free  20 GB bandwidth/month)',
              'Dashboard ? Developer Options ? API Keys ? copy Public Key and Private Key',
              'Copy your URL Endpoint (e.g. https://ik.imagekit.io/yourid)',
              'Custom domain: Dashboard ? URL Endpoints ? Add Custom Domain ? CNAME your subdomain to the hostname shown',
              'Paste credentials and URL Endpoint, Save & Test',
            ]},
            { key: 'bunny', color: '#fac517', icon: '○', title: 'BunnyCDN Setup', steps: [
              'Sign up at bunny.net (pay-as-you-go, ~$0.01/GB)',
              'Storage ? Add Storage Zone ? choose a region',
              'Copy the Storage Zone Name and Storage Access Key (FTP & API Access tab)',
              'Create a Pull Zone and link it to your Storage Zone',
              'Custom domain: Pull Zone ? Hostnames ? Add Custom Hostname ? CNAME to <zone>.b-cdn.net',
              'Paste credentials and Pull Zone URL, Save & Test',
            ]},
          ].map(({ key, color, icon, title, steps }) => (
            <div key={key} style={{ ...T.card, borderLeft: `3px solid ${color}`, borderRadius: 12, opacity: cfg.provider === key ? 1 : 0.55, transition: 'opacity 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color, letterSpacing: 2 }}>{title.toUpperCase()}</span>
                {cfg.provider === key && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: 1, padding: '2px 8px', background: `${color}22`, color, border: `1px solid ${color}44`, marginLeft: 4 }}>ACTIVE</span>}
              </div>
              <ol style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {steps.map((s, i) => (
                  <li key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#64748b', lineHeight: 1.7 }}>{s}</li>
                ))}
              </ol>
              <button onClick={() => { set('provider', key); setActiveSection('credentials') }}
                style={{ ...T.btn('ghost'), marginTop: 16, fontSize: 9, padding: '8px 16px' }}>
                {cfg.provider === key ? '✅ ACTIVE  GO TO CREDENTIALS' : `SELECT ${title.split(' ')[0].toUpperCase()} →`}
              </button>
            </div>
          ))}

          {/* DNS cheat sheet */}
          <div style={{ ...T.card, background: 'var(--bg)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 3, marginBottom: 14 }}>DNS CHEAT SHEET  cdn.aifazi.net</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {[
                { provider: 'Cloudflare R2',  type: 'via CF dashboard', target: 'Bucket ? Settings ? Custom Domains' },
                { provider: 'Backblaze B2',   type: 'CNAME + Proxy',    target: 'f004.backblazeb2.com (then orange-cloud it)' },
                { provider: 'ImageKit',       type: 'CNAME',            target: '<your-endpoint>.imagekit.io' },
                { provider: 'BunnyCDN',       type: 'CNAME',            target: '<yourzone>.b-cdn.net' },
                { provider: 'Cloudinary',     type: 'Worker/Proxy',     target: 'res.cloudinary.com/<cloud>/' },
              ].map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '130px 80px 1fr', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                  <span style={{ color: 'var(--text)' }}>{row.provider}</span>
                  <span style={{ color: '#ffd700', fontSize: 9 }}>{row.type}</span>
                  <span style={{ color: '#475569' }}>{row.target}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* -- Sticky Save bar (always visible) ---------------------------------- */}
      {activeSection !== 'guide' && (
        <div style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', borderTop: '1px solid var(--border)', padding: '14px 0', marginTop: 32, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={save} disabled={saving || testing} style={T.btn('primary')}>
            {saving ? 'SAVING...' : '💾 SAVE ALL SETTINGS'}
          </button>
          <button onClick={testConn} disabled={testing || saving} style={T.btn('secondary')}>
            {testing ? '⚡ TESTING...' : '⚡ TEST CONNECTION'}
          </button>
          {testStatus && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: testStatus === 'ok' ? '#00ff88' : '#ff4757', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={T.statusDot(testStatus)} />{testStatus === 'ok' ? 'Connected' : 'Failed'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// --- Animations ------------------------------------------------------------------
const ANIM_CATEGORIES = [
  { id: 'ALL',        label: 'All',           color: 'var(--green)' },
  { id: 'entrance',   label: '🎬 Entrance',    color: '#64b5f6' },
  { id: 'attention',  label: '⚡ Attention',   color: '#ffb74d' },
  { id: 'loading',    label: '⏳ Loading',     color: '#ce93d8' },
  { id: 'text',       label: '📝 Text / Hero', color: '#80cbc4' },
  { id: 'background', label: '🎨 Background',  color: '#ef9a9a' },
]


export default CdnSettings
