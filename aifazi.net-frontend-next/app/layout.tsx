import type { Metadata } from 'next'
import { headers } from 'next/headers'

import { Providers } from './providers'
import { getSiteConfigServer } from '@/lib/siteSettingsServer'
import { getContentBlocksServer } from '@/lib/contentServer'
import { themeFontUrl } from '@/core/fonts'
import { buildThemeCustomCss, resolveThemeCustom, themeCustomFontUrl } from '@/core/themeCustom'
import { LIGHT_THEMES as LIGHT_THEME_LIST, VALID_THEMES } from '@/core/themeCatalog'
import { SITE_URL } from '@/lib/config'
import './globals.css'

/** Escape JSON so it can never break out of an inline <script> (`</script>`). */
function escapeJsonForInline(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

/**
 * FOUC-prevention script with the admin's global config baked in at render time.
 * Priority: locked global theme > user's explicit choice (cookie cross-subdomain or
 * localStorage) > global default > device preference. Falls back to the
 * localStorage cache only when no server config was embedded (e.g. build-time
 * render without a reachable backend). Reads cookies so store.aifazi.net /
 * fivem.aifazi.net pick up the user's choice even though localStorage is
 * origin-isolated per subdomain.
 */
function buildFoucScript(config: Record<string, any>): string {
  const cfgJson = escapeJsonForInline(config)
  const lightsJson = escapeJsonForInline(LIGHT_THEME_LIST)
  return `(function(){try{var cfg=${cfgJson};var LIGHTS=${lightsJson};var c=null;try{var _c=localStorage.getItem('site-config-cache');if(_c)c=JSON.parse(_c)}catch(e){}var conf=cfg||c;function gc(n){try{var v=document.cookie.split('; ');for(var i=0;i<v.length;i++){var p=v[i].indexOf('=');if(p>0&&v[i].slice(0,p)===n)return decodeURIComponent(v[i].slice(p+1))}return null}catch(e){return null}}var u=!!localStorage.getItem('site-theme-user-set')||!!gc('site-theme-user-set');var s=localStorage.getItem('site-theme')||gc('site-theme');var t='cyber-dark';if(conf&&conf.lockTheme&&conf.globalTheme)t=conf.globalTheme;else if(u&&s)t=s;else if(conf&&conf.globalTheme)t=conf.globalTheme;else if(window.matchMedia&&window.matchMedia('(prefers-color-scheme:light)').matches)t='cyber-light';if(t!=='cyber-dark')document.documentElement.setAttribute('data-theme',t);else document.documentElement.removeAttribute('data-theme');document.documentElement.setAttribute('data-theme-mode',LIGHTS.indexOf(t)>=0?'light':'dark');var ba=(conf&&conf.bgAnimation)||'none';if(ba&&ba!=='none'&&ba!=='clean')document.documentElement.setAttribute('data-bg-animation',ba);var bg=(conf&&(conf.gridPattern||conf.backgroundPattern))||'grid';if(bg&&bg!=='none'&&bg!=='clean')document.documentElement.setAttribute('data-bg-grid',bg)}catch(e){}})();`
}

export const metadata: Metadata = {
  title: { default: 'Tanvir | aifazi.net', template: '%s | aifazi.net' },
  description: 'Full-stack developer, community platform, blog and tools.',
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: 'website',
    siteName: 'aifazi.net',
    locale: 'en_US',
  },
  robots: { index: true, follow: true },
}

// Explicit viewport export — ensures correct mobile rendering across all devices
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: dark)',  color: '#060a0f' },
    { media: '(prefers-color-scheme: light)', color: '#c8d4e0' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const nonce = headersList.get('x-nonce') || ''
  const isStoreDomain = headersList.get('x-store-domain') === 'true'
  const isFiveMDomain = headersList.get('x-fivem-domain') === 'true'

  // Server-side global config (cached 30s) — injected into every page so
  // visitors see the admin's settings on first paint, not the default theme.
  const siteConfig = await getSiteConfigServer()
  const foucScript = buildFoucScript(siteConfig)

  // Server-side content blocks (cached 30s) — injected so every EditableText on
  // every page renders the admin's saved value on first paint (no default flash).
  const contentBlocks = await getContentBlocksServer()

  // Apply the admin's global theme/styles directly on <html> at render time.
  // This guarantees no default-theme flash even before any JS runs (and is
  // independent of the CSP nonce behaviour for inline scripts).
  // If the visitor has explicitly picked a theme (cookie .aifazi.net cross-subdomain),
  // honour it server-side so store/fivem SSR with the user's choice on first paint,
  // not the admin's global default. localStorage is origin-isolated per subdomain
  // so only the cookie survives across aifazi.net → store.aifazi.net.
  let serverTheme =
    (siteConfig.globalTheme && typeof siteConfig.globalTheme === 'string' && siteConfig.globalTheme) ||
    'cyber-dark'
  try {
    const cookieHeader = headersList.get('cookie') || ''
    const getCookie = (name: string): string | null => {
      const m = cookieHeader.match(new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'))
      return m ? decodeURIComponent(m[1]) : null
    }
    const locked = !!(siteConfig.lockTheme && siteConfig.globalTheme)
    if (!locked) {
      const userSet = !!getCookie('site-theme-user-set')
      const saved = getCookie('site-theme')
      if (userSet && saved && VALID_THEMES.includes(saved)) serverTheme = saved
      else if (!userSet && siteConfig.globalTheme && VALID_THEMES.includes(siteConfig.globalTheme)) serverTheme = siteConfig.globalTheme
    }
  } catch {}
  const serverThemeMode = LIGHT_THEME_LIST.includes(serverTheme) ? 'light' : 'dark'
  const serverBgAnimation = siteConfig.bgAnimation || 'none'
  const serverBgGrid = siteConfig.gridPattern || siteConfig.backgroundPattern || 'grid'
  const htmlAttrs: Record<string, string> = {}
  if (serverTheme !== 'cyber-dark') htmlAttrs['data-theme'] = serverTheme
  htmlAttrs['data-theme-mode'] = serverThemeMode
  if (serverBgAnimation && serverBgAnimation !== 'none' && serverBgAnimation !== 'clean') {
    htmlAttrs['data-bg-animation'] = serverBgAnimation
  }
  if (serverBgGrid && serverBgGrid !== 'none' && serverBgGrid !== 'clean') {
    htmlAttrs['data-bg-grid'] = serverBgGrid
  }
  if (isStoreDomain) htmlAttrs['data-store'] = 'true'
  if (isFiveMDomain) htmlAttrs['data-fivem'] = 'true'

  return (
    <html lang="en" suppressHydrationWarning {...htmlAttrs}>
      <head>
        {/* Global site config for the client (providers.tsx reads this on mount) */}
        <script
          id="site-config-data"
          type="application/json"
          dangerouslySetInnerHTML={{ __html: escapeJsonForInline(siteConfig) }}
        />
        {/* FOUC prevention: set data-theme before React hydrates, using the
            admin's global config baked in at render time. The nonce is injected
            by proxy.ts per request; the site-config JSON block below is a data
            block (type="application/json") and is exempt from script-src. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: foucScript }} />
        {/* Content blocks are threaded to EditProvider via the `initialContent`
            prop on <Providers> below — SSR and hydration both render the admin's
            saved values, so no default flash and no hydration mismatch. */}
        {/* FIX #12: Only render preconnect when the env var is actually set */}
        {process.env.NEXT_PUBLIC_API_URL && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_API_URL} />
        )}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Always-on UI font (covers cyber-dark / system-font themes) */}
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:ital,wght@0,400;0,500;0,700;1,400&display=swap"
          rel="stylesheet"
        />
        {/* The admin's global theme's display font is injected server-side so the
            first paint already uses the right typeface (no FOUT on page load).
            themeFontUrl() returns '' for system-font themes, so nothing extra
            is loaded for cyber-dark / win95 / etc. */}
        {(() => {
          const url = themeFontUrl(serverTheme)
          return url ? (
            <>
              <link rel="preload" as="style" href={url} />
              <link rel="stylesheet" href={url} />
            </>
          ) : null
        })()}
        {/* Per-theme customization (fonts / colors / glow / custom CSS) for the
            admin's global theme is injected server-side so first paint already
            uses the custom look — no flash before React hydrates. */}
        {(() => {
          // Targeted rollout: resolve the customization that should apply for
          // this server theme. Server doesn't know the session, so logged-in
          // targets resolve on the client (providers) after hydration.
          const tc = resolveThemeCustom(siteConfig, serverTheme, { loggedIn: false })
          const uploadedFonts = Array.isArray(siteConfig.uploadedFonts) ? siteConfig.uploadedFonts : []
          const css = buildThemeCustomCss(serverTheme, tc, uploadedFonts)
          const fontUrl = themeCustomFontUrl(tc, uploadedFonts)
          return (
            <>
              {css ? <style id="theme-custom-css" dangerouslySetInnerHTML={{ __html: css }} /> : null}
              {fontUrl ? (
                <>
                  <link rel="preload" as="style" href={fontUrl} />
                  <link rel="stylesheet" href={fontUrl} />
                </>
              ) : null}
            </>
          )
        })()}
      </head>
      <body suppressHydrationWarning>
        <div className="scanline" />
        <Providers
          isStoreDomain={isStoreDomain}
          isFiveMDomain={isFiveMDomain}
          serverMaintenance={!!siteConfig.maintenanceMode}
          serverSubdomainMaintenance={siteConfig.subdomainMaintenance || {}}
          initialContent={contentBlocks}
          initialConfig={siteConfig}
          initialTheme={serverTheme}
        >{children}</Providers>
      </body>
    </html>
  )
}
