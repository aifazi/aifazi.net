'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { getUserPackage, setUserPackage } from '@/lib/userPackage'
import { isAdmin as checkIsAdmin } from '@/lib/api'
import { useSiteConfig } from './SiteConfigProvider'

interface AuthContextValue {
  isAdmin: boolean
  userPackage: { id: string; settings: Record<string, any> } | null
  applyUserPackage: (pkg: { id: string; settings: Record<string, any> }) => void
  clearUserPackage: () => void
}

const AuthContext = createContext<AuthContextValue>({
  isAdmin: false,
  userPackage: null,
  applyUserPackage: () => {},
  clearUserPackage: () => {},
})

export const useAuth = () => useContext(AuthContext)

interface AuthProviderProps {
  children: React.ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { siteConfig } = useSiteConfig()
  const [isAdmin, setIsAdmin] = useState(false)
  const [userPackage, setUserPackageState] = useState<{ id: string; settings: Record<string, any> } | null>(() => {
    if (typeof window === 'undefined') return null
    const pkg = getUserPackage()
    return pkg?.id && pkg.settings ? pkg : null
  })

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

  // Check admin status on auth changes
  useEffect(() => {
    const refresh = () => setIsAdmin(checkIsAdmin())
    window.addEventListener('auth-change', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('auth-change', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const applyUserPackage = (pkg: { id: string; settings: Record<string, any> }) => {
    if (!pkg?.id || !pkg?.settings) return
    if (siteConfig.lockTheme) return
    const s = pkg.settings
    if (s.globalTheme) {
      window.dispatchEvent(new CustomEvent('apply-user-theme', { detail: s.globalTheme }))
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

  return (
    <AuthContext.Provider value={{ isAdmin, userPackage, applyUserPackage, clearUserPackage }}>
      {children}
    </AuthContext.Provider>
  )
}