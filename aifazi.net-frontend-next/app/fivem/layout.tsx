import type { Metadata } from 'next'
import { FIVEM_URL } from '@/lib/config'

export const metadata: Metadata = {
  title: { default: 'AIFAZI RP', template: '%s | AIFAZI RP' },
  description: 'AIFAZI RP FiveM serious roleplay server: whitelist, connect, and server status.',
  metadataBase: new URL(FIVEM_URL),
  openGraph: {
    type: 'website',
    siteName: 'AIFAZI RP',
    title: 'AIFAZI RP',
    description: 'AIFAZI RP FiveM serious roleplay server.',
    url: FIVEM_URL,
  },
}

export default function FiveMLayout({ children }: { children: React.ReactNode }) {
  return children
}
