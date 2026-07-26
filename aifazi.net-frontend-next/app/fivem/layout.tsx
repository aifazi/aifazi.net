import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { default: 'AIFAZI RP', template: '%s | AIFAZI RP' },
  description: 'AIFAZI RP FiveM serious roleplay server: whitelist, connect, and server status.',
  metadataBase: new URL('https://fivem.aifazi.net'),
  openGraph: {
    type: 'website',
    siteName: 'AIFAZI RP',
    title: 'AIFAZI RP',
    description: 'AIFAZI RP FiveM serious roleplay server.',
    url: 'https://fivem.aifazi.net',
  },
}

export default function FiveMLayout({ children }: { children: React.ReactNode }) {
  return children
}
