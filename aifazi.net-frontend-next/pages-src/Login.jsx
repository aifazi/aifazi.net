'use client'
import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import api, { saveTokens, clearAuthTokens, getRole, ensureAdminGate } from '@/lib/api'
import { authProviderLoginRoute, safeNextPath, FORGOT_PASSWORD_PATH } from '@/lib/authRoutes'
import {
  loadGsap, AuthCheck, PassToggle, PasswordStrength, errorText, apiErrorText,
  ErrorBox, SuccessBox, FieldWrap, ADMIN_ROLES,
  SignIn, VerifyWaiting, SignUp, ForgotPassword, TwoFAStep,
} from './loginFlows'

// P2 — gsap is heavy and Login is a first-paint route: lazy-load it like the
// existing import('gsap') hook pattern (components/Hero.jsx) instead of a
// static top-level import.
let _gsapCache = null
const TABS = [
  { key: 'signin',   label: 'Sign in'  },
  { key: 'register', label: 'Create'   },
  { key: 'forgot',   label: 'Reset'    },
]
const TAB_META = {
  signin:   { tag: 'AUTHENTICATION',   title: 'Welcome back',       sub: 'Sign in to your account'     },
  register: { tag: 'NEW ACCOUNT',      title: 'Create your account', sub: 'Join the community — it takes a minute' },
  forgot:   { tag: 'ACCOUNT RECOVERY', title: 'Reset password',     sub: "We'll email you a reset link" },
}

const FEATURES = [
  {
    title: 'Secure Authentication',
    sub: 'Protected by hardened session tokens',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: 'End-to-End Encryption',
    sub: 'Every connection is protected',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="11" width="16" height="9" rx="2.5" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
    ),
  },
  {
    title: 'Multi-factor Authentication',
    sub: 'Protect your account with 2FA',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 10a4 4 0 0 0-4 4c0 2.5.5 4.5 2 6" />
        <path d="M12 6a8 8 0 0 1 8 8c0 1-.1 2-.3 3" />
        <path d="M12 6a8 8 0 0 0-8 8c0 1 .1 2 .3 3" />
        <path d="M12 18a3 3 0 0 1-3-3" />
        <path d="M15 12a3 3 0 0 1 3 3" />
        <path d="M12 18a3 3 0 0 0 3-3" />
        <path d="M17 9a6 6 0 0 0-10 0" />
        <path d="M12 22a4 4 0 0 0 4-4" />
      </svg>
    ),
  },
]

export default function Login() {
  const searchParams = useSearchParams()
  const router = useRouter()
  // Mounted gate (second layer behind the layout FOUC script): render nothing
  // theme-dependent until after mount so the login page never flashes the
  // default theme before the stored theme is confirmed.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mounted gate on first paint
    setMounted(true)
  }, [])
  const rawTab = searchParams?.get('tab') || 'signin'
  const validTab = ['signin','register','forgot'].includes(rawTab) ? rawTab : 'signin'
  const [tab, setTab] = useState(searchParams?.get('discord_error') ? 'signin' : validTab)
  const [twoFAChallenge, setTwoFAChallenge] = useState(() => {
    if (typeof window === 'undefined') return null
    const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''))
    if (hash.get('twofa') !== 'forum') return null
    const partial = hash.get('partial_token')
    if (!partial) return null
    return {
      partial_token: partial,
      username: hash.get('username') || 'user',
      verify_path: '/auth/2fa/verify',
      next: safeNextPath(hash.get('next')) || '/profile',
    }
  })
  const meta = twoFAChallenge
    ? { tag: 'TWO-FACTOR AUTH', title: 'Verify identity', sub: 'One more step to sign in' }
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
  }, [])

  // P1-9 — surface the "Session expired" notice stored by the api 401
  // handler before it redirected here with ?next=.
  const [sessionNotice, setSessionNotice] = useState(() => {
    if (typeof window === 'undefined') return ''
    try { return sessionStorage.getItem('post_login_notice') || '' } catch { return '' }
  })
  useEffect(() => {
    if (!sessionNotice) return
    try { sessionStorage.removeItem('post_login_notice') } catch {}
  }, [sessionNotice])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!twoFAChallenge) return
    const next = twoFAChallenge.next
    window.history.replaceState({}, '', `/login?tab=signin&next=${encodeURIComponent(next)}`)
  }, [twoFAChallenge])

  // ── Already logged in? Redirect away from /login ───────────────────────────
  // P1-8 — a localStorage role alone never routes to /admin (client-editable).
  // Staff roles are confirmed server-side via ensureAdminGate(); anything else
  // falls back to the safe default (/ or the requested next path).
  useEffect(() => {
    let alive = true
    const nextPath = safeNextPath(searchParams?.get('next'))
    const go = (role, staffConfirmed) => {
      if (!alive) return
      if (nextPath) { router.replace(nextPath); return }
      if (ADMIN_ROLES.includes(role) && staffConfirmed) {
        router.replace('/admin')
      } else if (ADMIN_ROLES.includes(role)) {
        router.replace('/')
      } else {
        router.replace('/profile')
      }
    }
    // Fast path: role from localStorage (set by /auth/verify on previous visits).
    // Only runs on client — avoids hydration mismatch (React #418).
    if (typeof window !== 'undefined') {
      const role = getRole()
      if (role) {
        if (ADMIN_ROLES.includes(role)) {
          ensureAdminGate().then(ok => go(role, ok)).catch(() => go(role, false))
        } else {
          go(role, false)
        }
      }
    }
    return () => { alive = false }
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

  // ── Ambient particles (SSR-safe) ─────────────────────────────────────────────
  // Deterministic seeded PRNG so the server and client render identical HTML —
  // Math.random() here caused React error #418 (hydration mismatch) and killed
  // the OAuth button event handlers on the live site.
  const particles = useMemo(
    () => {
      const out = []
      let seed = 1337
      for (let i = 0; i < 22; i++) {
        seed = (seed + 0x6D2B79F5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        const r1 = ((t ^ (t >>> 14)) >>> 0) / 4294967296
        seed = (seed + 0x6D2B79F5) | 0
        t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        const r2 = ((t ^ (t >>> 14)) >>> 0) / 4294967296
        seed = (seed + 0x6D2B79F5) | 0
        t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        const r3 = ((t ^ (t >>> 14)) >>> 0) / 4294967296
        seed = (seed + 0x6D2B79F5) | 0
        t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        const r4 = ((t ^ (t >>> 14)) >>> 0) / 4294967296
        seed = (seed + 0x6D2B79F5) | 0
        t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        const r5 = ((t ^ (t >>> 14)) >>> 0) / 4294967296
        seed = (seed + 0x6D2B79F5) | 0
        t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        const r6 = ((t ^ (t >>> 14)) >>> 0) / 4294967296
        out.push({
          left: r1 * 100,
          top: r2 * 100,
          size: 1.5 + r3 * 3.5,
          dur: 11 + r4 * 14,
          delay: r5 * 8,
          alpha: 0.15 + r6 * 0.35,
        })
      }
      return out
    },
    []
  )

  // ── GSAP: background layers ──────────────────────────────────────────────────
  const bgRef = useRef(null)
  useEffect(() => {
    if (reducedMotion() || !bgRef.current) return
    let alive = true
    let ctx = null
    loadGsap().then(gsap => {
      if (!alive || !gsap || !bgRef.current) return
      ctx = gsap.context(() => {
      // Aurora blob drift
      gsap.to('.auth-blob-1', { x: 80, y: 55, scale: 1.15, duration: 16, ease: 'sine.inOut', repeat: -1, yoyo: true })
      gsap.to('.auth-blob-2', { x: -70, y: -45, scale: 1.1, duration: 18, ease: 'sine.inOut', repeat: -1, yoyo: true })
      gsap.to('.auth-blob-3', { x: 45, y: -65, scale: 1.2, duration: 20, ease: 'sine.inOut', repeat: -1, yoyo: true })
      // Slow ambient light rays rotation
      gsap.to('.auth-rays', { rotation: 360, duration: 120, ease: 'none', repeat: -1 })
      // Floating particles drift
      gsap.utils.toArray('.auth-particle').forEach((p, i) => {
        gsap.to(p, {
          y: `random(-70, 70)`,
          x: `random(-40, 40)`,
          opacity: `random(0.1, 0.5)`,
          duration: 2 + (i % 6),
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
          delay: i * 0.4,
        })
      })
      }, bgRef)
    })
    return () => { alive = false; if (ctx) ctx.revert() }
  }, [])

  // ── GSAP: illustration (orbit + float + parallax) ───────────────────────────
  const illusRef = useRef(null)
  useEffect(() => {
    if (reducedMotion() || !illusRef.current) return
    let alive = true
    let ctx = null
    loadGsap().then(gsap => {
      if (!alive || !gsap || !illusRef.current) return
      ctx = gsap.context(() => {
      // Orbiting rings — constant slow rotation
      gsap.to('.auth-orbit-1', { rotation: 360, duration: 46, ease: 'none', repeat: -1 })
      gsap.to('.auth-orbit-2', { rotation: -360, duration: 70, ease: 'none', repeat: -1 })
      // Shield breathing + lock float
      gsap.to('.auth-shield-svg', { y: -10, scale: 1.04, duration: 3.2, ease: 'sine.inOut', repeat: -1, yoyo: true })
      gsap.to('.auth-lock-svg', { y: 12, duration: 2.6, ease: 'sine.inOut', repeat: -1, yoyo: true })
      // Glow pulse
      gsap.to('.auth-illus-glow', { opacity: 0.55, scale: 1.12, duration: 3.6, ease: 'sine.inOut', repeat: -1, yoyo: true })
      }, illusRef)
    })
    return () => { alive = false; if (ctx) ctx.revert() }
  }, [])

  // ── GSAP: mouse parallax on the illustration ─────────────────────────────────
  useEffect(() => {
    if (reducedMotion() || typeof window === 'undefined') return
    const hero = document.querySelector('.auth-hero')
    if (!hero) return
    const layers = hero.querySelectorAll('.auth-illus-inner, .auth-hero-title, .auth-hero-sub')
    if (!layers.length) return
    let alive = true
    let to = []
    let onMove = null
    loadGsap().then(gsap => {
      if (!alive || !gsap) return
      to = Array.from(layers).map(el => ({
        el,
        x: gsap.quickTo(el, 'x', { duration: 0.9, ease: 'power3.out' }),
        y: gsap.quickTo(el, 'y', { duration: 0.9, ease: 'power3.out' }),
      }))
      onMove = (e) => {
        const r = hero.getBoundingClientRect()
        const dx = (e.clientX - r.left) / r.width - 0.5
        const dy = (e.clientY - r.top) / r.height - 0.5
        to.forEach((t, i) => {
          const depth = (i + 1) * 12
          t.x(dx * depth)
          t.y(dy * depth)
        })
      }
      window.addEventListener('mousemove', onMove, { passive: true })
    })
    return () => { alive = false; if (onMove) window.removeEventListener('mousemove', onMove) }
  }, [])

  // ── GSAP: cursor spotlight following the mouse over the card ───────────────
  const glowRef = useRef(null)
  useEffect(() => {
    if (reducedMotion() || typeof window === 'undefined' || !glowRef.current) return
    let alive = true
    let onMove = null
    loadGsap().then(gsap => {
      if (!alive || !gsap || !glowRef.current) return
      const xTo = gsap.quickTo(glowRef.current, 'x', { duration: 0.7, ease: 'power3.out' })
      const yTo = gsap.quickTo(glowRef.current, 'y', { duration: 0.7, ease: 'power3.out' })
      onMove = (e) => {
        const card = document.querySelector('.auth-shell')
        if (!card) return
        const r = card.getBoundingClientRect()
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return
        xTo(e.clientX)
        yTo(e.clientY)
      }
      window.addEventListener('mousemove', onMove, { passive: true })
    })
    return () => { alive = false; if (onMove) window.removeEventListener('mousemove', onMove) }
  }, [])

  // ── GSAP: card + header entrance timeline ───────────────────────────────────
  const cardRef = useRef(null)
  useEffect(() => {
    if (reducedMotion() || !cardRef.current) return
    let alive = true
    let tl = null
    loadGsap().then(gsap => {
      if (!alive || !gsap || !cardRef.current) return
      tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.fromTo(cardRef.current,
          { opacity: 0, y: 30, scale: 0.96 },
          { opacity: 1, y: 0, scale: 1, duration: 0.6 })
        .fromTo(cardRef.current.querySelectorAll('.auth-head, .auth-tabs, .auth-brand-mobile'),
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.45, stagger: 0.09 }, '-=0.25')
    })
    return () => { alive = false; if (tl) tl.kill() }
  }, [])

  // ── GSAP: hero entrance ──────────────────────────────────────────────────────
  const heroRef = useRef(null)
  useEffect(() => {
    if (reducedMotion() || !heroRef.current) return
    let alive = true
    let tl = null
    loadGsap().then(gsap => {
      if (!alive || !gsap || !heroRef.current) return
      tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.fromTo(heroRef.current.querySelectorAll('.auth-hero-brand, .auth-hero-title, .auth-hero-sub, .auth-illus, .auth-feature'),
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.55, stagger: 0.08 })
    })
    return () => { alive = false; if (tl) tl.kill() }
  }, [])

  // ── GSAP: stagger form fields on tab/form change ────────────────────────────
  const formRef = useRef(null)
  useEffect(() => {
    if (reducedMotion() || !formRef.current) return
    const els = formRef.current.querySelectorAll(
      '.auth-field-wrap, .auth-submit, .auth-oauth-row, .auth-switch-line, .auth-intro, .auth-state, .auth-2fa-title, .auth-2fa-sub'
    )
    if (!els.length) return
    loadGsap().then(gsap => {
      if (!gsap) return
      gsap.fromTo(els,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: 'power2.out' })
    })
  }, [formKey])

  // ── GSAP: form shake on invalid submission ──────────────────────────────────
  const shakeForm = (el) => {
    if (reducedMotion() || !el) return
    loadGsap().then(gsap => {
      if (!gsap) return
      gsap.fromTo(el,
        { x: 0 },
        { keyframes: [
          { x: -10, duration: 0.07 }, { x: 10, duration: 0.07 },
          { x: -8, duration: 0.06 }, { x: 8, duration: 0.06 },
          { x: -4, duration: 0.05 }, { x: 0, duration: 0.05 },
        ], ease: 'power2.out' })
    })
  }

  // Render nothing theme-dependent until mount is confirmed (mounted gate) —
  // the layout FOUC script already stamped the stored theme before first
  // paint; this avoids a default-theme flash from React's first render.
  if (!mounted) return null

  return (
    <>
      <style>{`
        /* ══ AUTH PAGE — PREMIUM ═══════════════════════════════
           All colors are theme tokens (var(--green/--cyan/--purple/--bg…))
           so the design adapts to every theme package. */

        /* ── Ambient background ───────────────────────────────────── */
        .auth-bg { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }

        /* Subtle grid */
        .auth-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(color-mix(in srgb, var(--text) 3%, transparent) 1px, transparent 1px),
            linear-gradient(90deg, color-mix(in srgb, var(--text) 3%, transparent) 1px, transparent 1px);
          background-size: 46px 46px;
          mask-image: radial-gradient(ellipse at 50% 40%, black 20%, transparent 75%);
          -webkit-mask-image: radial-gradient(ellipse at 50% 40%, black 20%, transparent 75%);
        }

        /* Slow light rays */
        .auth-rays {
          position: absolute; left: -35%; right: -35%; top: -45%; bottom: -45%;
          background: conic-gradient(from 0deg at 50% 50%,
            transparent 0deg, color-mix(in srgb, var(--green) 4%, transparent) 18deg,
            transparent 36deg, color-mix(in srgb, var(--cyan) 3%, transparent) 54deg,
            transparent 72deg, color-mix(in srgb, var(--purple) 4%, transparent) 90deg,
            transparent 108deg, color-mix(in srgb, var(--green) 3%, transparent) 126deg,
            transparent 144deg, color-mix(in srgb, var(--cyan) 4%, transparent) 162deg,
            transparent 180deg, color-mix(in srgb, var(--green) 4%, transparent) 198deg,
            transparent 216deg, color-mix(in srgb, var(--purple) 3%, transparent) 234deg,
            transparent 252deg, color-mix(in srgb, var(--cyan) 4%, transparent) 270deg,
            transparent 288deg, color-mix(in srgb, var(--green) 3%, transparent) 306deg,
            transparent 324deg, color-mix(in srgb, var(--purple) 4%, transparent) 342deg,
            transparent 360deg);
          opacity: .5; will-change: transform;
        }

        /* Film grain */
        .auth-noise {
          position: absolute; inset: 0; opacity: .05; mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
        }

        /* Aurora blobs */
        .auth-blob { position: absolute; border-radius: 50%; filter: blur(90px); opacity: .5; will-change: transform; }
        .auth-blob-1 { width: 480px; height: 480px; top: -140px; left: -120px;
          background: radial-gradient(circle at 30% 30%, var(--green), transparent 70%); }
        .auth-blob-2 { width: 420px; height: 420px; bottom: -140px; right: -120px;
          background: radial-gradient(circle at 70% 70%, var(--cyan), transparent 70%); }
        .auth-blob-3 { width: 340px; height: 340px; top: 42%; left: 46%;
          background: radial-gradient(circle at 50% 50%, var(--purple), transparent 70%); opacity: .3; }

        /* Floating particles */
        .auth-particles { position: absolute; inset: 0; }
        .auth-particle {
          position: absolute; border-radius: 50%;
          background: var(--text); will-change: transform, opacity;
        }

        /* Cursor spotlight over the card */
        .auth-cursor-glow {
          position: fixed; z-index: 2; width: 420px; height: 420px; border-radius: 50%;
          pointer-events: none; opacity: 0; left: -210px; top: -210px;
          background: radial-gradient(circle, color-mix(in srgb, var(--green) 7%, transparent) 0%, transparent 60%);
          transition: opacity .4s ease;
        }
        .auth-shell:hover ~ .auth-cursor-glow { opacity: 1; }

        /* ── Page shell ───────────────────────────────────────────── */
        .auth-page {
          position: relative; z-index: 1;
          display: grid; grid-template-columns: 44fr 56fr; gap: 64px;
          align-items: center; min-height: calc(100vh - 170px);
          max-width: 1180px; margin: 0 auto; padding: 96px 24px 40px;
        }

        /* ── Left: hero / illustration ────────────────────────────── */
        .auth-hero { display: flex; flex-direction: column; justify-content: center; min-width: 0; }

        .auth-hero-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
        .auth-brand-mark { width: 46px; height: 46px; border-radius: 14px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: linear-gradient(135deg, var(--green), var(--cyan));
          color: var(--text); box-shadow: 0 8px 26px color-mix(in srgb, var(--green) 40%, transparent); }
        .auth-brand-text { display: flex; flex-direction: column; }
        .auth-brand-name { font-family: var(--font-display); font-weight: 800; font-size: 18px; color: var(--text); letter-spacing: -.2px; }
        .auth-brand-tag { font-family: var(--font-mono); font-size: 8.5px; letter-spacing: 3px; color: var(--muted); margin-top: 2px; }

        .auth-hero-title {
          font-family: var(--font-display); font-size: clamp(30px, 4vw, 44px); font-weight: 800;
          letter-spacing: -.8px; line-height: 1.05; margin: 0 0 12px;
          background: linear-gradient(120deg, var(--text) 20%, color-mix(in srgb, var(--cyan) 70%, var(--text)) 55%, var(--green));
          -webkit-background-clip: text; background-clip: text; color: transparent;
        }
        .auth-hero-sub { font-family: var(--font-display); font-size: 15.5px; color: var(--muted); margin: 0 0 28px; }

        /* Illustration */
        .auth-illus { position: relative; width: 340px; height: 300px; margin: 0 auto 34px; }
        .auth-illus-inner { position: relative; width: 100%; height: 100%; will-change: transform; }
        .auth-illus-glow {
          position: absolute; left: 50%; top: 50%; width: 230px; height: 230px;
          transform: translate(-50%, -50%); border-radius: 50%;
          background: radial-gradient(circle, color-mix(in srgb, var(--green) 16%, transparent), transparent 65%);
          filter: blur(10px);
        }
        .auth-orbit { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); will-change: transform; }
        .auth-orbit circle.ring { fill: none; stroke: color-mix(in srgb, var(--cyan) 30%, transparent); stroke-width: 1; stroke-dasharray: 3 7; }
        .auth-orbit circle.ring2 { fill: none; stroke: color-mix(in srgb, var(--green) 25%, transparent); stroke-width: 1; stroke-dasharray: 1 8; }
        .auth-orbit circle.node { fill: var(--green); }
        .auth-orbit circle.node2 { fill: var(--cyan); }
        .auth-shield-svg { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -52%); will-change: transform; filter: drop-shadow(0 10px 26px color-mix(in srgb, var(--green) 30%, transparent)); }
        .auth-lock-svg { position: absolute; left: 78%; top: 22%; will-change: transform; filter: drop-shadow(0 6px 14px color-mix(in srgb, var(--cyan) 35%, transparent)); }

        /* Feature cards */
        .auth-features { display: grid; grid-template-columns: 1fr; gap: 10px; }
        .auth-feature {
          display: flex; align-items: center; gap: 14px; padding: 14px 16px;
          border-radius: 16px; border: 1px solid color-mix(in srgb, var(--text) 7%, transparent);
          background: color-mix(in srgb, var(--bg2) 55%, transparent);
          backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
          transition: transform .25s cubic-bezier(.16,1,.3,1), border-color .25s, background .25s, box-shadow .25s;
        }
        .auth-feature:hover {
          transform: translateX(6px);
          border-color: color-mix(in srgb, var(--green) 45%, transparent);
          background: color-mix(in srgb, var(--bg2) 85%, transparent);
          box-shadow: 0 10px 30px -12px color-mix(in srgb, var(--green) 35%, transparent);
        }
        .auth-feature-ico {
          width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          color: var(--green);
          background: color-mix(in srgb, var(--green) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--green) 22%, transparent);
          transition: transform .3s cubic-bezier(.34,1.56,.64,1), color .3s, background .3s;
        }
        .auth-feature:hover .auth-feature-ico {
          transform: scale(1.12) rotate(-6deg);
          color: var(--text);
          background: linear-gradient(135deg, var(--green), var(--cyan));
        }
        .auth-feature-text { min-width: 0; }
        .auth-feature-title { font-family: var(--font-display); font-size: 13.5px; font-weight: 700; color: var(--text); letter-spacing: -.1px; }
        .auth-feature-sub { font-family: var(--font-mono); font-size: 9px; color: var(--muted); letter-spacing: .5px; margin-top: 3px; }

        /* ── Right: glass card ────────────────────────────────────── */
        .auth-side { min-width: 0; }

        /* Animated gradient border shell */
        .auth-shell {
          position: relative; border-radius: 26px; padding: 1px;
          background: linear-gradient(150deg,
            color-mix(in srgb, var(--green) 55%, transparent),
            color-mix(in srgb, var(--text) 10%, transparent) 35%,
            color-mix(in srgb, var(--purple) 45%, transparent) 70%,
            color-mix(in srgb, var(--cyan) 55%, transparent));
          background-size: 220% 220%; animation: authBorderFlow 8s ease infinite;
          box-shadow: 0 30px 80px -24px color-mix(in srgb, var(--bg) 80%, transparent),
                      0 0 60px -20px color-mix(in srgb, var(--green) 18%, transparent);
        }
        @keyframes authBorderFlow {
          0%   { background-position: 0% 0%; }
          50%  { background-position: 100% 100%; }
          100% { background-position: 0% 0%; }
        }

        .auth-card {
          border-radius: 25px; padding: 36px 36px 30px;
          background: color-mix(in srgb, var(--bg2) 82%, transparent);
          backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
          overflow: hidden;
        }

        /* Mobile-only brand (hero hidden on small screens) */
        .auth-brand-mobile { display: none; }

        /* Head */
        .auth-head { margin-bottom: 22px; }
        .auth-title { font-family: var(--font-display); font-size: clamp(22px, 3vw, 27px); font-weight: 800;
          color: var(--text); margin: 0 0 6px; letter-spacing: -.5px; line-height: 1.1; }
        .auth-sub { font-family: var(--font-display); font-size: 13.5px; color: var(--muted); margin: 0; }

        /* Tabs with sliding pill */
        .auth-tabs { position: relative; display: flex; background: color-mix(in srgb, var(--bg3) 60%, transparent);
          border: 1px solid color-mix(in srgb, var(--text) 8%, transparent); border-radius: 14px; padding: 5px; margin-bottom: 24px; }
        .auth-tab-indicator { position: absolute; top: 5px; bottom: 5px; left: 5px; width: calc((100% - 10px) / 3);
          background: linear-gradient(120deg, var(--green), var(--cyan)); border-radius: 10px;
          box-shadow: 0 4px 20px color-mix(in srgb, var(--green) 40%, transparent);
          transition: transform .35s cubic-bezier(.16,1,.3,1); }
        .auth-tab { flex: 1; position: relative; z-index: 1; padding: 11px 6px; background: transparent; border: none; cursor: pointer;
          font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 2px; text-transform: uppercase;
          color: var(--muted); transition: color .18s; border-radius: 10px; }
        .auth-tab:hover { color: var(--text); }
        .auth-tab.is-active { color: var(--text); font-weight: 800; }

        /* Form */
        .auth-form { display: flex; flex-direction: column; gap: 16px; }

        .auth-field-wrap { display: flex; flex-direction: column; }
        .auth-field { position: relative; }
        .auth-field input {
          background: color-mix(in srgb, var(--bg3) 45%, transparent);
          border: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
          border-radius: 12px;
          transition: border-color .25s ease, box-shadow .25s ease, background .25s ease;
        }
        .auth-field input:focus {
          border-color: color-mix(in srgb, var(--green) 60%, transparent);
          background: color-mix(in srgb, var(--bg3) 60%, transparent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--green) 14%, transparent),
                      0 6px 24px -12px color-mix(in srgb, var(--green) 45%, transparent);
        }
        .auth-field-line { position: absolute; left: 16px; right: 16px; bottom: 7px; height: 1px; background: transparent; }
        .auth-field-line::after { content:''; position:absolute; left:0; bottom:0; height:2px; width:100%;
          background: linear-gradient(90deg, var(--green), var(--cyan));
          transform: scaleX(0); transform-origin: left; transition: transform .3s cubic-bezier(.16,1,.3,1); }
        .auth-field:focus-within .auth-field-line::after { transform: scaleX(1); }

        /* Password toggle */
        .auth-eye {
          position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
          width: 36px; height: 36px; border: none; background: transparent; cursor: pointer;
          display: flex; align-items: center; justify-content: center; color: var(--muted);
          border-radius: 9px; transition: color .2s, background .2s;
        }
        .auth-eye:hover { color: var(--text); background: color-mix(in srgb, var(--text) 6%, transparent); }
        .auth-eye:focus-visible { outline: 2px solid var(--green); outline-offset: 1px; }

        .auth-field-status { font-family: var(--font-mono); font-size: 10px; color: var(--muted); margin-top: 6px; letter-spacing: 1px; display: block; }
        .auth-field-status-ok   { color: var(--green); }
        .auth-field-status-bad  { color: var(--red); }
        .auth-field-status-warn { color: var(--orange); }

        /* Password strength meter */
        .auth-strength { margin-top: 8px; }
        .auth-strength-bars { display: flex; gap: 4px; margin-bottom: 6px; }
        .auth-strength-bar { flex: 1; height: 4px; border-radius: 99px; background: color-mix(in srgb, var(--text) 9%, transparent); transition: background .3s ease; }
        .auth-strength-bar.is-on.weak   { background: var(--red); }
        .auth-strength-bar.is-on.medium { background: var(--orange); }
        .auth-strength-bar.is-on.good   { background: var(--cyan); }
        .auth-strength-bar.is-on.strong { background: var(--green); }
        .auth-strength-label { font-family: var(--font-mono); font-size: 9px; letter-spacing: 1.5px; color: var(--muted); text-transform: uppercase; }
        .auth-strength-label.is-weak   { color: var(--red); }
        .auth-strength-label.is-medium { color: var(--orange); }
        .auth-strength-label.is-good   { color: var(--cyan); }
        .auth-strength-label.is-strong { color: var(--green); }
        .auth-checklist { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 5px 14px; }
        .auth-checklist li {
          display: flex; align-items: center; gap: 7px; font-family: var(--font-mono); font-size: 9px;
          letter-spacing: .5px; color: var(--muted);
          animation: authCheckIn .3s ease both;
        }
        .auth-checklist li.is-pass { color: var(--green); }
        .auth-checklist-ico {
          width: 15px; height: 15px; border-radius: 50%; flex-shrink: 0;
          display: inline-flex; align-items: center; justify-content: center; font-size: 9px;
          background: color-mix(in srgb, var(--text) 8%, transparent); color: var(--muted);
          transition: background .25s, color .25s;
        }
        .auth-checklist li.is-pass .auth-checklist-ico { background: var(--green); color: var(--text); }
        @keyframes authCheckIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

        /* Alerts */
        .auth-alert { display: flex; align-items: flex-start; gap: 10px; padding: 11px 14px; border-radius: 12px;
          font-family: var(--font-mono); font-size: 11.5px; line-height: 1.6; animation: authAlertIn .3s ease both; }
        @keyframes authAlertIn { from { opacity:0; transform: translateY(-6px); } to { opacity:1; transform:none; } }
        .auth-alert-ico { font-size: 12px; line-height: 1.5; flex-shrink: 0; }
        .auth-alert-error { color: var(--red); background: color-mix(in srgb, var(--red) 8%, transparent); border: 1px solid color-mix(in srgb, var(--red) 30%, transparent); }
        .auth-alert-ok     { color: var(--green); background: color-mix(in srgb, var(--green) 7%, transparent); border: 1px solid color-mix(in srgb, var(--green) 25%, transparent); }
        .auth-alert-warn   { color: var(--orange); background: color-mix(in srgb, var(--orange) 8%, transparent); border: 1px solid color-mix(in srgb, var(--orange) 32%, transparent); }

        /* Submit button */
        .auth-submit { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; gap: 10px;
          font-family: var(--font-display); font-size: 14.5px; font-weight: 700; letter-spacing: .2px;
          padding: 15px; min-height: 54px; border: none; border-radius: 14px; cursor: pointer; color: var(--text);
          background: linear-gradient(120deg, var(--green), var(--cyan), var(--green));
          background-size: 220% 100%; transition: background-position .4s ease, transform .15s ease, box-shadow .25s ease;
          box-shadow: 0 6px 28px color-mix(in srgb, var(--green) 35%, transparent); }
        .auth-submit:hover:not(:disabled) { background-position: 100% 0; transform: translateY(-2px);
          box-shadow: 0 10px 36px color-mix(in srgb, var(--green) 45%, transparent); }
        .auth-submit:active:not(:disabled) { transform: translateY(0) scale(.98); }
        .auth-submit:disabled { cursor: not-allowed; opacity: .45; background: var(--bg3); color: var(--muted); box-shadow: none; }
        .auth-submit-arrow { font-size: 16px; transition: transform .2s ease; }
        .auth-submit:hover:not(:disabled) .auth-submit-arrow { transform: translateX(4px); }

        /* Loading spinner */
        .auth-spinner {
          width: 18px; height: 18px; border-radius: 50%;
          border: 2px solid color-mix(in srgb, var(--text) 30%, transparent);
          border-top-color: var(--text); animation: authSpin .7s linear infinite;
        }
        @keyframes authSpin { to { transform: rotate(360deg); } }

        /* Divider + OAuth */
        .auth-divider { display: flex; align-items: center; gap: 12px; margin: 4px 0; }
        .auth-divider::before, .auth-divider::after { content:''; flex: 1; height: 1px; background: linear-gradient(90deg, transparent, var(--border), transparent); }
        .auth-divider span { font-family: var(--font-mono); font-size: 8px; letter-spacing: 2px; color: var(--muted); white-space: nowrap; }

        .auth-oauth-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .auth-oauth { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 6px;
          font-family: var(--font-mono); font-size: 9px; letter-spacing: 1.5px; font-weight: 700; color: var(--text);
          border-radius: 12px; border: 1px solid color-mix(in srgb, var(--text) 10%, transparent); cursor: pointer;
          background: color-mix(in srgb, var(--bg3) 50%, transparent);
          transition: transform .18s ease, box-shadow .25s ease, border-color .2s, background .2s; }
        .auth-oauth::after { content:''; position: absolute; inset: 0; border-radius: inherit; opacity: 0;
          background: linear-gradient(120deg, color-mix(in srgb, var(--green) 14%, transparent), color-mix(in srgb, var(--cyan) 14%, transparent));
          transition: opacity .25s ease; pointer-events: none; }
        .auth-oauth:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--green) 40%, transparent);
          box-shadow: 0 10px 24px -10px color-mix(in srgb, var(--green) 35%, transparent); }
        .auth-oauth:hover::after { opacity: 1; }
        .auth-oauth:active { transform: translateY(0) scale(.98); }
        .auth-oauth svg { position: relative; z-index: 1; transition: transform .25s cubic-bezier(.34,1.56,.64,1); }
        .auth-oauth:hover svg { transform: scale(1.18) rotate(-5deg); }
        .auth-oauth span { position: relative; z-index: 1; }
        .auth-oauth-discord { color: #fff; background: #5865F2; }
        .auth-oauth-steam   { color: #e5f1ff; background: #1b2838; }
        .auth-oauth-github  { color: var(--text); background: color-mix(in srgb, var(--bg3) 70%, transparent); }
        .auth-oauth-lldap   { color: #fff; background: linear-gradient(135deg, #b56cff, #7c3aed); }
        .auth-oauth-lldap:disabled { opacity: .55; cursor: not-allowed; }
        .auth-oauth-authentik { color: #fff; background: linear-gradient(135deg, #fd5c63, #e64545); }
        .auth-oauth-wg     { color: #fff; background: linear-gradient(135deg, #00b4d8, #0077b6); }
        .auth-oauth-wg:disabled { opacity: .55; cursor: not-allowed; }

        /* Links + misc */
        .auth-link { background: none; border: none; cursor: pointer; padding: 0; font-weight: 600; transition: opacity .15s; }
        .auth-link:hover { opacity: .75; }
        .auth-link-green { font-family: var(--font-display); font-size: 13px; color: var(--green); }
        .auth-link-cyan  { font-family: var(--font-mono); font-size: 9px; color: var(--cyan); letter-spacing: 1px; }
        .auth-link-muted { font-family: var(--font-display); font-size: 13px; color: var(--muted); }
        .auth-switch-line { font-family: var(--font-display); font-size: 13px; color: var(--muted); text-align: center; margin: 0; }

        .auth-state { display: flex; flex-direction: column; gap: 16px; }
        .auth-state-ico { font-size: 44px; line-height: 1; }
        .auth-countdown { font-family: var(--font-mono); font-size: 10px; color: var(--muted); margin-bottom: 6px; }
        .auth-countdown span { color: var(--cyan); }
        .auth-progress { width: 100%; height: 4px; border-radius: 99px; overflow: hidden;
          background: color-mix(in srgb, var(--green) 15%, transparent); }
        .auth-progress-fill { height: 100%; border-radius: 99px;
          background: linear-gradient(90deg, var(--green), var(--cyan));
          transition: width .4s linear; }
        .auth-waiting { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 12px;
          font-family: var(--font-mono); font-size: 9px; color: var(--muted); letter-spacing: 2px; }
        .auth-waiting-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--cyan);
          display: inline-block; animation: authBlink 1.5s ease-in-out infinite; }
        .auth-waiting-note { font-family: var(--font-mono); font-size: 8px; color: var(--muted); opacity: .6; margin-bottom: 14px; }
        .auth-ghost-btn { font-family: var(--font-mono); font-size: 10px; color: var(--green); background: none;
          border: 1px solid color-mix(in srgb, var(--green) 40%, transparent); cursor: pointer; padding: 10px 24px;
          letter-spacing: 2px; border-radius: 10px; transition: background .2s, transform .15s; align-self: center; }
        .auth-ghost-btn:hover { background: color-mix(in srgb, var(--green) 10%, transparent); transform: translateY(-1px); }
        .auth-intro { font-family: var(--font-display); font-size: 13.5px; color: var(--muted); line-height: 1.7; margin: 0; }
        .auth-2fa-title { font-family: var(--font-display); font-size: 15px; font-weight: 700; color: var(--text); margin: 10px 0 6px; }
        .auth-2fa-sub { font-family: var(--font-mono); font-size: 10px; color: var(--muted); line-height: 1.7; margin-bottom: 6px; }

        /* 2FA shield icon */
        .auth-shield-ico { display: inline-flex; filter: drop-shadow(0 8px 20px color-mix(in srgb, var(--green) 30%, transparent)); }
        .auth-shield-ico svg { animation: authShieldGlow 2.6s ease-in-out infinite; }
        @keyframes authShieldGlow {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 6px 14px color-mix(in srgb, var(--green) 25%, transparent)); }
          50% { transform: scale(1.06); filter: drop-shadow(0 8px 26px color-mix(in srgb, var(--green) 45%, transparent)); }
        }

        /* Sent-plane animation (forgot password success) */
        .auth-plane { display: inline-flex; animation: authPlane 1.1s ease; }

        /* Success burst particles */
        .auth-burst { position: relative; width: 0; height: 0; margin: 0 auto; }
        .auth-burst span {
          position: absolute; width: 6px; height: 6px; border-radius: 50%;
          background: var(--green); opacity: 0; animation: authBurst 0.9s ease forwards;
        }
        .auth-burst span:nth-child(1) { left: 0; top: 0; animation-delay: .45s; }
        .auth-burst span:nth-child(2) { left: 0; top: 0; animation-delay: .5s; background: var(--cyan); }
        .auth-burst span:nth-child(3) { left: 0; top: 0; animation-delay: .55s; }
        .auth-burst span:nth-child(4) { left: 0; top: 0; animation-delay: .6s; background: var(--purple); }
        .auth-burst span:nth-child(5) { left: 0; top: 0; animation-delay: .65s; }
        .auth-burst span:nth-child(6) { left: 0; top: 0; animation-delay: .7s; background: var(--cyan); }
        .auth-burst span:nth-child(7) { left: 0; top: 0; animation-delay: .75s; }
        .auth-burst span:nth-child(8) { left: 0; top: 0; animation-delay: .8s; background: var(--purple); }
        @keyframes authBurst {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(var(--bx, 0), var(--by, 0)) scale(0); opacity: 0; }
        }
        .auth-burst span:nth-child(1) { --bx: -42px; --by: -34px; }
        .auth-burst span:nth-child(2) { --bx: 40px;  --by: -38px; }
        .auth-burst span:nth-child(3) { --bx: 46px;  --by: 22px; }
        .auth-burst span:nth-child(4) { --bx: -38px; --by: 30px; }
        .auth-burst span:nth-child(5) { --bx: -22px; --by: -52px; }
        .auth-burst span:nth-child(6) { --bx: 24px;  --by: 50px; }
        .auth-burst span:nth-child(7) { --bx: 56px;  --by: -8px; }
        .auth-burst span:nth-child(8) { --bx: -56px; --by: -6px; }

        /* Footer link */
        .auth-foot { margin-top: 22px; text-align: center; }
        .auth-foot a { font-family: var(--font-mono); font-size: 9px; color: var(--muted); text-decoration: none;
          letter-spacing: 3px; opacity: .7; transition: opacity .2s, color .2s; }
        .auth-foot a:hover { opacity: 1; color: var(--green); }

        @keyframes authBlink { 0%,100% { opacity:1; } 50% { opacity:.2; } }

        /* Focus-visible rings */
        :where(.auth-tab, .auth-link, .auth-oauth, .auth-submit, .auth-ghost-btn, .auth-eye):focus-visible {
          outline: 2px solid var(--green); outline-offset: 2px;
        }

        /* ── Responsive ───────────────────────────────────────────── */
        @media (max-width: 1024px) {
          .auth-page { gap: 40px; padding: 96px 20px 40px; }
          .auth-illus { width: 280px; height: 250px; }
        }

        @media (max-width: 860px) {
          .auth-page { grid-template-columns: 1fr; gap: 28px; min-height: 0; padding-top: 96px; }
          .auth-hero { align-items: center; text-align: center; }
          .auth-hero-title, .auth-hero-sub { text-align: center; }
          .auth-illus { width: 260px; height: 230px; margin-bottom: 26px; }
          .auth-features { max-width: 420px; width: 100%; }
          .auth-hero-brand { display: none; }
          .auth-brand-mobile { display: flex; margin-bottom: 20px; justify-content: center; }
        }

        @media (max-width: 480px) {
          .auth-card { padding: 26px 20px 24px; }
          .auth-oauth-row { grid-template-columns: 1fr; }
          .auth-checklist { grid-template-columns: 1fr; }
          .auth-illus { width: 220px; height: 200px; }
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .auth-blob, .auth-rays, .auth-particle, .auth-submit, .auth-tab-indicator,
          .auth-illus-glow, .auth-orbit, .auth-shield-svg, .auth-lock-svg { animation: none !important; transition: none !important; }
        }
      `}</style>

      {/* Ambient background */}
      <div className="auth-bg" aria-hidden="true" ref={bgRef}>
        <div className="auth-grid" />
        <div className="auth-rays" />
        <div className="auth-noise" />
        <div className="auth-blob auth-blob-1" />
        <div className="auth-blob auth-blob-2" />
        <div className="auth-blob auth-blob-3" />
        <div className="auth-particles">
          {particles.map((p, i) => (
            <span key={i} className="auth-particle"
              style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size, opacity: p.alpha, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s` }} />
          ))}
        </div>
      </div>

      {/* Cursor spotlight (chases the pointer over the card) */}
      <div className="auth-cursor-glow" ref={glowRef} aria-hidden="true" />

      <div className="page-container auth-page">
        {/* ── Left: hero / illustration ──────────────────────────── */}
        <aside className="auth-hero" ref={heroRef}>
          <div className="auth-hero-brand">
            <div className="auth-brand-mark">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2 3 7v10l9 5 9-5V7l-9-5z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div className="auth-brand-text">
              <span className="auth-brand-name">AIFAZI</span>
              <span className="auth-brand-tag">SECURE GATEWAY</span>
            </div>
          </div>

          <h1 className="auth-hero-title">Welcome back</h1>
          <p className="auth-hero-sub">Your secure workspace awaits.</p>

          {/* Animated shield illustration */}
          <div className="auth-illus" ref={illusRef}>
            <div className="auth-illus-inner">
              <div className="auth-illus-glow" />
              <svg className="auth-orbit auth-orbit-1" width="300" height="300" viewBox="0 0 200 200" aria-hidden="true">
                <circle cx="100" cy="100" r="92" className="ring" />
                <circle cx="100" cy="100" r="66" className="ring2" />
                <circle cx="100" cy="8" r="3.2" className="node" />
                <circle cx="100" cy="192" r="2.6" className="node2" />
                <circle cx="8" cy="100" r="2.6" className="node2" />
                <circle cx="192" cy="100" r="3.2" className="node" />
              </svg>
              <svg className="auth-orbit auth-orbit-2" width="300" height="300" viewBox="0 0 200 200" aria-hidden="true">
                <circle cx="100" cy="100" r="79" className="ring" />
                <circle cx="179" cy="100" r="2.2" className="node2" />
                <circle cx="21" cy="100" r="2.2" className="node" />
                <circle cx="100" cy="179" r="2.2" className="node" />
              </svg>
              <svg className="auth-shield-svg" width="150" height="168" viewBox="0 0 120 140" aria-hidden="true">
                <defs>
                  <linearGradient id="heroShieldGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--green)" />
                    <stop offset="100%" stopColor="var(--cyan)" />
                  </linearGradient>
                </defs>
                <path d="M60 6 110 28v42c0 32-22 52-50 64-28-12-50-32-50-64V28L60 6Z"
                  stroke="url(#heroShieldGrad)" strokeWidth="3"
                  fill="color-mix(in srgb, var(--green) 10%, transparent)" />
                <path d="M48 68l9 9 16-18" stroke="url(#heroShieldGrad)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <svg className="auth-lock-svg" width="46" height="46" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="11" fill="color-mix(in srgb, var(--bg2) 92%, transparent)" stroke="var(--cyan)" strokeWidth="1.2" />
                <rect x="6" y="11" width="12" height="7" rx="2" stroke="var(--cyan)" strokeWidth="1.6" />
                <path d="M9 11V8.5a3 3 0 0 1 6 0V11" stroke="var(--cyan)" strokeWidth="1.6" />
              </svg>
            </div>
          </div>

          {/* Feature cards */}
          <div className="auth-features">
            {FEATURES.map(f => (
              <div className="auth-feature" key={f.title}>
                <div className="auth-feature-ico">{f.icon}</div>
                <div className="auth-feature-text">
                  <div className="auth-feature-title">{f.title}</div>
                  <div className="auth-feature-sub">{f.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Right: glass card ───────────────────────────────────── */}
        <section className="auth-side">
          <div className="auth-shell">
            <div className="auth-card" ref={cardRef}>

              {/* Mobile brand */}
              <div className="auth-brand auth-brand-mobile">
                <div className="auth-brand-mark">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2 3 7v10l9 5 9-5V7l-9-5z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                </div>
                <div className="auth-brand-text">
                  <span className="auth-brand-name">AIFAZI</span>
                  <span className="auth-brand-tag">SECURE GATEWAY</span>
                </div>
              </div>

              {/* Header */}
              <div className="auth-head">
                <h1 className="auth-title">{meta.title}</h1>
                <p className="auth-sub">{meta.sub}</p>
              </div>

              {sessionNotice && (
                <div className="auth-alert auth-alert-warn" role="status">
                  <span className="auth-alert-ico">⏳</span>
                  <span style={{ flex: 1 }}>{sessionNotice}</span>
                  <button type="button" onClick={() => setSessionNotice('')} aria-label="Dismiss session notice"
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13 }}>✕</button>
                </div>
              )}

              {/* Tabs */}
              <div className="auth-tabs" role="tablist" aria-label="Authentication options">
                <div className="auth-tab-indicator" style={{ transform: `translateX(${Math.max(tabIndex, 0) * 100}%)` }} aria-hidden="true" />
                {TABS.map(t => (
                  <button key={t.key} type="button" data-tab={t.key}
                    role="tab" aria-selected={tab === t.key} tabIndex={tab === t.key ? 0 : -1}
                    className={`auth-tab${tab === t.key ? ' is-active' : ''}`}
                    onClick={() => switchTab(t.key)}
                    onKeyDown={e => {
                      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
                      e.preventDefault()
                      const idx = TABS.findIndex(x => x.key === t.key)
                      const next = TABS[(idx + (e.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length]
                      switchTab(next.key)
                      requestAnimationFrame(() => {
                        document.querySelector(`.auth-tab[data-tab="${next.key}"]`)?.focus()
                      })
                    }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Form */}
              <div key={formKey} ref={formRef} role="tabpanel" aria-label={meta.title}>
                {twoFAChallenge                && <TwoFAStep     challenge={twoFAChallenge} onBack={() => setTwoFAChallenge(null)} shake={shakeForm} />}
                {!twoFAChallenge && tab === 'signin'   && <SignIn   onSwitch={switchTab} onTwoFA={c => setTwoFAChallenge(c)} shake={shakeForm} />}
                {!twoFAChallenge && tab === 'register' && <SignUp   onSwitch={switchTab} shake={shakeForm} />}
                {!twoFAChallenge && tab === 'forgot'   && <ForgotPassword onSwitch={switchTab} shake={shakeForm} />}
              </div>

              {/* Footer */}
              <div className="auth-foot">
                <a href="/">← BACK TO HOME</a>
              </div>

            </div>
          </div>
        </section>
      </div>
    </>
  )
}
