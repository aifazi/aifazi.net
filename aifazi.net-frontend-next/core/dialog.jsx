/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  DIALOG SYSTEM — Confirmations, alerts, prompts.            ║
 * ║  Replaces Dialog.jsx. Provides:                             ║
 * ║    1. React hook   — const { confirm, prompt } = useDialog()║
 * ║    2. Imperative   — await dialog.confirm({ title: '...' }) ║
 * ║                      await dialog.prompt({ title: 'URL:' }) ║
 * ║                                                              ║
 * ║  confirm/alert → Promise<boolean>                           ║
 * ║  prompt        → Promise<string|null> (null = cancelled)    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react'
import { t, VARIANTS, zIndex } from './tokens'
import { reveal } from './animations'

const DialogContext = createContext(null)

export function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>')
  return ctx
}

// Imperative singleton — populated when DialogProvider mounts
const _api = { confirm: null, alert: null, prompt: null }
export const dialog = {
  confirm: (opts) => _api.confirm?.(opts) ?? Promise.resolve(false),
  alert:   (opts) => _api.alert?.(opts)   ?? Promise.resolve(),
  prompt:  (opts) => _api.prompt?.(opts)  ?? Promise.resolve(null),
}

// ── Dialog modal ──────────────────────────────────────────────────────────────
function DialogModal({ entry, onResolve, dialogStyle = 'cyber' }) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [inputVal, setInputVal] = useState(entry.defaultValue || '')
  const confirmRef = useRef(null)
  const inputRef   = useRef(null)
  const panelRef   = useRef(null)
  const isAlert    = entry.type === 'alert'
  const isPrompt   = entry.type === 'prompt'
  const variant    = entry.variant || (isPrompt ? 'info' : 'danger')
  const v = VARIANTS[variant] || VARIANTS.danger
  const titleId    = `dlg-title-${entry.id}`

  const resolve = useCallback((value) => {
    setLeaving(true)
    setTimeout(() => onResolve(value), 300)
  }, [onResolve])

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    // Focus input for prompts, confirm button otherwise; remember where we came
    // from so we can restore focus when the dialog closes.
    const previouslyFocused = document.activeElement
    setTimeout(() => {
      if (isPrompt) inputRef.current?.focus()
      else confirmRef.current?.focus()
    }, 100)
    const onKey = e => {
      if (e.key === 'Escape') resolve(isPrompt ? null : false)
      if (e.key === 'Enter' && !isPrompt) resolve(true)
      // Focus trap: keep Tab / Shift+Tab cycling inside the dialog.
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || active === panelRef.current)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      // Restore focus to the element that opened the dialog.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus()
      }
    }
  }, [])

  const handlePromptSubmit = () => {
    const val = inputVal.trim()
    resolve(val.length > 0 ? val : null)
  }

  const isSheet    = dialogStyle === 'sheet'
  const isTerminal = dialogStyle === 'terminal'
  const isGlass    = dialogStyle === 'glass'
  const isMinimal  = dialogStyle === 'minimal'
  const isBrutal   = dialogStyle === 'brutal'
  const isCommand  = dialogStyle === 'command'
  const isSplit    = dialogStyle === 'split'
  const isDrawer   = dialogStyle === 'drawer'
  const isPaper    = dialogStyle === 'paper'
  const isHolo     = dialogStyle === 'holo'
  const isCrt      = dialogStyle === 'crt'

  const panelStyle = (() => {
    const base = { width: '100%', maxWidth: 420, position: 'relative', overflow: 'hidden', pointerEvents: 'auto' }
    const anim = reveal(visible, leaving, { dir: isSheet ? 'down' : 'scale' })
    if (isSheet)    return { ...base, ...anim, background: t.bg2, borderRadius: '16px 16px 0 0', border: `1px solid ${t.border}`, position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: '100%', width: '100%' }
    if (isTerminal) return { ...base, ...anim, background: '#0a0f0a', border: `1px solid ${v.color}`, borderRadius: 6, boxShadow: `0 0 40px ${v.glow}, 0 0 80px rgba(0,0,0,0.8)` }
    if (isGlass)    return { ...base, ...anim, background: 'rgba(10,20,30,0.8)', border: `1px solid ${v.color}44`, borderRadius: 14, backdropFilter: 'blur(24px)', boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 1px ${v.color}55` }
    if (isMinimal)  return { ...base, ...anim, background: t.bg2, border: `1px solid ${t.border}`, borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }
    if (isBrutal)   return { ...base, ...anim, background: t.bg, border: `4px solid ${v.color}`, borderRadius: 0, boxShadow: `6px 6px 0 ${v.color}` }
    if (isCommand)  return { ...base, ...anim, background: '#070b12', border: '1px solid rgba(56,189,248,0.38)', borderRadius: 14, boxShadow: '0 24px 80px rgba(0,0,0,0.65)' }
    if (isSplit)    return { ...base, ...anim, background: t.bg2, border: `1px solid ${t.border}`, borderRadius: 10, boxShadow: '0 20px 60px rgba(0,0,0,0.55)' }
    if (isDrawer)   return { ...base, ...anim, background: t.bg2, border: `1px solid ${t.border}`, borderRadius: '14px 0 0 14px', position: 'fixed', top: 0, right: 0, bottom: 0, maxWidth: 420, height: '100%', boxShadow: '-20px 0 70px rgba(0,0,0,0.55)' }
    if (isPaper)    return { ...base, ...anim, background: '#fbf5ea', color: '#1f2937', border: '1px solid #d8c7b3', borderRadius: 2, boxShadow: '0 18px 50px rgba(40,25,10,0.26)' }
    if (isHolo)     return { ...base, ...anim, background: 'rgba(8,20,32,0.8)', border: '1px solid rgba(0,229,255,0.45)', borderRadius: 16, backdropFilter: 'blur(24px)', boxShadow: '0 0 40px rgba(0,229,255,0.18), inset 0 0 32px rgba(0,229,255,0.06), 0 12px 48px rgba(0,0,0,0.6)' }
    if (isCrt)      return { ...base, ...anim, background: '#020604', border: `1px solid ${v.color}66`, borderRadius: 4, boxShadow: `0 0 30px ${v.glow}, 0 0 60px rgba(0,0,0,0.8)` }
    return { ...base, ...anim, background: t.bg2, border: `1px solid ${v.color}`, boxShadow: `0 0 40px ${v.glow}, 0 0 80px rgba(0,0,0,0.8)` } // cyber
  })()

  const backdropStyle = {
    position: 'fixed', inset: 0, zIndex: zIndex.overlay,
    background: isSheet ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.75)',
    backdropFilter: isGlass ? 'blur(6px)' : 'blur(4px)',
    opacity: visible && !leaving ? 1 : 0,
    transition: 'opacity 0.3s ease',
  }

  return (
    <>
      <style>{`@keyframes dlg-crt-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
      <div onClick={() => resolve(isPrompt ? null : false)} role="presentation" style={backdropStyle} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={entry.message ? `${titleId}-desc` : undefined} style={{
        position: 'fixed', inset: 0, zIndex: zIndex.modal,
        display: 'flex', alignItems: isSheet ? 'flex-end' : 'center', justifyContent: isDrawer ? 'flex-end' : 'center',
        padding: isSheet ? 0 : 24, pointerEvents: 'none',
      }}>
        <div ref={panelRef} style={panelStyle}>
          {/* Terminal: title bar with traffic dots */}
          {isTerminal && (
            <div style={{ background: 'rgba(0,255,136,0.08)', borderBottom: `1px solid ${v.color}44`, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 7 }}>
              {['#ff5f56','#ffbd2e','#27c93f'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
              <span style={{ fontFamily: t.fontMono, fontSize: 9, color: 'var(--muted)', letterSpacing: 3, marginLeft: 8 }}>DIALOG.SH</span>
            </div>
          )}
          {/* CRT: scanline overlay + green status bar */}
          {isCrt && (
            <>
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.25) 2px,rgba(0,0,0,0.25) 4px)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderBottom: `1px solid ${v.color}33`, fontFamily: t.fontMono, fontSize: 9, color: v.color, letterSpacing: 2 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: v.color, boxShadow: `0 0 6px ${v.color}`, animation: 'dlg-crt-blink 1.2s steps(2) infinite' }} />
                <span>PHOSPHOR.DIALOG</span>
              </div>
            </>
          )}
          {/* Sheet: top handle */}
          {isSheet && <div style={{ width: 36, height: 4, borderRadius: 4, background: 'var(--muted)', margin: '10px auto 0', opacity: 0.4 }} />}
          {/* Cyber: top accent bar + corner accents */}
          {(!isTerminal && !isSheet && !isMinimal && !isBrutal && !isGlass && !isCrt) && (
            <>
              <div style={{ height: 3, background: `linear-gradient(90deg, ${v.color}, transparent)`, boxShadow: `0 0 12px ${v.color}` }} />
              {[{ top: 8, right: 8, borderTop: `1px solid ${v.color}`, borderRight: `1px solid ${v.color}` }, { bottom: 8, left: 8, borderBottom: `1px solid ${v.color}`, borderLeft: `1px solid ${v.color}` }].map((s, i) => (
                <div key={i} style={{ position: 'absolute', width: 12, height: 12, opacity: 0.6, ...s }} />
              ))}
            </>
          )}
          {/* Holo: corner brackets on all four corners */}
          {isHolo && (
            <>
              {[{ top: 10, left: 10, borderTop: '1px solid rgba(0,229,255,0.5)', borderLeft: '1px solid rgba(0,229,255,0.5)' },
                { top: 10, right: 10, borderTop: '1px solid rgba(0,229,255,0.5)', borderRight: '1px solid rgba(0,229,255,0.5)' },
                { bottom: 10, left: 10, borderBottom: '1px solid rgba(0,229,255,0.5)', borderLeft: '1px solid rgba(0,229,255,0.5)' },
                { bottom: 10, right: 10, borderBottom: '1px solid rgba(0,229,255,0.5)', borderRight: '1px solid rgba(0,229,255,0.5)' }].map((s, i) => (
                <div key={i} style={{ position: 'absolute', width: 14, height: 14, opacity: 0.7, ...s }} />
              ))}
            </>
          )}
          {/* Content */}
          <div style={{ padding: isSheet ? '16px 28px 32px' : '28px 32px 24px' }}>
            <div style={{ fontFamily: t.fontMono, fontSize: 9, letterSpacing: 3, color: v.color, marginBottom: 14, textTransform: 'uppercase' }}>{v.icon} {v.label}</div>
            <h2 id={titleId} style={{ fontFamily: t.fontDisplay, fontSize: isBrutal ? 26 : 22, fontWeight: isBrutal ? 900 : 700, color: isCrt ? '#33ff33' : t.text, marginBottom: entry.message || isPrompt ? 10 : 0, lineHeight: 1.2, textTransform: isBrutal ? 'uppercase' : 'none' }}>
              {entry.title || (isPrompt ? 'Enter a value' : 'Are you sure?')}
            </h2>
            {entry.message && <p id={`${titleId}-desc`} style={{ fontFamily: t.fontDisplay, fontSize: 15, color: isCrt ? 'rgba(51,255,51,0.75)' : t.muted, lineHeight: 1.6, marginBottom: isPrompt ? 14 : 0 }}>{entry.message}</p>}
            {isPrompt && (
              <input ref={inputRef} value={inputVal} onChange={e => setInputVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handlePromptSubmit() } }}
                placeholder={entry.placeholder || ''}
                style={{ width: '100%', boxSizing: 'border-box', background: t.bg3, border: `1px solid ${v.color}44`, color: isCrt ? '#33ff33' : t.text, fontFamily: t.fontMono, fontSize: 13, padding: '10px 14px', outline: 'none', borderRadius: isMinimal ? 6 : 0 }}
                onFocus={e => { e.currentTarget.style.borderColor = v.color }}
                onBlur={e => { e.currentTarget.style.borderColor = `${v.color}44` }}
              />
            )}
          </div>
          {/* Action buttons */}
          <div style={{ display: 'flex', borderTop: `${isBrutal ? 4 : 1}px solid ${isBrutal ? v.color : t.border}` }}>
            {!isAlert && (
              <button onClick={() => resolve(isPrompt ? null : false)} style={{ flex: 1, padding: '14px 20px', background: 'transparent', border: 'none', borderRight: `1px solid ${t.border}`, fontFamily: t.fontMono, fontSize: 11, letterSpacing: 2, color: t.muted, cursor: 'pointer', transition: 'background 0.2s, color 0.2s', fontWeight: isBrutal ? 700 : 400 }}
                onMouseEnter={e => { e.currentTarget.style.background = t.bg3; e.currentTarget.style.color = t.text }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = t.muted }}
              >{entry.cancelLabel || 'CANCEL'}</button>
            )}
            <button ref={confirmRef} onClick={() => isPrompt ? handlePromptSubmit() : resolve(true)} style={{ flex: 1, padding: '14px 20px', background: `${v.color}18`, border: 'none', fontFamily: t.fontMono, fontSize: 11, letterSpacing: 2, color: v.color, cursor: 'pointer', fontWeight: 700, transition: 'background 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = `${v.color}30` }}
              onMouseLeave={e => { e.currentTarget.style.background = `${v.color}18` }}
            >{isAlert ? 'OK' : (entry.confirmLabel || (isPrompt ? 'OK' : 'CONFIRM'))}</button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── DialogProvider ────────────────────────────────────────────────────────────
export function DialogProvider({ children, dialogStyle = 'cyber' }) {
  const [entries, setEntries] = useState([])

  const open = useCallback((options) => {
    return new Promise(resolve => {
      const id = Date.now() + Math.random()
      const entry = typeof options === 'string'
        ? { id, title: options, resolve }
        : { id, ...options, resolve }
      setEntries(prev => [...prev, entry])
    })
  }, [])

  const confirm = useCallback((opts) => open(opts), [open])

  const alert = useCallback((opts) => open(
    typeof opts === 'string'
      ? { title: opts, type: 'alert', variant: 'info' }
      : { type: 'alert', variant: 'info', ...opts }
  ), [open])

  const prompt = useCallback((opts) => open(
    typeof opts === 'string'
      ? { title: opts, type: 'prompt', variant: 'info' }
      : { type: 'prompt', variant: 'info', ...opts }
  ), [open])

  const handleResolve = useCallback((id, value) => {
    setEntries(prev => {
      const entry = prev.find(x => x.id === id)
      entry?.resolve(value)
      return prev.filter(x => x.id !== id)
    })
  }, [])

  useEffect(() => {
    _api.confirm = confirm
    _api.alert   = alert
    _api.prompt  = prompt
    return () => { _api.confirm = null; _api.alert = null; _api.prompt = null }
  }, [confirm, alert, prompt])

  return (
    <DialogContext.Provider value={{ confirm, alert, prompt }}>
      {children}
      {entries.map(entry => (
        <DialogModal key={entry.id} entry={entry} onResolve={v => handleResolve(entry.id, v)} dialogStyle={dialogStyle} />
      ))}
    </DialogContext.Provider>
  )
}
