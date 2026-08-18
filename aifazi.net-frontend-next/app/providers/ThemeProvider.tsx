'use client'

import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import { loadFontForTheme as loadThemeFont } from '@/core/fonts'
import { useSiteConfig } from './SiteConfigProvider'

const VALID_THEMES = [
  'cyber-dark','cyber-light','light',
  'midnight','midnight-light',
  'crimson','crimson-light',
  'ocean','ocean-light',
  'amber','amber-light',
  'rose','rose-light',
  'forest','forest-light',
  'lava','lava-light','toxic','toxic-light','ice',
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
  'ember-dark','ember-light',
  'cobalt-dark','cobalt-light',
  'slate-dark','slate-light',
  'honey-dark','honey-light',
  'violet-dark','violet-light',
  'teal-dark','teal-light',
]

const LIGHT_THEMES = [
  'light','cyber-light',
  'midnight-light','crimson-light','ocean-light','amber-light',
  'rose-light','forest-light','glass-light','synthwave-light',
  'terminal-light','neon-noir-light','aurora-light',
  'mario-light','minecraft-light','sonic-light','pacman-light',
  'lava-light','toxic-light',
  'ice',
  'brutalist','paper','neumorph','macos','pastel','win95',
  'ember-light','cobalt-light','slate-light','honey-light','violet-light','teal-light',
]

const THEME_PAIRS: Record<string,string> = {
  'cyber-dark':'cyber-light', 'cyber-light':'cyber-dark',
  'light':'cyber-dark',
  'midnight':'midnight-light', 'midnight-light':'midnight',
  'crimson':'crimson-light',   'crimson-light':'crimson',
  'ocean':'ocean-light',       'ocean-light':'ocean',
  'amber':'amber-light',       'amber-light':'amber',
  'rose':'rose-light',         'rose-light':'rose',
  'forest':'forest-light',     'forest-light':'forest',
  'lava':'lava-light',          'lava-light':'lava',
  'toxic':'toxic-light',        'toxic-light':'toxic',
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
  'ember-dark':'ember-light',   'ember-light':'ember-dark',
  'cobalt-dark':'cobalt-light', 'cobalt-light':'cobalt-dark',
  'slate-dark':'slate-light',   'slate-light':'slate-dark',
  'honey-dark':'honey-light',   'honey-light':'honey-dark',
  'violet-dark':'violet-light', 'violet-light':'violet-dark',
  'teal-dark':'teal-light',     'teal-light':'teal-dark',
}

function loadFontForTheme(themeId: string) {
  if (typeof document === 'undefined') return
  return loadThemeFont(themeId)
}

export interface ThemeContextValue {
  theme: string
  setTheme: (id: string) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'cyber-dark',
  setTheme: () => {},
  toggleTheme: () => {},
})

export const useTheme = () => useContext(ThemeContext)

interface ThemeProviderProps {
  children: React.ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { siteConfig } = useSiteConfig()
  const [theme, setThemeState] = useState('cyber-dark')
  const firstThemeSync = useRef(true)

  const setTheme = useCallback((id: string) => {
    if (!VALID_THEMES.includes(id)) return
    if (siteConfig.lockTheme && siteConfig.globalTheme && VALID_THEMES.includes(siteConfig.globalTheme)) return
    loadFontForTheme(id)
    setThemeState(id)
    if (LIGHT_THEMES.includes(id)) localStorage.setItem('last-light-theme', id)
    else localStorage.setItem('last-dark-theme', id)
    localStorage.setItem('site-theme', id)
    localStorage.setItem('site-theme-user-set', '1')
  }, [siteConfig.lockTheme, siteConfig.globalTheme])

  const toggleTheme = useCallback(() => {
    const pair = THEME_PAIRS[theme]
    if (pair && VALID_THEMES.includes(pair)) {
      setTheme(pair)
    } else {
      const isLight = LIGHT_THEMES.includes(theme)
      const last = localStorage.getItem(isLight ? 'last-dark-theme' : 'last-light-theme')
      if (last && VALID_THEMES.includes(last) && LIGHT_THEMES.includes(last) !== isLight) {
        setTheme(last)
      } else {
        setTheme(isLight ? 'cyber-dark' : 'cyber-light')
      }
    }
  }, [theme, setTheme])

  useEffect(() => {
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

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}