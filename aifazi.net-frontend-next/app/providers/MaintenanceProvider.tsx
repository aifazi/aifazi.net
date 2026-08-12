'use client'

import { createContext, useContext, useMemo } from 'react'
import { lazy, Suspense } from 'react'
import { useSiteConfig } from './SiteConfigProvider'
import { useAuth } from './AuthProvider'

const MaintenanceScreen = lazy(() => import('@/components/MaintenanceScreen'))

interface MaintenanceContextValue {
  showMaintenance: boolean
}

const MaintenanceContext = createContext<MaintenanceContextValue>({
  showMaintenance: false,
})

export const useMaintenance = () => useContext(MaintenanceContext)

interface MaintenanceProviderProps {
  children: React.ReactNode
  isStoreDomain: boolean
  isFiveMDomain: boolean
  serverMaintenance: boolean
  serverSubdomainMaintenance: Record<string, any>
}

export function MaintenanceProvider({ children, isStoreDomain, isFiveMDomain, serverMaintenance, serverSubdomainMaintenance }: MaintenanceProviderProps) {
  const { siteConfig } = useSiteConfig()
  const { isAdmin } = useAuth()

  const showMaintenance = useMemo(() => {
    if (isAdmin) return false
    const subMaint = siteConfig.subdomainMaintenance || serverSubdomainMaintenance || {}
    if (isStoreDomain && subMaint.store?.maintenanceMode) return true
    if (isFiveMDomain && subMaint.fivem?.maintenanceMode) return true
    return siteConfig.maintenanceMode ?? serverMaintenance
  }, [isAdmin, siteConfig.subdomainMaintenance, serverSubdomainMaintenance, isStoreDomain, isFiveMDomain, siteConfig.maintenanceMode, serverMaintenance])

  const maintenanceProps = useMemo(() => ({
    style: (isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceStyle)
        || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceStyle)
        || siteConfig.maintenanceStyle || 'terminal',
    message: (isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceMessage)
          || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceMessage)
          || siteConfig.maintenanceMessage || "We're performing scheduled upgrades. We'll be back online shortly.",
    status: (isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceStatus)
         || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceStatus)
         || siteConfig.maintenanceStatus || 'MAINTENANCE',
    icon: (isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceIcon)
       || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceIcon)
       || siteConfig.maintenanceIcon || '⚙️',
    returnTime: (isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceReturnTime)
             || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceReturnTime)
             || siteConfig.maintenanceReturnTime || '',
    showProgress: (isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceShowProgress)
               || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceShowProgress)
               || !!siteConfig.maintenanceShowProgress,
    progress: (isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceProgress)
           || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceProgress)
           || siteConfig.maintenanceProgress || 0,
    showSocial: (isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceShowSocial)
             || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceShowSocial)
             || (siteConfig.maintenanceShowSocial !== false),
    bgStyle: (isStoreDomain && siteConfig.subdomainMaintenance?.store?.maintenanceBgStyle)
          || (isFiveMDomain && siteConfig.subdomainMaintenance?.fivem?.maintenanceBgStyle)
          || siteConfig.maintenanceBgStyle || 'grid',
    siteConfig,
  }), [isStoreDomain, isFiveMDomain, siteConfig])

  return (
    <MaintenanceContext.Provider value={{ showMaintenance }}>
      {showMaintenance && (
        <Suspense fallback={null}>
          <MaintenanceScreen {...maintenanceProps} />
        </Suspense>
      )}
      {!showMaintenance && children}
    </MaintenanceContext.Provider>
  )
}