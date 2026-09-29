'use client'
import { useEffect, useState } from 'react'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [stack, setStack] = useState(() => (process.env.NODE_ENV !== 'production' ? (error.stack || '') : ''))
  const [prevError, setPrevError] = useState(error)
  if (prevError !== error) {
    setPrevError(error)
    if (process.env.NODE_ENV !== 'production') setStack(error.stack || '')
  }

  useEffect(() => {
    console.error('GlobalError caught:', error)
  }, [error])

  // Same chunk-mismatch heuristic as app/helpdesk/error.tsx: after a deploy,
  // cached HTML can reference deleted chunks. Offer a hard reload for those.
  const msg = error?.message || ''
  const isChunkError =
    msg.includes('Loading chunk') ||
    msg.includes('ChunkLoadError') ||
    msg.includes('Failed to fetch') ||
    msg.includes('Loading CSS chunk')

  return (
    <div style={{ background: '#060a0f', color: '#ff4757', fontFamily: 'monospace', padding: 40, lineHeight: 1.6, minHeight: '100vh' }}>
      <h1 style={{ color: isChunkError ? '#00d4ff' : '#ff4757', fontSize: 22, margin: 0 }}>
        {isChunkError ? 'Site was just updated' : 'Application Error'}
      </h1>
      <p style={{ color: '#8899aa', fontSize: 13 }}>
        {isChunkError
          ? 'A new version was deployed. Reload to get the latest files.'
          : error.message}
      </p>
      {stack && <pre style={{ color: '#556677', fontSize: 11, marginTop: 20, maxWidth: '100%', overflow: 'auto' }}>{stack}</pre>}
      <button onClick={() => (isChunkError ? window.location.reload() : reset())} style={{ marginTop: 20, padding: '8px 20px', background: '#1a2a3a', border: '1px solid #ff4757', color: '#ff4757', cursor: 'pointer', fontFamily: 'monospace', fontSize: 12 }}>
        {isChunkError ? 'Reload Now' : 'Try Again'}
      </button>
    </div>
  )
}