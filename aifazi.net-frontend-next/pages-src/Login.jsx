'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api, { saveTokens, clearAuthTokens, getAuthToken } from '@/lib/api'
import { authProviderLoginRoute, safeNextPath } from '@/lib/authRoutes'

// ── Shared styles ──────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%',
  background: 'var(--bg3)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontFamily: 'var(--font-display)',
  fontSize: 15,
  padding: '13px 16px',
  outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  boxSizing: 'border-box',
  minHeight: 50,
  borderRadius: 2,
}

const labelStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  letterSpacing: 2,
  color: 'var(--muted)',
  display: 'block',
  marginBottom: 7,
  textTransform: 'uppercase',
}

function errorText(value, fallback = 'Something went wrong. Please try again.') {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (typeof item === 'string') return item
        if (item?.msg && Array.isArray(item?.loc)) return `${item.loc.slice(-1)[0]}: ${item.msg}`
        if (item?.msg) return item.msg
        return ''
      })
      .filter(Boolean)
      .join(' ')
  }
  if (typeof value === 'object') return value.msg || value.detail || fallback
  return fallback
}

function apiErrorText(err, fallback) {
  return errorText(err?.response?.data?.detail || err?.message, fallback)
}

const ErrorBox = ({ msg }) => {
  const text = errorText(msg)
  return text ? (
    <div style={{
      fontFamily: 'var(--font-mono)', fontSize: 12,
      color: 'var(--red,#ff4757)', padding: '10px 14px',
      background: 'rgba(255,71,87,0.07)', border: '1px solid rgba(255,71,87,0.25)',
      marginBottom: 4, lineHeight: 1.6, borderRadius: 2,
    }}>{text}</div>
  ) : null
}

const SuccessBox = ({ msg }) => msg ? (
  <div style={{
    fontFamily: 'var(--font-mono)', fontSize: 12,
    color: 'var(--green)', padding: '12px 14px',
    background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)',
    marginBottom: 4, lineHeight: 1.7, borderRadius: 2,
  }}>{msg}</div>
) : null

const FieldWrap = ({ label, htmlFor, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
    <label style={labelStyle} htmlFor={htmlFor}>{label}</label>
    {children}
  </div>
)

const focusGreen = (e) => {
  e.target.style.borderColor = 'var(--green)'
  e.target.style.boxShadow = '0 0 0 2px rgba(0,255,136,0.08)'
}
const blurGreen = (e) => {
  e.target.style.borderColor = 'var(--border)'
  e.target.style.boxShadow = 'none'
}

const ADMIN_ROLES = ['admin', 'moderator', 'editor', 'chat']

// safeNextPath is imported from '@/lib/authRoutes' so OAuth callbacks share the same guard.

// ── Rate-limit helpers (module-level so they persist across re-renders) ────────
// Tracks failed attempts per identifier in sessionStorage so a refresh clears
// the lockout but a quick retry on the same tab is blocked.
const _LOCKOUT_KEY = 'login_failures'
const _BACKOFF     = [0, 0, 0, 2000, 4000, 8000, 16000, 30000] // ms per attempt count

function getFailures(id) {
  try { return JSON.parse(sessionStorage.getItem(_LOCKOUT_KEY) || '{}') } catch { return {} }
}
function recordFailure(id) {
  const all = getFailures()
  all[id] = (all[id] || 0) + 1
  sessionStorage.setItem(_LOCKOUT_KEY, JSON.stringify(all))
  return all[id]
}
function clearFailures(id) {
  const all = getFailures()
  delete all[id]
  sessionStorage.setItem(_LOCKOUT_KEY, JSON.stringify(all))
}
function backoffMs(count) { return _BACKOFF[Math.min(count, _BACKOFF.length - 1)] }

// ── Sign In ────────────────────────────────────────────────────────────────────
// Supports both forum users (email) and admin/staff (username)
function SignIn({ onSwitch, onTwoFA }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = safeNextPath(searchParams?.get('next'))
  const [fromForum, setFromForum] = useState(false)
  useEffect(() => {
    setFromForum(document.referrer.includes('/forum') || window.location.search.includes('from=forum'))
  }, [])
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword]     = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  // #3 — rate limiting
  const [lockoutUntil, setLockoutUntil] = useState(0)
  const [countdown, setCountdown]       = useState(0)
  const lockoutRef = useRef(null)

  // Countdown ticker
  useEffect(() => {
    if (lockoutUntil <= Date.now()) return
    const tick = () => {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000)
      if (remaining <= 0) { setCountdown(0); clearInterval(lockoutRef.current); return }
      setCountdown(remaining)
    }
    tick()
    lockoutRef.current = setInterval(tick, 500)
    return () => clearInterval(lockoutRef.current)
  }, [lockoutUntil])

  // Listen for Discord login errors dispatched from the parent LoginPage
  useEffect(() => {
    const handler = (e) => setError(e.detail)
    window.addEventListener('discord-login-error', handler)
    return () => window.removeEventListener('discord-login-error', handler)
  }, [])

  const isEmail = (str) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!identifier.trim() || !password) { setError('Please enter your email/username and password.'); return }
    if (Date.now() < lockoutUntil) return
    setLoading(true); setError('')

    try {
      const res = await api.post('/auth/login', { username: identifier, password })
      if (res.data?.requires_2fa) {
        onTwoFA({
          partial_token: res.data.partial_token,
          username: identifier,
          verify_path: res.data.verify_path || '/auth/2fa/verify',
          next: nextPath || '/profile',
        })
        return
      }
      const token = res.data?.token || res.data?.access_token
      const role  = res.data?.user?.role || res.data?.role
      if (token) {
        saveTokens({ token })
        window.dispatchEvent(new Event('auth-change'))
        clearFailures(identifier)
        router.push(nextPath || (role === 'chat' ? '/chat' : ADMIN_ROLES.includes(role) ? '/admin' : '/profile'))
      } else {
        setError('Login failed — no token received.')
      }
    } catch (err) {
      const detail = err?.response?.data?.detail
      if (detail === 'Email not verified') {
        setError('Please verify your email before signing in. Check your inbox.')
      } else {
        setError(detail || 'Invalid credentials. Please try again.')
      }
      const fails = recordFailure(identifier)
      const wait  = backoffMs(fails)
      if (wait > 0) { setLockoutUntil(Date.now() + wait) }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }} noValidate>
      <ErrorBox msg={error} />

      {/* #3 — lockout countdown banner */}
      {countdown > 0 && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, padding: '10px 14px',
          background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.3)',
          color: '#fbbf24', lineHeight: 1.6, borderRadius: 2,
        }}>
          ⏳ Too many failed attempts. Try again in <strong>{countdown}s</strong>.
        </div>
      )}

      <FieldWrap label="Email or Username" htmlFor="si-id">
        <input
          id="si-id" type="text"
          placeholder="your@email.com or username"
          value={identifier}
          onChange={e => setIdentifier(e.target.value)}
          required autoComplete="username"
          style={inputStyle}
          onFocus={focusGreen} onBlur={blurGreen}
        />
      </FieldWrap>

      <FieldWrap label={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Password</span>
          <button type="button" onClick={() => onSwitch('forgot')}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: 1, padding: 0 }}>
            FORGOT?
          </button>
        </div>
      } htmlFor="si-pass">
        <input
          id="si-pass" type="password"
          placeholder="••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required autoComplete="current-password"
          style={inputStyle}
          onFocus={focusGreen} onBlur={blurGreen}
        />
      </FieldWrap>

      <button type="submit" disabled={loading || countdown > 0} style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700,
        padding: '15px', background: (loading || countdown > 0) ? 'var(--bg3)' : 'var(--green)',
        color: (loading || countdown > 0) ? 'var(--muted)' : '#000',
        border: (loading || countdown > 0) ? '1px solid var(--border)' : 'none',
        cursor: (loading || countdown > 0) ? 'not-allowed' : 'pointer',
        opacity: (loading || countdown > 0) ? 0.7 : 1, width: '100%', minHeight: 50,
        transition: 'all 0.2s', textTransform: 'uppercase', borderRadius: 2,
      }}>
        {loading ? 'SIGNING IN...' : countdown > 0 ? `WAIT ${countdown}s` : 'SIGN IN →'}
      </button>

      {/* ── Discord OAuth divider + button ─────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 2 }}>OR</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <button
        type="button"
        onClick={() => { window.location.href = authProviderLoginRoute('discord', nextPath || '/profile') }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700,
          padding: '14px', background: '#5865F2', color: '#fff',
          border: 'none', cursor: 'pointer', width: '100%', minHeight: 50,
          transition: 'opacity 0.2s', textTransform: 'uppercase', borderRadius: 2,
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <svg width="20" height="20" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.44077 45.4204 0.52529C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.52529C25.5141 0.44359 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="white"/>
        </svg>
        CONTINUE WITH DISCORD
      </button>

      {/* ── Steam login button ──────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => { window.location.href = authProviderLoginRoute('steam', nextPath || '/profile') }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700,
          padding: '14px', background: '#1b2838', color: '#fff',
          border: '1px solid #2a475e', cursor: 'pointer', width: '100%', minHeight: 50,
          transition: 'opacity 0.2s', textTransform: 'uppercase', borderRadius: 2,
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <svg width="20" height="20" viewBox="0 0 233 233" fill="none">
          <path fill="#00b4ff" d="M116.5 18C62.7 18 18.8 60.9 18 114.5l52.7 21.8a29.6 29.6 0 0 1 16.6-5c.6 0 1.2 0 1.8.1L112 99.8v-.5c0-21.8 17.7-39.5 39.5-39.5S191 77.5 191 99.3s-17.7 39.5-39.5 39.5l-31.6 23.1c0 .5.1 1 .1 1.5 0 16.4-13.3 29.7-29.7 29.7-14.4 0-26.4-10.3-29.2-23.9L4.4 148.6C14.7 195.8 56.5 231 106.5 231c2.6 0 5.2-.1 7.8-.2C175 227.4 223 176.5 223 115c0-53.7-43.8-97-106.5-97zm-26 152.2c-8.5 3.4-18.1-.7-21.4-9.2s.7-18.1 9.2-21.5l9.2-3.7a21.8 21.8 0 1 0 3 34.4zM151.5 127a27.7 27.7 0 1 1 0-55.4 27.7 27.7 0 0 1 0 55.4zm0-11.1a16.6 16.6 0 1 0 0-33.2 16.6 16.6 0 0 0 0 33.2z"/>
        </svg>
        SIGN IN WITH STEAM
      </button>

      {/* ── GitHub login button ─────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => { window.location.href = authProviderLoginRoute('github', nextPath || '/profile') }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700,
          padding: '14px', background: '#24292f', color: '#fff',
          border: '1px solid #30363d', cursor: 'pointer', width: '100%', minHeight: 50,
          transition: 'opacity 0.2s', textTransform: 'uppercase', borderRadius: 2,
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <svg width="20" height="20" viewBox="0 0 16 16" fill="#fff" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        SIGN IN WITH GITHUB
      </button>

      <p style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--muted)', textAlign: 'center', margin: 0 }}>
        No account?{' '}
        <button type="button" onClick={() => onSwitch('register')}
          style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--cyan)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
          Create one free
        </button>
      </p>
    </form>
  )
}

// ── Verify Waiting (polls for activation from any device) ─────────────────────
function VerifyWaiting({ email, onSwitch }) {
  const router   = useRouter()
  const [activated, setActivated] = useState(false)
  const [countdown, setCountdown] = useState(3)
  const intervalRef  = useRef(null)
  const countdownRef = useRef(null)

  useEffect(() => {
    let stopped = false

    const poll = async () => {
      try {
        const res = await api.get(`/auth/verify-status?email=${encodeURIComponent(email)}`)
        if (res.data?.verified && !stopped) {
          stopped = true
          clearInterval(intervalRef.current)
          setActivated(true)
          let c = 3
          countdownRef.current = setInterval(() => {
            c -= 1
            setCountdown(c)
            if (c <= 0) {
              clearInterval(countdownRef.current)
              onSwitch('signin')
            }
          }, 1000)
        }
      } catch { /* silently ignore — keep polling */ }
    }

    // Poll immediately then every 3 s
    poll()
    intervalRef.current = setInterval(poll, 3000)

    return () => {
      stopped = true
      clearInterval(intervalRef.current)
      clearInterval(countdownRef.current)
    }
  }, [email, onSwitch])

  if (activated) return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{ fontSize: 52, marginBottom: 16, animation: 'authBounce 0.5s ease' }}>✅</div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--green)',
        padding: '14px 18px', background: 'rgba(0,255,136,0.07)',
        border: '1px solid rgba(0,255,136,0.3)', borderRadius: 4, marginBottom: 20, lineHeight: 1.7,
      }}>
        Account activated! You can now sign in.
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginBottom: 16 }}>
        Redirecting in <span style={{ color: 'var(--cyan)' }}>{countdown}</span>s…
      </div>
      <button type="button" onClick={() => onSwitch('signin')}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', background: 'none',
          border: '1px solid rgba(0,255,136,0.35)', cursor: 'pointer', padding: '10px 24px',
          letterSpacing: 2, borderRadius: 2 }}>
        SIGN IN NOW →
      </button>
      <style>{`@keyframes authBounce{0%{transform:scale(0.4);opacity:0}60%{transform:scale(1.2)}100%{transform:scale(1);opacity:1}}`}</style>
    </div>
  )

  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>📬</div>
      <SuccessBox msg={`Check ${email} for a verification link to activate your account.`} />
      {/* Live polling indicator */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginTop: 16, marginBottom: 4, fontFamily: 'var(--font-mono)', fontSize: 9,
        color: 'var(--muted)', letterSpacing: 2 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)',
          display: 'inline-block', animation: 'authPulse 1.5s ease-in-out infinite' }} />
        WAITING FOR VERIFICATION…
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', opacity: 0.6, marginBottom: 20 }}>
        This page will update automatically once you click the link
      </div>
      <button type="button" onClick={() => onSwitch('signin')}
        style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', background: 'none',
          border: '1px solid rgba(0,255,136,0.35)', cursor: 'pointer', padding: '10px 24px',
          letterSpacing: 2, borderRadius: 2 }}>
        ← BACK TO SIGN IN
      </button>
      <style>{`@keyframes authPulse{0%,100%{opacity:0.3;transform:scale(1)}50%{opacity:1;transform:scale(1.4)}}`}</style>
    </div>
  )
}

// ── Sign Up ────────────────────────────────────────────────────────────────────
function SignUp({ onSwitch }) {
  const [form, setForm]     = useState({ username: '', email: '', password: '', confirm: '' })
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  // Username availability check
  const [unCheck,   setUnCheck]   = useState('idle') // 'idle'|'checking'|'available'|'taken'
  const [unSuggest, setUnSuggest] = useState('')
  const [_timerRef] = useState({ current: null })

  const checkUsername = (uname) => {
    if (_timerRef.current) clearTimeout(_timerRef.current)
    if (!uname || uname.length < 3) { setUnCheck('idle'); setUnSuggest(''); return }
    setUnCheck('checking')
    _timerRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/auth/check-username?username=${encodeURIComponent(uname)}`)
        if (res.data.available) { setUnCheck('available'); setUnSuggest('') }
        else                    { setUnCheck('taken');     setUnSuggest(res.data.suggestion || '') }
      } catch { setUnCheck('idle') }
    }, 550)
  }

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    if (k === 'username') checkUsername(v)
  }

  // Normalize Pydantic v2 errors (detail can be an array of objects, not a string)
  const extractError = (err) => {
    const data = err?.response?.data
    if (!data) return 'Registration failed'
    if (data.detail) {
      if (Array.isArray(data.detail)) return data.detail.map(d => d.msg || String(d)).join(', ')
      return String(data.detail)
    }
    return String(data.error || 'Registration failed')
  }

  const pwMatch  = form.confirm.length > 0 && form.confirm !== form.password
  const canSubmit = !loading
    && form.username.trim().length >= 3
    && form.email.trim().length > 0
    && form.password.length >= 8
    && form.confirm.length > 0
    && form.password === form.confirm
    && unCheck !== 'taken'
    && unCheck !== 'checking'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.username.trim()) { setError('Username is required'); return }
    if (!form.email.trim())    { setError('Email is required');    return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError('')
    try {
      await api.post('/auth/register', {
        username: form.username.trim(), email: form.email.trim(), password: form.password,
      })
      setSuccess(`Check ${form.email} for a verification link to activate your account.`)
    } catch (err) {
      setError(extractError(err))
    } finally { setLoading(false) }
  }

  if (success) return (
    <VerifyWaiting email={form.email} onSwitch={onSwitch} />
  )

  // Username status badge
  const UnStatus = () => {
    if (!form.username || form.username.length < 3) return null
    if (unCheck === 'checking') return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 5, letterSpacing: 1, display: 'block' }}>⏳ Checking…</span>
    if (unCheck === 'available') return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', marginTop: 5, letterSpacing: 1, display: 'block' }}>✓ Available</span>
    if (unCheck === 'taken') return (
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ff4757', marginTop: 5, letterSpacing: 1, display: 'block' }}>
        ✗ Taken{unSuggest && <> — try <button type="button" onClick={() => set('username', unSuggest)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontSize: 10, padding: 0, textDecoration: 'underline' }}>{unSuggest}</button></>}
      </span>
    )
    return null
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
      <ErrorBox msg={error} />

      <FieldWrap label="Username" htmlFor="su-user">
        <input id="su-user" type="text" placeholder="CoolUsername"
          value={form.username} onChange={e => set('username', e.target.value)}
          required minLength={3} maxLength={30} autoComplete="username"
          style={{ ...inputStyle, borderColor: unCheck === 'taken' ? 'rgba(255,71,87,0.6)' : unCheck === 'available' ? 'rgba(0,255,136,0.5)' : 'var(--border)' }}
          onFocus={focusGreen} onBlur={blurGreen} />
        <UnStatus />
      </FieldWrap>

      <FieldWrap label="Email" htmlFor="su-email">
        <input id="su-email" type="email" placeholder="your@email.com"
          value={form.email} onChange={e => set('email', e.target.value)}
          required autoComplete="email"
          style={inputStyle} onFocus={focusGreen} onBlur={blurGreen} />
      </FieldWrap>

      <FieldWrap label="Password" htmlFor="su-pass">
        <input id="su-pass" type="password" placeholder="Min 8 characters"
          value={form.password} onChange={e => set('password', e.target.value)}
          required minLength={8} autoComplete="new-password"
          style={inputStyle} onFocus={focusGreen} onBlur={blurGreen} />
        {form.password.length > 0 && form.password.length < 8 && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ff9800', marginTop: 5, letterSpacing: 1, display: 'block' }}>
            {8 - form.password.length} more character{8 - form.password.length !== 1 ? 's' : ''} needed
          </span>
        )}
      </FieldWrap>

      <FieldWrap label="Confirm Password" htmlFor="su-conf">
        <input id="su-conf" type="password" placeholder="Repeat password"
          value={form.confirm} onChange={e => set('confirm', e.target.value)}
          required autoComplete="new-password"
          style={{ ...inputStyle, borderColor: pwMatch ? 'rgba(255,71,87,0.6)' : 'var(--border)' }}
          onFocus={e => { e.target.style.borderColor = pwMatch ? 'rgba(255,71,87,0.6)' : 'var(--green)'; e.target.style.boxShadow = '0 0 0 2px rgba(0,255,136,0.08)' }}
          onBlur={e =>  { e.target.style.borderColor = pwMatch ? 'rgba(255,71,87,0.6)' : 'var(--border)'; e.target.style.boxShadow = 'none' }} />
        {pwMatch && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#ff4757', marginTop: 5, letterSpacing: 1 }}>Passwords don't match</span>}
      </FieldWrap>

      <button type="submit" disabled={!canSubmit} style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700,
        padding: '15px', background: !canSubmit ? 'var(--bg3)' : loading ? 'var(--bg3)' : 'var(--cyan)',
        color: !canSubmit ? 'var(--muted)' : loading ? 'var(--muted)' : '#000',
        border: !canSubmit ? '1px solid var(--border)' : loading ? '1px solid var(--border)' : 'none',
        cursor: !canSubmit ? 'not-allowed' : loading ? 'not-allowed' : 'pointer',
        opacity: !canSubmit ? 0.5 : loading ? 0.7 : 1, width: '100%', minHeight: 50,
        transition: 'all 0.2s', textTransform: 'uppercase', borderRadius: 2,
      }}>
        {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT →'}
      </button>

      {/* ── Discord OAuth divider + button ─────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 2 }}>OR</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <button
        type="button"
        onClick={() => { window.location.href = authProviderLoginRoute('discord', '/profile') }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700,
          padding: '14px', background: '#5865F2', color: '#fff',
          border: 'none', cursor: 'pointer', width: '100%', minHeight: 50,
          transition: 'opacity 0.2s', textTransform: 'uppercase', borderRadius: 2,
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <svg width="20" height="20" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.44077 45.4204 0.52529C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.52529C25.5141 0.44359 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="white"/>
        </svg>
        SIGN UP WITH DISCORD
      </button>

      {/* ── Steam sign-up button ─────────────────────────────── */}
      <button
        type="button"
        onClick={() => { window.location.href = authProviderLoginRoute('steam', '/profile') }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700,
          padding: '14px', background: '#1b2838', color: '#fff',
          border: '1px solid #2a475e', cursor: 'pointer', width: '100%', minHeight: 50,
          transition: 'opacity 0.2s', textTransform: 'uppercase', borderRadius: 2,
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <svg width="20" height="20" viewBox="0 0 233 233" fill="none">
          <path fill="#00b4ff" d="M116.5 18C62.7 18 18.8 60.9 18 114.5l52.7 21.8a29.6 29.6 0 0 1 16.6-5c.6 0 1.2 0 1.8.1L112 99.8v-.5c0-21.8 17.7-39.5 39.5-39.5S191 77.5 191 99.3s-17.7 39.5-39.5 39.5l-31.6 23.1c0 .5.1 1 .1 1.5 0 16.4-13.3 29.7-29.7 29.7-14.4 0-26.4-10.3-29.2-23.9L4.4 148.6C14.7 195.8 56.5 231 106.5 231c2.6 0 5.2-.1 7.8-.2C175 227.4 223 176.5 223 115c0-53.7-43.8-97-106.5-97zm-26 152.2c-8.5 3.4-18.1-.7-21.4-9.2s.7-18.1 9.2-21.5l9.2-3.7a21.8 21.8 0 1 0 3 34.4zM151.5 127a27.7 27.7 0 1 1 0-55.4 27.7 27.7 0 0 1 0 55.4zm0-11.1a16.6 16.6 0 1 0 0-33.2 16.6 16.6 0 0 0 0 33.2z"/>
        </svg>
        SIGN UP WITH STEAM
      </button>

      {/* ── GitHub sign-up button ─────────────────────────────── */}
      <button
        type="button"
        onClick={() => { window.location.href = authProviderLoginRoute('github', '/profile') }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700,
          padding: '14px', background: '#24292f', color: '#fff',
          border: '1px solid #30363d', cursor: 'pointer', width: '100%', minHeight: 50,
          transition: 'opacity 0.2s', textTransform: 'uppercase', borderRadius: 2,
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        <svg width="20" height="20" viewBox="0 0 16 16" fill="#fff" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        SIGN UP WITH GITHUB
      </button>

      <p style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--muted)', textAlign: 'center', margin: 0 }}>
        Already have an account?{' '}
        <button type="button" onClick={() => onSwitch('signin')}
          style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
          Sign in
        </button>
      </p>
    </form>
  )
}

// ── Forgot Password ────────────────────────────────────────────────────────────
function ForgotPassword({ onSwitch }) {
  const [email, setEmail]   = useState('')
  const [error, setError]   = useState('')
  const [sent, setSent]     = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await api.post('/auth/forgot-password', { email })
      setSent(true)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not send reset email. Try again.')
    } finally { setLoading(false) }
  }

  if (sent) return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>📬</div>
      <SuccessBox msg={`Reset link sent to ${email}. Check your inbox and spam folder. Link expires in 1 hour.`} />
      <button type="button" onClick={() => onSwitch('signin')}
        style={{ marginTop: 20, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', background: 'none', border: '1px solid rgba(0,255,136,0.35)', cursor: 'pointer', padding: '10px 24px', letterSpacing: 2, borderRadius: 2 }}>
        ← BACK TO SIGN IN
      </button>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }} noValidate>
      <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, margin: 0 }}>
        Enter your email address and we'll send you a link to reset your password.
      </p>
      <ErrorBox msg={error} />
      <FieldWrap label="Email Address" htmlFor="fp-email">
        <input id="fp-email" type="email" placeholder="your@email.com"
          value={email} onChange={e => setEmail(e.target.value)}
          required autoComplete="email"
          style={inputStyle} onFocus={focusGreen} onBlur={blurGreen} />
      </FieldWrap>
      <button type="submit" disabled={loading} style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700,
        padding: '15px', background: loading ? 'var(--bg3)' : 'var(--green)',
        color: loading ? 'var(--muted)' : '#000',
        border: loading ? '1px solid var(--border)' : 'none',
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1, width: '100%', minHeight: 50,
        transition: 'all 0.2s', textTransform: 'uppercase', borderRadius: 2,
      }}>
        {loading ? 'SENDING...' : 'SEND RESET LINK →'}
      </button>
      <p style={{ textAlign: 'center', margin: 0 }}>
        <button type="button" onClick={() => onSwitch('signin')}
          style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          ← Back to Sign In
        </button>
      </p>
    </form>
  )
}

// ── Two-Factor Auth Step ───────────────────────────────────────────────────────
function TwoFAStep({ challenge, onBack }) {
  const router  = useRouter()
  const [code, setCode]           = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [expired, setExpired]     = useState(false)
  const [countdown, setCountdown] = useState(30)

  // Count down then auto-redirect when session expires
  useEffect(() => {
    if (!expired) return
    if (countdown <= 0) { onBack(); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [expired, countdown, onBack])

  async function verify(trimmed) {
    if (trimmed.length !== 6) { setError('Enter the 6-digit code from your authenticator app.'); return }
    setLoading(true); setError('')
    try {
      const verifyPath = challenge.verify_path || '/auth/2fa/verify'
      const res = await api.post(verifyPath, {
        partial_token: challenge.partial_token,
        code: trimmed,
      })
      const token = res.data?.token || res.data?.access_token
      const role  = res.data?.user?.role || res.data?.role
      if (token) {
        saveTokens({ token })
        window.dispatchEvent(new Event('auth-change'))
        router.push(challenge.next || (role === 'admin' || role === 'moderator' ? '/admin' : '/profile'))
      } else {
        setError('Verification failed — no token received.')
      }
    } catch (err) {
      if (err?.response?.status === 401) {
        setExpired(true)
        setError('')
      } else {
        setError(err?.response?.data?.detail || 'Invalid or expired code. Try again.')
      }
    } finally { setLoading(false) }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    await verify(code.replace(/\s/g, ''))
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }} noValidate>
      {/* Icon + title */}
      <div style={{ textAlign: 'center', paddingBottom: 4 }}>
        <div style={{ fontSize: 38, marginBottom: 10 }}>{expired ? '⏳' : '🔐'}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          Two-Factor Verification
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7 }}>
          Signed in as <span style={{ color: 'var(--cyan)' }}>{challenge.username}</span>.<br />
          Enter the 6-digit code from your authenticator app.
        </div>
      </div>

      {/* Session expired banner */}
      {expired && (
        <div style={{
          background: 'rgba(251,191,36,0.08)',
          border: '1px solid rgba(251,191,36,0.35)',
          borderRadius: 4,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: '#fbbf24', letterSpacing: 1 }}>
            ⚠ SESSION EXPIRED
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', lineHeight: 1.7 }}>
            Your sign-in session timed out. Please sign in again.
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#fbbf24' }}>
            Redirecting in {countdown}s…
          </div>
          <button
            type="button"
            onClick={onBack}
            style={{
              marginTop: 4,
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, fontWeight: 700,
              padding: '10px', background: 'rgba(251,191,36,0.12)',
              color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)',
              cursor: 'pointer', borderRadius: 2,
            }}
          >
            ← BACK TO SIGN IN NOW
          </button>
        </div>
      )}

      <ErrorBox msg={error} />

      <FieldWrap label="Authenticator Code" htmlFor="twofa-code">
        <input
          id="twofa-code" type="text" inputMode="numeric" pattern="[0-9 ]*"
          placeholder="000 000" maxLength={7}
          value={code}
          onChange={e => {
            const val = e.target.value.replace(/[^0-9 ]/g, '')
            setCode(val)
            const digits = val.replace(/\s/g, '')
            if (digits.length === 6) verify(digits)
          }}
          required autoComplete="one-time-code" autoFocus
          disabled={expired}
          style={{ ...inputStyle, textAlign: 'center', fontSize: 22, letterSpacing: 8, fontFamily: 'var(--font-mono)', opacity: expired ? 0.4 : 1 }}
          onFocus={focusGreen} onBlur={blurGreen}
        />
      </FieldWrap>

      <button type="submit" disabled={loading || expired} style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, fontWeight: 700,
        padding: '15px', background: (loading || expired) ? 'var(--bg3)' : 'var(--green)',
        color: (loading || expired) ? 'var(--muted)' : '#000',
        border: (loading || expired) ? '1px solid var(--border)' : 'none',
        cursor: (loading || expired) ? 'not-allowed' : 'pointer',
        opacity: (loading || expired) ? 0.7 : 1, width: '100%', minHeight: 50,
        transition: 'all 0.2s', textTransform: 'uppercase', borderRadius: 2,
      }}>
        {loading ? 'VERIFYING...' : 'VERIFY CODE →'}
      </button>

      <p style={{ textAlign: 'center', margin: 0 }}>
        <button type="button" onClick={onBack}
          style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          ← Back to Sign In
        </button>
      </p>
    </form>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'signin',   label: 'Sign In'  },
  { key: 'register', label: 'Sign Up'  },
  { key: 'forgot',   label: 'Forgot'   },
]
const TAB_META = {
  signin:   { tag: 'AUTHENTICATION',   title: 'Welcome Back',       sub: 'Sign in to your account'     },
  register: { tag: 'NEW ACCOUNT',      title: 'Join the Community', sub: 'Create your free account'    },
  forgot:   { tag: 'ACCOUNT RECOVERY', title: 'Reset Password',     sub: "We'll send a reset link"     },
}

export default function Login() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const rawTab = searchParams?.get('tab') || 'signin'
  const validTab = ['signin','register','forgot'].includes(rawTab) ? rawTab : 'signin'
  const [tab, setTab] = useState(validTab)
  const [twoFAChallenge, setTwoFAChallenge] = useState(null)
  const meta = twoFAChallenge
    ? { tag: 'TWO-FACTOR AUTH', title: 'Verify Identity', sub: 'One more step to sign in' }
    : TAB_META[tab]

  // ── Show Discord OAuth errors passed via query param ──────────────────────
  useEffect(() => {
    const discordError = searchParams?.get('discord_error')
    if (!discordError) return
    const msgs = {
      '1': 'Discord login was cancelled.',
      '2': 'Failed to exchange Discord token. Please try again.',
      '3': 'Could not fetch your Discord profile.',
      'cfg': 'Discord login is not configured yet — contact the admin.',
      'db': 'Database error during Discord login.',
      'banned': 'Your account has been banned.',
    }
    // Show error in the signin tab's error state via a custom event
    window.dispatchEvent(new CustomEvent('discord-login-error', {
      detail: msgs[discordError] || 'Discord login failed. Please try again.'
    }))
    setTab('signin')
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''))
    if (hash.get('twofa') !== 'forum') return
    const partial = hash.get('partial_token')
    if (!partial) return
    const next = safeNextPath(hash.get('next')) || '/profile'
    setTwoFAChallenge({
      partial_token: partial,
      username: hash.get('username') || 'user',
      verify_path: '/auth/2fa/verify',
      next,
    })
    window.history.replaceState({}, '', `/login?tab=signin&next=${encodeURIComponent(next)}`)
  }, [])

  // ── Already logged in? Redirect away from /login ───────────────────────────
  useEffect(() => {
    const token = getAuthToken()
    const nextPath = safeNextPath(searchParams?.get('next'))
    if (!token) return
    // Decode role from JWT payload (no verification needed — just for routing)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const role = payload?.role || ''

      if (nextPath) { router.replace(nextPath); return }
      if (ADMIN_ROLES.includes(role)) {
        router.replace('/admin')
      } else {
        router.replace('/profile')
      }
    } catch {
      // Malformed token — clear it and stay on login
      clearAuthTokens()
    }
  }, [])

  const switchTab = (t) => {
    setTab(t)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', t)
      window.history.replaceState({}, '', url.toString())
    }
  }

  return (
    <>
      <style>{`
        .auth-input:focus {
          border-color: var(--green) !important;
          box-shadow: 0 0 0 3px rgba(0,255,136,0.08) !important;
        }
        .auth-tab-btn:hover { color: var(--text) !important; }
        @media (max-width: 480px) {
          .auth-card-inner { padding: 20px 16px !important; }
          .auth-tab-btn { font-size: 9px !important; padding: 12px 4px !important; }
        }
      `}</style>

      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
        <div style={{ width: '100%', maxWidth: 460 }}>

          {/* Header */}
          <div style={{ marginBottom: 28, textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14,
              padding: '4px 14px', background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.2)', borderRadius: 20 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', boxShadow: '0 0 6px var(--green)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--green)' }}>
                {meta.tag}
              </span>
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 7vw, 34px)', fontWeight: 800, color: 'var(--text)', margin: '0 0 8px', letterSpacing: -0.5, lineHeight: 1.1 }}>
              {meta.title}
            </h1>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--muted)', margin: 0, fontWeight: 400 }}>
              {meta.sub}
            </p>
          </div>

          {/* Card */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', position: 'relative', boxSizing: 'border-box', borderRadius: 4, overflow: 'hidden' }}>
            {/* Top gradient bar */}
            <div style={{ height: 3, background: 'linear-gradient(90deg, var(--green), var(--cyan), var(--green))', backgroundSize: '200% 100%' }} />

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
              {TABS.map(t => (
                <button key={t.key} type="button" className="auth-tab-btn"
                  onClick={() => switchTab(t.key)}
                  style={{
                    flex: 1, padding: '14px 8px',
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
                    textTransform: 'uppercase', cursor: 'pointer', border: 'none',
                    background: tab === t.key ? 'rgba(0,255,136,0.05)' : 'transparent',
                    color: tab === t.key ? 'var(--green)' : 'var(--muted)',
                    borderBottom: tab === t.key ? '2px solid var(--green)' : '2px solid transparent',
                    transition: 'all 0.18s',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Form */}
            <div className="auth-card-inner" style={{ padding: 'clamp(20px, 5vw, 32px)' }}>
              {twoFAChallenge                && <TwoFAStep     challenge={twoFAChallenge} onBack={() => setTwoFAChallenge(null)} />}
              {!twoFAChallenge && tab === 'signin'   && <SignIn   onSwitch={switchTab} onTwoFA={c => setTwoFAChallenge(c)} />}
              {!twoFAChallenge && tab === 'register' && <SignUp   onSwitch={switchTab} />}
              {!twoFAChallenge && tab === 'forgot'   && <ForgotPassword onSwitch={switchTab} />}
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 22, textAlign: 'center' }}>
            <a href="/" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', textDecoration: 'none', letterSpacing: 3, opacity: 0.7 }}>
              ← BACK TO HOME
            </a>
          </div>

        </div>
      </div>
    </>
  )
}
