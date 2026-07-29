import { Suspense } from 'react'
import DiscordAuthClient from '@/pages-src/DiscordAuthCallback'

export const metadata = {
  title: 'Connecting Discord — AIFAZI RP',
}

function Loading() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg, #060a0f)',
      fontFamily: 'var(--font-mono, monospace)',
    }}>
      <p style={{ color: '#00ff88', fontSize: 14, letterSpacing: 2 }}>
        CONNECTING DISCORD...
      </p>
    </div>
  )
}

export default function DiscordAuthPage() {
  return (
    <Suspense fallback={<Loading />}>
      <DiscordAuthClient />
    </Suspense>
  )
}
