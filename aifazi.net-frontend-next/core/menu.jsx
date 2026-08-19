/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  MENU SYSTEM — Context menus & dropdown menus.              ║
 * ║  One system for all menus. Theme-reactive.                  ║
 * ║                                                              ║
 * ║  Usage — Context menu (right-click):                        ║
 * ║    const { openContextMenu } = useMenu()                    ║
 * ║    onContextMenu={(e) => openContextMenu(e, items)}         ║
 * ║                                                              ║
 * ║  Usage — Dropdown:                                          ║
 * ║    <Dropdown trigger={<button>...</button>} items={[...]} />║
 * ║                                                              ║
 * ║  Item shape:                                                 ║
 * ║    { label, icon?, sublabel?, action?, variant?, shortcut? } ║
 * ║    { type: 'separator' }                                     ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react'
import { t, VARIANTS, zIndex } from './tokens'

const MenuContext = createContext(null)

export function useMenu() {
  const ctx = useContext(MenuContext)
  if (!ctx) throw new Error('useMenu must be used inside <MenuProvider>')
  return ctx
}

// Imperative context-menu singleton (for use outside React components)
const _ctxApi = { open: null, close: null }
export const contextMenu = {
  open:  (e, items, opts) => _ctxApi.open?.(e, items, opts),
  close: ()               => _ctxApi.close?.(),
}

// ── MenuPanel — the floating panel used by BOTH context menus and dropdowns ───
export function MenuPanel({ items = [], x, y, header, onClose, style = {}, menuStyle = 'cyber' }) {
  const [activeIdx, setActiveIdx] = useState(-1)
  const ref = useRef(null)

  // Keep panel inside viewport
  useEffect(() => {
    if (!ref.current) return
    const el  = ref.current
    const r   = el.getBoundingClientRect()
    const vw  = window.innerWidth
    const vh  = window.innerHeight
    if (r.right  > vw - 8) el.style.left = `${vw - r.width - 8}px`
    if (r.bottom > vh - 8) el.style.top  = `${vh - r.height - 8}px`
  }, [])

  const panelBase = (() => {
    switch(menuStyle) {
      case 'glass':    return { background: 'rgba(10,20,30,0.75)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, backdropFilter: 'blur(20px)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', padding: '6px 4px' }
      case 'terminal': return { background: '#060a06', border: '1px solid #00ff8844', borderRadius: 2, boxShadow: 'none', padding: '4px' }
      case 'minimal':  return { background: t.bg2, border: `1px solid ${t.border}`, borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', padding: '6px 4px' }
      case 'neon':     return { background: t.bg, border: '1px solid rgba(0,212,255,0.6)', borderRadius: 6, boxShadow: '0 0 20px rgba(0,212,255,0.25), 0 8px 32px rgba(0,0,0,0.5)', padding: '6px 4px' }
      case 'floating': return { background: t.bg2, border: 'none', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.6)', padding: '8px 6px' }
      case 'command':  return { background: '#070b12', border: '1px solid rgba(56,189,248,0.35)', borderRadius: 12, boxShadow: '0 18px 60px rgba(0,0,0,0.55)', padding: '8px 6px' }
      case 'rail':     return { background: '#08111c', border: '1px solid rgba(167,139,250,0.28)', borderRadius: 4, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', padding: '6px 4px' }
      case 'paper':    return { background: '#fbf5ea', border: '1px solid #d8c7b3', borderRadius: 2, boxShadow: '0 8px 24px rgba(40,25,10,0.22)', padding: '6px 4px' }
      case 'arcade':   return { background: '#06060a', border: '3px solid var(--cyan)', borderRadius: 0, boxShadow: '4px 4px 0 var(--purple)', padding: '5px 4px' }
      case 'holo':     return { background: 'rgba(8,20,32,0.72)', border: '1px solid rgba(0,229,255,0.45)', borderRadius: 14, backdropFilter: 'blur(22px)', boxShadow: '0 0 30px rgba(0,229,255,0.18), inset 0 0 24px rgba(0,229,255,0.08), 0 16px 48px rgba(0,0,0,0.55)', padding: '6px 4px' }
      case 'matrix':   return { background: '#020604', border: '1px solid #22ff2244', borderRadius: 0, boxShadow: '0 0 24px rgba(0,255,0,0.1), inset 0 0 32px rgba(0,255,0,0.04)', padding: '4px', backgroundImage: 'repeating-linear-gradient(90deg, rgba(0,255,0,0.03) 0 1px, transparent 1px 3px)' }
      default:         return { background: t.bg2, border: `var(--border-w, 1px) solid ${t.border}`, borderRadius: 'var(--radius, 8px)', padding: '6px 4px', boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,255,136,0.06)', backdropFilter: 'blur(12px)' }
    }
  })()

  return (
    <>
      <style>{`@keyframes menu-in { from { opacity:0; transform:scale(0.92) translateY(-6px); } to { opacity:1; transform:scale(1) translateY(0); } }`}</style>
      <div ref={ref} role="menu" aria-label={header || 'Menu'} style={{
        position: 'fixed', left: x, top: y, zIndex: zIndex.dropdown, minWidth: 210,
        transformOrigin: 'top left', animation: 'menu-in 0.13s cubic-bezier(0.22,1,0.36,1) both',
        ...panelBase, ...style,
      }} onMouseLeave={() => setActiveIdx(-1)}>
        {/* Optional header */}
        {header && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px 6px', borderBottom: `1px solid ${menuStyle === 'terminal' || menuStyle === 'matrix' ? '#00ff8833' : t.border}`, marginBottom: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: menuStyle === 'neon' ? 'var(--cyan)' : t.green, display: 'inline-block', boxShadow: menuStyle !== 'minimal' ? `0 0 6px ${t.green}` : 'none' }} />
            <span style={{ fontFamily: t.fontMono, fontSize: 9, letterSpacing: 2, color: menuStyle === 'terminal' || menuStyle === 'matrix' ? '#33ff33' : t.muted, textTransform: 'uppercase' }}>{header}</span>
          </div>
        )}
        {/* Items */}
        {items.map((item, i) => {
          if (item.type === 'separator') return <div key={i} style={{ height: 1, background: menuStyle === 'terminal' || menuStyle === 'matrix' ? '#00ff8822' : t.border, margin: '3px 8px' }} />
          const itemColor = item.variant ? (VARIANTS[item.variant]?.color || t.text) : (item.color || (menuStyle === 'terminal' || menuStyle === 'matrix' ? '#33ff33' : t.text))
          const isActive = activeIdx === i
          const hoverBg = menuStyle === 'neon' ? 'rgba(0,212,255,0.1)' : menuStyle === 'floating' ? 'rgba(255,255,255,0.08)' : menuStyle === 'holo' ? 'rgba(0,229,255,0.12)' : menuStyle === 'matrix' ? 'rgba(0,255,0,0.08)' : 'rgba(255,255,255,0.05)'
          return (
            <div key={item.id != null ? item.id : i} role="menuitem" tabIndex={item.disabled ? -1 : 0} aria-disabled={item.disabled}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', height: menuStyle === 'floating' ? 38 : 34, cursor: item.disabled ? 'not-allowed' : 'pointer', borderRadius: menuStyle === 'floating' ? 10 : 4, opacity: item.disabled ? 0.4 : 1, background: isActive ? hoverBg : 'transparent', transition: 'background 0.08s', userSelect: 'none' }}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => { if (item.disabled) return; item.action?.(); onClose?.() }}
              onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !item.disabled) { item.action?.(); onClose?.() } }}
            >
              {item.icon != null && <span style={{ width: 18, textAlign: 'center', fontSize: 13, flexShrink: 0, opacity: 0.85, color: itemColor }}>{item.icon}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: t.fontMono, fontSize: 11, letterSpacing: 0.5, color: isActive ? itemColor : (menuStyle === 'terminal' || menuStyle === 'matrix' ? '#a0d0a0' : t.text), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
                {item.sublabel && <div style={{ fontFamily: t.fontMono, fontSize: 9, color: t.muted, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.sublabel}</div>}
              </div>
              {item.shortcut && <span style={{ fontFamily: t.fontMono, fontSize: 9, color: t.muted, flexShrink: 0 }}>{item.shortcut}</span>}
              <span style={{ fontSize: 10, color: itemColor, flexShrink: 0, opacity: isActive ? 0.5 : 0, transition: 'opacity 0.1s' }}>›</span>
            </div>
          )
        })}
      </div>
    </>
  )
}
// ── MenuProvider ──────────────────────────────────────────────────────────────
export function MenuProvider({ children, menuStyle = 'cyber' }) {
  const [ctxMenu, setCtxMenu] = useState(null)
  const menuRef = useRef(null)

  const openContextMenu = useCallback((e, items, options = {}) => {
    e.preventDefault()
    const ITEM_H = 34, HEADER_H = 36, PAD = 12
    const menuH = items.filter(i => i.type !== 'separator').length * ITEM_H
      + items.filter(i => i.type === 'separator').length * 7
      + PAD + (options.header !== false ? HEADER_H : 0)
    const x = Math.min(e.clientX, window.innerWidth  - 218)
    const y = Math.min(e.clientY, window.innerHeight - menuH - 8)
    setCtxMenu({ x, y, items, options })
  }, [])

  const closeContextMenu = useCallback(() => setCtxMenu(null), [])

  // Register global imperative API
  useEffect(() => {
    _ctxApi.open  = openContextMenu
    _ctxApi.close = closeContextMenu
    return () => { _ctxApi.open = null; _ctxApi.close = null }
  }, [openContextMenu, closeContextMenu])

  // Close on outside click / escape / scroll
  useEffect(() => {
    if (!ctxMenu) return
    const down   = e => { if (menuRef.current && !menuRef.current.contains(e.target)) closeContextMenu() }
    const key    = e => { if (e.key === 'Escape') closeContextMenu() }
    const scroll = () => closeContextMenu()
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', scroll, { passive: true })
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', scroll)
    }
  }, [ctxMenu, closeContextMenu])

  return (
    <MenuContext.Provider value={{ openContextMenu, closeContextMenu }}>
      {children}
      {ctxMenu && (
        <div ref={menuRef}>
          <MenuPanel
            items={ctxMenu.items}
            x={ctxMenu.x}
            y={ctxMenu.y}
            header={ctxMenu.options?.header ?? 'T.TANVIR · TOOLS'}
            onClose={closeContextMenu}
            menuStyle={menuStyle}
          />
        </div>
      )}
    </MenuContext.Provider>
  )
}

// ── Dropdown — attach a menu panel to a trigger element ──────────────────────
// Usage: <Dropdown trigger={<button>Options</button>} items={[...]} />
export function Dropdown({ trigger, items = [], placement = 'bottom-left', header }) {
  const [open, setOpen] = useState(false)
  const [pos,  setPos]  = useState({ x: 0, y: 0 })
  const triggerRef = useRef(null)
  const panelRef   = useRef(null)

  const openDropdown = useCallback((e) => {
    e.stopPropagation()
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const positions = {
      'bottom-left':  { x: r.left,        y: r.bottom + 4 },
      'bottom-right': { x: r.right - 210, y: r.bottom + 4 },
      'top-left':     { x: r.left,        y: r.top - 4 },
    }
    setPos(positions[placement] || positions['bottom-left'])
    setOpen(v => !v)
  }, [placement])

  useEffect(() => {
    if (!open) return
    const down = e => {
      const inTrigger = triggerRef.current?.contains(e.target)
      const inPanel   = panelRef.current?.contains(e.target)
      if (!inTrigger && !inPanel) setOpen(false)
    }
    const key = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <>
      <div ref={triggerRef} onClick={openDropdown} style={{ display: 'inline-block' }}>
        {trigger}
      </div>
      {open && (
        <div ref={panelRef}>
          <MenuPanel
            items={items}
            x={pos.x}
            y={pos.y}
            header={header}
            onClose={() => setOpen(false)}
          />
        </div>
      )}
    </>
  )
}
