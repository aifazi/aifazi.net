export function browserApiOrigin() {
  const configured = process.env.NEXT_PUBLIC_API_URL || ''
  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8000'
    if (configured && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(configured)) return configured
    return 'https://api.aifazi.net'
  }
  return configured || ''
}

export function authProviderLoginRoute(provider: 'discord' | 'steam', dest = '/profile') {
  const apiOrigin = browserApiOrigin()
  return `${apiOrigin}/api/forum/auth/${provider}/login?dest=${encodeURIComponent(dest)}`
}
