'use client'
import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Link, useLocation } from '@/lib/router-compat'
import { useEdit } from '../context/EditContext'
import { STORE_URL, FIVEM_URL } from '@/lib/config'
// Lazy-load the ~113KB theme drawer — it only renders when opened.
const ThemePicker = dynamic(() => import('./ThemePicker'), { ssr: false })
import { canEdit } from '@/lib/api'

const NAV_ITEMS = [
  { icon: '⬡', label: 'Projects',  desc: 'View my work',       href: '#projects', color: '#00ff88' },
  { icon: '◈', label: 'Skills',    desc: 'Technical expertise', href: '#skills',   color: '#00d4ff' },
  { icon: '✉', label: 'Contact',   desc: 'Get in touch',        href: '#contact',  color: '#00ff88' },
  { icon: '◉', label: 'Forum',     desc: 'Community',           href: '/forum',    isRoute: true, color: '#00d4ff' },
  { icon: '◇', label: 'Blog',      desc: 'Articles',            href: '/blog',     isRoute: true, color: '#00ff88' },
  { icon: '👑', label: 'Store',    desc: 'VIP subscriptions',   href: STORE_URL, color: '#ffd700' },
  { icon: '🎮', label: 'FiveM',    desc: 'Game server',         href: FIVEM_URL, color: '#00ff88' },
]

function NavItem({ item, expanded, onHover, onLeave, delay }) {
  const { icon, label, desc, href, isRoute, color } = item
  const btnStyle = {
    display: 'flex', alignItems: 'center', gap: 0, background: 'var(--bg)',
    border: `1px solid ${expanded ? color + '60' : 'var(--border)'}`, borderRadius: 24,
    padding: 0, height: 40, cursor: 'pointer', textDecoration: 'none',
    transition: 'all 0.25s cubic-bezier(0.25, 1, 0.5, 1)', overflow: 'hidden',
    boxShadow: expanded ? `0 4px 20px ${color}20, 0 0 0 1px ${color}15` : '0 2px 10px rgba(0,0,0,0.25)',
    whiteSpace: 'nowrap', animation: `floatNavItemIn 0.3s ease-out ${delay}s both`,
  }
  const iconStyle = {
    width: 40, height: 40, flexShrink: 0, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 15, color, transition: 'all 0.25s',
  }
  const labelArea = expanded ? (
    <div style={{ paddingRight: 14, display: 'flex', flexDirection: 'column', animation: 'floatNavFadeIn 0.2s ease-out' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--text)', letterSpacing: 1 }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>{desc}</span>
    </div>
  ) : null
  const inner = <><span style={iconStyle}>{icon}</span>{labelArea}</>
  const events = { onMouseEnter: onHover, onMouseLeave: onLeave }
  if (isRoute) return <Link to={href} style={btnStyle} {...events}>{inner}</Link>
  return <a href={href} style={btnStyle} {...events}>{inner}</a>
}

export default function FloatingNav() {
  const location = useLocation()
  const editCtx  = useEdit()

  // Hide only on the admin console (it has its own chrome); the inline edit
  // entry is available on every public page, including fullscreen routes.
  const isFullScreen = /^\/(admin)/.test(location.pathname)

  const [hoveredIdx, setHoveredIdx] = useState(-1)
  // Hydration-safe: start hidden on both server and client; the scroll effect
  // below syncs the real value immediately after mount. Reading window.scrollY
  // here would render different trees on server vs client and break hydration.
  const [visible, setVisible]       = useState(false)
  const [expanded, setExpanded]     = useState(false)
  const [themePickerOpen, setThemePickerOpen] = useState(false)

  // Check if user can edit (admin/editor role or content.pages permission) —
  // consistent with EditContext. Reads the cached effective role so it works
  // even before the in-memory token is refilled after a page reload.
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    const check = () => setIsAdmin(canEdit())
    check()
    window.addEventListener('auth-change', check)
    window.addEventListener('storage', check)
    return () => { window.removeEventListener('auth-change', check); window.removeEventListener('storage', check) }
  }, [])

  // Reset nav state when entering/leaving full-screen routes
  const [prevFullScreen, setPrevFullScreen] = useState(isFullScreen)
  if (prevFullScreen !== isFullScreen) {
    setPrevFullScreen(isFullScreen)
    if (isFullScreen) {
      setVisible(false); setExpanded(false)
    } else if (typeof window !== 'undefined') {
      setVisible(window.scrollY > 200)
    }
  }

  useEffect(() => {
    const onScroll = () => setVisible(!isFullScreen && window.scrollY > 200)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [isFullScreen])

  useEffect(() => {
    if (!expanded) return
    const onScroll = () => setExpanded(false)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [expanded])

  if (!visible) return null

  return (
    <>
    <div style={{ position: 'fixed', right: 20, bottom: 'max(32px, calc(32px + env(safe-area-inset-bottom, 0px)))',
      display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, zIndex: 1000 }}
      className="floating-nav floating-nav-container" aria-label="Quick navigation">

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, marginBottom: 6 }}>
          {NAV_ITEMS.map((item, i) => (
            <NavItem key={item.label} item={item}
              expanded={hoveredIdx === i}
              onHover={() => setHoveredIdx(i)}
              onLeave={() => setHoveredIdx(-1)}
              delay={i * 0.04}
            />
          ))}

          {/* Themes */}
          <button
            onClick={() => { setThemePickerOpen(true); setExpanded(false) }}
            onMouseEnter={() => setHoveredIdx(998)} onMouseLeave={() => setHoveredIdx(-1)}
            style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--bg)',
              border: `1px solid ${hoveredIdx === 998 ? 'rgba(168,85,247,0.6)' : 'var(--border)'}`,
              borderRadius: 24, padding: 0, height: 40, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap',
              transition: 'all 0.25s cubic-bezier(0.25,1,0.5,1)',
              boxShadow: hoveredIdx === 998 ? '0 4px 20px rgba(168,85,247,0.2)' : '0 2px 10px rgba(0,0,0,0.25)',
              animation: `floatNavItemIn 0.3s ease-out ${NAV_ITEMS.length * 0.04}s both`,
            }}
          >
            <span style={{ width: 40, height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
                <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
              </svg>
            </span>
            {hoveredIdx === 998 && (
              <div style={{ paddingRight: 14, animation: 'floatNavFadeIn 0.2s ease-out' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--text)', letterSpacing: 1 }}>Themes</span>
                <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>Theme library</span>
              </div>
            )}
          </button>

          {/* Edit Site — admin only */}
          {isAdmin && (
            <button
              onClick={() => { if (editCtx?.editingEnabled) editCtx.requestFinish(); else editCtx?.startEditing(); setExpanded(false) }}
              onMouseEnter={() => setHoveredIdx(999)} onMouseLeave={() => setHoveredIdx(-1)}
              style={{ display: 'flex', alignItems: 'center', gap: 0,
                background: editCtx?.editingEnabled ? 'color-mix(in srgb, var(--green) 12%, transparent)' : 'var(--bg)',
                border: `1px solid ${hoveredIdx === 999 ? (editCtx?.editingEnabled ? 'color-mix(in srgb, var(--green) 80%, transparent)' : 'color-mix(in srgb, var(--cyan) 60%, transparent)') : (editCtx?.editingEnabled ? 'color-mix(in srgb, var(--green) 50%, transparent)' : 'var(--border)')}`,
                borderRadius: 24, padding: 0, height: 40, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap',
                transition: 'all 0.25s cubic-bezier(0.25,1,0.5,1)',
                boxShadow: editCtx?.editingEnabled ? '0 4px 20px color-mix(in srgb, var(--green) 20%, transparent)' : '0 2px 10px rgba(0,0,0,0.25)',
                animation: `floatNavItemIn 0.3s ease-out ${(NAV_ITEMS.length + 1) * 0.04}s both`,
              }}
            >
              <span style={{ width: 40, height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: editCtx?.editingEnabled ? 'var(--green)' : 'var(--cyan)' }}>
                {editCtx?.editingEnabled ? '💾' : '✎'}
              </span>
              {hoveredIdx === 999 && (
                <div style={{ paddingRight: 14, animation: 'floatNavFadeIn 0.2s ease-out' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: editCtx?.editingEnabled ? 'var(--green)' : 'var(--text)', letterSpacing: 1 }}>
                    {editCtx?.editingEnabled ? `Done${Object.keys(editCtx.pendingChanges||{}).length > 0 ? ` (${Object.keys(editCtx.pendingChanges).length})` : ''}` : 'Edit Site'}
                  </span>
                  <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 1 }}>
                    {editCtx?.editingEnabled ? 'Save changes' : 'Admin edit mode'}
                  </span>
                </div>
              )}
            </button>
          )}
        </div>
      )}

      {/* Trigger button */}
      <button onClick={() => setExpanded(e => !e)}
        aria-label={expanded ? 'Close navigation' : 'Quick navigation'}
        style={{ width: 46, height: 46, borderRadius: '50%',
          background: expanded ? 'var(--green)' : 'var(--bg)',
          border: `1px solid ${expanded ? 'var(--green)' : 'var(--border)'}`, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: expanded ? '0 4px 24px color-mix(in srgb, var(--green) 30%, transparent)' : '0 4px 18px rgba(0,0,0,0.25)',
          transition: 'all 0.25s cubic-bezier(0.25,1,0.5,1)', animation: 'floatNavSlideIn 0.4s ease-out', outline: 'none' }}
        onMouseEnter={e => { if (!expanded) { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.boxShadow = '0 4px 24px color-mix(in srgb, var(--green) 20%, transparent)' } }}
        onMouseLeave={e => { if (!expanded) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = '0 4px 18px rgba(0,0,0,0.25)' } }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke={expanded ? '#000' : 'var(--green)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transition: 'transform 0.3s ease', transform: expanded ? 'rotate(45deg)' : 'rotate(0deg)' }}>
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <style>{`
        @keyframes floatNavSlideIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes floatNavFadeIn  { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:translateX(0)} }
        @keyframes floatNavItemIn  { from{opacity:0;transform:translateX(12px) scale(0.9)} to{opacity:1;transform:translateX(0) scale(1)} }
        /* mobile adapt handled by globals.css */`}</style>
    </div>

    <ThemePicker open={themePickerOpen} onClose={() => setThemePickerOpen(false)} />
  </>
  )
}
