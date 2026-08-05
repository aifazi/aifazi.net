'use client'
import { useEffect, useRef } from 'react'

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

    Promise.all([
      import('gsap').then(m => m.gsap),
      import('gsap/ScrollTrigger').then(m => m.ScrollTrigger),
    ]).then(([gsap, ScrollTrigger]) => {
      if (!el) return
      gsap.registerPlugin(ScrollTrigger)
      ctx = gsap.context(() => {
        gsap.fromTo(chars,
          { opacity: 0, y: fromY },
          {
            opacity: 1, y: 0,
            duration: duration / 1000,
            ease,
            stagger: staggerMs / 1000,
            scrollTrigger: {
              trigger: el,
              start: `top ${Math.round((1 - threshold) * 100)}%`,
              once: true,
            },
            immediateRender: false,
          }
        )
      })
    }).catch(() => {})

    return () => {
      try { ctx?.revert() } catch {}
      if (el) { el.innerHTML = originalHTML; el.removeAttribute('aria-label') }
    }
  }, [])

  return ref
}
