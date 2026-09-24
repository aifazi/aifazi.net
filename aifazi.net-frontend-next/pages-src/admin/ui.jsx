'use client'
import React, { useEffect, useRef } from 'react'
import { useTheme } from '@/app/providers'
import { BUTTON_STYLES, CARD_STYLES, BADGE_STYLES } from '../../core/framework-styles.js'

/**
 * admin/ui.jsx — shared admin design kit.
 * One set of primitives so panels stop redefining Btn/Badge/Stat/Modal/MONO
 * with subtly different styles. Migrate panels to import from here.
 *
 * Framework-aware: Btn/Badge/StatCard read siteConfig buttonStyle/badgeStyle/
 * cardStyle (set via Theme Library → Framework or per-theme personalities).
 * The framework value only sets the BASE — explicit props (color/danger/
 * small/variant/ghost/style/...) always win. When the keys are absent the
 * components render exactly the historic cyber look (cyber/cyber/pill).
 */

export const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'

const BUTTON_IDS = BUTTON_STYLES.map(s => s.id)
const CARD_IDS   = CARD_STYLES.map(s => s.id)
const BADGE_IDS  = BADGE_STYLES.map(s => s.id)

// Defensive framework read: unknown/empty values fall back to the default so
// the historic look is preserved when the keys are absent.
function fwKey(siteConfig, key, ids, fallback) {
  const v = siteConfig?.[key]
  return typeof v === 'string' && ids.includes(v) ? v : fallback
}
function useFwKey(key, ids, fallback) {
  const theme = useTheme()
  return fwKey(theme?.siteConfig, key, ids, fallback)
}

/* ── Button ─────────────────────────────────────────────────────────────── */
// Framework sets the BASE shape/glow; variant/ghost/danger/color/style props
// below still override, so every existing call site keeps working.
const BUTTON_BASE = {
  cyber:    {},
  pill:     { borderRadius: 999 },
  brutal:   { borderRadius: 0, border: '2px solid transparent', boxShadow: '3px 3px 0 rgba(0,0,0,0.55)' },
  ghost:    { borderRadius: 6 },
  neon:     null, // needs the live color prop — built per-render below
  terminal: { borderRadius: 0 },
  minimal:  { borderRadius: 4 },
  holo:     null, // needs the live color prop — built per-render below
}
export function Btn({ onClick, children, label, textColor, color = 'var(--green)', disabled, danger, small, ghost, full, variant = 'solid', style, type = 'button', ...rest }) {
  const buttonStyle = useFwKey('buttonStyle', BUTTON_IDS, 'cyber')
  const glowColor = danger ? '#ff4757' : color
  const fwBase = buttonStyle === 'neon'
    ? { borderRadius: 6, boxShadow: `0 0 14px color-mix(in srgb, ${glowColor} 55%, transparent)` }
    : buttonStyle === 'holo'
      ? { borderRadius: 8, border: `1px solid color-mix(in srgb, ${glowColor} 65%, transparent)`, boxShadow: `0 0 14px color-mix(in srgb, ${glowColor} 28%, transparent)` }
      : (BUTTON_BASE[buttonStyle] || {})
  const base = {
    fontFamily: MONO, fontSize: small ? 9 : 10, letterSpacing: 1.5, fontWeight: 700,
    padding: small ? '6px 12px' : '9px 16px', borderRadius: 'var(--comp-btn-radius, 6px)', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1, transition: 'all 0.15s', border: '1px solid transparent',
    boxShadow: 'var(--comp-btn-shadow, none)',
    whiteSpace: 'nowrap', ...(full ? { width: '100%' } : {}),
    ...fwBase,
    ...(style || {}),
  }
  const noExplicitBg = !(style || {}).background
  if (variant === 'outline') {
    base.background = disabled ? 'rgba(255,255,255,0.03)' : `color-mix(in srgb, ${color} 18%, transparent)`
    base.borderColor = disabled ? 'var(--comp-input-border, var(--border))' : `color-mix(in srgb, ${color} 44%, transparent)`
    base.color = danger ? '#ff4757' : color
  } else if (ghost || (buttonStyle === 'ghost' && noExplicitBg)) {
    base.background = 'transparent'
    base.borderColor = danger ? 'rgba(255,71,87,0.4)' : 'var(--comp-input-border, var(--border))'
    base.color = danger ? '#ff4757' : 'var(--muted)'
  } else if (buttonStyle === 'minimal' && variant === 'solid' && noExplicitBg) {
    base.background = 'transparent'
    base.borderColor = 'transparent'
    base.color = danger ? '#ff4757' : color
  } else {
    base.background = danger ? '#ff4757' : color
    base.color = 'var(--comp-btn-text, #000)'
  }
  if (textColor) base.color = textColor
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={base} {...rest}>{children ?? label}</button>
  )
}

/* ── Badge / pill ───────────────────────────────────────────────────────── */
export function Badge({ children, color = 'var(--green)', tone, style }) {
  const badgeStyle = useFwKey('badgeStyle', BADGE_IDS, 'pill')
  const map = {
    green: 'var(--comp-badge-text, var(--green))', red: '#ff4757', yellow: '#facc15', cyan: 'var(--cyan)',
    orange: '#ff6b35', purple: '#a855f7', muted: 'var(--muted)',
  }
  const c = map[tone] || color
  const fwBase = {
    square:  { borderRadius: 2 },
    neon:    { boxShadow: `0 0 10px color-mix(in srgb, ${c} 60%, transparent)` },
    minimal: { background: 'transparent', border: '1px solid transparent', padding: '3px 2px' },
    brutal:  { borderRadius: 0, border: `2px solid ${c}`, boxShadow: '2px 2px 0 rgba(0,0,0,0.55)' },
  }[badgeStyle] || {}
  return (
    <span style={{
      fontFamily: MONO, fontSize: 11, letterSpacing: 1.5, padding: '3px 9px', borderRadius: 'var(--comp-badge-radius, 999px)',
      background: `color-mix(in srgb, ${c} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`,
      color: c, whiteSpace: 'nowrap', ...fwBase, ...(style || {}),
    }}>{children}</span>
  )
}

/* ── Stat card ──────────────────────────────────────────────────────────── */
export function StatCard({ label, value, color = 'var(--green)', sub, onClick, style }) {
  const cardStyle = useFwKey('cardStyle', CARD_IDS, 'cyber')
  const fwBase = {
    glass:    { background: 'color-mix(in srgb, var(--bg2) 55%, transparent)', backdropFilter: 'blur(14px)', borderRadius: 14 },
    brutal:   { borderRadius: 0, border: '2px solid var(--text)', boxShadow: '4px 4px 0 rgba(0,0,0,0.55)' },
    paper:    { borderRadius: 2 },
    minimal:  { borderRadius: 8 },
    neon:     { borderRadius: 10, border: `1px solid color-mix(in srgb, ${color} 55%, transparent)`, boxShadow: `0 0 18px color-mix(in srgb, ${color} 22%, transparent)` },
    terminal: { borderRadius: 0 },
  }[cardStyle] || {}
  return (
    <div onClick={onClick} style={{
      background: 'var(--comp-card-bg, var(--bg2))', border: 'var(--comp-card-border, 1px solid var(--border))', borderRadius: 'var(--comp-card-radius, 12px)',
      boxShadow: 'var(--comp-card-shadow, none)',
      padding: '16px 18px', cursor: onClick ? 'pointer' : 'default',
      position: 'relative', overflow: 'hidden', transition: 'border-color 0.2s, transform 0.15s',
      ...fwBase,
      ...(style || {}),
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color; if (onClick) e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none' }} role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: 'var(--muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

/* ── Empty state ────────────────────────────────────────────────────────── */
export function EmptyState({ icon = '📭', title = 'Nothing here yet', hint }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--muted)', fontFamily: MONO }}>
      <div style={{ fontSize: 34, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>{title}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, opacity: 0.8 }}>{hint}</div>}
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
  void now
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) {
    const f = -ms
    const m = Math.floor(f / 60000)
    if (m < 1) return 'in a moment'
    if (m < 60) return `in ${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `in ${h}h`
    const d = Math.floor(h / 24)
    return d < 7 ? `in ${d}d` : new Date(iso).toLocaleDateString()
  }
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
      {label && <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)', marginRight: 'auto' }}>{label}</span>}
      <Btn variant="outline" small disabled={shown <= 1} onClick={() => onChange(shown - 1)}>← PREV</Btn>
      <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--muted)' }}>{shown} / {pages}</span>
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
        style={{ position: 'absolute', inset: 0, background: 'rgba(3,8,14,0.72)', backdropFilter: 'blur(3px)' }}  role="button" tabIndex={0} onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); e.currentTarget.click() } }} />
      <div ref={panelRef} tabIndex={-1} style={{
        position: 'relative', width: '100%', maxWidth: width, maxHeight: '88vh', overflowY: 'auto',
        background: 'var(--comp-card-bg, var(--bg2))', border: 'var(--comp-card-border, 1px solid var(--border))', borderRadius: 'var(--comp-card-radius, 14px)',
        boxShadow: 'var(--comp-card-shadow, 0 24px 60px rgba(0,0,0,0.55))', outline: 'none',
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
