'use client'

import { ThemeProvider } from './ThemeProvider'
import { SiteConfigProvider } from './SiteConfigProvider'
import { AuthProvider } from './AuthProvider'
import { MaintenanceProvider } from './MaintenanceProvider'
import { RealtimeProvider } from './RealtimeProvider'
import { ErrorCaptureProvider } from './ErrorCaptureProvider'
import { OSPreferenceProvider } from './OSPreferenceProvider'
import { UIProviders } from './UIProviders'
import LoadingScreen from '@/components/LoadingScreen'
import Cursor from '@/components/Cursor'
import ContextMenu from '@/components/ContextMenu'
import Navbar from '@/components/Navbar'
import SiteBanner from '@/components/SiteBanner'
import FunDragLayer from '@/components/FunDragLayer'
import Footer from '@/components/Footer'
import FloatingNav from '@/components/FloatingNav'
import RoamingRobot from '@/components/RoamingRobot'
import { useSiteConfig } from './SiteConfigProvider'
import { useAuth } from './AuthProvider'
import { useTheme } from './ThemeProvider'
import { usePathname } from 'next/navigation'
import { useSyncExternalStore, Suspense, lazy, useCallback, useState, useEffect, useRef } from 'react'

const MaintenanceScreen = lazy(() => import('@/components/MaintenanceScreen'))

function ProvidersInner({ children, isStoreDomain, isFiveMDomain, serverMaintenance, serverSubdomainMaintenance }: {
  children: React.ReactNode
  isStoreDomain?: boolean
  isFiveMDomain?: boolean
  serverMaintenance?: boolean
  serverSubdomainMaintenance?: Record<string, any>
}) {
  const pathname = usePathname()
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false)
  const { siteConfig, siteConfigReady } = useSiteConfig()
  const { isAdmin, userPackage } = useAuth()
  const { theme } = useTheme()

  const [loading, setLoading] = useState(false)
  const mountedRef = useRef(true)

  // Show loading screen only when this build hasn't been booted before
  useEffect(() => {
    const BUILD_ID = process.env.BUILD_ID || 'dev'
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (localStorage.getItem('site-loaded') !== BUILD_ID && mountedRef.current) setLoading(true)
    return () => { mountedRef.current = false }
  }, [])

  const onLoadComplete = useCallback(() => {
    setLoading(false)
    const BUILD_ID = process.env.BUILD_ID || 'dev'
    localStorage.setItem('site-loaded', BUILD_ID)
  }, [])

  const pkgSettings = userPackage?.settings || {}
  const eff = {
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

  const isFullScreen = /^\/(admin|chat|users\/chat|store)/.test(pathname || '') || siteConfig.isStoreDomain || isStoreDomain

  const showMaintenance = (() => {
    if (isAdmin) return false
    const subMaint = siteConfig.subdomainMaintenance || serverSubdomainMaintenance || {}
    if (isStoreDomain && subMaint.store?.maintenanceMode) return true
    if (isFiveMDomain && subMaint.fivem?.maintenanceMode) return true
    return siteConfig.maintenanceMode ?? serverMaintenance
  })()

  const maintenanceProps = {
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
  }

  return (
    <>
      {!showMaintenance && loading && (
        <Suspense fallback={null}>
          <LoadingScreen onComplete={onLoadComplete} style={eff.loadingScreenStyle} />
        </Suspense>
      )}
      {showMaintenance && (
        <Suspense fallback={null}>
          <MaintenanceScreen {...maintenanceProps} />
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
    </>
  )
}

export function Providers({ children, isStoreDomain = false, isFiveMDomain = false, serverMaintenance = false, serverSubdomainMaintenance = {} }: {
  children: React.ReactNode
  isStoreDomain?: boolean
  isFiveMDomain?: boolean
  serverMaintenance?: boolean
  serverSubdomainMaintenance?: Record<string, any>
}) {
  return (
    <SiteConfigProvider>
      <AuthProvider>
        <ThemeProvider>
          <MaintenanceProvider
            isStoreDomain={isStoreDomain}
            isFiveMDomain={isFiveMDomain}
            serverMaintenance={serverMaintenance}
            serverSubdomainMaintenance={serverSubdomainMaintenance}
          >
            <RealtimeProvider>
              <ErrorCaptureProvider>
                <OSPreferenceProvider>
                  <UIProviders>
                    <ProvidersInner
                      isStoreDomain={isStoreDomain}
                      isFiveMDomain={isFiveMDomain}
                      serverMaintenance={serverMaintenance}
                      serverSubdomainMaintenance={serverSubdomainMaintenance}
                    >
                      {children}
                    </ProvidersInner>
                  </UIProviders>
                </OSPreferenceProvider>
              </ErrorCaptureProvider>
            </RealtimeProvider>
          </MaintenanceProvider>
        </ThemeProvider>
      </AuthProvider>
    </SiteConfigProvider>
  )
}