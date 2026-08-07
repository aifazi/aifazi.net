'use client'
import { useEffect, useState, useRef, useSyncExternalStore, memo } from 'react'
// GSAP lazy-loaded to avoid SSR crash — static top-level import of gsap causes
// ReferenceError: window is not defined during Next.js server-side rendering.
import dynamic from 'next/dynamic'
import { EditableText, useInlineEdit, AnimatableWrapper } from '../context/EditContext'
import StatusBadge from './StatusBadge'
// H27 — ServerRackAnimation is ~125KB / 2578L of canvas+SVG. A static top-level
// import dragged it into the home-page first-paint chunk, hurting LCP/FCP. Lazy-load
// via next/dynamic with ssr:false (it's pure decoration, no hydration impact).
const ServerRackAnimation = dynamic(() => import('./ServerRackAnimation'), {
  ssr: false,
  loading: () => null,
})

// Shared lazy gsap loader — resolves to the gsap instance, never throws on server
let _gsapCache = null
const loadGsap = () => {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (_gsapCache) return Promise.resolve(_gsapCache)
  return import('gsap').then(m => { _gsapCache = m.gsap || m.default || m; return _gsapCache })
}

// ── Word-mask clip reveal (Dave Holloway style) ───────────────────────────────
// Wraps each word in an overflow:hidden clip so words slide up into view.
// Pure CSS keyframe animation (no gsap dependency) — the LCP name reveals
// immediately instead of waiting on the lazy-loaded gsap chunk.
function MaskReveal({ children, delay = 0, style = {} }) {
  return (
    <span style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', ...style }}>
      <span style={{ display: 'inline-block', animation: `maskReveal 0.85s cubic-bezier(0.16,1,0.3,1) ${delay}s both` }}>{children}</span>
    </span>
  )
}

// ── Magnetic button (Dave Holloway style) ─────────────────────────────────────
function MagneticBtn({ children, className, href, download, style = {}, strength = 0.35 }) {
  const ref = useRef()
  useEffect(() => {
    const el = ref.current
    if (!el || typeof window === 'undefined') return
    const onMove = e => {
      const rect   = el.getBoundingClientRect()
      const cx     = rect.left + rect.width  / 2
      const cy     = rect.top  + rect.height / 2
      const dx     = (e.clientX - cx) * strength
      const dy     = (e.clientY - cy) * strength
      el.style.transform = `translate(${dx}px, ${dy}px)`
    }
    const onLeave = () => {
      loadGsap().then(gsap => gsap?.to(el, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1, 0.4)' }))
    }
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave) }
  }, [strength])

  const props = { ref, className, style: { display: 'inline-block', willChange: 'transform', ...style } }
  return href
    ? <a {...props} href={href} download={download}>{children}</a>
    : <span {...props}>{children}</span>
}

// ── Infinite marquee (Dave Holloway badge ticker) ─────────────────────────────
function MarqueeBadges({ badges }) {
  const trackRef = useRef()
  useEffect(() => {
    const el = trackRef.current
    if (!el || typeof window === 'undefined') return
    let ctx
    loadGsap().then(gsap => {
      if (!gsap || !trackRef.current) return
      ctx = gsap.context(() => {
        gsap.to(el, {
          xPercent: -50,
          ease: 'none',
          duration: 18,
          repeat: -1,
          modifiers: {
            xPercent: v => parseFloat(v) % 50,
          },
        })
      }, trackRef)
    })
    return () => { try { ctx?.revert() } catch {} }
  }, [badges])

  // Duplicate badges for seamless loop
  const doubled = [...badges, ...badges]
  return (
    <div style={{ overflow: 'hidden', width: '100%', marginTop: 48, paddingBottom: 4 }}>
      <div ref={trackRef} style={{ display: 'flex', gap: 12, whiteSpace: 'nowrap', width: 'max-content' }}>
        {doubled.map((badge, i) => (
          <span key={i} style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
            padding: '6px 14px', border: '1px solid color-mix(in srgb, var(--cyan) 15%, transparent)',
            color: 'var(--muted)', background: 'color-mix(in srgb, var(--cyan) 3%, transparent)',
            flexShrink: 0, display: 'inline-block',
            transition: 'color 0.3s, border-color 0.3s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--cyan) 15%, transparent)'; e.currentTarget.style.color = 'var(--muted)' }}
          >{badge}</span>
        ))}
      </div>
    </div>
  )
}

// ── Spring-draggable badge ────────────────────────────────────────────────────
function DraggableBadge({ badge, style, onMouseEnter, onMouseLeave, 'data-ha-badge': dataAttr }) {
  const badgeRef = useRef(null)

  useEffect(() => {
    const el = badgeRef.current
    if (!el) return
    let draggable
    // GSAP Draggable — spring-like release via gsap.to inertia
    import('gsap/Draggable').then(({ Draggable }) => {
      import('gsap').then(({ gsap }) => {
        gsap.registerPlugin(Draggable)
        draggable = Draggable.create(el, {
          type: 'x,y',
          edgeResistance: 0.85,
          onRelease() {
            gsap.to(el, {
              x: 0, y: 0,
              duration: 0.6,
              ease: 'elastic.out(1, 0.4)',
            })
          },
        })[0]
      })
    }).catch(() => {})
    return () => { try { draggable?.kill?.() } catch {} }
  }, [])

  return (
    <div
      ref={badgeRef}
      data-ha-badge={dataAttr}
      style={{ ...style, cursor: 'grab', userSelect: 'none' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {badge}
    </div>
  )
}

const DEFAULT_WORDS = ['Network Specialist', 'IT Specialist', 'Infrastructure Architect', 'Security Specialist']
const DEFAULT_BADGES = ['Cisco', 'FortiGate', 'pfSense', 'Cyber Security', 'Docker', 'Linux']
const DEFAULT_STATS = [
  { num: '5+', label: 'YEARS EXP', color: 'var(--green)',  numKey: 'hero.stat0.num', labelKey: 'hero.stat0.label' },
  { num: '20+', label: 'PROJECTS', color: 'var(--cyan)',   numKey: 'hero.stat1.num', labelKey: 'hero.stat1.label' },
  { num: '99%', label: 'UPTIME',   color: 'var(--orange)', numKey: 'hero.stat2.num', labelKey: 'hero.stat2.label' },
]

// Particle config is precomputed once — but must be DETERMINISTIC: the server
// renders this component during SSR and the client renders it again at
// hydration. Module-level Math.random() produces different values on each,
// which triggers React hydration error #419. Use a seeded PRNG instead.
const PARTICLE_COUNT = 20
function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}
const _prng = seededRandom(42)
const PARTICLE_CONFIGS = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
  width:    _prng() * 3 + 1,
  height:   _prng() * 3 + 1,
  left:     _prng() * 100,
  top:      _prng() * 100,
  drift:    (_prng() - 0.5) * 80,
  duration: 3 + _prng() * 4,
  delay:    _prng() * 6,
  colorIdx: i % 3,
}))

const Particle = memo(function Particle({ cfg }) {
  return (
    <div style={{
      position: 'absolute',
      width:    cfg.width  + 'px',
      height:   cfg.height + 'px',
      borderRadius: '50%',
      background: cfg.colorIdx === 0 ? 'var(--green)' : cfg.colorIdx === 1 ? 'var(--cyan)' : 'color-mix(in srgb, var(--cyan) 40%, transparent)',
      left:  cfg.left + '%',
      top:   cfg.top  + '%',
      '--drift': cfg.drift + 'px',
      animation: `particle-rise ${cfg.duration}s ease-out ${cfg.delay}s infinite`,
      pointerEvents: 'none',
    }} />
  )
})

// ── Glitch Name Component ─────────────────────────────────────────────────────
function GlitchName({ children, color }) {
  const [glitching, setGlitching] = useState(false)

  useEffect(() => {
    const triggerGlitch = () => {
      setGlitching(true)
      setTimeout(() => setGlitching(false), 600)
    }
    // Random glitch every 4–9 seconds
    const schedule = () => {
      const delay = 4000 + Math.random() * 5000
      return setTimeout(() => { triggerGlitch(); schedule() }, delay)
    }
    const t = schedule()
    return () => clearTimeout(t)
  }, [])

  return (
    <span
      className={glitching ? 'glitch-active' : ''}
      data-text={children}
      style={{
        color: color || 'var(--text)',
        textShadow: color === 'var(--green)'
          ? '0 0 50px color-mix(in srgb, var(--green) 35%, transparent), 0 0 100px color-mix(in srgb, var(--green) 12%, transparent)'
          : '0 0 40px color-mix(in srgb, var(--text) 20%, transparent)',
        position: 'relative',
        display: 'inline-block',
      }}
    >
      {children}
    </span>
  )
}

export default function Hero() {
  const { value: words } = useInlineEdit('hero.words', DEFAULT_WORDS)
  const wordList = Array.isArray(words) ? words : DEFAULT_WORDS

  const [wordIdx, setWordIdx] = useState(0)
  const [displayed, setDisplayed] = useState('')
  const [deleting, setDeleting] = useState(false)
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  const heroLeftRef = useRef(null)
  const statsRef   = useRef(null)   // ref for the stats strip counter animation
  const rackRef    = useRef(null)   // ref for the server rack panel slide-in

  useEffect(() => {
    const word = wordList[wordIdx % wordList.length]
    let timeout
    if (!deleting && displayed.length < word.length) {
      timeout = setTimeout(() => setDisplayed(word.slice(0, displayed.length + 1)), 80)
    } else if (!deleting && displayed.length === word.length) {
      timeout = setTimeout(() => setDeleting(true), 2200)
    } else if (deleting && displayed.length > 0) {
      timeout = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 40)
    } else if (deleting && displayed.length === 0) {
      timeout = setTimeout(() => {
        setDeleting(false)
        setWordIdx((wordIdx + 1) % wordList.length)
      }, 0)
    }
    return () => clearTimeout(timeout)
  }, [displayed, deleting, wordIdx, wordList])

  // ── GSAP entrance timeline ────────────────────────────────────────────────
  // NOTE: Hero section entrances are now handled by CSS animations on each
  // AnimatableWrapper span (fill-mode:both pre-hides, delays stagger them).
  // This effect only handles the badge ticker reveal (data-ha-badge).
  useEffect(() => {
    const left = heroLeftRef.current
    if (!left) return
    const items  = left.querySelectorAll('[data-ha]')       // empty — AnimatableWrapper handles these
    const badges = left.querySelectorAll('[data-ha-badge]') // spring-pop for badge elements
    if (!items.length && !badges.length) return

    // Pre-hide synchronously so there's no flash before GSAP loads
    items.forEach(el => { el.style.opacity = '0'; el.style.transform = 'translateY(44px)' })
    badges.forEach(el => { el.style.opacity = '0'; el.style.transform = 'scale(0.78) translateY(12px)' })

    // Failsafe — show everything if GSAP hasn't animated after 3s
    const failsafe = setTimeout(() => {
      items.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; el.style.transition = 'opacity 0.4s ease, transform 0.4s ease' })
      badges.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none'; el.style.transition = 'opacity 0.4s ease, transform 0.4s ease' })
    }, 3000)

    let ctx
    loadGsap().then(gsap => {
      clearTimeout(failsafe)
      if (!gsap || !heroLeftRef.current) return
      ctx = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
        tl.to(items,  { opacity: 1, y: 0, duration: 0.82, stagger: 0.11, delay: 0.08 })
          .to(badges, { opacity: 1, scale: 1, y: 0, duration: 0.5, stagger: 0.055, ease: 'back.out(1.7)' }, '-=0.32')
      })
    })
    return () => { clearTimeout(failsafe); ctx?.revert() }
  }, [])

  // ── Stats counter animation ───────────────────────────────────────────────
  useEffect(() => {
    const strip = statsRef.current
    if (!strip) return
    const displays = strip.querySelectorAll('[data-stat-num]')
    if (!displays.length) return
    const TARGETS = [5, 20, 99]
    const timer = setTimeout(() => {
      loadGsap().then(gsap => {
        if (!gsap) return
        displays.forEach((el, i) => {
          const target = TARGETS[i]
          if (target === undefined) return
          const obj = { val: 0 }
          gsap.to(obj, {
            val: target, duration: 1.4, ease: 'expo.out',
            onUpdate: () => {
              const suffix = (DEFAULT_STATS[i]?.num ?? '').replace(/[0-9]/g, '')
              el.textContent = Math.round(obj.val) + suffix
            },
          })
        })
      })
    }, 900)
    return () => clearTimeout(timer)
  }, [])

  // ── Server rack panel: slide in from right ────────────────────────────────
  useEffect(() => {
    if (!mounted) return
    const panel = rackRef.current
    if (!panel) return
    loadGsap().then(gsap => {
      if (!gsap || !rackRef.current) return
      gsap.set(panel, { opacity: 0, x: 60 })
      setTimeout(() => {
        gsap.to(panel, { opacity: 1, x: 0, duration: 0.6, ease: 'expo.out' })
      }, 120)
    })
  }, [mounted])

  return (
    <section id="hero" style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      padding: 'clamp(80px, 12vh, 120px) clamp(16px, 5vw, 60px) clamp(40px, 6vh, 80px)',
      position: 'relative', zIndex: 1, overflow: 'hidden', maxWidth: '100vw'
    }}>
      {mounted && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {PARTICLE_CONFIGS.map((cfg, i) => <Particle key={i} cfg={cfg} />)}
        </div>
      )}
      <div style={{ position: 'absolute', width: 800, height: 800, borderRadius: '50%', background: 'radial-gradient(circle, color-mix(in srgb, var(--green) 5%, transparent) 0%, transparent 65%)', right: -200, top: '50%', transform: 'translateY(-50%)', animation: 'orb-drift 15s ease-in-out infinite', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, color-mix(in srgb, var(--cyan) 6%, transparent) 0%, transparent 65%)', left: 100, bottom: -100, animation: 'orb-drift 20s ease-in-out infinite reverse', pointerEvents: 'none' }} />

      {/* ── Two-column layout: content left, server rack animation right ── */}
      <div style={{ width: '100%', maxWidth: '100%', minWidth: 0, display: 'flex', alignItems: 'center', gap: 40, position: 'relative', zIndex: 2, flexWrap: 'wrap' }} className="hero-layout">

      {/* Left: all existing content */}
      <div ref={heroLeftRef} className="hero-left" style={{ flex: '1 1 520px', width: '100%', maxWidth: 680, minWidth: 0 }}>
        {/* Status row */}
        <AnimatableWrapper animKey="hero.statusRow" label="Status Row" currentAnim="fadeRight 0.6s 0.05s both">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--green)', letterSpacing: 4, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', animation: 'glow-pulse 2s ease-in-out infinite' }} />
            <span style={{ color: 'var(--cyan)' }}>&gt; </span>
            <EditableText contentKey="hero.status" defaultValue="AVAILABLE FOR NEW PROJECTS" />
          </div>
          {/* Live status badge */}
          <StatusBadge size="lg" />
        </div>
        </AnimatableWrapper>

        {/* Glitching name */}
        <AnimatableWrapper animKey="hero.name" label="Hero Name" currentAnim="fadeUp 0.7s 0.1s both">
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(56px, 8vw, 110px)', fontWeight: 700, lineHeight: 0.9, letterSpacing: -3, marginBottom: 16 }}>
          <MaskReveal delay={0.05} style={{ color: 'var(--text)', textShadow: '0 0 40px color-mix(in srgb, var(--text) 20%, transparent)' }}>
            <GlitchName color="var(--text)">
              <EditableText contentKey="hero.name1" defaultValue="TANVIR" />
            </GlitchName>
          </MaskReveal><br />
          <MaskReveal delay={0.12} style={{ color: 'var(--green)', textShadow: '0 0 50px color-mix(in srgb, var(--green) 35%, transparent)' }}>
            <GlitchName color="var(--green)">
              <EditableText contentKey="hero.name2" defaultValue="AIFAZI" />
            </GlitchName>
          </MaskReveal>
        </h1>
        </AnimatableWrapper>

        <AnimatableWrapper animKey="hero.typewriter" label="Typewriter Row" currentAnim="fadeUp 0.7s 0.2s both">
        <div style={{
          fontFamily: 'var(--font-code)', fontSize: 'clamp(13px, 2vw, 18px)',
          color: 'var(--cyan)', letterSpacing: 3, marginBottom: 36, minHeight: 28,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ color: 'color-mix(in srgb, var(--cyan) 35%, transparent)', fontWeight: 300 }}>{'// '}</span>
          <span style={{ color: 'var(--cyan)', textShadow: '0 0 18px color-mix(in srgb, var(--cyan) 50%, transparent)' }}>{displayed}</span>
          <span style={{ display: 'inline-block', width: 2, height: '1.2em', background: 'var(--cyan)', animation: 'blink 0.9s infinite', verticalAlign: 'middle', boxShadow: '0 0 8px var(--cyan)' }} />
        </div>
        </AnimatableWrapper>

        <AnimatableWrapper animKey="hero.desc" label="Description" currentAnim="fadeUp 0.7s 0.3s both">
        <p style={{
          fontSize: 17, lineHeight: 2, marginBottom: 52,
          maxWidth: 520, width: '100%', boxSizing: 'border-box',
          color: 'var(--text2)',
          borderLeft: '3px solid color-mix(in srgb, var(--green) 55%, transparent)',
          paddingLeft: 20, paddingTop: 14, paddingBottom: 14, paddingRight: 18,
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--green) 4%, transparent) 0%, color-mix(in srgb, var(--cyan) 3%, transparent) 100%)',
          borderRadius: '0 6px 6px 0',
          boxShadow: 'inset 0 0 30px color-mix(in srgb, var(--green) 2%, transparent)',
          letterSpacing: '0.01em',
        }}>
          <EditableText contentKey="hero.desc" defaultValue="Designing, deploying, and securing enterprise-grade network infrastructure. From routing protocols to zero-trust architecture — I keep systems connected and protected." multiline />
        </p>
        </AnimatableWrapper>

        <AnimatableWrapper animKey="hero.buttons" label="CTA Buttons" currentAnim="fadeUp 0.7s 0.4s both">
        <div className="hero-cta-row" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', width: '100%', maxWidth: '100%' }}>
          <MagneticBtn href="#projects" className="btn-primary" strength={0.4}><EditableText contentKey="hero.btn.projects" defaultValue="View Projects" /></MagneticBtn>
          <MagneticBtn href="/contact"  className="btn-outline"  strength={0.4}><EditableText contentKey="hero.btn.contact" defaultValue="Get In Touch" /></MagneticBtn>
          <MagneticBtn href="/resume.pdf" download="Tanvir_Aifazi_CV.pdf" className="btn-outline" strength={0.3}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <EditableText contentKey="hero.btn.cv" defaultValue="DOWNLOAD CV" />
          </MagneticBtn>
        </div>
        </AnimatableWrapper>

        {/* Stats strip — always visible, no absolute positioning */}
        <AnimatableWrapper animKey="hero.stats" label="Stats Strip" currentAnim="fadeUp 0.7s 0.5s both">
        <div ref={statsRef} className="hero-stats" style={{ display: 'flex', gap: 0, marginTop: 40, maxWidth: 360, width: '100%' }}>
          {DEFAULT_STATS.map(({ num, label, color, numKey, labelKey }, i) => (
            <div key={label}
              style={{
                flex: 1, padding: '16px 20px', textAlign: 'center',
                background: 'var(--bg2)', border: '1px solid var(--border)',
                borderLeft: i > 0 ? 'none' : '1px solid var(--border)',
                transition: 'all 0.3s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = `color-mix(in srgb, ${color} 8%, transparent)` }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg2)' }}
            >
              {/* data-stat-num targets the counter animation — shows "0+" → "5+" etc */}
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>
                <span data-stat-num className="stat-num"><EditableText contentKey={numKey} defaultValue={num} /></span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--muted)', letterSpacing: 2, marginTop: 4 }}>
                <EditableText contentKey={labelKey} defaultValue={label} />
              </div>
            </div>
          ))}
        </div>
        </AnimatableWrapper>

        <AnimatableWrapper animKey="hero.badges" label="Tech Badges" currentAnim="fadeUp 0.7s 0.6s both">
          <div className="hero-badges">
          <MarqueeBadges badges={DEFAULT_BADGES} />
        </div>
      </AnimatableWrapper>
      </div>{/* end left col */}

      {/* Right: Server Rack Animation — hidden on small screens */}
      {mounted && (
        <div ref={rackRef} style={{
          flex: '1 1 0', minWidth: 0, minHeight: 500,
          alignSelf: 'stretch',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }} className="hero-rack-panel">
          <ServerRackAnimation />
        </div>
      )}

      </div>{/* end two-column flex */}

      <style>{`
        /* ── Word-mask reveal (pure CSS) ── */
        @keyframes maskReveal {
          from { transform: translateY(110%); }
          to   { transform: translateY(0); }
        }
        /* ── Glitch effect ── */
        .glitch-active {
          animation: glitch 0.6s steps(1) forwards !important;
        }
        .glitch-active::before,
        .glitch-active::after {
          content: attr(data-text);
          position: absolute;
          top: 0; left: 0;
          width: 100%; height: 100%;
          pointer-events: none;
        }
        .glitch-active::before {
          color: var(--cyan);
          animation: glitch-top 0.6s steps(2) forwards;
          clip-path: polygon(0 0, 100% 0, 100% 35%, 0 35%);
        }
        .glitch-active::after {
          color: var(--orange);
          animation: glitch-bot 0.6s steps(2) forwards;
          clip-path: polygon(0 65%, 100% 65%, 100% 100%, 0 100%);
        }
        @keyframes glitch {
          0%,100% { transform: translate(0) skew(0deg); }
          20%      { transform: translate(-3px, 1px) skew(-1deg); }
          40%      { transform: translate(3px, -1px) skew(1deg); }
          60%      { transform: translate(-2px, 2px) skew(-0.5deg); }
          80%      { transform: translate(2px, -2px) skew(0.5deg); }
        }
        @keyframes glitch-top {
          0%,100% { transform: translate(0); }
          25%      { transform: translate(-4px, -2px); }
          75%      { transform: translate(4px, 2px); }
        }
        @keyframes glitch-bot {
          0%,100% { transform: translate(0); }
          25%      { transform: translate(4px, 2px); }
          75%      { transform: translate(-4px, -2px); }
        }

        @media (max-width: 1100px) {
          .hero-rack-panel { opacity: 0.7; }
        }
        @media (max-width: 900px) {
          .hero-layout { flex-direction: column !important; gap: 32px !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; }
          .hero-left { flex: 1 1 auto !important; width: 100% !important; max-width: 100% !important; min-width: 0 !important; }
          #hero p { max-width: 100% !important; overflow-wrap: anywhere !important; }
          .hero-cta-row { flex-direction: column !important; gap: 10px !important; }
          .hero-cta-row > a, .hero-cta-row > div { width: 100% !important; }
          .hero-stats { display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important; max-width: 100% !important; width: 100% !important; overflow: hidden !important; }
          .hero-stats > div { min-width: 0 !important; padding: 10px 12px !important; }
          .stat-num { font-size: 22px !important; }
        }
        @media (max-width: 480px) {
          .hero-cta-row { flex-direction: column !important; gap: 8px !important; }
          .hero-cta-row > a, .hero-cta-row > div { width: 100% !important; }
          .hero-stats { grid-template-columns: 1fr !important; }
          .hero-stats > div { padding: 8px 10px !important; border-left: 1px solid var(--border) !important; border-top: none !important; }
          .hero-stats > div:first-child { border-top: 1px solid var(--border) !important; }
          .stat-num { font-size: 20px !important; }
          .hero-badges { max-width: 100% !important; overflow: hidden !important; }
        }
        /* remaining responsive handled by globals.css */
      `}</style>
    </section>
  )
}
