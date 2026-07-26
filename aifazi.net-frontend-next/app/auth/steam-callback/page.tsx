import { Suspense } from 'react'
import SteamCallbackClient from '@/pages-src/SteamAuthCallback'

export const metadata = {
  title: 'Connecting Steam — AIFAZI RP',
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
      <p style={{ color: '#00b4ff', fontSize: 14, letterSpacing: 2 }}>
        CONNECTING STEAM...
      </p>
    </div>
  )
}

export default function SteamCallbackPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SteamCallbackClient />
    </Suspense>
  )
}
