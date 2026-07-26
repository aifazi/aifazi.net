'use client'
import { useEffect, useRef } from 'react'

/**
 * useReveal — GSAP ScrollTrigger entrance animation.
 * Migrated from animejs v4 onScroll.
 *
 * Uses start:'top <threshold>%' so elements already in the viewport
 * on mount (theme-change remounts, above-fold content) animate immediately
 * instead of staying hidden forever.
 */
export function useReveal(threshold = 0.1) {
  const ref = useRef()

  useEffect(() => {
    const el = ref.current
    if (!el || typeof window === 'undefined') return

    el.style.opacity = '0'
    el.style.transform = 'translateY(40px)'
    el.style.transition = 'none'

    let ctx

    Promise.all([
      import('gsap').then(m => m.gsap),
      import('gsap/ScrollTrigger').then(m => m.ScrollTrigger),
    ]).then(([gsap, ScrollTrigger]) => {
      gsap.registerPlugin(ScrollTrigger)
      ctx = gsap.context(() => {
        gsap.fromTo(el,
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: 0.75,
            ease: 'expo.out',
            scrollTrigger: {
              trigger: el,
              start: `top ${Math.round((1 - threshold) * 100)}%`,
              once: true,
            },
          }
        )
      })
    }).catch(() => {
      if (el) { el.style.opacity = '1'; el.style.transform = 'none' }
    })

    return () => { try { ctx?.revert() } catch {} }
  }, [threshold])

  return ref
}
