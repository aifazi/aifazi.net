'use client'

import { useEffect } from 'react'
import { useSiteConfig } from './SiteConfigProvider'
import { useTheme } from './ThemeProvider'

export function OSPreferenceProvider({ children }: { children: React.ReactNode }) {
  const { siteConfig } = useSiteConfig()
  const { setTheme } = useTheme()

  useEffect(() => {
    if (!siteConfig.followOsTheme || siteConfig.lockTheme) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem('site-theme-user-set')) return
      const id = e.matches ? 'cyber-dark' : 'cyber-light'
      setTheme(id)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [siteConfig.followOsTheme, siteConfig.lockTheme, setTheme])

  return <>{children}</>
}