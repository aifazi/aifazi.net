'use client'

const FIVEM_HOSTNAME = 'fivem.aifazi.net'

export function handOffFiveMAuthCallback(provider: 'discord' | 'steam' | 'github', token: string | null, dest: string) {
  if (typeof window === 'undefined' || !token) return false
  if (window.location.hostname === FIVEM_HOSTNAME) return false
  if (dest !== '/fivem' && !dest.startsWith('/fivem/')) return false

  const cleanDest = dest === '/fivem' ? '/' : dest.replace(/^\/fivem/, '') || '/'
  const url = new URL(`/auth/${provider}-callback`, window.location.href)
  url.hostname = FIVEM_HOSTNAME
  url.search = ''
  url.hash = new URLSearchParams({ token, dest: cleanDest }).toString()
  window.location.replace(url.toString())
  return true
}
