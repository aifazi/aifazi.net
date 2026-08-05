'use client'
import { useEffect, useRef } from 'react'

export function useReveal(threshold = 0.1) {
  const ref = useRef()

  useEffect(() => {
    const el = ref.current
    if (!el || typeof window === 'undefined') return

    // Never hide — content is visible from SSR. Only animate as enhancement.
    let ctx

    Promise.all([
      import('gsap').then(m => m.gsap),
      import('gsap/ScrollTrigger').then(m => m.ScrollTrigger),
    ]).then(([gsap, ScrollTrigger]) => {
      if (!el) return
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
            immediateRender: false,
          }
        )
      })
    }).catch(() => {})

    return () => { try { ctx?.revert() } catch {} }
  }, [threshold])

  return ref
}
