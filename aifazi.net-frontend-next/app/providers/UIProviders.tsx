'use client'

import { NotifyProvider } from '@/core/notify'
import { DialogProvider } from '@/core/dialog'
import { MenuProvider } from '@/core/menu'
import { EditProvider } from '@/context/EditContext'
import { ForumProvider } from '@/context/ForumContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useSiteConfig } from './SiteConfigProvider'
import { useAuth } from './AuthProvider'

export function UIProviders({ children }: { children: React.ReactNode }) {
  const { siteConfig } = useSiteConfig()
  const { userPackage } = useAuth()

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

  return (
    <NotifyProvider notifyStyle={eff.notifyStyle || 'cyber'} position={eff.notifyPosition || 'bottom-right'}>
      <DialogProvider dialogStyle={eff.dialogStyle || 'cyber'}>
        <MenuProvider menuStyle={eff.menuStyle || 'cyber'}>
          <EditProvider>
            <ErrorBoundary>
              <ForumProvider>
                {children}
              </ForumProvider>
            </ErrorBoundary>
          </EditProvider>
        </MenuProvider>
      </DialogProvider>
    </NotifyProvider>
  )
}