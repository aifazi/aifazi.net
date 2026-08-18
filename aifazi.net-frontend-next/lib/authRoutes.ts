import { API_URL } from './config'

export function browserApiOrigin() {
  const configured = process.env.NEXT_PUBLIC_API_URL || ''
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8000'
    if (configured && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(configured)) return configured
    return API_URL
  }
  return configured || ''
}

/**
 * safeNextPath — validate a user-supplied redirect target.
 * Rejects absolute URLs (`https://...`), protocol-relative (`//evil`), backslash
 * schemes (`\\evil`), and any value that isn't a same-origin relative path starting
 * with `/`. Returns null if the value is unsafe; the caller must use a safe default.
 *
 * Used by OAuth callbacks (Discord/Steam) to prevent open-redirect via the `dest`
 * query/hash parameter, which is attacker-controllable at the URL bar.
 */
export function safeNextPath(value: unknown): string | null {
  if (!value || typeof value !== 'string') return null
  // Must start with '/' and not '//' (protocol-relative)
  if (!value.startsWith('/') || value.startsWith('//')) return null
  // No scheme separators, no backslashes (Windows-style phishing)
  if (value.includes('://') || value.includes('\\')) return null
  // Reject control chars / whitespace that browsers might coerce
  if (/[\u0000-\u001F\u007F]/.test(value)) return null
  // Reject backspace-encoded path escapes (e.g. '/\evil.com')
  if (value.includes('/\\')) return null
  // Never redirect back onto an auth-only page (would show the login form again
  // or loop). Callers default to /profile when this returns null.
  const path = value.split('?')[0].split('#')[0].toLowerCase()
  if (
    path === '/login' || path === '/signin' || path === '/signup' ||
    path === '/register' || path === '/forgot' || path === '/forgot-password' ||
    path === '/reset' || path === '/reset-password' || path === '/verify' ||
    path === '/verify-email' || path === '/2fa' || path === '/two-factor' ||
    path === '/forum/auth' || path.startsWith('/auth/')
  ) return null
  return value
}

export function authProviderLoginRoute(provider: 'discord' | 'steam' | 'github', dest = '/profile') {
  const apiOrigin = browserApiOrigin()
  const safeDest = safeNextPath(dest) || '/profile'
  // Discord login lives on the unified /api/auth router (routers/auth.py); Steam
  // and GitHub keep their dedicated routers mounted at /api/forum/auth/{steam,github}.
  const base = provider === 'discord' ? '/api/auth/discord' : `/api/forum/auth/${provider}`
  return `${apiOrigin}${base}/login?dest=${encodeURIComponent(safeDest)}`
}
