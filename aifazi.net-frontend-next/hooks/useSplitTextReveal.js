'use client'
import { useEffect, useRef } from 'react'

/**
 * useSplitTextReveal — per-character staggered entrance with GSAP.
 * Migrated from animejs v4 animate + stagger + onScroll.
 *
 * Fires immediately for elements already in the viewport (theme-change
 * remounts, SSR hydration, above-fold headings) via ScrollTrigger start threshold.
 */
export function useSplitTextReveal(opts = {}) {
  const ref = useRef()
  const {
    staggerMs = 30,
    duration  = 600,
    ease      = 'expo.out',
    fromY     = 32,
    threshold = 0.1,
  } = opts

  useEffect(() => {
    const el = ref.current
    if (!el || typeof window === 'undefined') return

    const originalHTML = el.innerHTML
    const text = el.textContent || ''

    el.innerHTML = text
      .split('')
      .map(ch =>
        ch === ' '
          ? '<span aria-hidden="true" style="display:inline-block">&nbsp;</span>'
          : `<span aria-hidden="true" style="display:inline-block">${ch}</span>`
      )
      .join('')
    el.setAttribute('aria-label', text)

    const chars = Array.from(el.querySelectorAll('span'))
    if (!chars.length) return

    let ctx
    let cancelled = false
    const fallback = setTimeout(() => {
      if (!cancelled) {
        chars.forEach(c => { c.style.opacity = '1'; c.style.transform = 'none' })
      }
    }, 2000)

    Promise.all([
      import('gsap').then(m => m.gsap),
      import('gsap/ScrollTrigger').then(m => m.ScrollTrigger),
    ]).then(([gsap, ScrollTrigger]) => {
      if (cancelled) return
      clearTimeout(fallback)
      gsap.registerPlugin(ScrollTrigger)
      ctx = gsap.context(() => {
        gsap.fromTo(chars,
          { opacity: 0, y: fromY },
          {
            opacity: 1,
            y: 0,
            duration: duration / 1000,
            ease,
            stagger: staggerMs / 1000,
            scrollTrigger: {
              trigger: el,
              start: `top ${Math.round((1 - threshold) * 100)}%`,
              once: true,
            },
          }
        )
      })
    }).catch(() => {
      cancelled = true
      chars.forEach(c => { c.style.opacity = '1'; c.style.transform = 'none' })
    })

    return () => {
      cancelled = true; clearTimeout(fallback)
      try { ctx?.revert() } catch {}
      if (el) { el.innerHTML = originalHTML; el.removeAttribute('aria-label') }
    }
  }, [staggerMs, duration, ease, fromY, threshold])

  return ref
}
