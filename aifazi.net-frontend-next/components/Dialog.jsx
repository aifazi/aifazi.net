'use client'
import { useEffect, useRef } from 'react'

export { useDialog, dialog, DialogProvider } from '../core/dialog.jsx'

// ── Shared accessible modal shell (UI/UX audit P1-5) ─────────────────────────
// Escape-to-close, focus trap, autofocus, role=dialog + aria-modal, overlay
// click close. Visuals come from props so each caller keeps its existing look.
export function Dialog({
  onClose,
  label,
  labelledBy,
  describedBy,
  children,
  panelStyle,
  overlayStyle,
  zIndex = 300,
  initialFocusRef,
}) {
  const panelRef = useRef(null)

  useEffect(() => {
    const prevActive = typeof document !== 'undefined' ? document.activeElement : null
    const panel = panelRef.current
    // Autofocus: explicit ref, [data-autofocus], or first focusable element.
    const target =
      initialFocusRef?.current ||
      panel?.querySelector('[data-autofocus]') ||
      panel?.querySelector('input:not([disabled]), button:not([disabled]), select, textarea, a[href], [tabindex]:not([tabindex="-1"])')
    try { target?.focus?.() } catch {}
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return }
      if (e.key !== 'Tab' || !panel) return
      const items = [...panel.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      )].filter(el => el.offsetParent !== null)
      if (items.length === 0) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      try { prevActive?.focus?.() } catch {}
    }
  }, [onClose, initialFocusRef])

  return (
    <div
      role="dialog" aria-modal="true"
      aria-label={label} aria-labelledby={labelledBy} aria-describedby={describedBy}
      style={{ position: 'fixed', inset: 0, zIndex, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div onClick={onClose} aria-hidden="true"
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)', ...overlayStyle }} />
      <div ref={panelRef} style={{ position: 'relative', ...panelStyle }}>
        {children}
      </div>
    </div>
  )
}

