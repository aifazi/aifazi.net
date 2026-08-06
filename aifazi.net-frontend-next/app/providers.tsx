/**
 * app/providers.tsx — All client-side providers
 * Replaces the provider tree in App.jsx
 * Must be "use client" since it uses useState, useEffect, context
 */
'use client'

import { useState, useEffect, useCallback, useRef, createContext, useContext, lazy, Suspense } from 'react'
import { ForumProvider } from '@/context/ForumContext'
// DiscordProvider removed — Discord is now integrated into the unified ForumContext/forum_auth system
import { EditProvider } from '@/context/EditContext'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import Cursor from '@/components/Cursor'
import FloatingNav from '@/components/FloatingNav'
import ContextMenu from '@/components/ContextMenu'
import SiteBanner from '@/components/SiteBanner'
import FunDragLayer from '@/components/FunDragLayer'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { getSiteSettings } from '@/lib/siteSettings'
import { getUserPackage, setUserPackage } from '@/lib/userPackage'
import { getSupabase } from '@/lib/supabase'
import { MenuProvider } from '@/core/menu'
import { NotifyProvider } from '@/core/notify'
import { DialogProvider } from '@/core/dialog'
import { isAdmin as checkIsAdmin } from '@/lib/api'
import { usePathname } from 'next/navigation'

const LoadingScreen     = lazy(() => import('@/components/LoadingScreen'))
const MaintenanceScreen = lazy(() => import('@/components/MaintenanceScreen'))
const RoamingRobot      = lazy(() => import('@/components/RoamingRobot'))

// ── Theme Context ──────────────────────────────────────────────────────────────
export const ThemeContext = createContext<{
  theme: string
  setTheme: (id: string) => void
  toggleTheme: () => void
  siteConfig: Record<string, any>
  refreshSiteConfig: () => Promise<void>
  isAdmin: boolean
  siteConfigReady: boolean
  userPackage: { id: string; settings: Record<string, any> } | null
  applyUserPackage: (pkg: { id: string; settings: Record<string, any> }) => void
  clearUserPackage: () => void
}>({
  theme: 'cyber-dark', setTheme: () => {}, toggleTheme: () => {},
  siteConfig: {}, refreshSiteConfig: async () => {}, isAdmin: false, siteConfigReady: false,
  userPackage: null, applyUserPackage: () => {}, clearUserPackage: () => {},
})

export const useTheme = () => useContext(ThemeContext)

const VALID_THEMES = [
  'cyber-dark','cyber-light','light',
  'midnight','midnight-light',
  'crimson','crimson-light',
  'ocean','ocean-light',
  'amber','amber-light',
  'rose','rose-light',
  'forest','forest-light',
  'lava','toxic','ice',
  'glass-dark','glass-light',
  'brutalist','brutalist-dark',
  'synthwave','synthwave-light',
  'paper','paper-dark',
  'neumorph','neumorph-dark',
  'terminal','terminal-light',
  'macos','macos-dark',
  'neon-noir','neon-noir-light',
  'pastel','pastel-dark',
  'win95','win95-dark',
  'aurora','aurora-light',
  'mario','mario-light',
  'minecraft','minecraft-light',
  'sonic','sonic-light',
  'pacman','pacman-light',
]
const LIGHT_THEMES = [
  'light','cyber-light',
  'midnight-light','crimson-light','ocean-light','amber-light',
  'rose-light','forest-light','glass-light','synthwave-light',
  'terminal-light','neon-noir-light','aurora-light',
  'mario-light','minecraft-light','sonic-light','pacman-light',
  'ice',
  'brutalist','paper','neumorph','macos','pastel','win95',
]

// Dark ↔ Light pairs — toggle stays within the same theme family
const THEME_PAIRS: Record<string,string> = {
  'cyber-dark':'cyber-light', 'cyber-light':'cyber-dark',
  'light':'cyber-dark',
  'midnight':'midnight-light', 'midnight-light':'midnight',
  'crimson':'crimson-light',   'crimson-light':'crimson',
  'ocean':'ocean-light',       'ocean-light':'ocean',
  'amber':'amber-light',       'amber-light':'amber',
  'rose':'rose-light',         'rose-light':'rose',
  'forest':'forest-light',     'forest-light':'forest',
  'glass-dark':'glass-light',  'glass-light':'glass-dark',
  'brutalist':'brutalist-dark','brutalist-dark':'brutalist',
  'synthwave':'synthwave-light','synthwave-light':'synthwave',
  'paper':'paper-dark',         'paper-dark':'paper',
  'neumorph':'neumorph-dark',   'neumorph-dark':'neumorph',
  'terminal':'terminal-light',  'terminal-light':'terminal',
  'macos':'macos-dark',         'macos-dark':'macos',
  'neon-noir':'neon-noir-light','neon-noir-light':'neon-noir',
  'pastel':'pastel-dark',       'pastel-dark':'pastel',
  'win95':'win95-dark',         'win95-dark':'win95',
  'aurora':'aurora-light',      'aurora-light':'aurora',
  'mario':'mario-light',        'mario-light':'mario',
  'minecraft':'minecraft-light','minecraft-light':'minecraft',
  'sonic':'sonic-light',        'sonic-light':'sonic',
  'pacman':'pacman-light',      'pacman-light':'pacman',
}

function loadFontForTheme(themeId: string) {
  const fontMap: Record<string, string> = {
    midnight:   'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap',
    ocean:      'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;600;700&display=swap',
    brutalist:  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&display=swap',
    synthwave:  'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap',
    paper:      'https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&display=swap',
    neumorph:   'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap',
    macos:      'https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@400;500;700&display=swap',
    win95:      'https://fonts.googleapis.com/css2?family=VT323&display=swap',
    mario:      'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap',
    minecraft:  'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap',
    sonic:      'https://fonts.googleapis.com/css2?family=VT323&display=swap',
    pacman:     'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap',
  }
  const url = fontMap[themeId]
  if (!url) return
  if (document.querySelector(`link[href="${url}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'; link.href = url
  document.head.appendChild(link)
}

export function Providers({ children, isStoreDomain = false, isFiveMDomain = false, serverMaintenance = false, serverSubdomainMaintenance = {} }: {
  children: React.ReactNode;
  isStoreDomain?: boolean;
  isFiveMDomain?: boolean;
  serverMaintenance?: boolean;
  serverSubdomainMaintenance?: Record<string, any>;
}) {
  const pathname = usePathname()

  const [loading, setLoading] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [isStoreSubdomain, setIsStoreSubdomain] = useState(() => {
    if (typeof document !== 'undefined') return document.documentElement.dataset.store === 'true'
    return false
  })
  const firstThemeSync = useRef(true)

  // Synchronous initializer — always return server-safe defaults to avoid hydration mismatch
  // Client-side values are restored in the useEffect below
  function initSiteConfig(): Record<string, any> {
    return { maintenanceMode: false, animationPreset: 'smooth', loadingScreenStyle: 'terminal' }
  }

  function initTheme(): string {
    return 'cyber-dark'
  }

  const [siteConfig, setSiteConfig] = useState<Record<string, any>>(initSiteConfig)
  const [siteConfigReady, setSiteConfigReady] = useState(false)

  const [userIsAdmin, setUserIsAdmin] = useState(false)

  const [theme, setThemeState] = useState(initTheme)

  const [userPackage, setUserPackageState] = useState<{ id: string; settings: Record<string, any> } | null>(null)

  // Restore the user's applied package (per-user override) from localStorage
  useEffect(() => {
    const pkg = getUserPackage()
    if (pkg?.id && pkg.settings) setUserPackageState(pkg)
  }, [])

  // Cross-tab sync for the user package override
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'user-package') return
      const pkg = getUserPackage()
      setUserPackageState(pkg?.id && pkg.settings ? pkg : null)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Restore browser-only state after hydration (prevents SSR mismatch)
  useEffect(() => {
    const BUILD_ID = process.env.BUILD_ID || 'dev'

    // Mark hydration complete BEFORE we read the config or check the
    // loading state so the SSR-visible content never flashes before the
    // loading screen (if one is needed) can render.
    setHydrated(true)

    // FIX: Load the server-injected global config (#site-config-data, embedded in
    // the HTML by the root layout on every request) FIRST so the loading screen
    // renders with the admin-configured style, not the default. Falls back to the
    // localStorage cache only when no server config was embedded (build-time).
    let cachedConfig: Record<string, any> | null = null
    try {
      const el = document.getElementById('site-config-data')
      if (el?.textContent) {
        const parsed = JSON.parse(el.textContent)
        const keys = Object.keys(parsed)
        const isCorrupted = keys.length > 0 && keys.slice(0, 5).every((k) => /^\d+$/.test(k))
        if (!isCorrupted && keys.length > 0) {
          setSiteConfig((prev) => ({ ...prev, ...parsed }))
          cachedConfig = parsed
          setSiteConfigReady(true)
        }
      }
    } catch {}
    if (!cachedConfig) {
      try {
        const cached = localStorage.getItem('site-config-cache')
        if (cached) {
          const parsed = JSON.parse(cached)
          const keys = Object.keys(parsed)
          const isCorrupted = keys.length > 0 && keys.slice(0, 5).every((k) => /^\d+$/.test(k))
          if (!isCorrupted) {
            setSiteConfig((prev) => ({ ...prev, ...parsed }))
            cachedConfig = parsed
            setSiteConfigReady(true)
          } else localStorage.removeItem('site-config-cache')
        }
      } catch {}
    }

    // Show loading screen only when this build hasn't been booted before.
    // localStorage (not sessionStorage) so repeat visits/tabs skip the ~1.3s
    // boot animation and reach LCP immediately — it only plays once per deploy.
    if (localStorage.getItem('site-loaded') !== BUILD_ID) setLoading(true)

    setUserIsAdmin(checkIsAdmin())

    // FIX: Theme initialization — priority order:
    // 1. Locked global theme from cache (admin override, applied immediately)
    // 2. User's explicit saved preference (site-theme-user-set flag is set)
    // 3. Non-locked global site default from cache (for first-time / incognito visitors)
    // 4. Device preference (prefers-color-scheme) for first-time visitors
    if (cachedConfig?.lockTheme && cachedConfig?.globalTheme && VALID_THEMES.includes(cachedConfig.globalTheme)) {
      // Admin has locked the theme — apply immediately to avoid FOUC
      setThemeState(cachedConfig.globalTheme)
      if (cachedConfig.globalTheme === 'cyber-dark') document.documentElement.removeAttribute('data-theme')
      else document.documentElement.setAttribute('data-theme', cachedConfig.globalTheme)
      loadFontForTheme(cachedConfig.globalTheme)
    } else {
      const userExplicitlyChose = !!localStorage.getItem('site-theme-user-set')
      const saved = localStorage.getItem('site-theme')
      if (userExplicitlyChose && saved) {
        // Honour what the user deliberately picked
        if (saved === 'dark') setThemeState('cyber-dark')
        else if (VALID_THEMES.includes(saved)) setThemeState(saved as string)
      } else if (!userExplicitlyChose && cachedConfig?.globalTheme && VALID_THEMES.includes(cachedConfig.globalTheme)) {
        // No explicit user choice — apply the site's global default immediately (avoids FOUC)
        setThemeState(cachedConfig.globalTheme)
        if (cachedConfig.globalTheme === 'cyber-dark') document.documentElement.removeAttribute('data-theme')
        else document.documentElement.setAttribute('data-theme', cachedConfig.globalTheme)
        loadFontForTheme(cachedConfig.globalTheme)
      } else if (!userExplicitlyChose) {
        // First-time visitor — respect device preference instead of defaulting to cyber-dark
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches
        if (prefersDark) setThemeState('cyber-dark')
        else if (prefersLight) setThemeState('cyber-light')
        // else: no media query support — keep default cyber-dark
      }
    }
  }, [])

  const setTheme = (id: string) => {
    if (!VALID_THEMES.includes(id)) return
    // If admin has locked the theme, silently ignore user theme changes
    if (siteConfig.lockTheme && siteConfig.globalTheme && VALID_THEMES.includes(siteConfig.globalTheme)) return
    loadFontForTheme(id)
    setThemeState(id)
    if (LIGHT_THEMES.includes(id)) localStorage.setItem('last-light-theme', id)
    else                           localStorage.setItem('last-dark-theme', id)
    localStorage.setItem('site-theme', id)
    // Mark that the user has explicitly chosen a theme — prevents the global site
    // default from overriding their preference on next load / incognito sessions.
    localStorage.setItem('site-theme-user-set', '1')
  }

  const toggleTheme = () => {
    const pair = THEME_PAIRS[theme as keyof typeof THEME_PAIRS]
    if (pair && VALID_THEMES.includes(pair)) {
      setTheme(pair)
    } else {
      // Fallback for any unlisted theme
      setTheme(LIGHT_THEMES.includes(theme) ? 'cyber-dark' : 'cyber-light')
    }
  }

  // Per-user theme package — applies the package's globalTheme + framework styles
  // locally (localStorage) so non-admin users can adopt a preset without touching
  // the site-wide admin settings.
  const applyUserPackage = (pkg: { id: string; settings: Record<string, any> }) => {
    if (!pkg?.id || !pkg?.settings) return
    // When the admin has locked theming, ignore per-user packages entirely —
    // both the global theme AND the framework-style overrides — so users can't
    // bypass a locked design.
    if (siteConfig.lockTheme) return
    const s = pkg.settings
    if (s.globalTheme && VALID_THEMES.includes(s.globalTheme)) {
      setTheme(s.globalTheme)
    }
    const stored = { id: pkg.id, settings: s }
    setUserPackage(stored)
    setUserPackageState(stored)
    window.dispatchEvent(new CustomEvent('user-package-updated', { detail: { id: pkg.id, settings: s } }))
  }

  const clearUserPackage = () => {
    if (typeof window === 'undefined') return
    localStorage.removeItem('user-package')
    setUserPackageState(null)
    window.dispatchEvent(new CustomEvent('user-package-updated', { detail: { id: '', settings: {} } }))
  }

  useEffect(() => {
    // The server/FOUC script already stamped data-theme correctly on <html>
    // before React hydrated. Skip the first sync so we don't remove (or
    // replace) the correct attribute before the init effect in the mount block
    // above has had a chance to call setThemeState with the admin's global
    // default. Subsequent theme changes (user picks a different theme) sync
    // normally.
    if (firstThemeSync.current) {
      firstThemeSync.current = false
      return
    }
    if (theme === 'cyber-dark') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.setAttribute('data-theme-mode', LIGHT_THEMES.includes(theme) ? 'light' : 'dark')
    document.documentElement.style.colorScheme = LIGHT_THEMES.includes(theme) ? 'light' : 'dark'
    localStorage.setItem('site-theme', theme)
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme, mode: LIGHT_THEMES.includes(theme) ? 'light' : 'dark' } }))
  }, [theme])

  // Effective framework config = site-wide admin settings, layered with the
  // user's locally-applied package (per-user override wins for this browser).
  const pkgSettings = userPackage?.settings || {}
  const eff = {
    ...siteConfig,
    inputStyle:          pkgSettings.inputStyle          || siteConfig.inputStyle,
    surfaceStyle:        pkgSettings.surfaceStyle        || siteConfig.surfaceStyle,
    bgAnimation:         pkgSettings.bgAnimation         || siteConfig.bgAnimation,
    gridPattern:         pkgSettings.gridPattern         || siteConfig.gridPattern,
    backgroundPattern:   pkgSettings.backgroundPattern   || siteConfig.backgroundPattern,
    animationPreset:     pkgSettings.animationPreset     || siteConfig.animationPreset,
    loadingScreenStyle:  pkgSettings.loadingScreenStyle  || siteConfig.loadingScreenStyle,
    menuStyle:           pkgSettings.menuStyle           || siteConfig.menuStyle,
    notifyStyle:         pkgSettings.notifyStyle         || siteConfig.notifyStyle,
    notifyPosition:      pkgSettings.notifyPosition      || siteConfig.notifyPosition,
    dialogStyle:         pkgSettings.dialogStyle         || siteConfig.dialogStyle,
    headerStyle:         pkgSettings.headerStyle         || siteConfig.headerStyle,
    footerStyle:         pkgSettings.footerStyle         || siteConfig.footerStyle,
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-animation', eff.animationPreset || 'smooth')
  }, [eff.animationPreset])

  useEffect(() => {
    const inputStyle = eff.inputStyle || ''
    if (inputStyle) document.documentElement.setAttribute('data-input-style', inputStyle)
    else document.documentElement.removeAttribute('data-input-style')
  }, [eff.inputStyle])

  useEffect(() => {
    const surfaceStyle = eff.surfaceStyle || ''
    if (surfaceStyle) document.documentElement.setAttribute('data-surface-style', surfaceStyle)
    else document.documentElement.removeAttribute('data-surface-style')
  }, [eff.surfaceStyle])

  // Apply background animation (body::before)
  useEffect(() => {
    const anim = eff.bgAnimation || 'none'
    if (anim && anim !== 'none' && anim !== 'clean') {
      document.documentElement.setAttribute('data-bg-animation', anim)
    } else {
      document.documentElement.removeAttribute('data-bg-animation')
    }
  }, [eff.bgAnimation])

  // Apply grid overlay (body::after) — falls back to legacy backgroundPattern
  useEffect(() => {
    const grid = eff.gridPattern || eff.backgroundPattern || 'grid'
    if (grid && grid !== 'none' && grid !== 'clean') {
      document.documentElement.setAttribute('data-bg-grid', grid)
    } else {
      document.documentElement.removeAttribute('data-bg-grid')
    }
  }, [eff.gridPattern, eff.backgroundPattern])

  const refreshSiteConfig = useCallback(async () => {
    try {
      const data = await getSiteSettings({ fresh: true })
      // Guard: only merge if data is a plain non-empty object (never arrays or corrupted dicts)
      if (!data || typeof data !== 'object' || Array.isArray(data)) return
      setSiteConfig((prev) => {
        const next = { ...prev, ...data }
        try { localStorage.setItem('site-config-cache', JSON.stringify(next)) } catch {}
        return next
      })
      if (data.globalTheme && VALID_THEMES.includes(data.globalTheme)) {
        if (data.lockTheme) setThemeState(data.globalTheme)
        // Apply the site's global default only when the user has never explicitly
        // picked a theme. In incognito (empty localStorage) the built-in default
        // 'cyber-dark' was already written by the [theme] effect, so we can't use
        // site-theme as the signal — we use the dedicated user-set flag instead.
        else if (!localStorage.getItem('site-theme-user-set')) setThemeState(data.globalTheme)
      }
    } finally {
      setSiteConfigReady(true)
    }
  }, [])

  // FIX #9: Include refreshSiteConfig in dependency array (satisfies exhaustive-deps)
  useEffect(() => { refreshSiteConfig() }, [refreshSiteConfig])

  useEffect(() => {
    const refresh = () => setUserIsAdmin(checkIsAdmin())
    window.addEventListener('auth-change', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('auth-change', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  // Re-fetch settings when admin saves Framework / Site settings (window event)
  useEffect(() => {
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent)?.detail
      // Optimistic update: apply changed keys immediately from the event detail
      // so styles like notifyStyle, menuStyle, dialogStyle take effect on the
      // very next render — before the async refreshSiteConfig call completes.
      if (detail && typeof detail === 'object' && !Array.isArray(detail) && Object.keys(detail).length > 0) {
        const settingsDetail = Object.fromEntries(Object.entries(detail).filter(([key]) => !key.startsWith('_')))
        if (Object.keys(settingsDetail).length === 0) return
        setSiteConfig(prev => {
          const next = { ...prev, ...settingsDetail }
          try { localStorage.setItem('site-config-cache', JSON.stringify(next)) } catch {}
          return next
        })
        const nextTheme = settingsDetail.globalTheme
        if (typeof nextTheme === 'string' && VALID_THEMES.includes(nextTheme)) {
          const shouldApplyTheme = !!settingsDetail.lockTheme || (!localStorage.getItem('site-theme-user-set') && !siteConfig.lockTheme)
          if (shouldApplyTheme) {
            loadFontForTheme(nextTheme)
            setThemeState(nextTheme)
          }
        }
      }
      refreshSiteConfig()
    }
    window.addEventListener('site-settings-updated', onUpdate)
    return () => window.removeEventListener('site-settings-updated', onUpdate)
  }, [refreshSiteConfig])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'site-theme' && e.newValue && VALID_THEMES.includes(e.newValue)) {
        if (!(siteConfig.lockTheme && siteConfig.globalTheme && VALID_THEMES.includes(siteConfig.globalTheme))) {
          loadFontForTheme(e.newValue)
          setThemeState(e.newValue)
        }
        return
      }
      if (e.key !== 'site-config-cache' || !e.newValue) return
      try {
        const parsed = JSON.parse(e.newValue)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
        setSiteConfig(prev => ({ ...prev, ...parsed }))
        if (parsed.globalTheme && VALID_THEMES.includes(parsed.globalTheme)) {
          const shouldApplyTheme = parsed.lockTheme || (!localStorage.getItem('site-theme-user-set') && !siteConfig.lockTheme)
          if (shouldApplyTheme) {
            loadFontForTheme(parsed.globalTheme)
            setThemeState(parsed.globalTheme)
          }
        }
      } catch {}
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [siteConfig.globalTheme, siteConfig.lockTheme])

  // Live push: subscribe to Supabase Realtime on site_config so ALL open
  // browser tabs/users pick up settings changes the moment admin saves.
  useEffect(() => {
    const sb = getSupabase()
    if (!sb) return
    const channel = sb
      .channel('site-config-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_config' }, () => {
        refreshSiteConfig()
      })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [refreshSiteConfig])

  // #6 — Extend Supabase Realtime to contacts & staff_activity.
  // Only staff need these channels — skip them for visitors (saves 2 WebSocket
  // subscriptions for every anonymous user on every page).
  useEffect(() => {
    if (!userIsAdmin) return
    const sb = getSupabase()
    if (!sb) return
    const contactsChannel = sb
      .channel('contacts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => {
        window.dispatchEvent(new CustomEvent('contacts-updated'))
      })
      .subscribe()
    const activityChannel = sb
      .channel('staff-activity-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_activity' }, () => {
        window.dispatchEvent(new CustomEvent('staff-activity-updated'))
      })
      .subscribe()
    return () => {
      sb.removeChannel(contactsChannel)
      sb.removeChannel(activityChannel)
    }
  }, [userIsAdmin])

  // Re-check when the tab becomes visible again (user returns from another tab)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refreshSiteConfig() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshSiteConfig])

  // Global error capture — report uncaught errors + unhandled promise rejections
  // to the in-project monitor (Sentry-like) so the owner gets alerted.
  useEffect(() => {
    const report = (source: string, error?: Error | null, url?: string) => {
      if (!error) return
      try {
        fetch('/api/monitor/errors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'frontend',
            error_type: error.name || 'Error',
            message: error.message || String(error),
            stack: error.stack || '',
            endpoint: typeof window !== 'undefined' ? window.location.pathname : '',
            url: typeof window !== 'undefined' ? window.location.href : '',
          }),
        }).catch(() => {})
      } catch {}
    }
    const onError = (e: ErrorEvent) => report('window', e.error || new Error(e.message), e.filename)
    const onRejection = (e: PromiseRejectionEvent) => report('unhandledrejection', e.reason instanceof Error ? e.reason : new Error(String(e.reason)))
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  // Live OS preference listener — auto-switches theme when followOsTheme is ON.
  // Does nothing if the admin has locked the theme, or the user explicitly picked one.
  useEffect(() => {
    if (!siteConfig.followOsTheme || siteConfig.lockTheme) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem('site-theme-user-set')) return
      const id = e.matches ? 'cyber-dark' : 'cyber-light'
      setThemeState(id)
      localStorage.setItem('site-theme', id)
      if (id === 'cyber-dark') document.documentElement.removeAttribute('data-theme')
      else document.documentElement.setAttribute('data-theme', id)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [siteConfig.followOsTheme, siteConfig.lockTheme])

  // ── Live push: Socket.IO disabled — backend no longer mounts sio ASGI app.
  // Re-enable once the /site namespace is restored on the backend.
  // useEffect(() => {
  //   const socket = getSiteSocket()
  //   if (!socket) return
  //   const handleSettings = (data: Record<string, any>) => { ... }
  //   const handleBanners = () => { window.dispatchEvent(new CustomEvent('banners-changed')) }
  //   socket.on('settings-update', handleSettings)
  //   socket.on('banners-update', handleBanners)
  //   return () => { socket.off('settings-update', handleSettings); socket.off('banners-update', handleBanners) }
  // }, [])

  const isFullScreen = /^\/(admin|chat|users\/chat|store)/.test(pathname || '') || isStoreSubdomain || isStoreDomain
  const showMaintenance = (() => {
    if (userIsAdmin) return false
    const subMaint = siteConfig.subdomainMaintenance || serverSubdomainMaintenance || {}
    if (isStoreDomain && (subMaint.store?.maintenanceMode || false)) return true
    if (isFiveMDomain && (subMaint.fivem?.maintenanceMode || false)) return true
    return siteConfig.maintenanceMode ?? serverMaintenance
  })()

  const onLoadComplete = useCallback(() => {
    setLoading(false)
    const BUILD_ID = process.env.BUILD_ID || 'dev'
    localStorage.setItem('site-loaded', BUILD_ID)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, siteConfig, refreshSiteConfig, isAdmin: userIsAdmin, siteConfigReady, userPackage, applyUserPackage, clearUserPackage }}>
      <NotifyProvider notifyStyle={eff.notifyStyle || 'cyber'} position={eff.notifyPosition || 'bottom-right'}>
      <DialogProvider dialogStyle={eff.dialogStyle || 'cyber'}>
      <MenuProvider menuStyle={eff.menuStyle || 'cyber'}>
      <EditProvider>
        <ErrorBoundary>
        <ForumProvider>
          {!showMaintenance && loading && (
            <Suspense fallback={null}>
              <LoadingScreen onComplete={onLoadComplete} style={eff.loadingScreenStyle} />
            </Suspense>
          )}
          {showMaintenance && (
            <Suspense fallback={null}>
              <MaintenanceScreen
                style={(isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceStyle)
                    || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceStyle)
                    || siteConfig.maintenanceStyle || 'terminal'}
                message={(isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceMessage)
                      || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceMessage)
                      || siteConfig.maintenanceMessage || "We're performing scheduled upgrades. We'll be back online shortly."}
                status={(isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceStatus)
                     || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceStatus)
                     || siteConfig.maintenanceStatus || 'MAINTENANCE'}
                icon={(isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceIcon)
                   || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceIcon)
                   || siteConfig.maintenanceIcon || '⚙️'}
                returnTime={(isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceReturnTime)
                        || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceReturnTime)
                        || siteConfig.maintenanceReturnTime || ''}
                showProgress={(isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceShowProgress)
                           || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceShowProgress)
                           || !!siteConfig.maintenanceShowProgress}
                progress={(isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceProgress)
                       || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceProgress)
                       || siteConfig.maintenanceProgress || 0}
                showSocial={(isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceShowSocial)
                        || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceShowSocial)
                        || (siteConfig.maintenanceShowSocial !== false)}
                bgStyle={(isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceBgStyle)
                      || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceBgStyle)
                      || siteConfig.maintenanceBgStyle || 'grid'}
                siteConfig={siteConfig}
              />
            </Suspense>
          )}
          <div style={{ opacity: !hydrated || (loading && !showMaintenance) ? 0 : 1, transition: 'opacity 0.5s ease', pointerEvents: (!hydrated || (loading && !showMaintenance) || showMaintenance) ? 'none' : 'auto' }}>
            <Cursor />
            <ContextMenu />
            {!isFullScreen && <Navbar />}
            {!isFullScreen && <SiteBanner />}
            {!isFullScreen && <FunDragLayer enabled={siteConfig.funDragEnabled !== false} />}
            {children}
            {!isFullScreen && <Footer />}
            {!isFullScreen && <FloatingNav />}
            {!isFullScreen && siteConfigReady && siteConfig?.showRoamingRobot !== false && (
              <Suspense fallback={null}><RoamingRobot /></Suspense>
            )}
          </div>
          <style>{`
            [data-animation="smooth"]     { --t:0.35s; --ease:cubic-bezier(0.16,1,0.3,1);      --hover-lift:-3px; }
            [data-animation="snappy"]     { --t:0.12s; --ease:cubic-bezier(0.4,0,0.2,1);       --hover-lift:-2px; }
            [data-animation="bouncy"]     { --t:0.45s; --ease:cubic-bezier(0.34,1.56,0.64,1);  --hover-lift:-4px; }
            [data-animation="expressive"] { --t:0.5s;  --ease:cubic-bezier(0.22,1.5,0.36,1);   --hover-lift:-5px; }
            [data-animation="reduced"]    { --t:0.2s;  --ease:cubic-bezier(0.4,0,0.2,1);       --hover-lift:-1px; }
            [data-animation="elastic"]    { --t:0.5s;  --ease:cubic-bezier(0.68,-0.55,0.27,1.55); --hover-lift:-4px; }
            [data-animation="cinematic"]  { --t:1.2s;  --ease:cubic-bezier(0.25,0.1,0.25,1);   --hover-lift:-3px; }
            [data-animation="none"]       { --t:0s;    --ease:linear;                           --hover-lift:0px; }
            [data-input-style] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
            [data-input-style] textarea,
            [data-input-style] select {
              transition: border-color var(--t, .2s) var(--ease, ease), box-shadow var(--t, .2s) var(--ease, ease), background var(--t, .2s) var(--ease, ease);
            }
            [data-input-style="glass"] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
            [data-input-style="glass"] textarea,
            [data-input-style="glass"] select {
              background: rgba(255,255,255,.06) !important;
              border-color: rgba(255,255,255,.18) !important;
              border-radius: 12px !important;
              backdrop-filter: blur(16px);
            }
            [data-input-style="terminal"] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
            [data-input-style="terminal"] textarea,
            [data-input-style="terminal"] select {
              background: #050805 !important;
              border-color: rgba(51,255,51,.45) !important;
              color: #33ff33 !important;
              font-family: var(--font-mono) !important;
              border-radius: 2px !important;
            }
            [data-input-style="minimal"] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
            [data-input-style="minimal"] textarea,
            [data-input-style="minimal"] select {
              background: transparent !important;
              border-width: 0 0 1px 0 !important;
              border-radius: 0 !important;
              box-shadow: none !important;
            }
            [data-input-style="brutal"] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
            [data-input-style="brutal"] textarea,
            [data-input-style="brutal"] select {
              background: #fff !important;
              border: 3px solid #111 !important;
              border-radius: 0 !important;
              color: #111 !important;
              box-shadow: 4px 4px 0 #111 !important;
            }
            [data-input-style="paper"] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
            [data-input-style="paper"] textarea,
            [data-input-style="paper"] select {
              background: #fff8ef !important;
              border-color: #d8c7b3 !important;
              color: #2b241f !important;
              border-radius: 2px !important;
            }
            [data-input-style="pill"] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
            [data-input-style="pill"] textarea,
            [data-input-style="pill"] select {
              border-radius: 999px !important;
            }
            [data-input-style="command"] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
            [data-input-style="command"] textarea,
            [data-input-style="command"] select {
              background: #070b12 !important;
              border-color: rgba(56,189,248,.35) !important;
              border-radius: 8px !important;
              font-family: var(--font-mono) !important;
            }
            [data-input-style="holo"] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
            [data-input-style="holo"] textarea,
            [data-input-style="holo"] select {
              background: rgba(8,20,32,0.72) !important;
              border-color: rgba(0,229,255,.4) !important;
              color: var(--text) !important;
              border-radius: 12px !important;
              backdrop-filter: blur(14px);
              box-shadow: 0 0 0 1px rgba(0,229,255,.08), 0 0 14px rgba(0,229,255,.08) !important;
            }
            [data-input-style="crt"] input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]),
            [data-input-style="crt"] textarea,
            [data-input-style="crt"] select {
              background: #020604 !important;
              border-color: rgba(51,255,51,.4) !important;
              color: #33ff33 !important;
              font-family: var(--font-mono) !important;
              border-radius: 2px !important;
              box-shadow: 0 0 0 1px rgba(51,255,51,.06) !important;
            }
            [data-surface-style="brutalist"] body::after { display:none; }
            [data-surface-style="clean-app"] body::after { display:none; }
            [data-surface-style="void"] body::after { display:none; }
            [data-surface-style="holo"] body::after { display:none; }
            [data-surface-style="holo"] body { background: linear-gradient(180deg, rgba(0,229,255,0.03), transparent 40%) !important; }
            [data-surface-style="void"] body { background: #04050a !important; }
          `}</style>
        </ForumProvider>
        </ErrorBoundary>
      </EditProvider>
      </MenuProvider>
      </DialogProvider>
      </NotifyProvider>
    </ThemeContext.Provider>
  )
}
