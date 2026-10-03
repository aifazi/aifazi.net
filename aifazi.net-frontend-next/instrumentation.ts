// Registers Sentry server/edge configs (Sentry v11 + Next.js instrumentation).
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// v11: capture errors from Server Components, middleware, and proxies.
export const onRequestError = Sentry.captureRequestError
