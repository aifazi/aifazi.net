'use client'
// loginFlows.jsx — sign-in / sign-up / 2FA / forgot flows (extracted).
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api, { saveTokens, clearAuthTokens, getRole, ensureAdminGate } from '@/lib/api'
import { authProviderLoginRoute, safeNextPath, FORGOT_PASSWORD_PATH } from '@/lib/authRoutes'

let _gsapCache = null

function loadGsap() {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (_gsapCache) return Promise.resolve(_gsapCache)
  return import('gsap').then(m => { _gsapCache = m.gsap || m.default || m; return _gsapCache })
}

// Theme-reactive animation helpers — colors always come from var(--tokens).
const reducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Animated SVG checkmark — stroke uses var(--green); drawn in with GSAP.
function AuthCheck({ size = 72 }) {
  const circleRef = useRef(null)
  const pathRef = useRef(null)

  useEffect(() => {
    const circle = circleRef.current
    const path = pathRef.current
    if (!circle || !path) return
    let alive = true
    let tl = null
    loadGsap().then(gsap => {
      if (!alive || !gsap) return
      if (reducedMotion()) {
        gsap.set([circle, path], { strokeDashoffset: 0 })
        return
      }
      const cLen = circle.getTotalLength()
      const pLen = path.getTotalLength()
      gsap.set([circle, path], {
        strokeDasharray: (el) => (el === circle ? cLen : pLen),
        strokeDashoffset: (el) => (el === circle ? cLen : pLen),
      })
      tl = gsap.timeline()
      tl.to(circle, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.out' })
        .to(path, { strokeDashoffset: 0, duration: 0.42, ease: 'power2.out' }, '-=0.12')
    })
    return () => { alive = false; if (tl) tl.kill() }
  }, [])

  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <circle ref={circleRef} cx="36" cy="36" r="30"
        stroke="var(--green)" strokeWidth="3" strokeLinecap="round" />
      <path ref={pathRef} d="M23 37l9 9 17-19"
        stroke="var(--green)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Password visibility toggle — positioned inside the field.
function PassToggle({ show, onToggle }) {
  return (
    <button
      type="button"
      className="auth-eye"
      onClick={onToggle}
      aria-label={show ? 'Hide password' : 'Show password'}
      aria-pressed={show}
      title={show ? 'Hide password' : 'Show password'}
    >
      {show ? (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  )
}

// Live password-strength meter (5 segments) + rule checklist.
function PasswordStrength({ password }) {
  const checks = {
    len:   password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    num:   /\d/.test(password),
    spec:  /[^A-Za-z0-9]/.test(password),
  }
  const score = Object.values(checks).filter(Boolean).length
  const label = score <= 1 ? 'Weak' : score <= 3 ? 'Medium' : score === 4 ? 'Good' : 'Strong'
  const cls = score <= 1 ? 'weak' : score <= 3 ? 'medium' : score === 4 ? 'good' : 'strong'
  const active = password.length > 0

  const items = [
    { key: 'len',   label: '8+ characters' },
    { key: 'upper', label: 'Uppercase' },
    { key: 'lower', label: 'Lowercase' },
    { key: 'num',   label: 'Number' },
    { key: 'spec',  label: 'Special character' },
  ]

  return (
    <div className="auth-strength">
      <div className="auth-strength-bars" aria-hidden="true">
        {[0, 1, 2, 3, 4].map(i => (
          <span key={i} className={`auth-strength-bar ${active && i < score ? `is-on ${cls}` : ''}`} />
        ))}
      </div>
      <span className={`auth-strength-label ${active ? `is-${cls}` : ''}`} role="status" aria-live="polite">
        {active ? `${label} password` : 'Password strength'}
      </span>
      {active && (
        <ul className="auth-checklist">
          {items.map((it, i) => (
            <li key={it.key} className={checks[it.key] ? 'is-pass' : 'is-pending'} style={{ transitionDelay: `${i * 30}ms` }}>
              <span className="auth-checklist-ico" aria-hidden="true">{checks[it.key] ? '✓' : '•'}</span>
              {it.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: 'var(--text)',
  fontFamily: 'var(--font-display)',
  fontSize: 15,
  padding: '0 44px 0 16px',
  outline: 'none',
  boxSizing: 'border-box',
  minHeight: 52,
  borderRadius: 0,
}

const labelStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  letterSpacing: 2,
  color: 'var(--muted)',
  display: 'block',
  marginBottom: 8,
  textTransform: 'uppercase',
}

// P3 — never render backend internals: non-string error payloads map to a
// generic message; the raw details go to the console for debugging only.
function errorText(value, fallback = 'Something went wrong. Please try again.') {
  if (!value) return ''
  if (typeof value === 'string') return value
  try { console.debug('[auth] backend error detail:', value) } catch {}
  return fallback
}

function apiErrorText(err, fallback) {
  return errorText(err?.response?.data?.detail || err?.message, fallback)
}

const ErrorBox = ({ msg, id }) => {
  const text = errorText(msg)
  return text ? (
    <div className="auth-alert auth-alert-error" role="alert" id={id}>
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

const FieldWrap = ({ label, htmlFor, children, hint, noPad }) => (
  <div className="auth-field-wrap">
    <label style={labelStyle} htmlFor={htmlFor}>{label}</label>
    <div className={`auth-field${noPad ? ' no-pad' : ''}`}>
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

// ── Sign In ────────────────────────────────────────────────────────────────────
// Supports both forum users (email) and admin/staff (username)
function SignIn({ onSwitch, onTwoFA, shake }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = safeNextPath(searchParams?.get('next'))
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword]     = useState('')
  const [showPass, setShowPass]     = useState(false)
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const formRef = useRef(null)
  // #3 — rate limiting
  const [lockoutUntil, setLockoutUntil] = useState(0)
  const [countdown, setCountdown]       = useState(0)
  const [locked, setLocked]             = useState(false)
  const lockoutRef = useRef(null)
  // P0-2 — CapsLock warning state for the password field.
  const [capsOn, setCapsOn] = useState(false)
  const capsCheck = (e) => {
    try { setCapsOn(!!e.getModifierState?.('CapsLock')) } catch {}
  }
  // P1-1 — refs so submit failures can move focus to the first error.
  const siIdRef = useRef(null)
  const siPassRef = useRef(null)

  // Countdown ticker (also owns the `locked` flag — derived here, never via
  // Date.now() during render, which the compiler forbids as impure).
  useEffect(() => {
    if (lockoutUntil <= Date.now()) return
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000))
      if (remaining <= 0) { setCountdown(0); setLocked(false); clearInterval(lockoutRef.current); return }
      setCountdown(remaining)
      setLocked(true)
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

  // Which social / directory methods the admin has configured
  const [loginMethods, setLoginMethods] = useState({
    authentik: true, discord: true, github: true, steam: true, lldap: true,
  })
  useEffect(() => {
    let alive = true
    api.get('/auth/oauth/login-methods')
      .then(r => { if (alive && r.data) setLoginMethods(m => ({ ...m, ...r.data })) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const isEmail = (str) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!identifier.trim() || !password) {
      setError('Please enter your email/username and password.');
      (!identifier.trim() ? siIdRef.current : siPassRef.current)?.focus()
      shake?.(formRef.current); return
    }
    if (Date.now() < lockoutUntil) {
      const s = Math.ceil((lockoutUntil - Date.now()) / 1000)
      setCountdown(s)
      setError(`Too many attempts. Try again in ${s}s.`)
      shake?.(formRef.current); return
    }
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
        shake?.(formRef.current)
      }
    } catch (err) {
      // P2 — surface a server 429 "try in Ns" when present; client backoff
      // below stays as the fallback when the server gives no retry hint.
      const status = err?.response?.status
      const detail = err?.response?.data?.detail
      if (status === 429) {
        const hdrSecs = parseInt(err?.response?.headers?.['retry-after'], 10)
        const bodySecs = parseInt(err?.response?.data?.retry_after ?? err?.response?.data?.retryAfter, 10)
        const detailSecs = typeof detail === 'string' ? parseInt((detail.match(/(\d+)\s*s/) || [])[1], 10) : NaN
        const secs = [bodySecs, hdrSecs, detailSecs].find(n => Number.isFinite(n) && n > 0) || 0
        if (secs > 0) setLockoutUntil(Date.now() + secs * 1000)
        setError(typeof detail === 'string' && detail ? detail : (secs > 0 ? `Too many attempts. Try again in ${secs}s.` : 'Too many attempts. Please try again shortly.'))
        shake?.(formRef.current)
        siPassRef.current?.focus()
        const fails = recordFailure(identifier)
        if (secs <= 0) { const wait = backoffMs(fails); if (wait > 0) setLockoutUntil(Date.now() + wait) }
        return
      }
      if (detail === 'Email not verified') {
        setError('Please verify your email before signing in. Check your inbox.')
      } else {
        setError(detail || 'Invalid credentials. Please try again.')
      }
      shake?.(formRef.current)
      siPassRef.current?.focus()
      const fails = recordFailure(identifier)
      const wait  = backoffMs(fails)
      if (wait > 0) { setLockoutUntil(Date.now() + wait) }
    } finally {
      setLoading(false)
    }
  }

  // Directory login via LLDAP (same PASETO session as password login).
  async function handleLdapLogin() {
    if (!identifier.trim() || !password) {
      setError('Enter your LLDAP email/username and password first.')
      ;(!identifier.trim() ? siIdRef.current : siPassRef.current)?.focus()
      shake?.(formRef.current)
      return
    }
    // P2-8 — mirror the password-path lockout feedback (countdown + message +
    // shake) instead of silently returning.
    if (Date.now() < lockoutUntil) {
      const s = Math.ceil((lockoutUntil - Date.now()) / 1000)
      setCountdown(s)
      setError(`Too many attempts. Try again in ${s}s.`)
      shake?.(formRef.current); return
    }
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/auth/ldap/login', {
        username: identifier.trim(),
        password,
      })
      const token = res.data?.token || res.data?.access_token
      const role = res.data?.user?.role || 'user'
      if (token) {
        saveTokens({ token })
        window.dispatchEvent(new Event('auth-change'))
        clearFailures(identifier)
        router.push(nextPath || (role === 'chat' ? '/chat' : ADMIN_ROLES.includes(role) ? '/admin' : '/profile'))
      } else {
        setError('LLDAP login failed — no token received.')
        shake?.(formRef.current)
      }
    } catch (err) {
      const detail = err?.response?.data?.detail
      setError(detail || 'LLDAP login failed. Check your directory credentials.')
      siPassRef.current?.focus()
      shake?.(formRef.current)
      const fails = recordFailure(identifier)
      const wait = backoffMs(fails)
      if (wait > 0) setLockoutUntil(Date.now() + wait)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="auth-form" noValidate>
      <ErrorBox msg={error} id="si-form-error" />

      {/* #3 — lockout countdown banner */}
      {locked && (
        <div className="auth-alert auth-alert-warn" role="alert">
          <span className="auth-alert-ico">⏳</span>
          <span>Too many failed attempts. Try again in <strong>{countdown}s</strong>.</span>
        </div>
      )}

      <FieldWrap label="Email or Username" htmlFor="si-id">
        <input
          id="si-id" type="text" ref={siIdRef}
          placeholder="your@email.com or username"
          value={identifier}
          onChange={e => setIdentifier(e.target.value)}
          required autoComplete="username"
          aria-invalid={!!error} aria-describedby={error ? 'si-form-error' : undefined}
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
      } htmlFor="si-pass" hint={capsOn && (
        <span id="si-caps-warn" className="auth-field-status auth-field-status-bad" role="status">⚠ Caps Lock is on</span>
      )}>
        <input
          id="si-pass" type={showPass ? 'text' : 'password'} ref={siPassRef}
          placeholder="••••••••"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={capsCheck} onKeyUp={capsCheck}
          required autoComplete={showPass ? 'off' : 'current-password'}
          aria-invalid={!!error} aria-describedby={capsOn ? 'si-caps-warn' : error ? 'si-form-error' : undefined}
          style={{ ...inputStyle, paddingRight: 44 }}
          onFocus={focusGreen} onBlur={blurGreen}
        />
        <PassToggle show={showPass} onToggle={() => setShowPass(s => !s)} />
      </FieldWrap>

      <button type="submit" className="auth-submit" disabled={loading || locked}>
        {loading ? (
          <span className="auth-spinner" aria-hidden="true" />
        ) : locked ? `WAIT ${countdown}s` : 'Sign in'}
        {!loading && !locked && <span className="auth-submit-arrow" aria-hidden="true">→</span>}
      </button>

      {(loginMethods.authentik || loginMethods.discord || loginMethods.steam || loginMethods.github || loginMethods.lldap) && (
        <>
          <div className="auth-divider"><span>OR CONTINUE WITH</span></div>
          <div className="auth-oauth-row">
            {loginMethods.authentik && (
              <button type="button" className="auth-oauth auth-oauth-authentik"
                onClick={() => { window.location.href = authProviderLoginRoute('authentik', nextPath || '/profile') }}
                title="Sign in with Authentik">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3L4 7.5V12c0 5 3.5 9.2 8 10.5 4.5-1.3 8-5.5 8-10.5V7.5L12 3z" stroke="currentColor" strokeWidth="1.8"/>
                  <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Authentik</span>
              </button>
            )}
            {loginMethods.discord && (
              <button type="button" className="auth-oauth auth-oauth-discord"
                onClick={() => { window.location.href = authProviderLoginRoute('discord', nextPath || '/profile') }}
                title="Sign in with Discord">
                <svg width="18" height="18" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.44077 45.4204 0.52529C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.52529C25.5141 0.44359 25.4218 0.40133 25.3294 0.41542C20.2584 1.2888 15.4057 2.8186 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.305 54.5139 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9935 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3151C29.2558 49.6202 41.8354 49.6202 53.3179 44.3151C53.3935 44.2785 53.4831 44.2898 53.5502 44.3433C53.9057 44.6363 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2228C48.9662 48.2707 48.9102 48.4172 48.9718 48.5383C50.038 50.6034 51.2554 52.5699 52.5959 54.435C52.6519 54.5139 52.7526 54.5477 52.845 54.5195C58.6464 52.7249 64.529 50.0174 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9823C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1066 30.1693C30.1066 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6986 30.1693C53.6986 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="currentColor"/>
                </svg>
                <span>Discord</span>
              </button>
            )}
            {loginMethods.steam && (
              <button type="button" className="auth-oauth auth-oauth-steam"
                onClick={() => { window.location.href = authProviderLoginRoute('steam', nextPath || '/profile') }}
                title="Sign in with Steam">
                <svg width="18" height="18" viewBox="0 0 233 233" fill="none">
                  <path fill="currentColor" d="M116.5 18C62.7 18 18.8 60.9 18 114.5l52.7 21.8a29.6 29.6 0 0 1 16.6-5c.6 0 1.2 0 1.8.1L112 99.8v-.5c0-21.8 17.7-39.5 39.5-39.5S191 77.5 191 99.3s-17.7 39.5-39.5 39.5l-31.6 23.1c0 .5.1 1 .1 1.5 0 16.4-13.3 29.7-29.7 29.7-14.4 0-26.4-10.3-29.2-23.9L4.4 148.6C14.7 195.8 56.5 231 106.5 231c2.6 0 5.2-.1 7.8-.2C175 227.4 223 176.5 223 115c0-53.7-43.8-97-106.5-97zm-26 152.2c-8.5 3.4-18.1-.7-21.4-9.2s.7-18.1 9.2-21.5l9.2-3.7a21.8 21.8 0 1 0 3 34.4zM151.5 127a27.7 27.7 0 1 1 0-55.4 27.7 27.7 0 0 1 0 55.4zm0-11.1a16.6 16.6 0 1 0 0-33.2 16.6 16.6 0 0 0 0 33.2z"/>
                </svg>
                <span>Steam</span>
              </button>
            )}
            {loginMethods.github && (
              <button type="button" className="auth-oauth auth-oauth-github"
                onClick={() => { window.location.href = authProviderLoginRoute('github', nextPath || '/profile') }}
                title="Sign in with GitHub">
                <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                <span>GitHub</span>
              </button>
            )}
            {loginMethods.lldap && (
              <button type="button" className="auth-oauth auth-oauth-lldap"
                onClick={handleLdapLogin}
                disabled={loading || locked}
                title="Sign in with LLDAP directory">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2C7.58 2 4 3.34 4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5c0-1.66-3.58-3-8-3z" stroke="currentColor" strokeWidth="1.8"/>
                  <path d="M4 5c0 1.66 3.58 3 8 3s8-1.34 8-3M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" stroke="currentColor" strokeWidth="1.8"/>
                </svg>
                <span>LLDAP</span>
              </button>
            )}
            <button type="button" className="auth-oauth auth-oauth-wg"
              onClick={async () => {
                try {
                  setError('')
                  setLoading(true)
                  const res = await api.post('/auth/wg-login', {})
                  if (res.data?.token) {
                    saveTokens({ token: res.data.token, refreshToken: res.data.refreshToken })
                    const dest = nextPath || '/profile'
                    window.location.href = dest
                  } else {
                    setError('WireGuard login failed — no token received.')
                  }
                } catch (err) {
                  const detail = err.response?.data?.detail || 'WireGuard login failed'
                  setError(detail)
                } finally {
                  setLoading(false)
                }
              }}
              disabled={loading || locked}
              title="Sign in via WireGuard VPN"
              style={{ color: '#fff', background: 'linear-gradient(135deg, #00b4d8, #0077b6)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                  <path d="M12 22V12M12 12L3 7M12 12l9-5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                </svg>
                <span>WireGuard</span>
            </button>
          </div>
        </>
      )}

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
const VERIFY_POLL_MAX = 40 // ~2 min at 3 s intervals, then stop with a resend CTA
function VerifyWaiting({ email, onSwitch }) {
  const router   = useRouter()
  const [activated, setActivated] = useState(false)
  const [countdown, setCountdown] = useState(3)
  const [expired_, setExpired_] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const intervalRef  = useRef(null)
  const countdownRef = useRef(null)
  const attemptsRef  = useRef(0)
  const pollRef = useRef(async () => {})

  const resend = async () => {
    setResending(true)
    try {
      await api.post('/auth/resend-verification', { email })
      setResent(true)
      attemptsRef.current = 0
      setExpired_(false)
      if (!intervalRef.current) intervalRef.current = setInterval(() => { if (!document.hidden) pollRef.current() }, 3000)
    } catch {}
    finally { setResending(false) }
  }

  useEffect(() => {
    let stopped = false

    const poll = async () => {
      // P1-13 — email goes in the POST JSON body, never in a GET query string
      // (query strings are logged by proxies/CDNs and linger in history).
      try {
        attemptsRef.current += 1
        const res = await api.post('/auth/verify-status', { email })
        if (res.data?.verified && !stopped) {
          stopped = true
          clearInterval(intervalRef.current)
          intervalRef.current = null
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
        } else if (attemptsRef.current >= VERIFY_POLL_MAX && !stopped) {
          // P2 — stop polling after ~40 attempts; offer a resend instead of
          // hammering the backend forever on a background tab.
          stopped = true
          clearInterval(intervalRef.current)
          intervalRef.current = null
          setExpired_(true)
        }
      } catch {
        if (attemptsRef.current >= VERIFY_POLL_MAX && !stopped) {
          stopped = true
          clearInterval(intervalRef.current)
          intervalRef.current = null
          setExpired_(true)
        }
        /* otherwise silently ignore — keep polling */
      }
    }
    pollRef.current = poll

    // Poll immediately then every 3 s — P2-6: skip ticks while the tab is
    // hidden (mirrors ForumProfile.jsx heartbeat guard).
    poll()
    intervalRef.current = setInterval(() => { if (!document.hidden) pollRef.current() }, 3000)

    return () => {
      stopped = true
      clearInterval(intervalRef.current)
      intervalRef.current = null
      clearInterval(countdownRef.current)
    }
  }, [email, onSwitch])

  if (activated) return (
    <div className="auth-state" style={{ textAlign: 'center', padding: '8px 0' }}>
      <div className="auth-burst" aria-hidden="true">
        <span /><span /><span /><span /><span /><span /><span /><span />
      </div>
      <AuthCheck />
      <SuccessBox msg="Account activated! You can now sign in." />
      <div className="auth-countdown">Redirecting in <span>{countdown}</span>s…</div>
      {/* Progress bar toward auto-redirect */}
      <div className="auth-progress" aria-hidden="true">
        <div className="auth-progress-fill" style={{ width: `${Math.max(0, Math.min(100, ((3 - countdown) / 3) * 100))}%` }} />
      </div>
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
      {expired_ ? (
        <>
          <div className="auth-waiting-note">Still waiting? The link may have expired — request a fresh one.</div>
          <button type="button" className="auth-submit" onClick={resend} disabled={resending}>
            {resending ? <span className="auth-spinner" aria-hidden="true" /> : 'Resend verification email'}
          </button>
          {resent && <SuccessBox msg="Verification email resent. Check your inbox." />}
        </>
      ) : (
        <>
          {/* Live polling indicator */}
          <div className="auth-waiting">
            <span className="auth-waiting-dot" />
            WAITING FOR VERIFICATION…
          </div>
          <div className="auth-waiting-note">This page will update automatically once you click the link</div>
        </>
      )}
      <button type="button" className="auth-ghost-btn" onClick={() => onSwitch('signin')}>
        ← BACK TO SIGN IN
      </button>
      <style>{`@keyframes authFloatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>
    </div>
  )
}

// Username status badge
const UnStatus = ({ username, check, suggest, onSuggest }) => {
  if (!username || username.length < 3) return null
  if (check === 'checking') return <span className="auth-field-status">⏳ Checking…</span>
  if (check === 'available') return <span className="auth-field-status auth-field-status-ok">✓ Available</span>
  if (check === 'taken') return (
    <span id="su-user-taken" className="auth-field-status auth-field-status-bad" role="status">
      ✗ Taken{suggest && <> — try <button type="button" onClick={() => onSuggest()} className="auth-link auth-link-cyan" style={{ fontSize: 11, textDecoration: 'underline' }}>{suggest}</button></>}
    </span>
  )
  return null
}

// ── Sign Up ────────────────────────────────────────────────────────────────────
function SignUp({ onSwitch, shake }) {
  const [form, setForm]     = useState({ username: '', email: '', password: '', confirm: '' })
  const [showPass, setShowPass]     = useState(false)
  const [showConf, setShowConf]     = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const formRef = useRef(null)
  // P1-1 — refs so submit failures can move focus to the first error.
  const suUserRef = useRef(null)
  const suEmailRef = useRef(null)
  const suPassRef = useRef(null)
  const suConfRef = useRef(null)

  // Username availability check
  const [unCheck,   setUnCheck]   = useState('idle') // 'idle'|'checking'|'available'|'taken'
  const [unSuggest, setUnSuggest] = useState('')
  const [_timerRef] = useState({ current: null })
  // P2 — request id so a slow earlier response can never overwrite a newer one.
  const unReqRef = useRef(0)

  const checkUsername = (uname) => {
    if (_timerRef.current) clearTimeout(_timerRef.current)
    if (!uname || uname.length < 3) { setUnCheck('idle'); setUnSuggest(''); return }
    setUnCheck('checking')
    _timerRef.current = setTimeout(async () => {
      const reqId = ++unReqRef.current
      try {
        // P1-13 — username goes in the POST JSON body, never in a GET query.
        const res = await api.post('/auth/check-username', { username: uname })
        if (reqId !== unReqRef.current) return // stale — ignore
        if (res.data.available) { setUnCheck('available'); setUnSuggest('') }
        else                    { setUnCheck('taken');     setUnSuggest(res.data.suggestion || '') }
      } catch { if (reqId === unReqRef.current) setUnCheck('idle') }
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

  // P0-1 — same gate as canSubmit, but expressed as the blocking rule so the
  // always-enabled submit button can explain WHY it will not go through.
  const blockReason =
    unCheck === 'checking' ? 'Checking username availability…'
    : unCheck === 'taken' ? 'That username is taken — try the suggestion above.'
    : form.username.trim().length < 3 ? 'Username needs at least 3 characters.'
    : !form.email.trim() ? 'Email is required.'
    : form.password.length < 8 ? 'Password needs at least 8 characters.'
    : !form.confirm ? 'Please confirm your password.'
    : form.password !== form.confirm ? 'Passwords do not match.'
    : ''
  const showBlockReason = !canSubmit && !loading && blockReason

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.username.trim()) { setError('Username is required'); suUserRef.current?.focus(); shake?.(formRef.current); return }
    if (!form.email.trim())    { setError('Email is required');    suEmailRef.current?.focus(); shake?.(formRef.current); return }
    if (unCheck === 'taken')   { setError('That username is taken — pick another.'); suUserRef.current?.focus(); shake?.(formRef.current); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); suPassRef.current?.focus(); shake?.(formRef.current); return }
    if (form.password !== form.confirm) { setError('Passwords do not match'); suConfRef.current?.focus(); shake?.(formRef.current); return }
    setLoading(true); setError('')
    try {
      await api.post('/auth/register', {
        username: form.username.trim(), email: form.email.trim(), password: form.password,
      })
      setSuccess(`Check ${form.email} for a verification link to activate your account.`)
    } catch (err) {
      setError(extractError(err))
      shake?.(formRef.current)
    } finally { setLoading(false) }
  }

  if (success) return (
    <VerifyWaiting email={form.email} onSwitch={onSwitch} />
  )

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="auth-form" noValidate>
      <ErrorBox msg={error} id="su-form-error" />

      <FieldWrap label="Username" htmlFor="su-user" hint={<UnStatus username={form.username} check={unCheck} suggest={unSuggest} onSuggest={() => set('username', unSuggest)} />}>
        <input id="su-user" type="text" ref={suUserRef} placeholder="CoolUsername"
          value={form.username} onChange={e => set('username', e.target.value)}
          required minLength={3} maxLength={30} autoComplete="username"
          aria-invalid={unCheck === 'taken' || !!error} aria-describedby={unCheck === 'taken' ? 'su-user-taken' : error ? 'su-form-error' : undefined}
          style={inputStyle}
          onFocus={focusGreen} onBlur={blurGreen} />
      </FieldWrap>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textAlign: 'right', marginTop: -14, marginBottom: 6 }}>{form.username.length}/30</div>

      <FieldWrap label="Email" htmlFor="su-email">
        <input id="su-email" type="email" ref={suEmailRef} placeholder="your@email.com"
          value={form.email} onChange={e => set('email', e.target.value)}
          required autoComplete="email"
          aria-invalid={!!error} aria-describedby={error ? 'su-form-error' : undefined}
          style={inputStyle} onFocus={focusGreen} onBlur={blurGreen} />
      </FieldWrap>

      <FieldWrap label="Password" htmlFor="su-pass" hint={
        <PasswordStrength password={form.password} />
      }>
        <input id="su-pass" type={showPass ? 'text' : 'password'} ref={suPassRef} placeholder="Min 8 characters"
          value={form.password} onChange={e => set('password', e.target.value)}
          required minLength={8} autoComplete={showPass ? 'off' : 'new-password'}
          aria-invalid={!!error} aria-describedby={error ? 'su-form-error' : undefined}
          style={{ ...inputStyle, paddingRight: 44 }}
          onFocus={focusGreen} onBlur={blurGreen} />
        <PassToggle show={showPass} onToggle={() => setShowPass(s => !s)} />
      </FieldWrap>

      <FieldWrap label="Confirm Password" htmlFor="su-conf" hint={pwMatch && <span id="su-conf-mismatch" className="auth-field-status auth-field-status-bad">Passwords don&apos;t match</span>}>
        <input id="su-conf" type={showConf ? 'text' : 'password'} ref={suConfRef} placeholder="Repeat password"
          value={form.confirm} onChange={e => set('confirm', e.target.value)}
          required autoComplete={showConf ? 'off' : 'new-password'}
          aria-invalid={pwMatch || !!error} aria-describedby={pwMatch ? 'su-conf-mismatch' : error ? 'su-form-error' : undefined}
          style={{ ...inputStyle, paddingRight: 44 }}
          onFocus={focusGreen} onBlur={blurGreen} />
        <PassToggle show={showConf} onToggle={() => setShowConf(s => !s)} />
      </FieldWrap>

      {/* P0-1 — button stays enabled; the blocking rule is explained here
          (linked via aria-describedby) instead of a dead disabled button. */}
      {showBlockReason && (
        <div id="su-block-reason" role="status" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 0.5, color: 'var(--orange)', textAlign: 'center', margin: '-2px 0 8px' }}>
          {blockReason}
        </div>
      )}
      <button type="submit" className="auth-submit" disabled={loading} aria-describedby={showBlockReason ? 'su-block-reason' : undefined}>
        {loading ? (
          <span className="auth-spinner" aria-hidden="true" />
        ) : 'Create account'}
        {!loading && <span className="auth-submit-arrow" aria-hidden="true">→</span>}
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
          <span>Discord</span>
        </button>
        <button type="button" className="auth-oauth auth-oauth-steam"
          onClick={() => { window.location.href = authProviderLoginRoute('steam', '/profile') }}
          title="Sign up with Steam">
          <svg width="18" height="18" viewBox="0 0 233 233" fill="none">
            <path fill="currentColor" d="M116.5 18C62.7 18 18.8 60.9 18 114.5l52.7 21.8a29.6 29.6 0 0 1 16.6-5c.6 0 1.2 0 1.8.1L112 99.8v-.5c0-21.8 17.7-39.5 39.5-39.5S191 77.5 191 99.3s-17.7 39.5-39.5 39.5l-31.6 23.1c0 .5.1 1 .1 1.5 0 16.4-13.3 29.7-29.7 29.7-14.4 0-26.4-10.3-29.2-23.9L4.4 148.6C14.7 195.8 56.5 231 106.5 231c2.6 0 5.2-.1 7.8-.2C175 227.4 223 176.5 223 115c0-53.7-43.8-97-106.5-97zm-26 152.2c-8.5 3.4-18.1-.7-21.4-9.2s.7-18.1 9.2-21.5l9.2-3.7a21.8 21.8 0 1 0 3 34.4zM151.5 127a27.7 27.7 0 1 1 0-55.4 27.7 27.7 0 0 1 0 55.4zm0-11.1a16.6 16.6 0 1 0 0-33.2 16.6 16.6 0 0 0 0 33.2z"/>
          </svg>
          <span>Steam</span>
        </button>
        <button type="button" className="auth-oauth auth-oauth-github"
          onClick={() => { window.location.href = authProviderLoginRoute('github', '/profile') }}
          title="Sign up with GitHub">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          <span>GitHub</span>
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
function ForgotPassword({ onSwitch, shake }) {
  const [email, setEmail]   = useState('')
  const [error, setError]   = useState('')
  const [sent, setSent]     = useState(false)
  const [loading, setLoading] = useState(false)
  const formRef = useRef(null)

  async function handleSubmit(e) {
    e.preventDefault()
    // P2 — client-side email format check (backend re-validates); avoids a
    // pointless round-trip and mirrors the sign-in form's isEmail rule.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.')
      document.getElementById('fp-email')?.focus()
      shake?.(formRef.current)
      return
    }
    setLoading(true); setError('')
    try {
      await api.post(FORGOT_PASSWORD_PATH, { email })
      setSent(true)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not send reset email. Try again.')
      shake?.(formRef.current)
    } finally { setLoading(false) }
  }

  if (sent) return (
    <div className="auth-state" style={{ textAlign: 'center', padding: '8px 0' }}>
      <div className="auth-plane" aria-hidden="true">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2 11 13" />
          <path d="M22 2 15 22l-4-9-9-4Z" />
        </svg>
      </div>
      <SuccessBox msg={`Reset link sent to ${email}. Check your inbox and spam folder. Link expires in 1 hour.`} />
      <button type="button" className="auth-ghost-btn" style={{ marginTop: 20 }} onClick={() => onSwitch('signin')}>
        ← BACK TO SIGN IN
      </button>
      <style>{`@keyframes authPlane{0%{transform:translateY(0) rotate(0)}30%{transform:translateY(-18px) rotate(-8deg)}60%{transform:translateY(4px) rotate(4deg)}100%{transform:translateY(0) rotate(0)}}`}</style>
    </div>
  )

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="auth-form" noValidate>
      <p className="auth-intro">
        Enter your email address and we&apos;ll send you a link to reset your password.
      </p>
      <ErrorBox msg={error} id="fp-form-error" />
      <FieldWrap label="Email Address" htmlFor="fp-email">
        <input id="fp-email" type="email" placeholder="your@email.com"
          value={email} onChange={e => setEmail(e.target.value)}
          required autoComplete="email"
          aria-invalid={!!error} aria-describedby={error ? 'fp-form-error' : undefined}
          style={inputStyle} onFocus={focusGreen} onBlur={blurGreen} />
      </FieldWrap>
      <button type="submit" className="auth-submit" disabled={loading}>
        {loading ? <span className="auth-spinner" aria-hidden="true" /> : 'Send reset link'}
        {!loading && <span className="auth-submit-arrow" aria-hidden="true">→</span>}
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
function TwoFAStep({ challenge, onBack, shake }) {
  const router  = useRouter()
  const [code, setCode]           = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [expired, setExpired]     = useState(false)
  const [countdown, setCountdown] = useState(30)
  const formRef = useRef(null)
  // P2 — auto-verify fires from onChange; guard against double-submit while a
  // verification request is already in flight.
  const verifyingRef = useRef(false)
  // P0-3 — auto-verify is debounced (~600ms) so every keystroke does not fire
  // a request; the explicit Verify button below always works immediately.
  const verifyTimer = useRef(null)
  useEffect(() => () => { if (verifyTimer.current) clearTimeout(verifyTimer.current) }, [])

  // Count down then auto-redirect when session expires
  useEffect(() => {
    if (!expired) return
    if (countdown <= 0) { onBack(); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [expired, countdown, onBack])

  async function verify(raw) {
    if (verifyingRef.current) return
    const trimmed = raw.replace(/[\s-]/g, '')
    const isTotp   = /^\d{6}$/.test(trimmed)
    const isRecovery = /^[A-Za-z2-7]{12}$/.test(trimmed)
    if (!isTotp && !isRecovery) {
      setError('Enter the 6-digit code, or a 12-character recovery code.')
      shake?.(formRef.current)
      return
    }
    setLoading(true); setError('')
    verifyingRef.current = true
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
        shake?.(formRef.current)
      }
    } catch (err) {
      if (err?.response?.status === 401) {
        setExpired(true)
        setError('')
      } else {
        setError(err?.response?.data?.detail || 'Invalid or expired code. Try again.')
        shake?.(formRef.current)
      }
    } finally { setLoading(false); verifyingRef.current = false }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    await verify(code)
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="auth-form" noValidate>
      {/* Shield + title */}
      <div style={{ textAlign: 'center', paddingBottom: 4 }}>
        <div className="auth-shield-ico" aria-hidden="true">
          <svg width="46" height="52" viewBox="0 0 120 140" fill="none">
            <defs>
              <linearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="var(--green)" />
                <stop offset="100%" stopColor="var(--cyan)" />
              </linearGradient>
            </defs>
            <path d="M60 6 110 28v42c0 32-22 52-50 64-28-12-50-32-50-64V28L60 6Z" stroke="url(#shieldGrad)" strokeWidth="4" fill="color-mix(in srgb, var(--green) 8%, transparent)" />
            <path d="M48 68l9 9 16-18" stroke="url(#shieldGrad)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
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
            <span style={{ color: 'var(--orange)' }}> Redirecting in {countdown}s…</span>
          </span>
        </div>
      )}

      <ErrorBox msg={error} id="twofa-form-error" />

      <FieldWrap label="Authenticator Code" htmlFor="twofa-code">
        <input
          id="twofa-code" type="text" inputMode="numeric" pattern="[0-9 ]*"
          placeholder="000 000  ·  XXXX-XXXX-XXXX" maxLength={23}
          value={code}
          onChange={e => {
            const val = e.target.value.replace(/[^A-Za-z0-9 \-]/g, '')
            setCode(val)
            if (error) setError('')
            if (verifyTimer.current) clearTimeout(verifyTimer.current)
            const clean = val.replace(/[\s-]/g, '')
            if (/^\d{6}$/.test(clean) || /^[A-Za-z2-7]{12}$/.test(clean)) {
              verifyTimer.current = setTimeout(() => verify(clean), 600)
            }
          }}
          required autoComplete="one-time-code" autoFocus
          aria-invalid={!!error} aria-describedby={error ? 'twofa-form-error' : undefined}
          disabled={expired || loading}
          style={{ ...inputStyle, textAlign: 'center', fontSize: 20, letterSpacing: 3, fontFamily: 'var(--font-mono)', opacity: expired ? 0.4 : 1 }}
          onFocus={focusGreen} onBlur={blurGreen}
        />
        <p style={{ textAlign: 'center', margin: '6px 0 0', fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)', letterSpacing: 1 }}>
          Can&apos;t use your authenticator? Enter a backup recovery code instead.
        </p>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textAlign: 'right', marginTop: 4 }}>{code.replace(/[\s-]/g, '').length}/12</div>
      </FieldWrap>

      <button type="submit" className="auth-submit" disabled={loading || expired}>
        {loading ? <span className="auth-spinner" aria-hidden="true" /> : 'Verify code'}
        {!loading && <span className="auth-submit-arrow" aria-hidden="true">→</span>}
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

export {
  loadGsap, AuthCheck, PassToggle, PasswordStrength, errorText, apiErrorText,
  ErrorBox, SuccessBox, FieldWrap, ADMIN_ROLES, reducedMotion,
  SignIn, VerifyWaiting, SignUp, ForgotPassword, TwoFAStep,
}
