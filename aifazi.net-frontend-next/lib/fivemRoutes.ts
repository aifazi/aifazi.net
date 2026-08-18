'use client'

import { useState } from 'react'
import { FIVEM_URL, hostOf } from './config'

const FIVEM_HOSTNAME = hostOf(FIVEM_URL)

export function isFiveMHost() {
  if (typeof window === 'undefined') return false
  return window.location.hostname === FIVEM_HOSTNAME
}

export function fivemRoute(path = '/') {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return cleanPath === '/' ? '/fivem' : `/fivem${cleanPath}`
}

export function useFiveMRoute(path = '/') {
  const [onFiveMHost] = useState(() => (typeof window === 'undefined' ? false : isFiveMHost()))

  const cleanPath = path.startsWith('/') ? path : `/${path}`
  if (onFiveMHost) return cleanPath
  return fivemRoute(cleanPath)
}

export function fivemLoginRoute(nextPath = '/connect') {
  return `/login?next=${encodeURIComponent(fivemRoute(nextPath))}`
}

export function useFiveMLoginRoute(nextPath = '/connect') {
  return `/login?next=${encodeURIComponent(useFiveMRoute(nextPath))}`
}
