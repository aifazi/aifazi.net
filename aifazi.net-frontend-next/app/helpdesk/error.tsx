'use client'
'use client'

/**
 * app/helpdesk/error.tsx — route-level error boundary for /helpdesk
 *
 * Catches two failure modes:
 *   1. JS chunk hash mismatch after a new deployment (browser cached old HTML
 *      pointing to a chunk that no longer exists on the CDN).
 *   2. Any unhandled render error inside the HelpDesk component tree.
 *
 * Shows a friendly recovery card with a hard-reload button instead of the
 * default Next.js "Application error: a client-side exception" white screen.
 */
import { useEffect } from 'react'

export default function HelpDeskError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[helpdesk] render error:', error)
  }, [error])

  const isChunkError =
    error?.message?.includes('Loading chunk') ||
    error?.message?.includes('ChunkLoadError') ||
    error?.message?.includes('Failed to fetch') ||
    error?.message?.includes('Loading CSS chunk')

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        maxWidth: 480, width: '100%', background: 'var(--bg2)',
        border: '1px solid var(--border)', borderRadius: 12,
        padding: '36px 32px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>
          {isChunkError ? '🔄' : '⚠️'}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3,
          color: isChunkError ? 'var(--cyan)' : '#ff4757', marginBottom: 12,
        }}>
          {isChunkError ? 'NEW VERSION AVAILABLE' : 'PAGE ERROR'}
        </div>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700,
          marginBottom: 12, color: 'var(--text)',
        }}>
          {isChunkError ? 'Site was just updated' : 'Something went wrong'}
        </h2>
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)',
          lineHeight: 1.7, marginBottom: 24,
        }}>
          {isChunkError
            ? 'A new version of aifazi.net was deployed. Please reload to get the latest version.'
            : 'An unexpected error occurred loading this page. Try reloading — if the problem persists please submit a ticket.'}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
              padding: '11px 24px', background: 'var(--green)', color: '#000',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700,
            }}
          >
            🔄 RELOAD PAGE
          </button>
          {!isChunkError && (
            <button
              onClick={reset}
              style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
                padding: '11px 24px', background: 'transparent', color: 'var(--muted)',
                border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
              }}
            >
              TRY AGAIN
            </button>
          )}
        </div>
        {error?.digest && (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--border)',
            marginTop: 20, letterSpacing: 1,
          }}>
            Error ID: {error.digest}
          </div>
        )}
      </div>
    </div>
  )
}
