'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api, { saveTokens, clearAuthTokens, getAuthToken } from '@/lib/api'
import { authProviderLoginRoute, safeNextPath } from '@/lib/authRoutes'

// ── Shared styles ──────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: 'var(--text)',
  fontFamily: 'var(--font-display)',
  fontSize: 15,
  padding: '13px 4px',
  outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  boxSizing: 'border-box',
  minHeight: 50,
  borderRadius: 0,
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
    <div className="auth-alert auth-alert-error" role="alert">
      <span className="auth-alert-ico">✕</span>
      <span>{text}</span>
    </div>
  ) : null
}

const SuccessBox = ({ msg }) => msg ? (
  <div className="auth-alert auth-alert-ok" role="status">
    <span className="auth-alert-ico">✓</span>
    <span>{msg}</span>
  </div>
) : null

const FieldWrap = ({ label, htmlFor, children, hint }) => (
  <div className="auth-field-wrap">
    <label style={labelStyle} htmlFor={htmlFor}>{label}</label>
    <div className="auth-field">
      {children}
      <span className="auth-field-line" aria-hidden="true" />
    </div>
    {hint}
  </div>
)

const focusGreen = (e) => {
  e.target.style.color = 'var(--text)'
}
const blurGreen = (e) => {
  e.target.style.color = 'var(--text)'
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

// ── Animated backdrop: constellation particle field ────────────────────────────
function ParticleField() {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let w = 0, h = 0, raf = 0, particles = [], dpr = 1

    const resize = () => {
      dpr = window.devicePixelRatio || 1
      w = window.innerWidth; h = window.innerHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(110, Math.floor((w * h) / 15000))
      particles = Array.from({ length: count }, (_, i) => ({
        idx: i, x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.45, vy: (Math.random() - 0.5) * 0.45,
        r: Math.random() * 1.7 + 0.6,
      }))
    }
    resize()

    const tick = () => {
      const cs = getComputedStyle(document.documentElement)
      const green = cs.getPropertyValue('--green').trim() || '#00ff88'
      const cyan  = cs.getPropertyValue('--cyan').trim()  || '#00d4ff'
      const isLight = document.documentElement.getAttribute('data-theme-mode') === 'light'
      const dim = isLight ? 0.16 : 0.42
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i], b = particles[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < 150 * 150) {
            const alpha = (1 - Math.sqrt(d2) / 150) * dim * 0.9
            ctx.strokeStyle = green; ctx.globalAlpha = alpha; ctx.lineWidth = 0.5
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
          }
        }
      }
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1
        ctx.fillStyle = p.idx % 2 ? cyan : green
        ctx.globalAlpha = dim * 1.6
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const onVisibility = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(tick) }
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  return <canvas ref={ref} className="auth-canvas" aria-hidden="true" />
}

// ── Left visual panel: neural core + system readout ────────────────────────────
const STATUS_LINES = [
  { label: 'SESSION HANDSHAKE',  value: 'ESTABLISHED', ok: true  },
  { label: 'ENCRYPTION LAYER',   value: 'AES-256-GCM', ok: true  },
  { label: 'NODE MESH LATENCY',  value: '12ms',        ok: true  },
  { label: 'IDENTITY TOKEN',     value: 'PENDING',     ok: false },
]

function NeuralCore() {
  return (
    <div className="auth-core" aria-hidden="true">
      <div className="auth-core-ring auth-ring-1" />
      <div className="auth-core-ring auth-ring-2" />
      <div className="auth-core-ring auth-ring-3" />
      <div className="auth-core-orbit auth-orbit-1"><span className="auth-orbit-dot" /></div>
      <div className="auth-core-orbit auth-orbit-2"><span className="auth-orbit-dot" /></div>
      <div className="auth-core-hub">
        <div className="auth-hub-pulse" />
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="13.5" cy="6.5" r=".5" fill="var(--green)"/>
          <circle cx="17.5" cy="10.5" r=".5" fill="var(--green)"/>
          <circle cx="8.5" cy="7.5" r=".5" fill="var(--green)"/>
          <circle cx="6.5" cy="12.5" r=".5" fill="var(--green)"/>
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
        </svg>
      </div>
      <div className="auth-core-hud">
        {STATUS_LINES.map((s, i) => (
          <div key={s.label} className="auth-hud-row" style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
            <span className="auth-hud-label">{s.label}</span>
            <span className="auth-hud-val" data-ok={s.ok}>{s.value}</span>
          </div>
        ))}
        <div className="auth-hud-blink">
          <span className="auth-hud-blink-dot" /> AWAITING AUTHENTICATION
        </div>
      </div>
      <div className="auth-core-note">SIGNAL.LOCK</div>
    </div>
  )
}

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
    <form onSubmit={handleSubmit} className="auth-form" noValidate>
      <ErrorBox msg={error} />

      {/* #3 — lockout countdown banner */}
      {countdown > 0 && (
        <div className="auth-alert auth-alert-warn" role="alert">
          <span className="auth-alert-ico">⏳</span>
          <span>Too many failed attempts. Try again in <strong>{countdown}s</strong>.</span>
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
            className="auth-link auth-link-cyan">
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

      <button type="submit" className="auth-submit" disabled={loading || countdown > 0}>
        <span className="auth-submit-shine" aria-hidden="true" />
        {loading ? 'SIGNING IN...' : countdown > 0 ? `WAIT ${countdown}s` : 'SIGN IN'}
        <span className="auth-submit-arrow" aria-hidden="true">→</span>
      </button>

      {/* ── Discord OAuth divider + button ─────────────────────────────── */}
      <div className="auth-divider"><span>OR CONTINUE WITH</span></div>
      <div className="auth-oauth-row">
        <button type="button" className="auth-oauth auth-oauth-discord"
          onClick={() => { window.location.href = authProviderLoginRoute('discord', nextPath || '/profile') }}
          title="Sign in with Discord">
          <svg width="18" height="18" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.44077 45.4204 0.52529C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.52529C25.5141 0.44359 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="currentColor"/>
          </svg>
          <span>DISCORD</span>
        </button>
        <button type="button" className="auth-oauth auth-oauth-steam"
          onClick={() => { window.location.href = authProviderLoginRoute('steam', nextPath || '/profile') }}
          title="Sign in with Steam">
          <svg width="18" height="18" viewBox="0 0 233 233" fill="none">
            <path fill="currentColor" d="M116.5 18C62.7 18 18.8 60.9 18 114.5l52.7 21.8a29.6 29.6 0 0 1 16.6-5c.6 0 1.2 0 1.8.1L112 99.8v-.5c0-21.8 17.7-39.5 39.5-39.5S191 77.5 191 99.3s-17.7 39.5-39.5 39.5l-31.6 23.1c0 .5.1 1 .1 1.5 0 16.4-13.3 29.7-29.7 29.7-14.4 0-26.4-10.3-29.2-23.9L4.4 148.6C14.7 195.8 56.5 231 106.5 231c2.6 0 5.2-.1 7.8-.2C175 227.4 223 176.5 223 115c0-53.7-43.8-97-106.5-97zm-26 152.2c-8.5 3.4-18.1-.7-21.4-9.2s.7-18.1 9.2-21.5l9.2-3.7a21.8 21.8 0 1 0 3 34.4zM151.5 127a27.7 27.7 0 1 1 0-55.4 27.7 27.7 0 0 1 0 55.4zm0-11.1a16.6 16.6 0 1 0 0-33.2 16.6 16.6 0 0 0 0 33.2z"/>
          </svg>
          <span>STEAM</span>
        </button>
        <button type="button" className="auth-oauth auth-oauth-github"
          onClick={() => { window.location.href = authProviderLoginRoute('github', nextPath || '/profile') }}
          title="Sign in with GitHub">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          <span>GITHUB</span>
        </button>
      </div>

      <p className="auth-switch-line">
        No account?{' '}
        <button type="button" onClick={() => onSwitch('register')} className="auth-link auth-link-green">
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
    <div className="auth-state" style={{ textAlign: 'center', padding: '8px 0' }}>
      <div className="auth-state-ico" style={{ animation: 'authBounce 0.5s ease' }}>✅</div>
      <SuccessBox msg="Account activated! You can now sign in." />
      <div className="auth-countdown">Redirecting in <span>{countdown}</span>s…</div>
      <button type="button" className="auth-ghost-btn" onClick={() => onSwitch('signin')}>
        SIGN IN NOW →
      </button>
      <style>{`@keyframes authBounce{0%{transform:scale(0.4);opacity:0}60%{transform:scale(1.2)}100%{transform:scale(1);opacity:1}}`}</style>
    </div>
  )

  return (
    <div className="auth-state" style={{ textAlign: 'center', padding: '8px 0' }}>
      <div className="auth-state-ico" style={{ animation: 'authFloatY 2.4s ease-in-out infinite' }}>📬</div>
      <SuccessBox msg={`Check ${email} for a verification link to activate your account.`} />
      {/* Live polling indicator */}
      <div className="auth-waiting">
        <span className="auth-waiting-dot" />
        WAITING FOR VERIFICATION…
      </div>
      <div className="auth-waiting-note">This page will update automatically once you click the link</div>
      <button type="button" className="auth-ghost-btn" onClick={() => onSwitch('signin')}>
        ← BACK TO SIGN IN
      </button>
      <style>{`@keyframes authFloatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>
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
    if (unCheck === 'checking') return <span className="auth-field-status">⏳ Checking…</span>
    if (unCheck === 'available') return <span className="auth-field-status auth-field-status-ok">✓ Available</span>
    if (unCheck === 'taken') return (
      <span className="auth-field-status auth-field-status-bad">
        ✗ Taken{unSuggest && <> — try <button type="button" onClick={() => set('username', unSuggest)} className="auth-link auth-link-cyan" style={{ fontSize: 10, textDecoration: 'underline' }}>{unSuggest}</button></>}
      </span>
    )
    return null
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form" noValidate>
      <ErrorBox msg={error} />

      <FieldWrap label="Username" htmlFor="su-user" hint={<UnStatus />}>
        <input id="su-user" type="text" placeholder="CoolUsername"
          value={form.username} onChange={e => set('username', e.target.value)}
          required minLength={3} maxLength={30} autoComplete="username"
          style={inputStyle}
          onFocus={focusGreen} onBlur={blurGreen} />
      </FieldWrap>

      <FieldWrap label="Email" htmlFor="su-email">
        <input id="su-email" type="email" placeholder="your@email.com"
          value={form.email} onChange={e => set('email', e.target.value)}
          required autoComplete="email"
          style={inputStyle} onFocus={focusGreen} onBlur={blurGreen} />
      </FieldWrap>

      <FieldWrap label="Password" htmlFor="su-pass" hint={
        form.password.length > 0 && form.password.length < 8 && (
          <span className="auth-field-status auth-field-status-warn">{8 - form.password.length} more character{8 - form.password.length !== 1 ? 's' : ''} needed</span>
        )
      }>
        <input id="su-pass" type="password" placeholder="Min 8 characters"
          value={form.password} onChange={e => set('password', e.target.value)}
          required minLength={8} autoComplete="new-password"
          style={inputStyle} onFocus={focusGreen} onBlur={blurGreen} />
      </FieldWrap>

      <FieldWrap label="Confirm Password" htmlFor="su-conf" hint={pwMatch && <span className="auth-field-status auth-field-status-bad">Passwords don't match</span>}>
        <input id="su-conf" type="password" placeholder="Repeat password"
          value={form.confirm} onChange={e => set('confirm', e.target.value)}
          required autoComplete="new-password"
          style={{ ...inputStyle }}
          onFocus={focusGreen} onBlur={blurGreen} />
      </FieldWrap>

      <button type="submit" className="auth-submit" disabled={!canSubmit}>
        <span className="auth-submit-shine" aria-hidden="true" />
        {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
        <span className="auth-submit-arrow" aria-hidden="true">→</span>
      </button>

      {/* ── Discord OAuth divider + button ─────────────────────────────── */}
      <div className="auth-divider"><span>OR CONTINUE WITH</span></div>
      <div className="auth-oauth-row">
        <button type="button" className="auth-oauth auth-oauth-discord"
          onClick={() => { window.location.href = authProviderLoginRoute('discord', '/profile') }}
          title="Sign up with Discord">
          <svg width="18" height="18" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.44077 45.4204 0.52529C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.52529C25.5141 0.44359 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="currentColor"/>
          </svg>
          <span>DISCORD</span>
        </button>
        <button type="button" className="auth-oauth auth-oauth-steam"
          onClick={() => { window.location.href = authProviderLoginRoute('steam', '/profile') }}
          title="Sign up with Steam">
          <svg width="18" height="18" viewBox="0 0 233 233" fill="none">
            <path fill="currentColor" d="M116.5 18C62.7 18 18.8 60.9 18 114.5l52.7 21.8a29.6 29.6 0 0 1 16.6-5c.6 0 1.2 0 1.8.1L112 99.8v-.5c0-21.8 17.7-39.5 39.5-39.5S191 77.5 191 99.3s-17.7 39.5-39.5 39.5l-31.6 23.1c0 .5.1 1 .1 1.5 0 16.4-13.3 29.7-29.7 29.7-14.4 0-26.4-10.3-29.2-23.9L4.4 148.6C14.7 195.8 56.5 231 106.5 231c2.6 0 5.2-.1 7.8-.2C175 227.4 223 176.5 223 115c0-53.7-43.8-97-106.5-97zm-26 152.2c-8.5 3.4-18.1-.7-21.4-9.2s.7-18.1 9.2-21.5l9.2-3.7a21.8 21.8 0 1 0 3 34.4zM151.5 127a27.7 27.7 0 1 1 0-55.4 27.7 27.7 0 0 1 0 55.4zm0-11.1a16.6 16.6 0 1 0 0-33.2 16.6 16.6 0 0 0 0 33.2z"/>
          </svg>
          <span>STEAM</span>
        </button>
        <button type="button" className="auth-oauth auth-oauth-github"
          onClick={() => { window.location.href = authProviderLoginRoute('github', '/profile') }}
          title="Sign up with GitHub">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          <span>GITHUB</span>
        </button>
      </div>

      <p className="auth-switch-line">
        Already have an account?{' '}
        <button type="button" onClick={() => onSwitch('signin')} className="auth-link auth-link-green">
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
    <div className="auth-state" style={{ textAlign: 'center', padding: '8px 0' }}>
      <div className="auth-state-ico" style={{ animation: 'authFloatY 2.4s ease-in-out infinite' }}>📬</div>
      <SuccessBox msg={`Reset link sent to ${email}. Check your inbox and spam folder. Link expires in 1 hour.`} />
      <button type="button" className="auth-ghost-btn" style={{ marginTop: 20 }} onClick={() => onSwitch('signin')}>
        ← BACK TO SIGN IN
      </button>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="auth-form" noValidate>
      <p className="auth-intro">
        Enter your email address and we'll send you a link to reset your password.
      </p>
      <ErrorBox msg={error} />
      <FieldWrap label="Email Address" htmlFor="fp-email">
        <input id="fp-email" type="email" placeholder="your@email.com"
          value={email} onChange={e => setEmail(e.target.value)}
          required autoComplete="email"
          style={inputStyle} onFocus={focusGreen} onBlur={blurGreen} />
      </FieldWrap>
      <button type="submit" className="auth-submit" disabled={loading}>
        <span className="auth-submit-shine" aria-hidden="true" />
        {loading ? 'SENDING...' : 'SEND RESET LINK'}
        <span className="auth-submit-arrow" aria-hidden="true">→</span>
      </button>
      <p style={{ textAlign: 'center', margin: 0 }}>
        <button type="button" onClick={() => onSwitch('signin')} className="auth-link auth-link-muted">
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
    <form onSubmit={handleSubmit} className="auth-form" noValidate>
      {/* Icon + title */}
      <div style={{ textAlign: 'center', paddingBottom: 4 }}>
        <div className="auth-state-ico" style={{ animation: 'authSpinSlow 6s linear infinite', display: 'inline-flex' }}>{expired ? '⏳' : '🔐'}</div>
        <div className="auth-2fa-title">Two-Factor Verification</div>
        <div className="auth-2fa-sub">
          Signed in as <span style={{ color: 'var(--cyan)' }}>{challenge.username}</span>.<br />
          Enter the 6-digit code from your authenticator app.
        </div>
      </div>

      {/* Session expired banner */}
      {expired && (
        <div className="auth-alert auth-alert-warn">
          <span className="auth-alert-ico">⚠</span>
          <span style={{ flex: 1 }}>
            <strong style={{ letterSpacing: 1 }}>SESSION EXPIRED</strong><br />
            Your sign-in session timed out. Please sign in again.
            <span style={{ color: '#fbbf24' }}> Redirecting in {countdown}s…</span>
          </span>
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

      <button type="submit" className="auth-submit" disabled={loading || expired}>
        <span className="auth-submit-shine" aria-hidden="true" />
        {loading ? 'VERIFYING...' : 'VERIFY CODE'}
        <span className="auth-submit-arrow" aria-hidden="true">→</span>
      </button>

      <p style={{ textAlign: 'center', margin: 0 }}>
        <button type="button" onClick={onBack} className="auth-link auth-link-muted">
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

  const tabIndex = TABS.findIndex(t => t.key === tab)
  const formKey = twoFAChallenge ? '2fa' : tab

  return (
    <>
      <style>{`
        /* ══ AUTH PAGE — NEURAL GATEWAY ═══════════════════════════ */
        .auth-canvas { position: fixed; inset: 0; z-index: 0; pointer-events: none; }

        .auth-page { display: flex; align-items: center; justify-content: center; padding-top: 96px; padding-bottom: 60px; }
        .auth-stage {
          position: relative; z-index: 1; width: 100%; max-width: 980px;
          display: grid; grid-template-columns: 1.05fr 1fr; min-height: 560px;
          border-radius: 18px; overflow: hidden;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--bg2) 92%, transparent);
          box-shadow: 0 30px 80px rgba(0,0,0,0.5), 0 0 60px var(--border2, rgba(0,212,255,0.06));
          animation: authStageIn .6s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes authStageIn { from { opacity:0; transform: translateY(28px) scale(.985); } to { opacity:1; transform:none; } }

        /* Corner brackets */
        .auth-stage::before, .auth-stage::after,
        .auth-visual::before, .auth-visual::after {
          content:''; position:absolute; width:22px; height:22px; z-index:3; pointer-events:none;
          border-color: var(--green); border-style:solid; border-width:0;
          opacity:.85; filter: drop-shadow(0 0 6px var(--green));
        }
        .auth-stage::before { top:10px; left:10px; border-top-width:2px; border-left-width:2px; }
        .auth-stage::after  { bottom:10px; right:10px; border-bottom-width:2px; border-right-width:2px; }
        .auth-visual::before { bottom:10px; left:10px; border-bottom-width:2px; border-left-width:2px; opacity:.4; }
        .auth-visual::after  { top:10px; right:10px; border-top-width:2px; border-right-width:2px; opacity:.4; }

        /* Left visual panel */
        .auth-visual {
          position: relative; overflow: hidden; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 22px;
          background:
            radial-gradient(ellipse at 20% 0%, var(--green) 0%, transparent 55%),
            radial-gradient(ellipse at 90% 100%, var(--cyan) 0%, transparent 50%),
            linear-gradient(180deg, color-mix(in srgb, var(--bg) 88%, transparent), var(--bg2));
          border-right: 1px solid var(--border);
        }
        .auth-visual::after {
          content:''; position:absolute; inset:0; z-index:1; pointer-events:none;
          background-image:
            linear-gradient(var(--grid-line) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: radial-gradient(ellipse at center, rgba(0,0,0,.9), transparent 75%);
          -webkit-mask-image: radial-gradient(ellipse at center, rgba(0,0,0,.9), transparent 75%);
        }
        .auth-visual > * { position: relative; z-index: 2; }

        /* Neural core */
        .auth-core { position: relative; width: 230px; height: 230px; display:flex; align-items:center; justify-content:center; }
        .auth-core-ring { position:absolute; border-radius:50%; border:1px solid var(--border); }
        .auth-ring-1 { width:120px; height:120px; border-color: rgba(0,255,136,0.25); animation: authSpinSlow 14s linear infinite; border-top-color: var(--green); }
        .auth-ring-2 { width:170px; height:170px; border-color: rgba(0,212,255,0.18); animation: authSpinRev 20s linear infinite; border-bottom-color: var(--cyan); }
        .auth-ring-3 { width:220px; height:220px; border:1px dashed rgba(255,255,255,0.06); animation: authSpinSlow 34s linear infinite; }
        @keyframes authSpinSlow { to { transform: rotate(360deg); } }
        @keyframes authSpinRev  { to { transform: rotate(-360deg); } }

        .auth-core-orbit { position:absolute; border-radius:50%; }
        .auth-orbit-1 { width:170px; height:60px; animation: authTilt 6s ease-in-out infinite; }
        .auth-orbit-2 { width:60px; height:170px; animation: authTilt 6s ease-in-out infinite reverse; }
        @keyframes authTilt { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(180deg); } }
        .auth-orbit-dot { position:absolute; top:50%; left:50%; width:7px; height:7px; border-radius:50%;
          background: var(--green); box-shadow: 0 0 12px var(--green); }
        .auth-orbit-1 .auth-orbit-dot { transform: translate(-50%,-50%); animation: authOrbitMove 6s linear infinite; }
        .auth-orbit-2 .auth-orbit-dot { background: var(--cyan); box-shadow: 0 0 12px var(--cyan); animation: authOrbitMove 6s linear infinite reverse; }
        @keyframes authOrbitMove { 0% { margin-top:-3px; margin-left:55px; } 50% { margin-top:3px; margin-left:-55px; } 100% { margin-top:-3px; margin-left:55px; } }

        .auth-core-hub { position:relative; width:64px; height:64px; border-radius:50%; display:flex; align-items:center; justify-content:center;
          background: color-mix(in srgb, var(--bg3) 80%, transparent);
          border:1px solid rgba(0,255,136,0.35); animation: authHubPulse 3s ease-in-out infinite; }
        .auth-hub-pulse { position:absolute; inset:-8px; border-radius:50%; border:1px solid rgba(0,255,136,0.2); animation: authHubPulse 3s ease-in-out infinite; }
        @keyframes authHubPulse { 0%,100% { box-shadow: 0 0 18px rgba(0,255,136,0.18); } 50% { box-shadow: 0 0 34px rgba(0,255,136,0.42); } }

        /* HUD readout */
        .auth-core-hud { position:absolute; top: calc(100% + 14px); left:50%; transform:translateX(-50%);
          width: 260px; display:flex; flex-direction:column; gap:7px; }
        .auth-hud-row { display:flex; align-items:center; justify-content:space-between; gap:10px;
          font-family: var(--font-mono); font-size: 8.5px; letter-spacing: 1.5px;
          color: var(--muted); opacity:0; animation: authHudIn .4s ease forwards; }
        .auth-hud-label { opacity:.7; }
        .auth-hud-val { color: var(--green); }
        .auth-hud-val[data-ok="false"] { color: #ffb020; }
        .auth-hud-blink { display:flex; align-items:center; gap:6px; margin-top:4px;
          font-family: var(--font-mono); font-size: 8px; letter-spacing: 2px; color: var(--green); }
        .auth-hud-blink-dot { width:5px; height:5px; border-radius:50%; background:var(--green);
          box-shadow:0 0 8px var(--green); animation: authBlink 1.2s steps(1) infinite; }
        @keyframes authHudIn { to { opacity:1; } }
        @keyframes authBlink { 0%,100% { opacity:1; } 50% { opacity:0.1; } }
        .auth-core-note { position:absolute; bottom:-44px; font-family: var(--font-mono); font-size:8px;
          letter-spacing:4px; color: var(--muted); opacity:.4; }

        /* Right form panel */
        .auth-panel { position:relative; padding: 30px clamp(24px, 4vw, 40px) 28px; display:flex; flex-direction:column; }

        .auth-head { text-align:left; margin-bottom: 22px; }
        .auth-pill { display:inline-flex; align-items:center; gap:8px; margin-bottom: 14px;
          padding: 5px 14px; background: color-mix(in srgb, var(--green) 8%, transparent);
          border:1px solid color-mix(in srgb, var(--green) 30%, transparent); border-radius: 999px; }
        .auth-pill-dot { width:6px; height:6px; border-radius:50%; background:var(--green);
          box-shadow:0 0 6px var(--green); animation: authBlink 1.6s ease-in-out infinite; }
        .auth-pill span { font-family: var(--font-mono); font-size:9px; letter-spacing:3px; color:var(--green); }
        .auth-title { font-family: var(--font-display); font-size: clamp(22px, 4.5vw, 30px); font-weight:800;
          color: var(--text); margin:0 0 6px; letter-spacing:-0.5px; line-height:1.1; }
        .auth-sub { font-family: var(--font-display); font-size:13.5px; color: var(--muted); margin:0; }

        /* Tabs with sliding indicator */
        .auth-tabs { position:relative; display:flex; border-bottom:1px solid var(--border); margin-bottom: 22px; }
        .auth-tab-indicator { position:absolute; bottom:-1px; left:0; height:2px; width:33.333%;
          background: linear-gradient(90deg, var(--green), var(--cyan));
          box-shadow: 0 0 12px var(--green); transition: transform .34s cubic-bezier(0.16,1,0.3,1); }
        .auth-tab { flex:1; padding: 12px 8px; background:transparent; border:none; cursor:pointer;
          font-family: var(--font-mono); font-size:10px; letter-spacing:2px; text-transform:uppercase;
          color: var(--muted); transition: color .18s, background .18s; position:relative; }
        .auth-tab:hover { color: var(--text); }
        .auth-tab.is-active { color: var(--green); }

        /* Form */
        .auth-form { display:flex; flex-direction:column; gap: 18px; animation: authFormIn .4s ease both; }
        @keyframes authFormIn { from { opacity:0; transform: translateX(14px); } to { opacity:1; transform:none; } }

        .auth-field-wrap { display:flex; flex-direction:column; }
        .auth-field { position:relative; }
        .auth-field input { background:transparent; border:none; }
        .auth-field-line { position:absolute; left:0; right:0; bottom:0; height:1px;
          background: var(--border); transition: all .25s ease; }
        .auth-field-line::after { content:''; position:absolute; left:0; bottom:0; height:2px; width:100%;
          background: linear-gradient(90deg, var(--green), var(--cyan));
          transform: scaleX(0); transform-origin:left; transition: transform .3s cubic-bezier(0.16,1,0.3,1);
          box-shadow: 0 0 10px var(--green); }
        .auth-field:focus-within .auth-field-line::after { transform: scaleX(1); }
        .auth-field:focus-within .auth-field-line { background: transparent; }
        .auth-field-status { font-family: var(--font-mono); font-size:10px; color: var(--muted);
          margin-top:6px; letter-spacing:1px; display:block; }
        .auth-field-status-ok   { color: var(--green); }
        .auth-field-status-bad  { color: #ff4757; }
        .auth-field-status-warn { color: #ff9800; }

        /* Alerts */
        .auth-alert { display:flex; align-items:flex-start; gap:10px; padding: 11px 14px; border-radius:8px;
          font-family: var(--font-mono); font-size:11.5px; line-height:1.65; animation: authAlertIn .3s ease both; }
        @keyframes authAlertIn { from { opacity:0; transform: translateY(-6px); } to { opacity:1; transform:none; } }
        .auth-alert-ico { font-size:12px; line-height:1.5; flex-shrink:0; }
        .auth-alert-error { color:#ff4757; background: rgba(255,71,87,0.07); border:1px solid rgba(255,71,87,0.28); }
        .auth-alert-ok     { color:var(--green); background: rgba(0,255,136,0.06); border:1px solid rgba(0,255,136,0.22); }
        .auth-alert-warn   { color:#fbbf24; background: rgba(251,191,36,0.07); border:1px solid rgba(251,191,36,0.3); }

        /* Submit button */
        .auth-submit { position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; gap:10px;
          font-family: var(--font-mono); font-size:11px; letter-spacing:3px; font-weight:700; text-transform:uppercase;
          padding:15px; min-height:52px; border:none; border-radius:8px; cursor:pointer; color:#000;
          background: linear-gradient(120deg, var(--green), var(--cyan), var(--green));
          background-size: 220% 100%; transition: background-position .4s ease, transform .15s ease, box-shadow .25s ease;
          box-shadow: 0 4px 24px color-mix(in srgb, var(--green) 35%, transparent); }
        .auth-submit:hover:not(:disabled) { background-position: 100% 0; transform: translateY(-1px);
          box-shadow: 0 8px 32px color-mix(in srgb, var(--green) 45%, transparent); }
        .auth-submit:active:not(:disabled) { transform: translateY(0) scale(.99); }
        .auth-submit:disabled { cursor:not-allowed; opacity:.45; background: var(--bg3); color: var(--muted); box-shadow:none; }
        .auth-submit-shine { position:absolute; top:0; bottom:0; left:0; width:40%;
          background: linear-gradient(105deg, transparent, rgba(255,255,255,0.55), transparent);
          transform: translateX(-160%) skewX(-18deg); animation: authShine 3.2s ease-in-out infinite; pointer-events:none; }
        @keyframes authShine { 0%,60% { transform: translateX(-160%) skewX(-18deg); } 90%,100% { transform: translateX(420%) skewX(-18deg); } }
        .auth-submit-arrow { font-size:15px; transition: transform .2s ease; }
        .auth-submit:hover:not(:disabled) .auth-submit-arrow { transform: translateX(4px); }

        /* Divider + OAuth */
        .auth-divider { display:flex; align-items:center; gap:12px; margin:2px 0; }
        .auth-divider::before, .auth-divider::after { content:''; flex:1; height:1px; background: linear-gradient(90deg, transparent, var(--border), transparent); }
        .auth-divider span { font-family: var(--font-mono); font-size:8px; letter-spacing:2px; color: var(--muted); white-space:nowrap; }

        .auth-oauth-row { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px; }
        .auth-oauth { display:flex; align-items:center; justify-content:center; gap:8px; padding:12px 6px;
          font-family: var(--font-mono); font-size:9px; letter-spacing:1.5px; font-weight:700; color:#fff;
          border-radius:8px; border:1px solid transparent; cursor:pointer; transition: transform .15s ease, filter .2s ease, box-shadow .25s ease; }
        .auth-oauth:hover { transform: translateY(-2px); filter: brightness(1.1); box-shadow: 0 6px 18px rgba(0,0,0,0.35); }
        .auth-oauth:active { transform: translateY(0) scale(.98); }
        .auth-oauth-discord { background:#5865F2; }
        .auth-oauth-steam   { background:#1b2838; border-color:#2a475e; color:#e5f1ff; }
        .auth-oauth-github  { background:#24292f; border-color:#30363d; }

        /* Links + misc */
        .auth-link { background:none; border:none; cursor:pointer; padding:0; font-weight:600; transition: opacity .15s; }
        .auth-link:hover { opacity:.75; }
        .auth-link-green { font-family: var(--font-display); font-size:13px; color: var(--green); }
        .auth-link-cyan  { font-family: var(--font-mono); font-size:9px; color: var(--cyan); letter-spacing:1px; }
        .auth-link-muted { font-family: var(--font-display); font-size:13px; color: var(--muted); }
        .auth-switch-line { font-family: var(--font-display); font-size:13px; color: var(--muted); text-align:center; margin:0; }

        .auth-state { display:flex; flex-direction:column; gap:16px; }
        .auth-state-ico { font-size:44px; line-height:1; }
        .auth-countdown { font-family: var(--font-mono); font-size:10px; color: var(--muted); margin-bottom: 6px; }
        .auth-countdown span { color: var(--cyan); }
        .auth-waiting { display:flex; align-items:center; justify-content:center; gap:8px; margin-top:12px;
          font-family: var(--font-mono); font-size:9px; color: var(--muted); letter-spacing:2px; }
        .auth-waiting-dot { width:6px; height:6px; border-radius:50%; background: var(--cyan);
          display:inline-block; animation: authBlink 1.5s ease-in-out infinite; }
        .auth-waiting-note { font-family: var(--font-mono); font-size:8px; color: var(--muted); opacity:.6; margin-bottom:14px; }
        .auth-ghost-btn { font-family: var(--font-mono); font-size:10px; color: var(--green); background:none;
          border:1px solid color-mix(in srgb, var(--green) 40%, transparent); cursor:pointer; padding:10px 24px;
          letter-spacing:2px; border-radius:8px; transition: background .2s, transform .15s; align-self:center; }
        .auth-ghost-btn:hover { background: color-mix(in srgb, var(--green) 10%, transparent); transform: translateY(-1px); }
        .auth-intro { font-family: var(--font-display); font-size:14px; color: var(--muted); line-height:1.7; margin:0; }
        .auth-2fa-title { font-family: var(--font-display); font-size:15px; font-weight:700; color: var(--text); margin:10px 0 6px; }
        .auth-2fa-sub { font-family: var(--font-mono); font-size:10px; color: var(--muted); line-height:1.7; margin-bottom: 6px; }

        /* Footer link */
        .auth-foot { margin-top: 22px; text-align:center; }
        .auth-foot a { font-family: var(--font-mono); font-size:9px; color: var(--muted); text-decoration:none;
          letter-spacing:3px; opacity:.7; transition: opacity .2s, color .2s; }
        .auth-foot a:hover { opacity:1; color: var(--green); }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .auth-canvas, .auth-core-ring, .auth-core-orbit, .auth-core-hub, .auth-hub-pulse,
          .auth-submit-shine, .auth-pill-dot, .auth-hud-blink-dot { animation: none !important; }
          .auth-stage { animation: none; }
        }

        /* Responsive */
        @media (max-width: 860px) {
          .auth-stage { grid-template-columns: 1fr; max-width: 460px; min-height: 0; }
          .auth-visual { display:none; }
          .auth-tabs { margin-bottom: 18px; }
        }
        @media (max-width: 480px) {
          .auth-panel { padding: 22px 16px 20px; }
          .auth-oauth-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <ParticleField />

      <div className="page-container auth-page">
        <div className="auth-stage">

          {/* Left visual panel */}
          <div className="auth-visual">
            <NeuralCore />
          </div>

          {/* Right form panel */}
          <div className="auth-panel">

            {/* Header */}
            <div className="auth-head">
              <div className="auth-pill">
                <span className="auth-pill-dot" />
                <span>{meta.tag}</span>
              </div>
              <h1 className="auth-title">{meta.title}</h1>
              <p className="auth-sub">{meta.sub}</p>
            </div>

            {/* Tabs */}
            <div className="auth-tabs">
              <div className="auth-tab-indicator" style={{ transform: `translateX(${Math.max(tabIndex, 0) * 300}%)` }} />
              {TABS.map(t => (
                <button key={t.key} type="button"
                  className={`auth-tab${tab === t.key ? ' is-active' : ''}`}
                  onClick={() => switchTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Form */}
            <div key={formKey}>
              {twoFAChallenge                && <TwoFAStep     challenge={twoFAChallenge} onBack={() => setTwoFAChallenge(null)} />}
              {!twoFAChallenge && tab === 'signin'   && <SignIn   onSwitch={switchTab} onTwoFA={c => setTwoFAChallenge(c)} />}
              {!twoFAChallenge && tab === 'register' && <SignUp   onSwitch={switchTab} />}
              {!twoFAChallenge && tab === 'forgot'   && <ForgotPassword onSwitch={switchTab} />}
            </div>

            {/* Footer */}
            <div className="auth-foot">
              <a href="/">← BACK TO HOME</a>
            </div>

          </div>
        </div>
      </div>
    </>
  )
}
