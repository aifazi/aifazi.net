/**
 * lib/animate.js — Site-wide GSAP animation utilities
 *
 * Usage:
 *   import { useFadeUp, useStaggerIn, useCountUp, useGlitch } from '@/lib/animate'
 *
 *   const ref = useFadeUp()
 *   <div ref={ref}>...</div>
 *
 *   const ref = useStaggerIn('.card')
 *   <div ref={ref}><div className="card">...</div></div>
 *
 *   const { ref, value } = useCountUp(1234)
 *   <span ref={ref}>{value}</span>
 */
'use client'
import { useEffect, useRef, useState } from 'react'

// Lazy-load GSAP to avoid SSR issues
let gsapPromise = null
const loadGsap = () => {
  if (!gsapPromise) gsapPromise = import('gsap').then(m => m.gsap || m.default || m)
  return gsapPromise
}

export const GSAP_ANIMATION_PRESETS = [
  {
    id: 'gsap-fade-up',
    label: 'GSAP Fade Up',
    category: 'GSAP',
    icon: '↑',
    defaults: { duration: 0.9, delay: 0, ease: 'power3.out' },
    from: { autoAlpha: 0, y: 34 },
    to: { autoAlpha: 1, y: 0 },
  },
  {
    id: 'gsap-fade-down',
    label: 'GSAP Fade Down',
    category: 'GSAP',
    icon: '↓',
    defaults: { duration: 0.9, delay: 0, ease: 'power3.out' },
    from: { autoAlpha: 0, y: -34 },
    to: { autoAlpha: 1, y: 0 },
  },
  {
    id: 'gsap-slide-left',
    label: 'GSAP Slide Left',
    category: 'GSAP',
    icon: '←',
    defaults: { duration: 0.95, delay: 0, ease: 'expo.out' },
    from: { autoAlpha: 0, x: 58 },
    to: { autoAlpha: 1, x: 0 },
  },
  {
    id: 'gsap-slide-right',
    label: 'GSAP Slide Right',
    category: 'GSAP',
    icon: '→',
    defaults: { duration: 0.95, delay: 0, ease: 'expo.out' },
    from: { autoAlpha: 0, x: -58 },
    to: { autoAlpha: 1, x: 0 },
  },
  {
    id: 'gsap-zoom-pop',
    label: 'GSAP Zoom Pop',
    category: 'GSAP',
    icon: '⊕',
    defaults: { duration: 0.78, delay: 0, ease: 'back.out(1.7)' },
    from: { autoAlpha: 0, scale: 0.82 },
    to: { autoAlpha: 1, scale: 1, transformOrigin: '50% 50%' },
  },
  {
    id: 'gsap-flip-in',
    label: 'GSAP Flip In',
    category: 'GSAP',
    icon: '◫',
    defaults: { duration: 0.85, delay: 0, ease: 'back.out(1.4)' },
    from: { autoAlpha: 0, rotateX: -75, y: 18 },
    to: { autoAlpha: 1, rotateX: 0, y: 0, transformPerspective: 900, transformOrigin: '50% 50%' },
  },
  {
    id: 'gsap-elastic-pop',
    label: 'GSAP Elastic Pop',
    category: 'GSAP',
    icon: '◉',
    defaults: { duration: 1.05, delay: 0, ease: 'elastic.out(1, 0.45)' },
    from: { autoAlpha: 0, scale: 0.68 },
    to: { autoAlpha: 1, scale: 1, transformOrigin: '50% 50%' },
  },
  {
    id: 'gsap-neon-pulse',
    label: 'GSAP Neon Pulse',
    category: 'GSAP',
    icon: '✦',
    defaults: { duration: 1.6, delay: 0, ease: 'sine.inOut', repeat: -1, yoyo: true },
    from: { filter: 'drop-shadow(0 0 0 rgba(0,255,136,0))' },
    to: { filter: 'drop-shadow(0 0 14px rgba(0,255,136,0.75))' },
  },
  {
    id: 'gsap-float-loop',
    label: 'GSAP Float Loop',
    category: 'GSAP',
    icon: '〰',
    defaults: { duration: 2.8, delay: 0, ease: 'sine.inOut', repeat: -1, yoyo: true },
    from: { y: 0 },
    to: { y: -18 },
  },
  {
    id: 'gsap-scan-glitch',
    label: 'GSAP Scan Glitch',
    category: 'GSAP',
    icon: '▓',
    defaults: { duration: 1.1, delay: 0, ease: 'steps(5)', repeat: -1, repeatDelay: 2.4 },
    keyframes: [
      { x: -2, skewX: -3, opacity: 0.72, duration: 0.06 },
      { x: 3, skewX: 3, opacity: 1, duration: 0.06 },
      { x: -1, skewX: -1, opacity: 0.82, duration: 0.05 },
      { x: 0, skewX: 0, opacity: 1, duration: 0.08 },
    ],
  },
]

export function isGsapAnimationValue(value) {
  return typeof value === 'string' && value.startsWith('gsap:')
}

export function buildGsapAnimationValue(presetId, params = {}) {
  const preset = GSAP_ANIMATION_PRESETS.find(p => p.id === presetId)
  if (!preset) return 'none'
  const payload = {
    engine: 'gsap',
    id: presetId,
    duration: Number(params.duration ?? preset.defaults?.duration ?? 0.9),
    delay: Number(params.delay ?? preset.defaults?.delay ?? 0),
    ease: params.easing || preset.defaults?.ease || 'power3.out',
    repeat: Number(params.repeat ?? preset.defaults?.repeat ?? 0),
    yoyo: Boolean(params.yoyo ?? preset.defaults?.yoyo ?? false),
    repeatDelay: Number(params.repeatDelay ?? preset.defaults?.repeatDelay ?? 0),
  }
  return `gsap:${encodeURIComponent(JSON.stringify(payload))}`
}

export function parseGsapAnimationValue(value) {
  if (!isGsapAnimationValue(value)) return null
  try {
    const parsed = JSON.parse(decodeURIComponent(value.slice(5)))
    const preset = GSAP_ANIMATION_PRESETS.find(p => p.id === parsed.id)
    if (!preset) return null
    return { ...parsed, preset }
  } catch {
    return null
  }
}

export function describeGsapAnimationValue(value) {
  const parsed = parseGsapAnimationValue(value)
  if (!parsed) return value || 'none'
  const bits = [
    parsed.preset.label,
    `${parsed.duration || parsed.preset.defaults?.duration || 0.9}s`,
    parsed.ease || parsed.preset.defaults?.ease || 'power3.out',
  ]
  if (parsed.delay) bits.push(`delay ${parsed.delay}s`)
  if (parsed.repeat === -1) bits.push('loop')
  return bits.join(' · ')
}

export function useGsapAnimation(animationValue, deps = []) {
  const ref = useRef(null)

  useEffect(() => {
    const parsed = parseGsapAnimationValue(animationValue)
    if (!parsed || !ref.current || typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return

    let ctx
    let cancelled = false
    loadGsap().then(gsap => {
      if (cancelled || !ref.current) return
      const { preset } = parsed
      const shared = {
        duration: parsed.duration ?? preset.defaults?.duration ?? 0.9,
        delay: parsed.delay ?? preset.defaults?.delay ?? 0,
        ease: parsed.ease ?? preset.defaults?.ease ?? 'power3.out',
        repeat: parsed.repeat ?? preset.defaults?.repeat ?? 0,
        yoyo: parsed.yoyo ?? preset.defaults?.yoyo ?? false,
        repeatDelay: parsed.repeatDelay ?? preset.defaults?.repeatDelay ?? 0,
      }

      ctx = gsap.context(() => {
        if (preset.keyframes) {
          gsap.to(ref.current, {
            keyframes: preset.keyframes,
            ...shared,
          })
          return
        }
        gsap.fromTo(ref.current, preset.from || {}, {
          ...(preset.to || {}),
          ...shared,
        })
      }, ref)
    })

    return () => {
      cancelled = true
      ctx?.revert()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationValue, ...deps])

  return ref
}

// ── Fade up on mount ──────────────────────────────────────────────────────────
export function useFadeUp(options = {}) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    let ctx
    loadGsap().then(gsap => {
      if (!ref.current) return
      ctx = gsap.context(() => {
        gsap.from(ref.current, {
          opacity: 0,
          y: options.distance ?? 24,
          duration: (options.duration ?? 600) / 1000,
          delay: (options.delay ?? 0) / 1000,
          ease: options.easing ?? 'expo.out',
        })
      })
    })
    return () => ctx?.revert()
  }, [])
  return ref
}

// ── Stagger children in on mount ──────────────────────────────────────────────
export function useStaggerIn(childSelector = '*', options = {}) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    let ctx
    loadGsap().then(gsap => {
      if (!ref.current) return
      const targets = ref.current.querySelectorAll(childSelector)
      if (!targets.length) return
      ctx = gsap.context(() => {
        gsap.from(targets, {
          opacity: 0,
          y: options.distance ?? 20,
          duration: (options.duration ?? 500) / 1000,
          stagger: (options.stagger ?? 60) / 1000,
          delay: (options.delay ?? 0) / 1000,
          ease: options.easing ?? 'expo.out',
        })
      })
    })
    return () => ctx?.revert()
  }, [])
  return ref
}

// ── Animated counter (number counting up) ─────────────────────────────────────
export function useCountUp(target, options = {}) {
  const ref = useRef(null)
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (target == null) return
    let ctx
    loadGsap().then(gsap => {
      const obj = { val: 0 }
      ctx = gsap.context(() => {
        gsap.to(obj, {
          val: Number(target),
          duration: (options.duration ?? 1200) / 1000,
          delay: (options.delay ?? 100) / 1000,
          ease: options.easing ?? 'expo.out',
          onUpdate: () => setValue(Math.round(obj.val)),
        })
      })
    })
    return () => ctx?.revert()
  }, [target])
  return { ref, value }
}

// ── Glitch text flicker on hover ──────────────────────────────────────────────
export function useGlitch() {
  const ref = useRef(null)
  const play = () => {
    if (!ref.current) return
    loadGsap().then(gsap => {
      gsap.to(ref.current, {
        keyframes: [
          { skewX: -4, opacity: 0.6, duration: 0.05 },
          { skewX:  4, opacity: 1.0, duration: 0.05 },
          { skewX: -2, opacity: 0.7, duration: 0.05 },
          { skewX:  2, opacity: 1.0, duration: 0.05 },
          { skewX:  0, opacity: 1.0, duration: 0.08 },
        ],
        ease: 'none',
      })
    })
  }
  return { ref, play }
}

// ── Pulse glow (for live indicators, alerts) ──────────────────────────────────
export function usePulse(color = 'var(--green)') {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    let ctx
    loadGsap().then(gsap => {
      if (!ref.current) return
      ctx = gsap.context(() => {
        gsap.to(ref.current, {
          boxShadow: `0 0 16px ${color}80`,
          duration: 1,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
      })
    })
    return () => ctx?.revert()
  }, [color])
  return ref
}

// ── Slide in from side (for panels, drawers) ──────────────────────────────────
export function useSlideIn(direction = 'left', options = {}) {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    let ctx
    const axis = direction === 'left' || direction === 'right' ? 'x' : 'y'
    const from = direction === 'left' || direction === 'top' ? -30 : 30
    loadGsap().then(gsap => {
      if (!ref.current) return
      ctx = gsap.context(() => {
        gsap.from(ref.current, {
          opacity: 0,
          [axis]: from,
          duration: (options.duration ?? 450) / 1000,
          delay: (options.delay ?? 0) / 1000,
          ease: options.easing ?? 'expo.out',
        })
      })
    })
    return () => ctx?.revert()
  }, [])
  return ref
}
