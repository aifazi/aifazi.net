import type { Metadata } from 'next'

import { Providers } from './providers'
import { getSiteConfigServer } from '@/lib/siteSettingsServer'
import './globals.css'

// Light themes (mirrors LIGHT_THEMES in app/providers.tsx) — used to set
// data-theme-mode correctly before hydration.
const LIGHT_THEME_LIST = [
  'light', 'cyber-light',
  'midnight-light', 'crimson-light', 'ocean-light', 'amber-light',
  'rose-light', 'forest-light', 'glass-light', 'synthwave-light',
  'terminal-light', 'neon-noir-light', 'aurora-light',
  'brutalist', 'paper', 'neumorph', 'macos', 'pastel', 'win95',
]

/** Escape JSON so it can never break out of an inline <script> (`</script>`). */
function escapeJsonForInline(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

/**
 * FOUC-prevention script with the admin's global config baked in at render time.
 * Priority: locked global theme > user's explicit choice > global default >
 * device preference. Falls back to the localStorage cache only when no server
 * config was embedded (e.g. build-time render without a reachable backend).
 */
function buildFoucScript(config: Record<string, any>): string {
  const cfgJson = escapeJsonForInline(config)
  const lightsJson = escapeJsonForInline(LIGHT_THEME_LIST)
  return `(function(){try{var cfg=${cfgJson};var LIGHTS=${lightsJson};var c=null;try{var _c=localStorage.getItem('site-config-cache');if(_c)c=JSON.parse(_c)}catch(e){}var conf=cfg||c;var u=!!localStorage.getItem('site-theme-user-set');var s=localStorage.getItem('site-theme');var t='cyber-dark';if(conf&&conf.lockTheme&&conf.globalTheme)t=conf.globalTheme;else if(u&&s)t=s;else if(conf&&conf.globalTheme)t=conf.globalTheme;else if(window.matchMedia&&window.matchMedia('(prefers-color-scheme:light)').matches)t='cyber-light';if(t!=='cyber-dark')document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-theme-mode',LIGHTS.indexOf(t)>=0?'light':'dark');var ba=(conf&&conf.bgAnimation)||'none';if(ba&&ba!=='none'&&ba!=='clean')document.documentElement.setAttribute('data-bg-animation',ba);var bg=(conf&&(conf.gridPattern||conf.backgroundPattern))||'grid';if(bg&&bg!=='none'&&bg!=='clean')document.documentElement.setAttribute('data-bg-grid',bg)}catch(e){}})();`
}

export const metadata: Metadata = {
  title: { default: 'Tanvir | aifazi.net', template: '%s | aifazi.net' },
  description: 'Full-stack developer, community platform, blog and tools.',
  metadataBase: new URL('https://aifazi.net'),
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
  // Server-side global config (cached 30s) — injected into every page so
  // visitors see the admin's settings on first paint, not the default theme.
  const siteConfig = await getSiteConfigServer()
  const foucScript = buildFoucScript(siteConfig)

  // Apply the admin's global theme/styles directly on <html> at render time.
  // This guarantees no default-theme flash even before any JS runs (and is
  // independent of the CSP nonce behaviour for inline scripts).
  const serverTheme =
    (siteConfig.globalTheme && typeof siteConfig.globalTheme === 'string' && siteConfig.globalTheme) ||
    'cyber-dark'
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
            admin's global config baked in at render time */}
        <script dangerouslySetInnerHTML={{ __html: foucScript }} />
        {/* FIX #12: Only render preconnect when the env var is actually set */}
        {process.env.NEXT_PUBLIC_API_URL && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_API_URL} />
        )}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:ital,wght@0,400;0,500;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <div className="scanline" />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
