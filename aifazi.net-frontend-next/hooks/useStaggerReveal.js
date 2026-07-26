'use client'
import { useEffect, useRef } from 'react'

/**
 * useStaggerReveal — staggered GSAP entrance on a group of child elements.
 * Migrated from animejs + old GSAP hybrid. Now fully GSAP-native:
 * no animejs imports, no 2.5s failsafe timeout, instant catch fallback.
 *
 * Usage:
 *   const ref = useStaggerReveal('[data-item]')
 *   <div ref={ref}>
 *     <div data-item>Item</div>
 *   </div>
 */
export function useStaggerReveal(selector = '[data-item]', opts = {}) {
  const ref = useRef()
  const {
    staggerMs  = 80,
    duration   = 700,
    ease       = 'expo.out',
    startDelay = 0,
    fromY      = 40,
    threshold  = 0.1,
  } = opts

  useEffect(() => {
    const container = ref.current
    if (!container || typeof window === 'undefined') return

    const els = Array.from(container.querySelectorAll(selector))
    if (!els.length) return

    els.forEach(el => {
      el.style.opacity = '0'
      el.style.transform = `translateY(${fromY}px)`
      el.style.transition = 'none'
    })

    let ctx

    Promise.all([
      import('gsap').then(m => m.gsap),
      import('gsap/ScrollTrigger').then(m => m.ScrollTrigger),
    ]).then(([gsap, ScrollTrigger]) => {
      gsap.registerPlugin(ScrollTrigger)
      ctx = gsap.context(() => {
        gsap.fromTo(els,
          { opacity: 0, y: fromY },
          {
            opacity: 1,
            y: 0,
            duration: duration / 1000,
            ease,
            stagger: staggerMs / 1000,
            delay: startDelay / 1000,
            scrollTrigger: {
              trigger: container,
              start: `top ${Math.round((1 - threshold) * 100)}%`,
              once: true,
            },
          }
        )
        if (document.readyState === 'complete') {
          setTimeout(() => ScrollTrigger.refresh(), 200)
        } else {
          window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true })
        }
      })
    }).catch(() => {
      els.forEach(el => { el.style.opacity = '1'; el.style.transform = 'none' })
    })

    return () => { try { ctx?.revert() } catch {} }
  }, [selector, staggerMs, duration, ease, startDelay, fromY, threshold])

  return ref
}
