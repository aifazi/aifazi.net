/**
 * lib/adminSession.ts — server-only admin session verification.
 *
 * Shared by app/admin routes. Mints the same per-request HMAC
 * X-Internal-Token that proxy.ts stamps on /api/* traffic (method + path +
 * sorted-query + timestamp, ~5 min TTL), so the SSR verify call passes the
 * backend gate exactly like a proxied browser request.
 *
 * Server-only: imports next/headers + node:crypto. Never import from client
 * components.
 */
import { cookies } from 'next/headers'
import { API_URL } from '@/lib/config'

const BACKEND_URL = API_URL
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || ''

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return Buffer.from(binary, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const _rfcencode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

function canonicalQuery(searchParams?: URLSearchParams): string {
  return [...(searchParams?.entries() ?? [])]
    .sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([k, v]) => `${_rfcencode(k)}=${_rfcencode(v)}`)
    .join('&')
}

async function makeInternalToken(method: string, pathname: string, searchParams?: URLSearchParams): Promise<string> {
  if (!INTERNAL_API_SECRET) return ''
  const ts = String(Math.floor(Date.now() / 1000))
  const query = canonicalQuery(searchParams)
  const msg = `${method}:${pathname}:${query}:${ts}`
  const { createHmac } = await import('crypto')
  const sig = createHmac('sha256', INTERNAL_API_SECRET).update(msg).digest()
  return `${bytesToBase64Url(new TextEncoder().encode(ts))}.${bytesToBase64Url(sig)}`
}

export async function verifyAdminSession(
  searchParams?: URLSearchParams,
): Promise<{ valid: boolean; user?: any }> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  // NOTE: client X-Forwarded-For / X-Real-IP are deliberately NOT forwarded.
  // They are attacker-controlled and the backend only trusts CF-Connecting-IP
  // behind CF-Ray — forwarding them could only pollute audit logs, never help.
  try {
    const headers: Record<string, string> = { Cookie: cookieHeader }
    const internalToken = await makeInternalToken('GET', '/api/auth/verify', searchParams)
    if (internalToken) headers['X-Internal-Token'] = internalToken
    const url = `${BACKEND_URL}/api/auth/verify${searchParams?.size ? `?${searchParams.toString()}` : ''}`
    const res = await fetch(url, {
      method: 'GET',
      headers,
      cache: 'no-store',
    })

    if (!res.ok) return { valid: false }
    const data = await res.json()
    return { valid: data.valid === true, user: data.user }
  } catch {
    return { valid: false }
  }
}

/** Escape JSON so it can never break out of an inline <script> (`</script>`). */
export function escapeJsonForInline(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}
