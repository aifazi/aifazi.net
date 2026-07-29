import type { Metadata } from 'next'

import { Providers } from './providers'
import './globals.css'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* FOUC prevention: set data-theme before React hydrates */}
        <script dangerouslySetInnerHTML={{
          __html: `(function(){try{var t='cyber-dark',c,u,s;try{var _c=localStorage.getItem('site-config-cache');if(_c)c=JSON.parse(_c)}catch(e){}s=localStorage.getItem('site-theme');u=!!localStorage.getItem('site-theme-user-set');if(c&&c.lockTheme&&c.globalTheme)t=c.globalTheme;else if(u&&s)t=s;else if(c&&c.globalTheme)t=c.globalTheme;else if(window.matchMedia('(prefers-color-scheme:dark)').matches)t='cyber-dark';else if(window.matchMedia('(prefers-color-scheme:light)').matches)t='cyber-light';if(t!=='cyber-dark')document.documentElement.setAttribute('data-theme',t);var ba=(c&&c.bgAnimation)||'none';if(ba&&ba!=='none')document.documentElement.setAttribute('data-bg-animation',ba);var bg=(c&&c.gridPattern)||(c&&c.backgroundPattern)||'grid';if(bg)document.documentElement.setAttribute('data-bg-grid',bg)}catch(e){}})();`
        }} />
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
