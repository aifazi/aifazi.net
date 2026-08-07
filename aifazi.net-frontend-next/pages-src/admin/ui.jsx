'use client'
import React, { useEffect, useRef } from 'react'

/**
 * admin/ui.jsx — shared admin design kit.
 * One set of primitives so panels stop redefining Btn/Badge/Stat/Modal/MONO
 * with subtly different styles. Migrate panels to import from here.
 */

export const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'

/* ── Button ─────────────────────────────────────────────────────────────── */
export function Btn({ onClick, children, color = 'var(--green)', disabled, danger, small, ghost, full, variant = 'solid', style, type = 'button', ...rest }) {
  const base = {
    fontFamily: MONO, fontSize: small ? 9 : 10, letterSpacing: 1.5, fontWeight: 700,
    padding: small ? '6px 12px' : '9px 16px', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, transition: 'all 0.15s', border: '1px solid transparent',
    whiteSpace: 'nowrap', ...(full ? { width: '100%' } : {}),
    ...(style || {}),
  }
  if (variant === 'outline') {
    base.background = disabled ? 'rgba(255,255,255,0.03)' : `color-mix(in srgb, ${color} 18%, transparent)`
    base.borderColor = disabled ? 'var(--border)' : `color-mix(in srgb, ${color} 44%, transparent)`
    base.color = danger ? '#ff4757' : color
  } else if (ghost) {
    base.background = 'transparent'
    base.borderColor = danger ? 'rgba(255,71,87,0.4)' : 'var(--border)'
    base.color = danger ? '#ff4757' : 'var(--muted)'
  } else {
    base.background = danger ? '#ff4757' : color
    base.color = '#000'
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={base} {...rest}>{children}</button>
  )
}

/* ── Badge / pill ───────────────────────────────────────────────────────── */
export function Badge({ children, color = 'var(--green)', tone, style }) {
  const map = {
    green: 'var(--green)', red: '#ff4757', yellow: '#facc15', cyan: 'var(--cyan)',
    orange: '#ff6b35', purple: '#a855f7', muted: 'var(--muted)',
  }
  const c = map[tone] || color
  return (
    <span style={{
      fontFamily: MONO, fontSize: 8, letterSpacing: 1.5, padding: '3px 9px', borderRadius: 999,
      background: `color-mix(in srgb, ${c} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`,
      color: c, whiteSpace: 'nowrap', ...(style || {}),
    }}>{children}</span>
  )
}

/* ── Stat card ──────────────────────────────────────────────────────────── */
export function StatCard({ label, value, color = 'var(--green)', sub, onClick, style }) {
  return (
    <div onClick={onClick} style={{
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '16px 18px', cursor: onClick ? 'pointer' : 'default',
      position: 'relative', overflow: 'hidden', transition: 'border-color 0.2s, transform 0.15s',
      ...(style || {}),
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color; if (onClick) e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--muted)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

/* ── Empty state ────────────────────────────────────────────────────────── */
export function EmptyState({ icon = '📭', title = 'Nothing here yet', hint }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--muted)', fontFamily: MONO }}>
      <div style={{ fontSize: 34, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>{title}</div>
      {hint && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8, opacity: 0.8 }}>{hint}</div>}
    </div>
  )
}

/* ── Skeleton block ─────────────────────────────────────────────────────── */
export function Skeleton({ width = '100%', height = 12, style }) {
  return (
    <div style={{
      width, height, borderRadius: 4, flexShrink: 0,
      background: 'linear-gradient(90deg, var(--bg3) 25%, var(--border) 50%, var(--bg3) 75%)',
      backgroundSize: '200% 100%', animation: 'adminSkel 1.4s ease infinite', ...(style || {}),
    }} />
  )
}

/* ── Relative time ──────────────────────────────────────────────────────── */
export function RelTime({ iso, now }) {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString()
}

/* ── Pagination ─────────────────────────────────────────────────────────── */
export function Pagination({ page, total, pageSize = 50, onChange, label }) {
  const pages = Math.max(1, Math.ceil((total || 0) / pageSize))
  // Clamp to a real page: if the total shrank (delete/filter) and the user sits
  // on a now-empty page, surface it so they can get back instead of a blank list.
  const shown = Math.min(page, pages)
  const clamped = shown !== page
  if (clamped && onChange) onChange(shown)
  if (pages <= 1 && shown <= 1) return null
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', padding: '10px 4px', flexWrap: 'wrap' }}>
      {label && <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)', marginRight: 'auto' }}>{label}</span>}
      <Btn variant="outline" small disabled={shown <= 1} onClick={() => onChange(shown - 1)}>← PREV</Btn>
      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--muted)' }}>{shown} / {pages}</span>
      <Btn variant="outline" small disabled={shown >= pages} onClick={() => onChange(shown + 1)}>NEXT →</Btn>
    </div>
  )
}

/* ── Accessible Modal ───────────────────────────────────────────────────── */
const ESC = 27
let modalStack = 0
let modalTopId = 0
let savedBodyOverflow = ''

/**
 * Accessible modal overlay: role="dialog", aria-modal, focus trap, Escape to
 * close, backdrop click to close, focus restored to the opener on close, and
 * body scroll locked while open. Wrap your panel content in <Modal>…</Modal>.
 *
 * props:
 *   open          boolean  — whether the modal is shown
 *   onClose       fn       — required; called on Escape/backdrop/close
 *   title         string   — used as the accessible name (aria-labelledby)
 *   width         number|string — max-width of the panel (default 560)
 *   noBackdropClose bool   — require an explicit close (no click-outside)
 *   children      node     — panel content
 */
export function Modal({ open, onClose, title, width = 560, noBackdropClose, children }) {
  const panelRef = useRef(null)
  const restoreRef = useRef(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose // keep latest without re-running the effect
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const doc = document
    restoreRef.current = doc.activeElement
    modalTopId += 1
    const myId = modalTopId
    if (modalStack === 0) savedBodyOverflow = doc.body.style.overflow
    modalStack += 1
    doc.body.style.overflow = 'hidden'

    const onKey = e => {
      if (myId !== modalTopId) return // only the top-most modal handles keys
      if (e.keyCode === ESC || e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); return }
      if (e.key !== 'Tab') return
      // Focus trap
      const panel = panelRef.current
      if (!panel) return
      const focusables = panel.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])')
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const inPanel = doc.activeElement === panel || panel.contains(doc.activeElement)
      if (e.shiftKey) {
        if (doc.activeElement === first || doc.activeElement === panel || !inPanel) { e.preventDefault(); last.focus() }
      } else if (doc.activeElement === last || doc.activeElement === panel || !inPanel) {
        e.preventDefault(); first.focus()
      }
    }
    doc.addEventListener('keydown', onKey, true)
    // Focus the panel once paint settles
    const raf = requestAnimationFrame(() => panelRef.current?.focus?.())

    return () => {
      modalStack = Math.max(0, modalStack - 1)
      if (modalStack === 0) doc.body.style.overflow = savedBodyOverflow
      doc.removeEventListener('keydown', onKey, true)
      cancelAnimationFrame(raf)
      // Restore focus to the element that opened the modal
      if (restoreRef.current && typeof restoreRef.current.focus === 'function') restoreRef.current.focus()
    }
  }, [open])

  if (!open) return null
  const name = typeof title === 'string' && title ? title : 'Dialog'
  const titleId = typeof title === 'string' && title ? `modal-${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}` : undefined

  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-label={titleId ? undefined : name}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={noBackdropClose ? undefined : onClose} aria-hidden="true"
        style={{ position: 'absolute', inset: 0, background: 'rgba(3,8,14,0.72)', backdropFilter: 'blur(3px)' }} />
      <div ref={panelRef} tabIndex={-1} style={{
        position: 'relative', width: '100%', maxWidth: width, maxHeight: '88vh', overflowY: 'auto',
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14,
        boxShadow: '0 24px 60px rgba(0,0,0,0.55)', outline: 'none',
      }}>
        {(typeof title === 'string' && title) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <div id={titleId} style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 3, color: 'var(--green)', textTransform: 'uppercase' }}>{title}</div>
            <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
