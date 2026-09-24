/**
 * core/useFocusTrap.js — keep Tab / Shift+Tab inside an overlay.
 * Used by CommandPalette (and any future modal without core/dialog.jsx).
 */
import { useEffect, useRef } from 'react'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(active) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!active) return
    const previouslyFocused = document.activeElement
    const onKey = (e) => {
      if (e.key !== 'Tab' || !panelRef.current) return
      const focusables = panelRef.current.querySelectorAll(FOCUSABLE)
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const el = document.activeElement
      if (e.shiftKey && (el === first || el === panelRef.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && el === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [active])

  return panelRef
}

/** True when the user asked the OS for reduced motion. */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
