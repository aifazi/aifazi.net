'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { getSiteSettings } from '@/lib/siteSettings'
import { getSupabase } from '@/lib/supabase'

interface SiteConfigContextValue {
  siteConfig: Record<string, any>
  refreshSiteConfig: () => Promise<void>
  siteConfigReady: boolean
}

const SiteConfigContext = createContext<SiteConfigContextValue>({
  siteConfig: {},
  refreshSiteConfig: async () => {},
  siteConfigReady: false,
})

export const useSiteConfig = () => useContext(SiteConfigContext)

interface SiteConfigProviderProps {
  children: React.ReactNode
}

export function SiteConfigProvider({ children }: SiteConfigProviderProps) {
  const [siteConfig, setSiteConfig] = useState<Record<string, any>>({ maintenanceMode: false, animationPreset: 'smooth', loadingScreenStyle: 'terminal' })
  const [siteConfigReady, setSiteConfigReady] = useState(false)
  const mountedRef = useRef(true)

  const refreshSiteConfig = useCallback(async () => {
    try {
      const data = await getSiteSettings({ fresh: true })
      if (!data || typeof data !== 'object' || Array.isArray(data)) return
      setSiteConfig((prev) => {
        const next = { ...prev, ...data }
        try { localStorage.setItem('site-config-cache', JSON.stringify(next)) } catch {}
        return next
      })
      if (data.globalTheme) {
        window.dispatchEvent(new CustomEvent('site-config-theme-update', { detail: data }))
      }
    } finally {
      setSiteConfigReady(true)
    }
  }, [])

  useEffect(() => { refreshSiteConfig() }, [refreshSiteConfig])

  // Re-fetch settings when admin saves Framework / Site settings (window event)
  useEffect(() => {
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent)?.detail
      if (detail && typeof detail === 'object' && !Array.isArray(detail) && Object.keys(detail).length > 0) {
        const settingsDetail = Object.fromEntries(Object.entries(detail).filter(([key]) => !key.startsWith('_')))
        if (Object.keys(settingsDetail).length === 0) return
        setSiteConfig(prev => {
          const next = { ...prev, ...settingsDetail }
          try { localStorage.setItem('site-config-cache', JSON.stringify(next)) } catch {}
          return next
        })
        if (settingsDetail.globalTheme) {
          window.dispatchEvent(new CustomEvent('site-config-theme-update', { detail: settingsDetail }))
        }
      }
      refreshSiteConfig()
    }
    window.addEventListener('site-settings-updated', onUpdate)
    return () => window.removeEventListener('site-settings-updated', onUpdate)
  }, [refreshSiteConfig])

  // Cross-tab sync via localStorage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'site-config-cache' || !e.newValue) return
      try {
        const parsed = JSON.parse(e.newValue)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return
        setSiteConfig(prev => ({ ...prev, ...parsed }))
        if (parsed.globalTheme) {
          window.dispatchEvent(new CustomEvent('site-config-theme-update', { detail: parsed }))
        }
      } catch {}
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Live push: subscribe to Supabase Realtime on site_config
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

  // Re-check when tab becomes visible
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refreshSiteConfig() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshSiteConfig])

  // Initialize from server-injected config and localStorage cache
  useEffect(() => {
    let cachedConfig: Record<string, any> | null = null
    try {
      const el = document.getElementById('site-config-data')
      if (el?.textContent) {
        const parsed = JSON.parse(el.textContent)
        const keys = Object.keys(parsed)
        const isCorrupted = keys.length > 0 && keys.slice(0, 5).every((k) => /^\d+$/.test(k))
        if (!isCorrupted && keys.length > 0 && mountedRef.current) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
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
          if (!isCorrupted && mountedRef.current) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSiteConfig((prev) => ({ ...prev, ...parsed }))
            cachedConfig = parsed
            setSiteConfigReady(true)
          } else localStorage.removeItem('site-config-cache')
        }
      } catch {}
    }
    return () => { mountedRef.current = false }
  }, [])

  return (
    <SiteConfigContext.Provider value={{ siteConfig, refreshSiteConfig, siteConfigReady }}>
      {children}
    </SiteConfigContext.Provider>
  )
}