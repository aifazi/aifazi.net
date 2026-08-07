'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Link, useLocation, useNavigate } from '@/lib/router-compat'
import { useForum } from '../context/ForumContext'
import { useTheme } from '@/app/providers'
import CommandPalette from './CommandPalette'
import Terminal from './Terminal'
// ThemePicker is ~113KB (theme catalog + admin global panel). It only matters
// when the drawer opens, so load it lazily instead of shipping it to every
// visitor on every page.
const ThemePicker = dynamic(() => import('./ThemePicker'), { ssr: false })
import api from '@/lib/api'
import NotificationBell from './NotificationBell'
import { getUsername, getRole, getAuthToken } from '@/lib/api'
import { getSiteSettings } from '@/lib/siteSettings'
import { isFiveMHost, fivemRoute, useFiveMRoute, useFiveMLoginRoute } from '@/lib/fivemRoutes'

// ── Theme Toggle — animated pill slider ───────────────────────────────────────
function ThemeToggle({ theme, onToggle }) {
  const LIGHT_IDS = new Set([
    'light','cyber-light',
    'midnight-light','crimson-light','ocean-light','amber-light',
    'rose-light','forest-light','glass-light','synthwave-light',
    'terminal-light','neon-noir-light','aurora-light',
    'brutalist','paper','neumorph','macos','pastel','win95',
    'lava-light','toxic-light',
    'mario-light','minecraft-light','sonic-light','pacman-light',
  ])
  const isDark = !LIGHT_IDS.has(theme)

  return (
    <>
      <style>{`
        .theme-pill {
          position: relative; width: 58px; height: 30px;
          border-radius: 15px; cursor: pointer; outline: none; flex-shrink: 0;
          background: transparent;
          border: 1.5px solid var(--border);
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
          overflow: hidden;
          padding: 0;
        }
        .theme-pill-bg {
          position: absolute; inset: 0; border-radius: 13px;
          background: var(--bg3);
          transition: background 0.4s ease;
        }
        .theme-pill:hover {
          border-color: var(--green);
          box-shadow: 0 0 10px color-mix(in srgb, var(--green) 20%, transparent), inset 0 0 8px color-mix(in srgb, var(--green) 4%, transparent);
        }
        [data-theme="light"] .theme-pill:hover {
          border-color: var(--cyan);
          box-shadow: 0 0 10px rgba(0,93,143,0.2), inset 0 0 8px rgba(0,93,143,0.04);
        }
        .theme-pill-icons {
          position: absolute; inset: 0;
          display: flex; align-items: center;
          justify-content: space-between; padding: 0 7px;
          pointer-events: none;
        }
        .theme-pill-knob {
          position: absolute; top: 3px;
          width: 22px; height: 22px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          transition: left 0.38s cubic-bezier(0.34, 1.4, 0.64, 1),
                      background 0.35s ease, box-shadow 0.35s ease;
          pointer-events: none;
          z-index: 2;
        }
        .theme-pill-knob svg {
          position: absolute;
          transition: transform 0.42s cubic-bezier(0.34,1.4,0.64,1), opacity 0.22s ease;
        }
        /* Pop animation replays on every toggle (knob is remounted via key) */
        .theme-pill-knob.pop {
          animation: theme-knob-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes theme-knob-pop {
          0%   { transform: scale(0.55) rotate(-35deg); }
          55%  { transform: scale(1.28) rotate(10deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .theme-pill-knob.pop { animation: none; }
        }
      `}</style>

      <button
        className="theme-pill"
        onClick={onToggle}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Light mode' : 'Dark mode'}
      >
        <div className="theme-pill-bg" />

        {/* Static track icons */}
        <div className="theme-pill-icons">
          {/* Moon on left */}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke={isDark ? 'var(--green)' : 'var(--muted)'}
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ opacity: isDark ? 0.85 : 0.25, transition: 'opacity 0.3s, stroke 0.3s' }}>
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          {/* Sun on right */}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke={isDark ? 'var(--muted)' : '#d48800'}
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ opacity: isDark ? 0.25 : 0.9, transition: 'opacity 0.3s, stroke 0.3s' }}>
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        </div>

        {/* Sliding knob — remounted on each toggle so the pop animation replays */}
        <div key={isDark ? 'dark' : 'light'} className="theme-pill-knob pop" style={{
          left: isDark ? '2px' : '32px',
          background: isDark ? 'color-mix(in srgb, var(--green) 15%, transparent)' : 'rgba(212,136,0,0.15)',
          boxShadow: isDark
            ? '0 0 8px color-mix(in srgb, var(--green) 35%, transparent), inset 0 0 0 1px color-mix(in srgb, var(--green) 40%, transparent)'
            : '0 0 8px rgba(212,136,0,0.35), inset 0 0 0 1px rgba(212,136,0,0.4)',
        }}>
          {/* Moon in knob (dark mode) */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{
              transform: isDark ? 'rotate(0deg) scale(1)' : 'rotate(-90deg) scale(0)',
              opacity: isDark ? 1 : 0,
            }}>
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
          {/* Sun in knob (light mode) */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="#d48800" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{
              transform: isDark ? 'rotate(90deg) scale(0)' : 'rotate(0deg) scale(1)',
              opacity: isDark ? 0 : 1,
            }}>
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        </div>
      </button>
    </>
  )
}

export default function Navbar() {
  const [scrolled, setScrolled]             = useState(false)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [activeSection, setActiveSection]   = useState('')
  const [menuOpen, setMenuOpen]             = useState(false)
  const [terminalOpen, setTerminalOpen]     = useState(false)
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const [toolsOpen, setToolsOpen]           = useState(false)
  const [headerStyle, setHeaderStyle]       = useState('cyber')
  const [isMobileNav, setIsMobileNav]       = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user: forumUser, logout: forumLogout } = useForum()
  const { theme, toggleTheme, siteConfig } = useTheme()
  const isThemeLocked = !!(siteConfig?.lockTheme && siteConfig?.globalTheme)

  // ── FiveM awareness ─────────────────────────────────────────────────────
  // Active on /fivem/* routes and the fivem.aifazi.net host — swaps the
  // portfolio nav links / branding for FiveM-specific ones while keeping the
  // shared header shell, theme, and auth controls.
  const [isFiveMHostState, setIsFiveMHostState] = useState(() => {
    if (typeof document !== 'undefined') return document.documentElement.dataset.fivem === 'true' || isFiveMHost()
    return false
  })
  const isFiveM = location.pathname.startsWith('/fivem') || isFiveMHostState

  // Host-aware FiveM routes (bare path on fivem.aifazi.net, /fivem/x otherwise)
  const fiveMHomeRoute      = fivemRoute('/')            // always the FiveM landing
  const fiveMConnectRoute   = useFiveMRoute('/connect')
  const fiveMWhitelistRoute = useFiveMRoute('/whitelist')
  const fiveMStatusRoute    = useFiveMRoute('/status')
  const fiveMProfileRoute   = useFiveMRoute('/profile')
  const fiveMStoreRoute     = useFiveMRoute('/store')
  const fiveMRulesRoute     = useFiveMRoute('/rules')
  const fiveMGuidesRoute    = useFiveMRoute('/guides')
  const fiveMLoginRoute     = useFiveMLoginRoute('/connect')
  const loginRoute          = isFiveM ? fiveMLoginRoute : '/login'
  const registerRoute       = isFiveM
    ? `/login?tab=register&next=${encodeURIComponent(fivemRoute('/connect'))}`
    : '/login?tab=register'
  const profileRoute        = isFiveM ? fiveMProfileRoute : '/profile'

  // Load header style from site settings (user package override wins for this browser)
  useEffect(() => {
    const pkgOverride = () => {
      try {
        const raw = localStorage.getItem('user-package')
        if (raw) {
          const pkg = JSON.parse(raw)
          if (pkg?.settings?.headerStyle) return pkg.settings.headerStyle
        }
      } catch {}
      return null
    }
    getSiteSettings().then(s => { if (s.headerStyle) setHeaderStyle(pkgOverride() || s.headerStyle) }).catch(() => {})
    const onUpdate = (e) => {
      if (e.detail?.headerStyle) setHeaderStyle(pkgOverride() || e.detail.headerStyle)
    }
    const onUserPkg = (e) => {
      // Re-read localStorage so a cleared package (empty settings event)
      // reverts to the site default instead of staying stuck on the package style.
      const fromPkg = pkgOverride()
      const fromEvent = e.detail?.settings?.headerStyle
      if (fromPkg || fromEvent) { setHeaderStyle(fromPkg || fromEvent); return }
      getSiteSettings().then(s => { if (s.headerStyle) setHeaderStyle(s.headerStyle) }).catch(() => {})
    }
    window.addEventListener('site-settings-updated', onUpdate)
    window.addEventListener('user-package-updated', onUserPkg)
    return () => {
      window.removeEventListener('site-settings-updated', onUpdate)
      window.removeEventListener('user-package-updated', onUserPkg)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 1100px)')
    const update = () => setIsMobileNav(mq.matches || window.innerWidth <= 1100)
    update()
    mq.addEventListener?.('change', update)
    window.addEventListener('resize', update, { passive: true })
    window.addEventListener('orientationchange', update)
    return () => {
      mq.removeEventListener?.('change', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  // Derived style values per headerStyle ─────────────────────────────────────
  const HS = {
    cyber:       { bg: 'var(--nav-bg-scrolled)', accent: 'var(--green)', secondary: 'var(--cyan)',  logoColor: 'var(--text)',  linkColor: 'var(--muted)', activeLinkColor: 'var(--green)', borderColor: 'var(--border)', progressGrad: 'linear-gradient(to right, var(--green), var(--cyan))' },
    glass:       { bg: 'var(--nav-bg-scrolled)', accent: 'var(--green)', secondary: 'var(--cyan)',  logoColor: 'var(--text)',  linkColor: 'var(--muted)', activeLinkColor: 'var(--green)', borderColor: 'var(--border)', progressGrad: 'linear-gradient(to right, var(--green), var(--cyan))' },
    editorial:   { bg: 'var(--bg2)',             accent: 'var(--green)', secondary: 'var(--cyan)',  logoColor: 'var(--text)',  linkColor: 'var(--muted)', activeLinkColor: 'var(--green)', borderColor: 'var(--border)', progressGrad: 'linear-gradient(to right, var(--green), var(--cyan))' },
    minimal:     { bg: 'var(--bg)',              accent: 'var(--green)', secondary: 'var(--cyan)',  logoColor: 'var(--text)',  linkColor: 'var(--muted)', activeLinkColor: 'var(--green)', borderColor: 'var(--border)', progressGrad: 'linear-gradient(to right, var(--green), var(--cyan))' },
    'neon-band': { bg: 'var(--bg2)',             accent: 'var(--green)', secondary: 'var(--cyan)',  logoColor: 'var(--text)',  linkColor: 'var(--muted)', activeLinkColor: 'var(--green)', borderColor: 'var(--border)', progressGrad: 'linear-gradient(to right, var(--green), var(--cyan))' },
    terminal:    { bg: 'var(--bg)',              accent: 'var(--green)', secondary: 'var(--cyan)',  logoColor: 'var(--green)', linkColor: 'var(--muted)', activeLinkColor: 'var(--green)', borderColor: 'var(--border)', progressGrad: 'linear-gradient(to right, var(--green), var(--cyan))' },
    command:     { bg: '#070b12',                accent: '#38bdf8',      secondary: '#94a3b8',      logoColor: 'var(--text)',  linkColor: '#94a3b8',     activeLinkColor: '#38bdf8',      borderColor: 'rgba(56,189,248,0.24)', progressGrad: 'linear-gradient(to right, #38bdf8, #a78bfa)' },
    dashboard:   { bg: '#07111a',                accent: '#38bdf8',      secondary: '#00ff88',      logoColor: 'var(--text)',  linkColor: '#6b8296',     activeLinkColor: '#38bdf8',      borderColor: 'rgba(56,189,248,0.16)', progressGrad: 'linear-gradient(to right, #38bdf8, #00ff88)' },
    magazine:    { bg: '#f7f1e8',                accent: '#111111',      secondary: '#b91c1c',      logoColor: '#111111',      linkColor: '#4b5563',     activeLinkColor: '#111111',      borderColor: 'rgba(17,17,17,0.28)', progressGrad: 'linear-gradient(to right, #111, #b91c1c)' },
    brutal:      { bg: '#f2f0ec',                accent: '#111111',      secondary: '#111111',      logoColor: '#111111',      linkColor: '#111111',     activeLinkColor: '#111111',      borderColor: '#111111', progressGrad: 'linear-gradient(to right, #111, #111)' },
    'mobile-dock': { bg: 'var(--bg2)',           accent: 'var(--cyan)',  secondary: 'var(--green)', logoColor: 'var(--text)',  linkColor: 'var(--muted)', activeLinkColor: 'var(--cyan)',  borderColor: 'var(--border)', progressGrad: 'linear-gradient(to right, var(--cyan), var(--green))' },
    studio:      { bg: '#090909',                accent: '#ffffff',      secondary: '#777777',      logoColor: '#ffffff',      linkColor: '#777777',     activeLinkColor: '#ffffff',      borderColor: 'rgba(255,255,255,0.16)', progressGrad: 'linear-gradient(to right, #fff, #777)' },
  }
  const hs = HS[headerStyle] || HS.cyber
  const isAdminRoute = location.pathname.startsWith('/admin')
  const showDesktopNav = !isAdminRoute && !isMobileNav

  // ── Admin/staff auth state ─────────────────────────────────────────────────
  const getAdminAuth = useCallback(() => {
    if (typeof window === 'undefined') return null
    const token = getAuthToken()
    if (!token) return null
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const role = payload.role
      if (!role || role === 'user') return null // forum users handled by forumUser
      return { username: payload.username, role, token }
    } catch { return null }
  }, [])

  const [adminAuth, setAdminAuth] = useState(() => getAdminAuth())

  useEffect(() => {
    const refresh = () => setAdminAuth(getAdminAuth())
    window.addEventListener('auth-change', refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener('auth-change', refresh); window.removeEventListener('storage', refresh) }
  }, [getAdminAuth])

  // Reset active section + close mobile menu on route change
  const [prevPathname, setPrevPathname] = useState(location.pathname)
  if (prevPathname !== location.pathname) {
    setPrevPathname(location.pathname)
    if (location.pathname !== '/') setActiveSection('')
    setMenuOpen(false)
  }

  const handleAdminLogout = async () => {
    try { await api.post('/auth/logout') } catch {}
    localStorage.removeItem('auth_token'); localStorage.removeItem('admin_token'); localStorage.removeItem('staff_token')
    window.dispatchEvent(new Event('auth-change'))
    setAdminAuth(null)
    navigate(loginRoute, { state: { signedOut: true } })
  }

  const ADMIN_ROLE_COLORS = {
    admin:     'var(--green)',
    moderator: 'var(--cyan)',
    editor:    '#ff6b35',
    chat:      '#ffd700',
  }

  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(() => {
          ticking = false
          const scrollY = window.scrollY
          const docH = document.documentElement.scrollHeight - window.innerHeight
          setScrolled(scrollY > 20)
          setScrollProgress(docH > 0 ? (scrollY / docH) * 100 : 0)
          if (location.pathname === '/') {
            const sections = ['about', 'experience', 'skills', 'services', 'projects', 'contact']
            let found = ''
            for (const id of [...sections].reverse()) {
              const el = document.getElementById(id)
              if (el && scrollY >= el.offsetTop - 120) { found = id; break }
            }
            setActiveSection(found)
          }
        })
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [location.pathname])

  // Open terminal with backtick shortcut
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '`' && !e.ctrlKey && !e.metaKey && !['INPUT','TEXTAREA'].includes(e.target.tagName)) {
        setTerminalOpen(o => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleHashLink = (e, hash) => {
    e.preventDefault()
    setMenuOpen(false)
    if (location.pathname === '/') {
      const el = document.getElementById(hash)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      navigate('/', { state: { scrollTo: hash } })
    }
  }

  const portfolioNavLinks = [
    { type: 'hash',    hash: 'about',          label: 'About'      },
    { type: 'hash',    hash: 'experience',      label: 'Experience' },
    { type: 'hash',    hash: 'services',        label: 'Services'   },

    { type: 'hash',    hash: 'projects',        label: 'Projects'   },
    { type: 'route',   to: '/blog',             label: 'Blog'       },
    { type: 'route',   to: '/forum',            label: 'Forum'      },
    { type: 'route',   to: '/store',            label: 'Store'      },
    { type: 'contact',                          label: 'Contact'    },
  ]

  // FiveM nav links — shared header shell, FiveM-specific destinations
  const fiveMNavLinks = [
    { type: 'route',   to: fiveMHomeRoute,      label: 'Home',      exact: true },
    { type: 'route',   to: fiveMConnectRoute,   label: 'Connect'   },
    { type: 'route',   to: fiveMWhitelistRoute, label: 'Whitelist' },
    { type: 'route',   to: fiveMStatusRoute,    label: 'Status'    },
    { type: 'route',   to: fiveMStoreRoute,     label: 'Store'     },
    { type: 'route',   to: fiveMRulesRoute,     label: 'Rules'     },
    { type: 'route',   to: fiveMGuidesRoute,    label: 'Guides'    },
    { type: 'route',   to: fiveMProfileRoute,   label: 'Profile'   },
  ]

  const navLinks = isFiveM ? fiveMNavLinks : portfolioNavLinks

  // Tools dropdown entries
  const toolsLinks = [
    { to: '/tools/network', label: '🛠️  Network Tools' },
    { to: '/tools/files',   label: '📁  File Tools'     },
    { to: '/tools/seo',     label: '🔍  SEO Tools'      },
    { to: '/helpdesk',      label: '🎫  Help Desk'       },
  ]

  const isActive = (link) => {
    if (link.type === 'route') {
      if (link.exact) return location.pathname === link.to
      return location.pathname.startsWith(link.to)
    }
    if (link.type === 'contact') return location.pathname === '/contact' || activeSection === 'contact'
    if (link.type === 'hash')    return activeSection === link.hash
    return false
  }

  const ActiveBar = () => (
    <span style={{
      position: 'absolute', bottom: -4, left: 0, right: 0,
      height: 1, background: hs.accent,
      boxShadow: `0 0 8px ${hs.accent}`, animation: 'fadeIn 0.3s ease'
    }} />
  )

  const renderLink = (link, mobile = false) => {
    const active = isActive(link)
    const activeColor = hs.activeLinkColor
    const mutedColor  = hs.linkColor
    const baseStyle = mobile ? {
      fontFamily: headerStyle === 'terminal' ? 'monospace' : 'var(--font-code)', fontSize: 13, letterSpacing: 2,
      textTransform: 'uppercase', padding: '16px 24px',
      color: active ? activeColor : mutedColor,
      textDecoration: 'none', display: 'block', width: '100%', textAlign: 'left',
      background: active ? `${activeColor}0a` : 'none', border: 'none', cursor: 'pointer',
      borderLeft: active ? `3px solid ${activeColor}` : '3px solid transparent',
      minHeight: 52, boxSizing: 'border-box',
    } : {
      fontFamily: headerStyle === 'terminal' ? 'monospace' : 'var(--font-code)', fontSize: 11, letterSpacing: 3,
      textTransform: 'uppercase', color: active ? activeColor : mutedColor,
      textDecoration: 'none', transition: 'color 0.3s',
      position: 'relative', paddingBottom: 4,
      background: 'none', border: 'none', cursor: 'pointer',
    }

    const hover = { enter: e => { if (!active) e.currentTarget.style.color = activeColor },
                    leave: e => { if (!active) e.currentTarget.style.color = mutedColor } }

    if (link.type === 'hash') return (
      <a key={link.hash} href={`/#${link.hash}`} style={baseStyle}
        onClick={e => handleHashLink(e, link.hash)}
        onMouseEnter={hover.enter} onMouseLeave={hover.leave}
      >
        {link.label}{!mobile && active && <ActiveBar />}
      </a>
    )

    if (link.type === 'contact') return (
      <Link key="contact" to="/contact" state={{ from: location.pathname }} style={baseStyle}
        onMouseEnter={hover.enter} onMouseLeave={hover.leave}
      >
        {link.label}{!mobile && active && <ActiveBar />}
      </Link>
    )

    return (
      <Link key={link.to} to={link.to} style={baseStyle}
        onMouseEnter={hover.enter} onMouseLeave={hover.leave}
      >
        {link.label}{!mobile && active && <ActiveBar />}
      </Link>
    )
  }

  return (
    <>
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: scrolled ? hs.bg : (headerStyle === 'minimal' || headerStyle === 'editorial' || headerStyle === 'terminal' ? hs.bg : 'var(--nav-bg-top)'),
        backdropFilter: headerStyle === 'glass' ? 'blur(20px) saturate(1.4)' : 'blur(16px)',
        borderBottom: `1px solid ${hs.borderColor}`,
        transition: 'background 0.4s',
        ...(headerStyle === 'editorial' ? { borderTop: '3px solid var(--green)' } : {}),
        ...(headerStyle === 'neon-band' ? { borderTop: '2px solid var(--green)' } : {}),
        ...(headerStyle === 'terminal'  ? { fontFamily: 'monospace' } : {}),
        ...(headerStyle === 'minimal'   ? { boxShadow: '0 1px 0 var(--border)' } : {}),
      }}>
        {/* Scroll progress bar */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0,
          height: 2, width: scrollProgress + '%',
          background: hs.progressGrad,
          boxShadow: `0 0 6px ${hs.accent}`,
          transition: 'width 0.1s linear', zIndex: 101
        }} />

        <div className="nav-inner" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isAdminRoute ? 'center' : 'space-between',
          gap: isMobileNav ? 12 : 24,
          padding: isMobileNav
            ? '12px max(14px, env(safe-area-inset-right, 14px)) 12px max(14px, env(safe-area-inset-left, 14px))'
            : '20px 60px',
          minWidth: 0,
          width: '100%',
          boxSizing: 'border-box',
        }}>
          <style>{`
            .site-logo { transition: opacity 0.2s ease; }
            .site-logo:hover { opacity: 0.85; }
            .site-logo-mark { transition: filter 0.3s ease; }
          `}</style>
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexShrink: 1 }}
            className="site-logo">
            {isFiveM ? (
              <>
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="site-logo-mark"
                  xmlns="http://www.w3.org/2000/svg">
                  <polygon points="18,1 33,9.5 33,26.5 18,35 3,26.5 3,9.5"
                    fill="none" stroke={hs.accent} strokeWidth="1.5" opacity="0.45"/>
                  <polygon points="18,6 28,11.5 28,24.5 18,30 8,24.5 8,11.5"
                    fill={hs.accent} opacity="0.07"/>
                  <circle cx="3"  cy="9.5"  r="2" fill={hs.accent} opacity="0.55"/>
                  <circle cx="33" cy="26.5" r="2" fill={hs.secondary || hs.accent}  opacity="0.55"/>
                  <line x1="11" y1="13" x2="25" y2="13" stroke={hs.accent} strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="18" y1="13" x2="18" y2="25" stroke={hs.accent} strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="25" y1="11" x2="25" y2="15" stroke={hs.secondary || hs.accent} strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700,
                    letterSpacing: 3, color: hs.logoColor || 'var(--text)' }}>AIFAZI</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 4,
                    color: hs.accent, marginTop: 3, opacity: 0.75 }}>NEON OPS</span>
                </div>
              </>
            ) : headerStyle === 'editorial' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 18, height: 18, background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--bg)' }}>T</span>
                </div>
                <span style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 900, color: 'var(--text)', letterSpacing: -0.5 }}>AIFAZI</span>
              </div>
            ) : headerStyle === 'minimal' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, letterSpacing: 3, color: 'var(--text)' }}>TANVIR</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--muted)' }}>.DEV</span>
              </div>
            ) : headerStyle === 'terminal' ? (
              <div>
                <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--muted)', letterSpacing: 1, lineHeight: 1 }}>root@aifazi:~$</div>
                <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--green)', letterSpacing: 2, lineHeight: 1.4, textShadow: '0 0 8px var(--green)' }}>AIFAZI.NET</div>
              </div>
            ) : headerStyle === 'neon-band' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ padding: '4px 12px', borderRadius: 20, background: 'color-mix(in srgb, var(--green) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 40%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--green)', letterSpacing: 2 }}>AF</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: 'var(--muted)' }}>AIFAZI.NET</div>
              </div>
            ) : (
              // Default (cyber, glass): hexagon logo
              <>
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="site-logo-mark"
                  xmlns="http://www.w3.org/2000/svg">
                  <polygon points="18,1 33,9.5 33,26.5 18,35 3,26.5 3,9.5"
                    fill="none" stroke={hs.accent} strokeWidth="1.5" opacity="0.45"/>
                  <polygon points="18,6 28,11.5 28,24.5 18,30 8,24.5 8,11.5"
                    fill={hs.accent} opacity="0.07"/>
                  <circle cx="3"  cy="9.5"  r="2" fill={hs.accent} opacity="0.55"/>
                  <circle cx="33" cy="26.5" r="2" fill={hs.secondary || hs.accent}  opacity="0.55"/>
                  <line x1="11" y1="13" x2="25" y2="13" stroke={hs.accent} strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="18" y1="13" x2="18" y2="25" stroke={hs.accent} strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="25" y1="11" x2="25" y2="15" stroke={hs.secondary || hs.accent} strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700,
                    letterSpacing: 3, color: hs.logoColor || 'var(--text)' }}>TANVIR</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 4,
                    color: hs.accent, marginTop: 3, opacity: 0.75 }}>.DEV</span>
                </div>
              </>
            )}
          </Link>

          {/* Admin portal badge — shown only on /admin routes */}
          {isAdminRoute && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 1, height: 22, background: 'var(--border)', opacity: 0.5 }} />
              <div style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '4px 12px', borderRadius: 20,
                background: 'color-mix(in srgb, var(--green) 6%, transparent)',
                border: '1px solid color-mix(in srgb, var(--green) 22%, transparent)',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)', display: 'inline-block' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--green)', fontWeight: 700 }}>ADMIN PORTAL</span>
              </div>
            </div>
          )}

          {/* Desktop nav links — hidden on admin routes */}
          {showDesktopNav && (
          <ul className="nav-links" style={{ display: 'flex', gap: 40, listStyle: 'none', margin: 0, padding: 0, alignItems: 'center' }}>
            {navLinks.map(link => (
              <li key={link.hash || link.to || 'contact'} style={{ display: 'flex', alignItems: 'center' }}>{renderLink(link)}</li>
            ))}
            {/* Tools dropdown */}
            {!isFiveM && (
            <li style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <button
                onClick={() => setToolsOpen(o => !o)}
                onBlur={() => setTimeout(() => setToolsOpen(false), 150)}
                style={{
                  fontFamily: 'var(--font-code)', fontSize: 11, letterSpacing: 3,
                  textTransform: 'uppercase', color: toolsOpen ? 'var(--green)' : 'var(--muted)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: 0, lineHeight: 1,
                  transition: 'color 0.3s', position: 'relative',
                }}
                onMouseEnter={e => { if (!toolsOpen) e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={e => { if (!toolsOpen) e.currentTarget.style.color = 'var(--muted)' }}
              >
                Tools
                <svg width="8" height="8" viewBox="0 0 10 6" fill="currentColor"
                  style={{ transition: 'transform 0.2s', transform: toolsOpen ? 'rotate(180deg)' : 'none' }}>
                  <path d="M0 0l5 6 5-6z"/>
                </svg>
                {toolsOpen && <span style={{ position: 'absolute', bottom: -8, left: 0, right: 0, height: 1, background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />}
              </button>
              {toolsOpen && (
                <div style={{
                  position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
                  marginTop: 12, background: 'var(--bg2)', border: '1px solid color-mix(in srgb, var(--green) 20%, transparent)',
                  boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 24px color-mix(in srgb, var(--green) 5%, transparent)',
                  minWidth: 180, zIndex: 200, animation: 'toolsDropdown 0.15s ease',
                }}>
                  <div style={{ height: 2, background: 'linear-gradient(90deg, var(--green), var(--cyan))' }} />
                  {toolsLinks.map(({ to, label }) => (
                    <Link key={to} to={to} onMouseDown={e => e.preventDefault()} onClick={() => setToolsOpen(false)} style={{
                      display: 'block', padding: '11px 16px',
                      fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 1,
                      color: 'var(--muted)', textDecoration: 'none',
                      transition: 'all 0.15s', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--green)'; e.currentTarget.style.background = 'color-mix(in srgb, var(--green) 4%, transparent)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.background = 'transparent' }}
                    >{label}</Link>
                  ))}
                </div>
              )}
            </li>
            )}
          </ul>
          )}

          {/* Right side controls — hidden on admin routes */}
          {showDesktopNav && (
          <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Command Palette — terminal accessible via ⌘K → "Open Terminal" command */}
            <CommandPalette onToggleTheme={toggleTheme} onOpenTerminal={() => setTerminalOpen(true)} />

            {/* Notification Bell (forum users only) */}
            <NotificationBell forumUser={forumUser} />

            {/* User badge / Sign In */}
            {adminAuth ? (
              // Admin / Staff user
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Link to={profileRoute} style={{ display: 'flex', alignItems: 'center', gap: 7, textDecoration: 'none' }} title="Profile">
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: `${ADMIN_ROLE_COLORS[adminAuth.role] || 'var(--green)'}18`,
                    border: `1px solid ${ADMIN_ROLE_COLORS[adminAuth.role] || 'var(--green)'}44`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                  }}>
                    {adminAuth.role === 'admin' ? '⚡' : adminAuth.role === 'moderator' ? '🛡️' : adminAuth.role === 'chat' ? '💬' : '✏️'}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: ADMIN_ROLE_COLORS[adminAuth.role] || 'var(--green)', letterSpacing: 1, lineHeight: 1 }}>{adminAuth.username}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--muted)', letterSpacing: 2, lineHeight: 1.5 }}>{adminAuth.role.toUpperCase()}</div>
                  </div>
                </Link>
                <button onClick={handleAdminLogout} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 8px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', letterSpacing: 1 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,71,87,0.4)'; e.currentTarget.style.color = '#ff4757' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
                >OUT</button>
              </div>
            ) : forumUser ? (
              // Forum user
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link to={profileRoute}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
                  title="Account"
                >
                  <img src={forumUser.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${forumUser.username}&backgroundColor=${theme === 'dark' ? '0b1118' : 'e8f4f0'}&textColor=00ff88`}
                    alt={forumUser.username} loading="lazy"
                    style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--green)', objectFit: 'cover' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--green)', letterSpacing: 1 }}>{forumUser.username}</span>
                </Link>
                <button onClick={async () => { await forumLogout(); navigate(loginRoute, { state: { signedOut: true } }) }} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '4px 8px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', letterSpacing: 1 }}>OUT</button>
              </div>
            ) : (
              <Link to={loginRoute} style={{
                fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2,
                padding: '6px 14px', color: hs.accent,
                border: `1px solid ${hs.accent}55`, textDecoration: 'none',
                background: 'transparent', transition: 'all 0.2s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = `${hs.accent}12`}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                SIGN IN
              </Link>
            )}
          </div>
          )}

          {/* ── Always-visible controls (theme picker + toggle) — hidden on admin routes or when theme locked ── */}
          {showDesktopNav && !isThemeLocked && (
          <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* Theme Picker button — all users */}
            <button
              onClick={() => setThemePickerOpen(true)}
              title="Theme Library"
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 13,
                padding: '5px 10px', background: 'var(--bg3)',
                border: '1px solid var(--border)', color: 'var(--muted)',
                cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 4,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
                <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
                <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
                <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
              </svg>
            </button>
            {/* Theme toggle */}
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
          )}

          {/* Hamburger */}
          {!isAdminRoute && (
          <button className="nav-hamburger" onClick={() => setMenuOpen(o => !o)}
            style={{ display: isMobileNav ? 'flex' : 'none', flexDirection: 'column', gap: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: '10px 8px', marginLeft: 4, zIndex: 130, flexShrink: 0, width: 44, height: 44, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            aria-controls="site-mobile-menu"
          >
            <span style={{ display: 'block', width: 22, height: 2, borderRadius: 1, background: menuOpen ? 'var(--green)' : 'var(--text)', transition: 'all 0.3s', transform: menuOpen ? 'rotate(45deg) translate(5px, 5px)' : 'none' }} />
            <span style={{ display: 'block', width: 22, height: 2, borderRadius: 1, background: menuOpen ? 'var(--green)' : 'var(--text)', transition: 'all 0.3s', opacity: menuOpen ? 0 : 1 }} />
            <span style={{ display: 'block', width: 22, height: 2, borderRadius: 1, background: menuOpen ? 'var(--green)' : 'var(--text)', transition: 'all 0.3s', transform: menuOpen ? 'rotate(-45deg) translate(5px, -5px)' : 'none' }} />
          </button>
          )}
        </div>

        {/* Mobile menu */}
        {menuOpen && isMobileNav && (
          <div className="nav-mobile-backdrop" onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 110 }} />
        )}
        {menuOpen && isMobileNav && (
          <div id="site-mobile-menu" className="nav-mobile-menu" style={{ background: 'var(--bg)', backgroundImage: 'linear-gradient(180deg, color-mix(in srgb, var(--bg2) 88%, var(--bg) 12%), var(--bg))', backdropFilter: 'none', WebkitBackdropFilter: 'none', borderTop: '1px solid var(--border)', borderBottom: '1px solid color-mix(in srgb, var(--cyan) 22%, transparent)', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 68px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch', animation: 'mobileMenuIn 0.22s cubic-bezier(0.16,1,0.3,1)', paddingBottom: 'env(safe-area-inset-bottom, 8px)', position: 'fixed', top: 68, left: 0, right: 0, width: '100vw', zIndex: 120, boxShadow: '0 24px 90px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.03)' }}>
            {navLinks.map(link => renderLink(link, true))}
            {/* Tools section */}
            {!isFiveM && (
            <>
              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              {toolsLinks.map(({ to, label }) => (
                <Link key={to} to={to} onClick={() => setMenuOpen(false)} style={{
                  fontFamily: 'var(--font-code)', fontSize: 13, letterSpacing: 2,
                  textTransform: 'uppercase', padding: '16px 24px',
                  color: 'var(--muted)', textDecoration: 'none',
                  borderLeft: '3px solid transparent', display: 'block', minHeight: 52,
                }}>{label}</Link>
              ))}
            </>
            )}
            <button onClick={() => { setTerminalOpen(true); setMenuOpen(false) }} style={{
              fontFamily: 'var(--font-code)', fontSize: 13, letterSpacing: 2,
              textTransform: 'uppercase', padding: '16px 24px',
              color: 'var(--muted)', background: 'none', border: 'none',
              borderLeft: '3px solid transparent', cursor: 'pointer', textAlign: 'left', width: '100%', minHeight: 52,
            }}>&gt;_ Terminal</button>

            <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
            {adminAuth ? (
              <div style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Link to={profileRoute} onClick={() => setMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${ADMIN_ROLE_COLORS[adminAuth.role]}18`, border: `1px solid ${ADMIN_ROLE_COLORS[adminAuth.role]}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                    {adminAuth.role === 'admin' ? '⚡' : adminAuth.role === 'moderator' ? '🛡️' : '✏️'}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: ADMIN_ROLE_COLORS[adminAuth.role], letterSpacing: 1 }}>{adminAuth.username}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: 2 }}>{adminAuth.role.toUpperCase()}</div>
                  </div>
                </Link>
                <button onClick={() => { handleAdminLogout(); setMenuOpen(false) }} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '5px 10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', letterSpacing: 1 }}>SIGN OUT</button>
              </div>
            ) : forumUser ? (
              <div style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Link to={profileRoute} onClick={() => setMenuOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                  <img src={forumUser.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${forumUser.username}&backgroundColor=${theme === 'dark' ? '0b1118' : 'e8f4f0'}&textColor=00ff88`} alt={forumUser.username} loading="lazy" style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--green)', objectFit: 'cover' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', letterSpacing: 1 }}>{forumUser.username}</span>
                </Link>
                <button onClick={async () => { await forumLogout(); navigate(loginRoute, { state: { signedOut: true } }); setMenuOpen(false) }} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, padding: '5px 10px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', letterSpacing: 1 }}>SIGN OUT</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, margin: '8px 24px 12px' }}>
                <Link to={loginRoute} onClick={() => setMenuOpen(false)} style={{ flex: 1, display: 'block', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '11px 0', color: 'var(--green)', border: '1px solid color-mix(in srgb, var(--green) 35%, transparent)', textDecoration: 'none', background: 'color-mix(in srgb, var(--green) 6%, transparent)' }}>SIGN IN</Link>
                <Link to={registerRoute} onClick={() => setMenuOpen(false)} style={{ flex: 1, display: 'block', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, padding: '11px 0', color: 'var(--cyan)', border: '1px solid color-mix(in srgb, var(--cyan) 35%, transparent)', textDecoration: 'none', background: 'color-mix(in srgb, var(--cyan) 6%, transparent)' }}>SIGN UP</Link>
              </div>
            )}
            <div style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 14, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontFamily: 'var(--font-code)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--muted)', flex: 1 }}>
                {['light','cyber-light','midnight-light','crimson-light','ocean-light','amber-light','rose-light','forest-light','glass-light','synthwave-light','terminal-light','neon-noir-light','aurora-light','brutalist','paper','neumorph','macos','pastel','win95'].includes(theme) ? '☾ Dark Mode' : '☀ Light Mode'}
              </span>
              {isThemeLocked
                ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', letterSpacing: 1, opacity: 0.5 }}>LOCKED</span>
                : <ThemeToggle theme={theme} onToggle={toggleTheme} />
              }
            </div>
          </div>
        )}

        <style>{`
          @media (min-width: 1101px) {
            .nav-hamburger { display: none !important; }
          }
          @media (max-width: 1100px) {
            .nav-inner { padding: 14px 20px !important; justify-content: space-between !important; }
            .nav-links { display: none !important; }
            .nav-hamburger { display: flex !important; }
          }
          @media (max-width: 480px) {
            .nav-inner { padding: 12px 16px !important; }
          }
          @keyframes toolsDropdown { from { opacity:0; transform:translateX(-50%) translateY(-6px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
          @keyframes mobileMenuIn { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }
        `}</style>
      </nav>

      {/* Terminal overlay */}
      {terminalOpen && <Terminal onClose={() => setTerminalOpen(false)} />}

      {/* Theme Picker drawer */}
      <ThemePicker open={themePickerOpen} onClose={() => setThemePickerOpen(false)} />
    </>
  )
}
