import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import * as SecureStore from 'expo-secure-store'
import { THEMES, THEME_IDS, Theme, ThemeId } from './themes'

interface ThemeCtx {
  theme: Theme
  setTheme: (id: ThemeId) => void
  cycleTheme: () => void
}

const Ctx = createContext<ThemeCtx>({
  theme: THEMES['cyber-dark'],
  setTheme: () => {},
  cycleTheme: () => {},
})

const STORE_KEY = 'aifazi_mobile_theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<ThemeId>('cyber-dark')

  useEffect(() => {
    SecureStore.getItemAsync(STORE_KEY)
      .then((v) => {
        if (v && (THEME_IDS as string[]).includes(v)) setId(v as ThemeId)
      })
      .catch(() => {})
  }, [])

  const setTheme = useCallback((next: ThemeId) => {
    setId(next)
    SecureStore.setItemAsync(STORE_KEY, next).catch(() => {})
  }, [])

  const cycleTheme = useCallback(() => {
    const idx = THEME_IDS.indexOf(id)
    const next = THEME_IDS[(idx + 1) % THEME_IDS.length]
    setId(next)
    SecureStore.setItemAsync(STORE_KEY, next).catch(() => {})
  }, [id])

  return <Ctx.Provider value={{ theme: THEMES[id], setTheme, cycleTheme }}>{children}</Ctx.Provider>
}

export const useTheme = () => useContext(Ctx)
