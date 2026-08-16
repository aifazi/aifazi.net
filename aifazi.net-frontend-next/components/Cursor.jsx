'use client'
import { useEffect, useRef, useSyncExternalStore } from 'react'

const reducedMotionQuery = () =>
  typeof window === 'undefined' ? null : window.matchMedia('(prefers-reduced-motion: reduce)')
const coarsePointerQuery = () =>
  typeof window === 'undefined' ? null : window.matchMedia('(hover: none)')

// Hydration-safe: the server snapshot is always false so server and client
// first render both return null. After hydration the client snapshot enables
// the cursor only when the environment actually has a fine pointer, without
// calling setState inside an effect.
function subscribeCursorEnabled(cb) {
  const rm = reducedMotionQuery()
  const cp = coarsePointerQuery()
  if (!rm || !cp) return () => {}
  rm.addEventListener('change', cb)
  cp.addEventListener('change', cb)
  return () => {
    rm.removeEventListener('change', cb)
    cp.removeEventListener('change', cb)
  }
}

function getCursorEnabled() {
  const rm = reducedMotionQuery()
  const cp = coarsePointerQuery()
  if (!rm || !cp) return false
  return !rm.matches && !cp.matches
}

const getServerCursorEnabled = () => false

export default function Cursor() {
  const dotRef  = useRef()
  const ringRef = useRef()
  const show    = useSyncExternalStore(subscribeCursorEnabled, getCursorEnabled, getServerCursorEnabled)

  useEffect(() => {
    const pos   = { x: -200, y: -200 }
    const ring  = { x: -200, y: -200 }
    const vel   = { x: 0, y: 0 }
    let   lastX = -200, lastY = -200, rafId

    const onMove = e => {
      vel.x = e.clientX - lastX
      vel.y = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      pos.x = e.clientX
      pos.y = e.clientY
    }

    const lerp = (a, b, t) => a + (b - a) * t

    const animate = () => {
      // Dot — instant
      if (dotRef.current) {
        dotRef.current.style.left = pos.x + 'px'
        dotRef.current.style.top  = pos.y + 'px'
      }
      // Ring — lagged
      ring.x = lerp(ring.x, pos.x, 0.10)
      ring.y = lerp(ring.y, pos.y, 0.10)

      // Velocity-based squish (Dave Holloway style)
      const speed   = Math.sqrt(vel.x ** 2 + vel.y ** 2)
      const stretch = Math.min(1 + speed * 0.03, 2.2)
      const squeeze = 1 / stretch
      const angle   = speed > 1 ? Math.atan2(vel.y, vel.x) * (180 / Math.PI) : 0

      if (ringRef.current) {
        ringRef.current.style.left      = ring.x + 'px'
        ringRef.current.style.top       = ring.y + 'px'
        ringRef.current.style.transform =
          `translate(-50%,-50%) rotate(${angle}deg) scaleX(${stretch}) scaleY(${squeeze})`
      }

      // Dampen velocity
      vel.x *= 0.7
      vel.y *= 0.7

      rafId = requestAnimationFrame(animate)
    }

    document.addEventListener('mousemove', onMove, { passive: true })
    rafId = requestAnimationFrame(animate)

    // Magnetic hover — scale dot up & switch colour.
    // Event delegation on document (instead of attaching to every a/button):
    // no per-element listeners to leak on unmount, and it stays correct across
    // route changes / re-renders without re-scanning the DOM.
    const isTarget = el => el && (el.tagName === 'A' || el.tagName === 'BUTTON' || el.hasAttribute?.('data-hover'))
    const onEnter = e => {
      if (!isTarget(e.target)) return
      if (dotRef.current) {
        dotRef.current.style.transform  = 'translate(-50%,-50%) scale(2.5)'
        dotRef.current.style.background = 'var(--cyan)'
        dotRef.current.style.mixBlendMode = 'normal'
      }
      if (ringRef.current) ringRef.current.style.opacity = '0.3'
    }
    const onLeave = e => {
      if (!isTarget(e.target)) return
      if (dotRef.current) {
        dotRef.current.style.transform    = 'translate(-50%,-50%) scale(1)'
        dotRef.current.style.background   = 'var(--green)'
        dotRef.current.style.mixBlendMode = 'difference'
      }
      if (ringRef.current) ringRef.current.style.opacity = '1'
    }
    document.addEventListener('mouseover', onEnter, { passive: true })
    document.addEventListener('mouseout', onLeave, { passive: true })

    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseover', onEnter)
      document.removeEventListener('mouseout', onLeave)
      cancelAnimationFrame(rafId)
    }
  }, [])

  if (!show) return null

  return (
    <>
      {/* Dot — instant, mix-blend-mode difference for inversion */}
      <div ref={dotRef} style={{
        position: 'fixed', pointerEvents: 'none', zIndex: 99999,
        width: 8, height: 8, borderRadius: '50%',
        background: 'var(--green)',
        transform: 'translate(-50%,-50%)',
        mixBlendMode: 'difference',
        transition: 'transform 0.15s ease, background 0.2s ease',
        willChange: 'left, top, transform',
      }}/>
      {/* Ring — lagged + velocity squish */}
      <div ref={ringRef} style={{
        position: 'fixed', pointerEvents: 'none', zIndex: 99998,
        width: 36, height: 36, borderRadius: '50%',
        border: '1.5px solid color-mix(in srgb, var(--cyan) 55%, transparent)',
        transform: 'translate(-50%,-50%)',
        willChange: 'left, top, transform',
        transition: 'opacity 0.2s ease',
      }}/>
    </>
  )
}
