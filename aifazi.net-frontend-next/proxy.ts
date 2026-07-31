/**
 * proxy.ts — Next.js request proxy
 *
 * 1. cdn.aifazi.net — CDN subdomain → /api/cdn proxy
 * 2. fivem.aifazi.net — FiveM subdomain → /fivem/* routes
 * 3. Admin route protection — validates admin_session cookie (PASETO v4 / JWT).
 * 4. Internal token injection for /api/* requests.
 *
 * Supports both PASETO v4 tokens (XChaCha20-Poly1305 or HMAC-SHA256 fallback)
 * and legacy JWT tokens for backward compatibility during migration.
 */
import { NextRequest, NextResponse } from 'next/server'

const CDN_HOSTNAME        = 'cdn.aifazi.net'
const FIVEM_HOSTNAME      = 'fivem.aifazi.net'
const ROOT_HOSTNAMES      = new Set(['aifazi.net', 'www.aifazi.net'])
const FIVEM_SHARED_PREFIXES = ['/api', '/auth', '/forum', '/forms', '/chat']
const FIVEM_SHARED_PATHS = new Set(['/robots.txt', '/sitemap.xml'])
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET   || ''
const PASETO_SECRET       = process.env.PASETO_SECRET || process.env.JWT_SECRET || ''
const JWT_SECRET          = process.env.JWT_SECRET || ''
const ADMIN_GATE_SECRET   = process.env.ADMIN_GATE_SECRET || INTERNAL_API_SECRET || PASETO_SECRET
const ADMIN_ROLES         = new Set(['admin', 'moderator', 'editor', 'chat'])

// ── Base64url helpers ────────────────────────────────────────────────────────
function base64UrlToBuffer(input: string): ArrayBuffer {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)
  return bytes.buffer
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return copy.buffer
}

// ── PASETO v4 token helpers ──────────────────────────────────────────────────
function isPasetoToken(token: string): boolean {
  return token.startsWith('v4.')
}

function decodePasetoPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payloadB64 = parts[1]
    const raw = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function verifyPasetoHmac(token: string): Promise<boolean> {
  const secret = ADMIN_GATE_SECRET
  if (!secret) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  try {
    const msg = `${parts[0]}.${parts[1]}`
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    return await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBuffer(parts[2]),
      toArrayBuffer(new TextEncoder().encode(msg)),
    )
  } catch {
    return false
  }
}

// ── Legacy JWT helpers ───────────────────────────────────────────────────────
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
    const decoded = atob(padded)
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

async function verifyJwtSignature(token: string): Promise<boolean> {
  const secret = ADMIN_GATE_SECRET || JWT_SECRET
  if (!secret) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    return await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlToBuffer(parts[2]),
      toArrayBuffer(new TextEncoder().encode(`${parts[0]}.${parts[1]}`)),
    )
  } catch {
    return false
  }
}

// ── Unified token verification ───────────────────────────────────────────────
async function verifyTokenSignature(token: string): Promise<boolean> {
  if (isPasetoToken(token)) return verifyPasetoHmac(token)
  return verifyJwtSignature(token)
}

function decodeTokenPayload(token: string): Record<string, any> | null {
  if (isPasetoToken(token)) return decodePasetoPayload(token)
  return decodeJwtPayload(token)
}

// ── Host / env helpers ───────────────────────────────────────────────────────
function isLocalHost(hostname: string): boolean {
  const host = hostname.split(':')[0]
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
}

// M1 — only relax signature verification during local development. Never rely on
// a raw Host header or a build-time ENV flag, both of which an attacker can
// influence in non-Vercel/standalone deployments.
function isRelaxedLocalRuntime(hostname: string): boolean {
  return process.env.NODE_ENV === 'development' && isLocalHost(hostname)
}

async function isAdminSessionValid(cookieValue: string | undefined, hostname = ''): Promise<boolean> {
  if (!cookieValue) return false
  if (cookieValue === '1') return false

  const signatureValid = await verifyTokenSignature(cookieValue)
  if (!signatureValid && !isRelaxedLocalRuntime(hostname)) return false

  const payload = decodeTokenPayload(cookieValue)
  if (!payload) return false
  if (payload.purpose !== 'admin_gate') return false
  if (!ADMIN_ROLES.has(String(payload.role || ''))) return false
  const exp = payload.exp
  if (!exp) return false
  return Date.now() / 1000 < exp
}

export async function proxy(request: NextRequest) {
  // M1 — trust request.nextUrl.hostname (derived from the TLS SNI / routing),
  // not the raw Host header which an attacker controls.
  const hostname = (request.nextUrl.hostname || request.headers.get('host') || '').split(':')[0]
  const { pathname } = request.nextUrl

  // ── 1. cdn.aifazi.net — true reverse proxy via /api/cdn ──────────────────
  if (hostname === CDN_HOSTNAME) {
    if (pathname === '/' || pathname === '') {
      return NextResponse.redirect('https://aifazi.net', { status: 301 })
    }
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = `/api/cdn${pathname}`
    return NextResponse.rewrite(rewriteUrl)
  }

  // ── 2. Canonicalize FiveM URLs to fivem.aifazi.net ─────────────────────
  if (ROOT_HOSTNAMES.has(hostname)) {
    if (pathname === '/whitelist') {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.hostname = FIVEM_HOSTNAME
      redirectUrl.pathname = '/whitelist'
      return NextResponse.redirect(redirectUrl, { status: 308 })
    }
    if (pathname === '/fivem' || pathname.startsWith('/fivem/')) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.hostname = FIVEM_HOSTNAME
      redirectUrl.pathname = pathname === '/fivem' ? '/' : pathname.replace(/^\/fivem/, '')
      return NextResponse.redirect(redirectUrl, { status: 308 })
    }
  }

  // ── 3. fivem.aifazi.net → /fivem/* routes ──────────────────────────────
  if (hostname === FIVEM_HOSTNAME) {
    if (
      FIVEM_SHARED_PATHS.has(pathname) ||
      FIVEM_SHARED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
    ) {
      if (pathname.startsWith('/api/') && INTERNAL_API_SECRET) {
        const headers = new Headers(request.headers)
        headers.set('X-Internal-Token', INTERNAL_API_SECRET)
        return NextResponse.next({ request: { headers } })
      }
      return NextResponse.next()
    }
    if (pathname === '/' || pathname === '') {
      const rewriteUrl = request.nextUrl.clone()
      rewriteUrl.pathname = '/fivem'
      return NextResponse.rewrite(rewriteUrl)
    }
    if (pathname.startsWith('/fivem')) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = pathname.replace(/^\/fivem/, '') || '/'
      return NextResponse.redirect(redirectUrl, { status: 308 })
    }
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = `/fivem${pathname}`
    return NextResponse.rewrite(rewriteUrl)
  }

  // ── 4. Admin route protection ─────────────────────────────────────────────
  if (pathname.toLowerCase().startsWith('/admin')) {
    const sessionCookie = request.cookies.get('admin_session')?.value
    if (!sessionCookie || !(await isAdminSessionValid(sessionCookie, hostname))) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('tab', 'signin')
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // ── 5. Internal token injection ───────────────────────────────────────────
  if (pathname.startsWith('/api/') && INTERNAL_API_SECRET) {
    const headers = new Headers(request.headers)
    headers.set('X-Internal-Token', INTERNAL_API_SECRET)
    return NextResponse.next({ request: { headers } })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
