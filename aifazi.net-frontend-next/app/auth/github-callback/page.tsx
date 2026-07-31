import { Suspense } from 'react'
import GitHubCallbackClient from '@/pages-src/GitHubAuthCallback'

export const metadata = {
  title: 'Connecting GitHub — AIFAZI RP',
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
        CONNECTING GITHUB...
      </p>
    </div>
  )
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={<Loading />}>
      <GitHubCallbackClient />
    </Suspense>
  )
}
