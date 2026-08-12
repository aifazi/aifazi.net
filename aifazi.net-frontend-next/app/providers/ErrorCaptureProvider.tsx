'use client'

import { useEffect } from 'react'

export function ErrorCaptureProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const report = (source: string, error?: Error | null, url?: string) => {
      if (!error) return
      try {
        fetch('/api/monitor/errors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'frontend',
            error_type: error.name || 'Error',
            message: error.message || String(error),
            stack: error.stack || '',
            endpoint: typeof window !== 'undefined' ? window.location.pathname : '',
            url: typeof window !== 'undefined' ? window.location.href : '',
          }),
        }).catch(() => {})
      } catch {}
    }
    const onError = (e: ErrorEvent) => report('window', e.error || new Error(e.message), e.filename)
    const onRejection = (e: PromiseRejectionEvent) => report('unhandledrejection', e.reason instanceof Error ? e.reason : new Error(String(e.reason)))
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return <>{children}</>
}