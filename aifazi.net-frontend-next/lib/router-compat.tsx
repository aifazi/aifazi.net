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
import React, { useCallback, useSyncExternalStore } from 'react'
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

/** Replaces react-router useLocation — hydration-safe via mounted pattern */
export function useLocation() {
  const pathname = usePathname()
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)

  // SSR-safe defaults (always empty)
  let search = ''
  let hash = ''
  let state: any = null

  if (mounted) {
    search = window.location.search
    hash = window.location.hash
    try {
      const raw = sessionStorage.getItem('nav-state:' + pathname)
      if (raw) { state = JSON.parse(raw); sessionStorage.removeItem('nav-state:' + pathname) }
    } catch {}
  }

  return { pathname, search, hash, state }
}

/** Replaces react-router useParams */
export function useParams<T extends Record<string, string>>(): T {
  return _useParams() as T
}

/** Replaces react-router Navigate component */
export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const router = useRouter()
  if (typeof window !== 'undefined') {
    if (replace) router.replace(to)
    else router.push(to)
  }
  return null
}
