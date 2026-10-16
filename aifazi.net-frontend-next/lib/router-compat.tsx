/**
 * lib/router-compat.tsx
 * Drop-in shim: maps react-router-dom hooks → Next.js equivalents.
 * Import this instead of react-router-dom in converted components.
 *
 * Usage in components:
 *   import { Link, useNavigate, useLocation, useParams } from '@/lib/router-compat'
 */
'use client'

import NextLink from 'next/link'
import React, { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useRouter, usePathname, useParams as _useParams } from 'next/navigation'

export { usePathname, useSearchParams } from 'next/navigation'
export { useRouter as _useRouter } from 'next/navigation'

/**
 * Drop-in Link that accepts react-router-dom's `to` prop (and optional `state`)
 * and maps it to Next.js Link's `href`.
 * `state` is stored in sessionStorage so useLocation().state can pick it up.
 */
export function Link({
  to,
  href,
  state,
  children,
  onClick,
  ...rest
}: {
  to?: string
  href?: string
  state?: any
  children?: React.ReactNode
  onClick?: React.MouseEventHandler<HTMLAnchorElement>
  [key: string]: any
}) {
  const dest = (to ?? href ?? '/') as string
  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
    if (state !== undefined) {
      try { sessionStorage.setItem('nav-state:' + dest, JSON.stringify(state)) } catch {}
    }
    if (onClick) onClick(e)
  }
  return (
    <NextLink href={dest} onClick={handleClick} {...rest}>
      {children}
    </NextLink>
  )
}

/** Replaces react-router useNavigate */
export function useNavigate() {
  const router = useRouter()
  return useCallback((to: string | number, opts?: { replace?: boolean; state?: any }) => {
    if (typeof to === 'number') {
      if (to === -1) router.back()
      else router.forward()
      return
    }
    if (opts?.replace) router.replace(to)
    else router.push(to)
  }, [router])
}

// Replaces react-router useLocation — hydration-safe. The client snapshot is
// read from window/sessionStorage through useSyncExternalStore (an external
// store), not by calling setState inside an effect: a render must stay pure,
// and the one-shot nav-state must not be drained during render or twice under
// StrictMode's double render.
type LocSnapshot = { search: string; hash: string; state: any }
const EMPTY_SNAPSHOT: LocSnapshot = { search: '', hash: '', state: null }
let _snapKey = ''
let _snap: LocSnapshot = EMPTY_SNAPSHOT

function _clientSnapshot(pathname: string): LocSnapshot {
  if (typeof window === 'undefined') return EMPTY_SNAPSHOT
  const search = window.location.search
  const hash = window.location.hash
  let raw = ''
  try {
    raw = sessionStorage.getItem('nav-state:' + pathname) || ''
  } catch {}
  const key = `${pathname}\u0000${search}\u0000${hash}\u0000${raw}`
  if (key === _snapKey) return _snap // cached → referentially stable per read
  let state: any = null
  if (raw) {
    try {
      state = JSON.parse(raw)
    } catch {}
  }
  _snapKey = key
  _snap = { search, hash, state }
  return _snap
}

const _subscribe = () => () => {}

export function useLocation() {
  const pathname = usePathname()
  const getSnapshot = useCallback(() => _clientSnapshot(pathname), [pathname])
  const snapshot = useSyncExternalStore(_subscribe, getSnapshot, () => EMPTY_SNAPSHOT)

  // Consume the one-shot nav-state after it has been read (idempotent — the
  // removal is a side effect, so it belongs in an effect, not in render).
  useEffect(() => {
    try {
      sessionStorage.removeItem('nav-state:' + pathname)
    } catch {}
  }, [pathname])

  return { pathname, search: snapshot.search, hash: snapshot.hash, state: snapshot.state }
}

/** Replaces react-router useParams */
export function useParams<T extends Record<string, string>>(): T {
  return _useParams() as T
}

/** Replaces react-router Navigate component */
export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const router = useRouter()
  // R7-10 — never navigate during render (React forbids side effects there and
  // StrictMode double-render would push twice). The effect is client-only, so
  // the old `typeof window` guard is preserved implicitly; `replace`
  // semantics are unchanged.
  useEffect(() => {
    if (replace) router.replace(to)
    else router.push(to)
  }, [router, to, replace])
  return null
}
