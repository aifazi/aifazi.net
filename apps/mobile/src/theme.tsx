import { createContext, useContext, useState, useCallback, useEffect, useMemo, ReactNode } from 'react'
import * as SecureStore from 'expo-secure-store'
import { AppState, useColorScheme } from 'react-native'
import { THEMES, THEME_IDS, Theme, ThemeId, webThemeToMobile, toggleTheme as toggleThemeId } from './themes'
import { getSiteConfig, SiteConfig } from './lib/siteConfig'
import { resolveFramework, ResolvedFramework } from './framework'

export type ThemeSource = 'locked' | 'user' | 'os' | 'global' | 'default'

interface ThemeCtx {
  theme: Theme
  framework: ResolvedFramework
  setTheme: (id: ThemeId) => void
  cycleTheme: () => void
  toggleTheme: () => void
  source: ThemeSource
  isLocked: boolean
  globalThemeId: ThemeId | null
  siteConfig: SiteConfig | null
  reload: () => Promise<void>
}

const Ctx = createContext<ThemeCtx>({
  theme: THEMES['cyber-dark'],
  framework: resolveFramework(THEMES['cyber-dark'], null),
  setTheme: () => {},
  cycleTheme: () => {},
  toggleTheme: () => {},
  source: 'default',
  isLocked: false,
  globalThemeId: null,
  siteConfig: null,
  reload: async () => {},
})

const STORE_KEY = 'aifazi_mobile_theme'
const REFRESH_MS = 90_000

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [userTheme, setUserTheme] = useState<ThemeId | null>(null)
  const [userSet, setUserSet] = useState(false)
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null)
  const osScheme = useColorScheme()

  const loadSite = useCallback(async (fresh = true) => {
    try {
      setSiteConfig(await getSiteConfig({ fresh }))
    } catch {
      /* keep last known config */
    }
  }, [])

  useEffect(() => {
    let active = true
    SecureStore.getItemAsync(STORE_KEY).then((v) => {
      if (!active) return
      if (v && (THEME_IDS as string[]).includes(v)) {
        setUserTheme(v as ThemeId)
        setUserSet(true)
      }
    }).catch(() => {})
    loadSite(true)
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') loadSite(true)
    }, REFRESH_MS)
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') loadSite(true)
    })
    return () => {
      active = false
      clearInterval(timer)
      sub.remove()
    }
  }, [loadSite])

  /**
   * Priority resolution — mirrors the web (providers.tsx):
   * 1. Admin lock            lockTheme + globalTheme  → forced
   * 2. User's explicit choice                        → user theme
   * 3. Site default          globalTheme             → site theme
   * 4. Follow OS             followOsTheme           → light/dark
   * 5. Fallback                                     → cyber-dark
   */
  const { id, source } = useMemo<{ id: ThemeId; source: ThemeSource }>(() => {
    const cfg = siteConfig ?? {}
    const locked = !!cfg.lockTheme && typeof cfg.globalTheme === 'string'
    if (locked) return { id: webThemeToMobile(cfg.globalTheme), source: 'locked' }
    if (userSet && userTheme) return { id: userTheme, source: 'user' }
    if (typeof cfg.globalTheme === 'string') return { id: webThemeToMobile(cfg.globalTheme), source: 'global' }
    if (cfg.followOsTheme) {
      return { id: osScheme === 'light' ? 'light' : 'cyber-dark', source: 'os' }
    }
    return { id: 'cyber-dark', source: 'default' }
  }, [siteConfig, userSet, userTheme, osScheme])

  const isLocked = source === 'locked'
  const persist = useCallback((next: ThemeId) => {
    setUserTheme(next)
    setUserSet(true)
    SecureStore.setItemAsync(STORE_KEY, next).catch(() => {})
  }, [])

  const setTheme = useCallback(
    (next: ThemeId) => {
      if ((THEME_IDS as string[]).includes(next) && !isLocked) persist(next)
    },
    [isLocked, persist],
  )

  const cycleTheme = useCallback(() => {
    if (isLocked) return
    const idx = THEME_IDS.indexOf(id)
    const next = THEME_IDS[(idx + 1) % THEME_IDS.length]
    persist(next)
  }, [id, isLocked, persist])

  /** Toggle the current theme to its light/dark counterpart (web parity). */
  const toggleTheme = useCallback(() => {
    if (isLocked) return
    persist(toggleThemeId(id))
  }, [id, isLocked, persist])

  const reload = useCallback(() => loadSite(true), [loadSite])

  const value = useMemo<ThemeCtx>(
    () => ({
      theme: THEMES[id],
      framework: resolveFramework(THEMES[id], siteConfig),
      setTheme,
      cycleTheme,
      toggleTheme,
      source,
      isLocked,
      globalThemeId: typeof siteConfig?.globalTheme === 'string' ? webThemeToMobile(siteConfig.globalTheme) : null,
      siteConfig,
      reload,
    }),
    [id, siteConfig, setTheme, cycleTheme, toggleTheme, source, isLocked, reload],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)