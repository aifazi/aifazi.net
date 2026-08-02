'use client'
import { useState, useEffect } from 'react'
import { Link, useNavigate, useParams } from '@/lib/router-compat'
import api from '@/lib/api'
import { useForum } from '../context/ForumContext'
import { authProviderLoginRoute } from '@/lib/authRoutes'

// ─── Shared styles ────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)',
  color: 'var(--text)', fontFamily: 'var(--font-display)',
  fontSize: 15, padding: '12px 16px', outline: 'none',
  borderRadius: 10,
  transition: 'border-color 0.2s, box-shadow 0.2s',
}

const labelStyle = {
  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
  color: 'var(--muted)', display: 'block', marginBottom: 8,
}

const btnStyle = (bg = 'var(--green)', disabled = false) => ({
  fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 2,
  padding: '14px', background: bg, color: bg === 'var(--green)' || bg === 'var(--cyan)' ? '#000' : '#e2e8f0',
  border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1, fontWeight: 700, width: '100%',
  borderRadius: 10,
  boxShadow: bg === 'var(--green)' ? '0 0 18px rgba(0,255,136,0.22)' : bg === 'var(--cyan)' ? '0 0 18px rgba(0,212,255,0.2)' : undefined,
  transition: 'opacity 0.2s, box-shadow 0.2s, transform 0.2s',
})

const ErrorBox = ({ msg }) => msg ? (
  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--red)', padding: '10px 16px', background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.2)', borderRadius: 10 }}>
    {msg}
  </div>
) : null

const SuccessBox = ({ msg }) => msg ? (
  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--green)', padding: '12px 16px', background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 10, lineHeight: 1.6 }}>
    {msg}
  </div>
) : null

const PageWrap = ({ children }) => (
  <div className="page-container community-page" style={{ zIndex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh', padding: '40px 24px' }}>
    <div style={{ width: '100%', maxWidth: 440 }}>
      <div style={{
        border: '1px solid var(--border)', borderRadius: 18,
        padding: 'clamp(28px, 5vw, 44px)',
        background:
          'radial-gradient(120% 140% at 12% 0%, rgba(0,255,136,0.07), transparent 50%),' +
          'radial-gradient(120% 140% at 88% 100%, rgba(0,212,255,0.06), transparent 52%),' +
          'color-mix(in srgb, var(--bg2) 90%, var(--bg) 10%)',
        boxShadow: 'var(--shadow-card)',
      }}>
        {children}
      </div>
    </div>
  </div>
)

const Tag = ({ text, color = 'var(--green)' }) => (
  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color, letterSpacing: 4, marginBottom: 8 }}>
    ACCOUNT
  </div>
)

const BackLink = ({ to = '/', label = '← BACK TO HOME' }) => (
  <div style={{ marginTop: 16, textAlign: 'center' }}>
    <Link to={to} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 2 }}>
      {label}
    </Link>
  </div>
)

// ─── Email Sent Screen ────────────────────────────────────────────────────────
function EmailSentScreen({ email, onResend, resending, resent, type = 'verify' }) {
  const isReset = type === 'reset'
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>📬</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: isReset ? 'var(--cyan)' : 'var(--green)', letterSpacing: 4, marginBottom: 8 }}>EMAIL SENT</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, marginBottom: 20 }}>
        {isReset ? 'Check your inbox' : 'Verify your email'}
      </h1>
      <p style={{ color: 'var(--muted)', lineHeight: 1.8, marginBottom: 28, fontSize: 15 }}>
        {isReset
          ? <>We sent a password reset link to <strong style={{ color: 'var(--text)' }}>{email}</strong>. Click the link in the email to set a new password. It expires in 1 hour.</>
          : <>We sent a verification link to <strong style={{ color: 'var(--text)' }}>{email}</strong>. Click it to activate your account. The link expires in 24 hours.</>
        }
      </p>

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '16px 20px', marginBottom: 24, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1, lineHeight: 1.8 }}>
        💡 Check your spam folder if you don't see it in a few minutes.
      </div>

      {!isReset && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>Didn't receive it?</p>
          {resent
            ? <SuccessBox msg="Email resent! Check your inbox." />
            : (
              <button onClick={onResend} disabled={resending}
                style={{ ...btnStyle('var(--bg3)', resending), border: '1px solid var(--border)', color: 'var(--cyan)', fontSize: 11 }}>
                {resending ? 'RESENDING...' : '↺ RESEND VERIFICATION EMAIL'}
              </button>
            )
          }
        </div>
      )}

      <BackLink />
    </div>
  )
}

// ─── ForumLogin ───────────────────────────────────────────────────────────────
export function ForumLogin() {
  const { login }  = useForum()
  const navigate   = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  // Unverified state
  const [unverified,  setUnverified]  = useState(false)
  const [unverEmail,  setUnverEmail]  = useState('')
  const [resending,   setResending]   = useState(false)
  const [resent,      setResent]      = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(''); setUnverified(false)
    try {
      const res = await api.post('/auth/login', { username: email, password })
      login(res.data.token, res.data.user)
      navigate('/')
    } catch (err) {
      const data = err.response?.data
      const detail = data?.detail || data?.error || ''
      if (detail === 'Email not verified') {
        setUnverified(true)
        setUnverEmail(email)
        setError('')
      } else {
        setError(detail || 'Login failed')
      }
    } finally { setLoading(false) }
  }

  const handleResend = async () => {
    setResending(true)
    try {
      await api.post('/auth/resend-verification', { email: unverEmail })
      setResent(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend email')
    } finally { setResending(false) }
  }

  return (
    <PageWrap>
      <Tag />
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 8vw, 40px)', fontWeight: 700, marginBottom: 32 }}>Sign In</h1>

      {unverified ? (
        <div>
          <div style={{ background: 'rgba(255,107,53,0.06)', border: '1px solid rgba(255,107,53,0.3)', padding: '20px', marginBottom: 24 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--orange)', letterSpacing: 2, marginBottom: 8 }}>EMAIL NOT VERIFIED</div>
            <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7 }}>
              You need to verify your email address before you can log in.
              Check your inbox at <strong style={{ color: 'var(--text)' }}>{unverEmail}</strong>.
            </p>
          </div>
          {resent
            ? <SuccessBox msg="Verification email resent! Check your inbox." />
            : (
              <button onClick={handleResend} disabled={resending}
                style={{ ...btnStyle('var(--green)', resending), marginBottom: 12 }}>
                {resending ? 'SENDING...' : '↺ RESEND VERIFICATION EMAIL'}
              </button>
            )
          }
          <button onClick={() => setUnverified(false)}
            style={{ ...btnStyle('var(--bg3)'), border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 11 }}>
            ← BACK TO LOGIN
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <label style={labelStyle}>EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="your@email.com" style={inputStyle} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>PASSWORD</label>
              <Link to="/forum/forgot-password" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', textDecoration: 'none', letterSpacing: 1 }}>
                FORGOT PASSWORD?
              </Link>
            </div>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" style={inputStyle} />
          </div>

          <ErrorBox msg={error} />

          <button type="submit" disabled={loading} style={btnStyle('var(--green)', loading)}>
            {loading ? 'SIGNING IN...' : 'SIGN IN →'}
          </button>
        </form>
      )}

      {!unverified && (
        <>
          <div style={{ marginTop: 24, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
            No account? <Link to="/forum/register" style={{ color: 'var(--cyan)' }}>Register here</Link>
          </div>
          <BackLink />
        </>
      )}
    </PageWrap>
  )
}

// ─── ForumRegister ────────────────────────────────────────────────────────────
export function ForumRegister() {
  const navigate  = useNavigate()
  const [form, setForm]         = useState({ username: '', email: '', password: '', confirm: '' })
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [registered, setRegistered] = useState(false)
  const [resending, setResending]   = useState(false)
  const [resent, setResent]         = useState(false)

  // ── Username availability check ──────────────────────────────────────────
  const [unCheck, setUnCheck] = useState('idle') // 'idle'|'checking'|'available'|'taken'
  const [unSuggest, setUnSuggest] = useState('')
  const debounceRef = useEffect.bind(null) // just a ref holder
  const timerRef = { current: null }

  // Stable ref to avoid closure issues
  const [_timerRef] = useState({ current: null })

  const checkUsername = (uname) => {
    if (_timerRef.current) clearTimeout(_timerRef.current)
    if (!uname || uname.length < 3) { setUnCheck('idle'); setUnSuggest(''); return }
    setUnCheck('checking')
    _timerRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/auth/check-username?username=${encodeURIComponent(uname)}`)
        if (res.data.available) {
          setUnCheck('available'); setUnSuggest('')
        } else {
          setUnCheck('taken'); setUnSuggest(res.data.suggestion || '')
        }
      } catch { setUnCheck('idle') }
    }, 550)
  }

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    if (k === 'username') checkUsername(v)
  }

  // Normalize API error — Pydantic validation returns an array, not a string
  const extractError = (err) => {
    const data = err?.response?.data
    if (!data) return 'Registration failed'
    if (data.detail) {
      if (Array.isArray(data.detail)) return data.detail.map(d => d.msg || String(d)).join(', ')
      return String(data.detail)
    }
    return String(data.error || 'Registration failed')
  }

  const canSubmit = !loading
    && form.username.trim().length >= 3
    && form.email.trim().length > 0
    && form.password.length >= 8
    && form.confirm.length > 0
    && unCheck !== 'taken'   // block if username is known-taken
    && unCheck !== 'checking'

  const handleSubmit = async (e) => {
    e.preventDefault()
    // Explicit front-end guards (belt-and-suspenders on top of HTML required)
    if (!form.username.trim()) { setError('Username is required'); return }
    if (!form.email.trim())    { setError('Email is required'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError('')
    try {
      await api.post('/auth/register', {
        username: form.username.trim(),
        email:    form.email.trim(),
        password: form.password,
      })
      setRegistered(true)
    } catch (err) {
      setError(extractError(err))
    } finally { setLoading(false) }
  }

  const handleResend = async () => {
    setResending(true)
    try {
      await api.post('/auth/resend-verification', { email: form.email })
      setResent(true)
    } catch (err) {
      setError(extractError(err))
    } finally { setResending(false) }
  }

  // Username status indicator
  const UnStatus = () => {
    if (!form.username || form.username.length < 3) return null
    if (unCheck === 'checking') return (
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6, letterSpacing: 1 }}>
        ⏳ Checking availability…
      </div>
    )
    if (unCheck === 'available') return (
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', marginTop: 6, letterSpacing: 1 }}>
        ✓ Available
      </div>
    )
    if (unCheck === 'taken') return (
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)', marginTop: 6, letterSpacing: 1 }}>
        ✗ Username taken
        {unSuggest && (
          <span>
            {' — try '}
            <button
              type="button"
              onClick={() => { set('username', unSuggest) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 10, padding: 0, textDecoration: 'underline' }}
            >
              {unSuggest}
            </button>
          </span>
        )}
      </div>
    )
    return null
  }

  if (registered) {
    return (
      <PageWrap>
        <EmailSentScreen
          email={form.email}
          onResend={handleResend}
          resending={resending}
          resent={resent}
          type="verify"
        />
      </PageWrap>
    )
  }

  return (
    <PageWrap>
      <Tag color="var(--cyan)" />
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px, 8vw, 40px)', fontWeight: 700, marginBottom: 32 }}>Create Account</h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <label style={labelStyle}>USERNAME</label>
          <input
            value={form.username}
            onChange={e => set('username', e.target.value)}
            required autoFocus
            placeholder="CoolUsername"
            minLength={3} maxLength={30}
            style={{
              ...inputStyle,
              borderColor: unCheck === 'taken' ? 'rgba(255,71,87,0.6)'
                : unCheck === 'available' ? 'rgba(0,255,136,0.5)'
                : 'var(--border)'
            }}
          />
          <UnStatus />
        </div>
        <div>
          <label style={labelStyle}>EMAIL</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required placeholder="your@email.com" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>PASSWORD</label>
          <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required placeholder="Min 8 characters" minLength={8} style={inputStyle} />
          {form.password.length > 0 && form.password.length < 8 && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--orange)', marginTop: 6, letterSpacing: 1 }}>
              {8 - form.password.length} more character{8 - form.password.length !== 1 ? 's' : ''} needed
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>CONFIRM PASSWORD</label>
          <input
            type="password" value={form.confirm}
            onChange={e => set('confirm', e.target.value)}
            required placeholder="Repeat password"
            style={{
              ...inputStyle,
              borderColor: form.confirm.length > 0 && form.confirm !== form.password
                ? 'rgba(255,71,87,0.6)' : 'var(--border)'
            }}
          />
          {form.confirm.length > 0 && form.confirm !== form.password && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)', marginTop: 6, letterSpacing: 1 }}>
              Passwords don't match
            </div>
          )}
        </div>

        <ErrorBox msg={error} />

        <button type="submit" disabled={!canSubmit} style={btnStyle('var(--cyan)', !canSubmit)}>
          {loading ? 'CREATING...' : 'CREATE ACCOUNT →'}
        </button>
      </form>

      {/* OAuth options */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 2 }}>OR</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        <a href={authProviderLoginRoute('discord', '/forum/profile')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            background: '#5865F2', color: '#fff', padding: '13px 16px',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700,
            textDecoration: 'none', transition: 'opacity 0.2s' }}>
          <svg width="18" height="14" viewBox="0 0 71 55" fill="white"><path d="M60.1 4.9A58.6 58.6 0 0 0 45.5.7a40.3 40.3 0 0 0-1.8 3.7 54.2 54.2 0 0 0-16.4 0A40 40 0 0 0 25.4.7 58.4 58.4 0 0 0 10.8 5C1.6 18.8-1 32.3.3 45.6a59.2 59.2 0 0 0 18 9.2c1.5-2 2.8-4.2 3.9-6.5a38.4 38.4 0 0 1-6.1-3 .3.3 0 0 1 0-.5l1.2-.9a42 42 0 0 0 36.2 0l1.2.9a.3.3 0 0 1 0 .5 38.9 38.9 0 0 1-6.2 3 36.5 36.5 0 0 0 3.9 6.5 59 59 0 0 0 18.1-9.2c1.5-15.6-2.5-29-10.4-40.7ZM23.7 37.7c-3.5 0-6.4-3.3-6.4-7.3s2.8-7.3 6.4-7.3c3.6 0 6.5 3.3 6.4 7.3 0 4-2.8 7.3-6.4 7.3Zm23.6 0c-3.5 0-6.4-3.3-6.4-7.3s2.8-7.3 6.4-7.3c3.6 0 6.5 3.3 6.4 7.3 0 4-2.8 7.3-6.4 7.3Z"/></svg>
          SIGN UP WITH DISCORD
        </a>
        <a href={authProviderLoginRoute('steam', '/forum/profile')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            background: '#1b2838', color: '#c7d5e0', padding: '13px 16px',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700,
            textDecoration: 'none', transition: 'opacity 0.2s', border: '1px solid #2a475e' }}>
          <svg width="18" height="18" viewBox="0 0 233 233" fill="#c7d5e0"><path d="M116.5 18C62.7 18 18.8 60.9 18 114.5l52.7 21.8a29.6 29.6 0 0 1 16.6-5c.6 0 1.2 0 1.8.1L112 99.8v-.5c0-21.8 17.7-39.5 39.5-39.5S191 77.5 191 99.3s-17.7 39.5-39.5 39.5l-31.6 23.1c0 .5.1 1 .1 1.5 0 16.4-13.3 29.7-29.7 29.7-14.4 0-26.4-10.3-29.2-23.9L4.4 148.6C14.7 195.8 56.5 231 106.5 231c2.6 0 5.2-.1 7.8-.2C175 227.4 223 176.5 223 115c0-53.7-43.8-97-106.5-97zm-26 152.2c-8.5 3.4-18.1-.7-21.4-9.2s.7-18.1 9.2-21.5l9.2-3.7a21.8 21.8 0 1 0 3 34.4zM151.5 127a27.7 27.7 0 1 1 0-55.4 27.7 27.7 0 0 1 0 55.4zm0-11.1a16.6 16.6 0 1 0 0-33.2 16.6 16.6 0 0 0 0 33.2z"/></svg>
          SIGN UP WITH STEAM
        </a>
        <a href={authProviderLoginRoute('github', '/forum/profile')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            background: '#24292f', color: '#fff', padding: '13px 16px',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700,
            textDecoration: 'none', transition: 'opacity 0.2s', border: '1px solid #30363d' }}>
          <svg width="18" height="18" viewBox="0 0 16 16" fill="#fff"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
          SIGN UP WITH GITHUB
        </a>
      </div>

      <div style={{ marginTop: 20, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
        Already have an account? <Link to="/forum/login" style={{ color: 'var(--green)' }}>Sign in</Link>
      </div>
      <BackLink />
    </PageWrap>
  )
}

// ─── VerifyEmail ──────────────────────────────────────────────────────────────
export function VerifyEmail() {
  const { login }  = useForum()
  const navigate   = useNavigate()
  const [status, setStatus] = useState('loading') // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Token comes as ?token= query param in the email link
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) { setStatus('error'); setMessage('No token provided.'); return }
    api.get(`/auth/verify-email?token=${token}`)
      .then(res => {
        setStatus('success')
        setMessage(res.data.message || 'Email verified!')
        setTimeout(() => navigate('/login'), 2500)
      })
      .catch(err => {
        setStatus('error')
        setMessage(err.response?.data?.detail || err.response?.data?.error || 'Verification failed or link expired.')
      })
  }, [])

  return (
    <PageWrap>
      <div style={{ textAlign: 'center' }}>
        {status === 'loading' && (
          <>
            <div style={{ fontSize: 56, marginBottom: 20 }}>⏳</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', letterSpacing: 2 }}>VERIFYING YOUR EMAIL...</div>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: 64, marginBottom: 20 }}>✅</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', letterSpacing: 4, marginBottom: 12 }}>VERIFIED</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, marginBottom: 16 }}>Email Confirmed!</h1>
            <p style={{ color: 'var(--muted)', lineHeight: 1.8, marginBottom: 24 }}>
              Your account is active. Redirecting you...
            </p>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>
              <Link to="/" style={{ color: 'var(--green)', textDecoration: 'none' }}>CLICK HERE IF NOT REDIRECTED →</Link>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 64, marginBottom: 20 }}>❌</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--red)', letterSpacing: 4, marginBottom: 12 }}>INVALID LINK</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, marginBottom: 16 }}>Link Expired</h1>
            <p style={{ color: 'var(--muted)', lineHeight: 1.8, marginBottom: 24 }}>{message}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link to="/login" style={{ ...btnStyle('var(--green)'), display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                GO TO LOGIN (RESEND FROM THERE)
              </Link>
              <BackLink />
            </div>
          </>
        )}
      </div>
    </PageWrap>
  )
}

// ─── ForgotPassword ───────────────────────────────────────────────────────────
export function ForgotPassword() {
  const [tab,        setTab]        = useState('reset')   // 'reset' | 'find'
  // Reset-password tab state
  const [identifier, setIdentifier] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSent,    setResetSent]    = useState(false)
  const [resetError,   setResetError]   = useState('')
  // Find-username tab state
  const [findEmail,   setFindEmail]   = useState('')
  const [findLoading, setFindLoading] = useState(false)
  const [findSent,    setFindSent]    = useState(false)
  const [findError,   setFindError]   = useState('')

  const handleReset = async (e) => {
    e.preventDefault()
    setResetLoading(true); setResetError('')
    try {
      await api.post('/auth/forgot', { identifier })
      setResetSent(true)
    } catch (err) {
      setResetError(err.response?.data?.detail || err.response?.data?.error || 'Something went wrong')
    } finally { setResetLoading(false) }
  }

  const handleFind = async (e) => {
    e.preventDefault()
    setFindLoading(true); setFindError('')
    try {
      await api.post('/auth/find-username', { email: findEmail })
      setFindSent(true)
    } catch (err) {
      setFindError(err.response?.data?.detail || err.response?.data?.error || 'Something went wrong')
    } finally { setFindLoading(false) }
  }

  const tabStyle = (active) => ({
    flex: 1, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
    padding: '12px 8px', border: 'none', cursor: 'pointer',
    background: active ? 'var(--cyan)' : 'var(--bg3)',
    color:      active ? '#000'        : 'var(--muted)',
    borderBottom: active ? '2px solid var(--cyan)' : '2px solid var(--border)',
    fontWeight: active ? 700 : 400,
    transition: 'all 0.15s',
  })

  // ── Reset tab sent ─────────────────────────────────────────────────────────
  if (resetSent) return (
    <PageWrap>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 20 }}>📬</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: 4, marginBottom: 8 }}>EMAIL SENT</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, marginBottom: 16 }}>Check your inbox</h1>
        <p style={{ color: 'var(--muted)', lineHeight: 1.8, marginBottom: 24, fontSize: 15 }}>
          If an account matches <strong style={{ color: 'var(--text)' }}>{identifier}</strong>, a reset link has been sent. It expires in&nbsp;1&nbsp;hour.
        </p>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '14px 18px', marginBottom: 28, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1, lineHeight: 1.8 }}>
          💡 Check your spam folder if you don't see it.
        </div>
        <Link to="/login" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 2 }}>← BACK TO LOGIN</Link>
      </div>
    </PageWrap>
  )

  // ── Find-username tab sent ─────────────────────────────────────────────────
  if (findSent) return (
    <PageWrap>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 20 }}>📬</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', letterSpacing: 4, marginBottom: 8 }}>EMAIL SENT</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, marginBottom: 16 }}>Check your inbox</h1>
        <p style={{ color: 'var(--muted)', lineHeight: 1.8, marginBottom: 24, fontSize: 15 }}>
          If <strong style={{ color: 'var(--text)' }}>{findEmail}</strong> is registered, your username has been sent to that address.
        </p>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '14px 18px', marginBottom: 28, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1, lineHeight: 1.8 }}>
          💡 Check your spam folder if you don't see it.
        </div>
        <Link to="/login" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 2 }}>← BACK TO LOGIN</Link>
      </div>
    </PageWrap>
  )

  return (
    <PageWrap>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: 4, marginBottom: 8 }}>ACCOUNT RECOVERY</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px,8vw,40px)', fontWeight: 700, marginBottom: 28 }}>Account Recovery</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', marginBottom: 28, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <button style={tabStyle(tab === 'reset')} onClick={() => setTab('reset')}>🔑 RESET PASSWORD</button>
        <button style={tabStyle(tab === 'find')}  onClick={() => setTab('find')}>👤 FIND USERNAME</button>
      </div>

      {/* ── Reset Password tab ─────────────────────────────────────────────── */}
      {tab === 'reset' && (
        <div>
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
            Enter your <strong style={{ color: 'var(--text)' }}>email address or username</strong> and we'll send a password reset link to your registered email.
          </p>
          <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={labelStyle}>EMAIL OR USERNAME</label>
              <input
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                required autoFocus
                placeholder="your@email.com  or  CoolUsername"
                style={inputStyle}
              />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', marginTop: 6, letterSpacing: 1 }}>
                Both email and username are accepted
              </div>
            </div>
            <ErrorBox msg={resetError} />
            <button type="submit" disabled={resetLoading} style={btnStyle('var(--cyan)', resetLoading)}>
              {resetLoading ? 'SENDING...' : 'SEND RESET LINK →'}
            </button>
          </form>
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>
              Don't know your username?{' '}
              <button onClick={() => setTab('find')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', letterSpacing: 1, padding: 0 }}>
                Find it here
              </button>
            </span>
          </div>
        </div>
      )}

      {/* ── Find Username tab ──────────────────────────────────────────────── */}
      {tab === 'find' && (
        <div>
          <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
            Enter the <strong style={{ color: 'var(--text)' }}>email address</strong> you registered with and we'll send your username to that inbox.
          </p>
          <form onSubmit={handleFind} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={labelStyle}>EMAIL ADDRESS</label>
              <input
                type="email"
                value={findEmail}
                onChange={e => setFindEmail(e.target.value)}
                required autoFocus
                placeholder="your@email.com"
                style={inputStyle}
              />
            </div>
            <ErrorBox msg={findError} />
            <button type="submit" disabled={findLoading} style={btnStyle('var(--green)', findLoading)}>
              {findLoading ? 'SENDING...' : 'SEND MY USERNAME →'}
            </button>
          </form>
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>
              Know your username?{' '}
              <button onClick={() => setTab('reset')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)', letterSpacing: 1, padding: 0 }}>
                Reset password instead
              </button>
            </span>
          </div>
        </div>
      )}

      <div style={{ marginTop: 28, textAlign: 'center' }}>
        <Link to="/login" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 2 }}>← BACK TO LOGIN</Link>
      </div>
    </PageWrap>
  )
}

// ─── ResetPassword ────────────────────────────────────────────────────────────
export function ResetPassword() {
  const navigate     = useNavigate()
  const [password,   setPassword]  = useState('')
  const [confirm,    setConfirm]   = useState('')
  const [loading,    setLoading]   = useState(false)
  const [error,      setError]     = useState('')
  const [success,    setSuccess]   = useState(false)

  // Token comes as ?token= query param in the email link
  const token = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('token')
    : null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError('')
    try {
      await api.post(`/auth/reset-password/${token}`, { password })
      // C3 — the backend returns {message} only (no token/user); reset revokes
      // old sessions, so take the user to the login page to sign in fresh.
      setSuccess(true)
      setTimeout(() => navigate('/login?tab=signin'), 2000)
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed. Link may have expired.')
    } finally { setLoading(false) }
  }

  // Strength indicator
  const strength = password.length === 0 ? 0
    : password.length < 6  ? 1
    : password.length < 10 ? 2
    : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 4
    : 3
  const strengthLabel = ['', 'WEAK', 'FAIR', 'GOOD', 'STRONG'][strength]
  const strengthColor = ['', 'var(--red)', 'var(--orange)', 'var(--cyan)', 'var(--green)'][strength]

  if (success) {
    return (
      <PageWrap>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 20 }}>🔓</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', letterSpacing: 4, marginBottom: 12 }}>PASSWORD RESET</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 700, marginBottom: 16 }}>All Done!</h1>
          <p style={{ color: 'var(--muted)', lineHeight: 1.8 }}>Your password has been changed. Redirecting you...</p>
        </div>
      </PageWrap>
    )
  }

  return (
    <PageWrap>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', letterSpacing: 4, marginBottom: 8 }}>ACCOUNT RECOVERY</div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 700, marginBottom: 40 }}>New Password</h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <label style={labelStyle}>NEW PASSWORD</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min 8 characters" minLength={6} style={inputStyle} />
          {password.length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{ height: 3, flex: 1, background: i <= strength ? strengthColor : 'var(--border)', transition: 'background 0.3s' }} />
              ))}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: strengthColor, letterSpacing: 1, marginLeft: 6, whiteSpace: 'nowrap' }}>{strengthLabel}</span>
            </div>
          )}
        </div>
        <div>
          <label style={labelStyle}>CONFIRM PASSWORD</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="Repeat password" style={{ ...inputStyle, borderColor: confirm.length > 0 && confirm !== password ? 'rgba(255,71,87,0.6)' : 'var(--border)' }} />
          {confirm.length > 0 && confirm !== password && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red)', marginTop: 6, letterSpacing: 1 }}>Passwords don't match</div>
          )}
        </div>

        <ErrorBox msg={error} />

        <button type="submit" disabled={loading || password !== confirm || password.length < 6}
          style={btnStyle('var(--green)', loading || password !== confirm || password.length < 6)}>
          {loading ? 'SAVING...' : 'SET NEW PASSWORD →'}
        </button>
      </form>

      <BackLink to="/login" label="← BACK TO LOGIN" />
    </PageWrap>
  )
}
