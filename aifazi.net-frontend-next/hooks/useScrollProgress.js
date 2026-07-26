'use client'
import { useEffect, useRef } from 'react'

/**
 * useScrollProgress — animates a target element tied to scroll position
 * using GSAP ScrollTrigger in scrub mode.
 *
 * Usage:
 *   const ref = useScrollProgress({ x: '-100%' })
 *   <div ref={ref} />
 *
 * @param {object} animProps  - GSAP to() properties to tween to
 * @param {object} scrollOpts - additional ScrollTrigger options
 */
export function useScrollProgress(animProps = {}, scrollOpts = {}) {
  const ref = useRef()

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let ctx
    let cancelled = false

    Promise.all([
      import('gsap').then(m => m.gsap),
      import('gsap/ScrollTrigger').then(m => m.ScrollTrigger),
    ]).then(([gsap, ScrollTrigger]) => {
      if (cancelled || !el) return
      gsap.registerPlugin(ScrollTrigger)
      ctx = gsap.context(() => {
        gsap.to(el, {
          ...animProps,
          ease: 'none',
          scrollTrigger: {
            trigger: el,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
            ...scrollOpts,
          },
        })
      })
    }).catch(() => {})

    return () => {
      cancelled = true
      ctx?.revert()
    }
  }, [])

  return ref
}
