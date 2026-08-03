/**
 * proxy.ts — Next.js request proxy
 *
 * 1. cdn.aifazi.net — CDN subdomain → /api/cdn proxy
 * 2. fivem.aifazi.net — FiveM subdomain → /fivem/* routes
 * 3. store.aifazi.net — Store subdomain → /store/* routes
 * 4. Admin route protection — validates admin_session cookie (PASETO v4 / JWT).
 * 5. Internal token injection for /api/* requests.
 *
 * Supports both PASETO v4 tokens (XChaCha20-Poly1305 or HMAC-SHA256 fallback)
 * and legacy JWT tokens for backward compatibility during migration.
 */
import { NextRequest, NextResponse } from 'next/server'
import { xchacha20poly1305 } from '@noble/ciphers/chacha'

const CDN_HOSTNAME        = 'cdn.aifazi.net'
const FIVEM_HOSTNAME      = 'fivem.aifazi.net'
const STORE_HOSTNAME      = 'store.aifazi.net'
const ROOT_HOSTNAMES      = new Set(['aifazi.net', 'www.aifazi.net'])
const FIVEM_SHARED_PREFIXES = ['/api', '/auth', '/forum', '/forms', '/chat']
const FIVEM_SHARED_PATHS = new Set(['/robots.txt', '/sitemap.xml'])
const STORE_SHARED_PREFIXES = ['/api', '/auth', '/forum', '/login', '/profile', '/forms', '/blog', '/contact', '/privacy', '/tools']
const STORE_SHARED_PATHS = new Set(['/robots.txt', '/sitemap.xml', '/favicon.ico'])
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
// PASETO header {"v":"v4","t":"local"} base64url-encoded. The backend emits
// tokens as `<header_b64>.<encrypted>` (NOT a literal "v4." prefix), so matching
// on this header is the only correct way to detect PASETO tokens.
const PASETO_HEADER_B64 = 'eyJ2IjoidjQiLCJ0IjoibG9jYWwifQ'

function isPasetoToken(token: string): boolean {
  return token.startsWith(`${PASETO_HEADER_B64}.`) || token.startsWith('v4.local.')
}

const PASETO_KEY_SALT = new TextEncoder().encode('paseto-v4-aifazi')
const PASETO_NONCE_SIZE = 24 // XChaCha20 nonce (prepended to ciphertext per PASETO v4)
const PASETO_TAG_SIZE = 16   // Poly1305 auth tag

// Backend derives keys with PBKDF2-HMAC-SHA256(secret, salt="paseto-v4-aifazi",
// 100k iterations, 32 bytes). See paseto_token._derive_key / jwt_compat._resolve_key.
// The KDF result is cached per secret so it runs once per process, mirroring the
// backend's _derived_key_cache.
const pasetoKeyCache = new Map<string, Promise<Uint8Array>>()

function derivePasetoKey(secret: string): Promise<Uint8Array> {
  let pending = pasetoKeyCache.get(secret)
  if (!pending) {
    pending = (async () => {
      const material = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        'PBKDF2',
        false,
        ['deriveBits'],
      )
      const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: PASETO_KEY_SALT, iterations: 100000, hash: 'SHA-256' },
        material,
        256,
      )
      return new Uint8Array(bits)
    })()
    pasetoKeyCache.set(secret, pending)
  }
  return pending
}

/**
 * Decrypt + authenticate a true PASETO v4.local token (2-part, XChaCha20-Poly1305).
 * Returns the verified payload, or null if the secret is wrong / token tampered /
 * malformed. Throwing on auth failure is handled internally.
 */
async function decryptPasetoV4(token: string, secret: string): Promise<Record<string, any> | null> {
  if (!secret) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  if (parts[0] !== PASETO_HEADER_B64) return null
  try {
    const encrypted = base64UrlToBuffer(parts[1])
    if (encrypted.byteLength < PASETO_NONCE_SIZE + PASETO_TAG_SIZE) return null
    const nonce = new Uint8Array(encrypted, 0, PASETO_NONCE_SIZE)
    const ciphertext = new Uint8Array(encrypted, PASETO_NONCE_SIZE)
    const key = await derivePasetoKey(secret)
    const aead = xchacha20poly1305(key, nonce)
    const plaintext = aead.decrypt(ciphertext)
    return JSON.parse(new TextDecoder().decode(plaintext))
  } catch {
    return null
  }
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
  if (isPasetoToken(token)) {
    // True PASETO v4.local (XChaCha20-Poly1305) — decryption authenticates the token.
    const payload = await decryptPasetoV4(token, ADMIN_GATE_SECRET)
    if (payload) return true
    // Legacy 3-part HMAC-SHA256 fallback minted before cryptography>=42 was pinned.
    return verifyPasetoHmac(token)
  }
  return verifyJwtSignature(token)
}

async function decodeTokenPayload(token: string): Promise<Record<string, any> | null> {
  if (isPasetoToken(token)) {
    const payload = await decryptPasetoV4(token, ADMIN_GATE_SECRET)
    if (payload) return payload
    return decodePasetoPayload(token)
  }
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

// ── CSP ──────────────────────────────────────────────────────────────────────
// No per-request nonce and no script hash may appear in script-src. Per the CSP
// spec, 'unsafe-inline' is IGNORED whenever the directive also contains a nonce
// or hash value. A nonce/hash cannot cover this app's inline scripts anyway:
//   1. Many pages are statically prerendered — Next.js cannot inject a runtime
//      nonce into build-time HTML, so every inline script there would be blocked.
//   2. The root layout emits inline FOUC / site-config scripts via
//      dangerouslySetInnerHTML which have no way to carry a request nonce.
// With a nonce or hash present, ALL inline scripts (including the framework's
// hydration bootstrap) are blocked and hydration never runs (pages stuck on
// their loading skeletons, then "Connection closed" once the fetch times out).
// So neither is emitted: 'unsafe-inline' is the operative allowance for inline
// scripts, while script-src still restricts origins to self + the explicit
// third-party allowlist below.
function buildCsp(): string {
  const isDev = process.env.NODE_ENV === 'development'
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' https://cdn.lordicon.com https://cdnjs.cloudflare.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://cdn.aifazi.net https://*.supabase.co https://res.cloudinary.com https://api.dicebear.com https://*.aifazi.net https://*.imgur.com https://i.imgur.com https://*.cloudinary.com https://*.r2.cloudflarestorage.com https://*.amazonaws.com https://*.unsplash.com https://*.googleusercontent.com https://*.githubusercontent.com",
    `connect-src 'self' ${isDev ? 'http://localhost:8000 http://127.0.0.1:8000 ' : ''}https://api.aifazi.net https://*.supabase.co wss://*.supabase.co https://cdn.aifazi.net https://*.ingest.sentry.io https://fonts.googleapis.com https://fonts.gstatic.com https://ipwho.is https://ipapi.co https://ipwhois.app https://api64.ipify.org https://*.livekit.cloud wss://*.livekit.cloud`,
    "media-src 'self' https://cdn.aifazi.net https://*.aifazi.net data: blob: https://*.supabase.co https://*.r2.cloudflarestorage.com https://*.amazonaws.com https://res.cloudinary.com",
    "frame-src 'self' https://www.youtube.com https://player.vimeo.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

function secureRequest(request: NextRequest): { headers: Headers } {
  const headers = new Headers(request.headers)
  return { headers }
}

function withCsp(response: NextResponse): NextResponse {
  response.headers.set('Content-Security-Policy', buildCsp())
  return response
}

async function isAdminSessionValid(cookieValue: string | undefined, hostname = ''): Promise<boolean> {
  if (!cookieValue) return false
  if (cookieValue === '1') return false

  const signatureValid = await verifyTokenSignature(cookieValue)
  if (!signatureValid && !isRelaxedLocalRuntime(hostname)) return false

  const payload = await decodeTokenPayload(cookieValue)
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
    const { headers } = secureRequest(request)
    return withCsp(NextResponse.rewrite(rewriteUrl, { request: { headers } }))
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
      const { headers } = secureRequest(request)
      if (pathname.startsWith('/api/') && INTERNAL_API_SECRET) {
        headers.set('X-Internal-Token', INTERNAL_API_SECRET)
      }
      return withCsp(NextResponse.next({ request: { headers } }))
    }
    if (pathname === '/' || pathname === '') {
      const rewriteUrl = request.nextUrl.clone()
      rewriteUrl.pathname = '/fivem'
      const { headers } = secureRequest(request)
      return withCsp(NextResponse.rewrite(rewriteUrl, { request: { headers } }))
    }
    if (pathname.startsWith('/fivem')) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = pathname.replace(/^\/fivem/, '') || '/'
      return NextResponse.redirect(redirectUrl, { status: 308 })
    }
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = `/fivem${pathname}`
    const { headers } = secureRequest(request)
    return withCsp(NextResponse.rewrite(rewriteUrl, { request: { headers } }))
  }

  // ── 4. Store — canonicalize root /store to store.aifazi.net ──────────────
  if (ROOT_HOSTNAMES.has(hostname)) {
    if (pathname === '/store' || pathname.startsWith('/store/')) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.hostname = STORE_HOSTNAME
      redirectUrl.pathname = pathname === '/store' ? '/' : pathname.replace(/^\/store/, '')
      return NextResponse.redirect(redirectUrl, { status: 308 })
    }
  }

  // ── 5. store.aifazi.net → /store/* routes ────────────────────────────────
  if (hostname === STORE_HOSTNAME) {
    if (
      STORE_SHARED_PATHS.has(pathname) ||
      STORE_SHARED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
    ) {
      const { headers } = secureRequest(request)
      if (pathname.startsWith('/api/') && INTERNAL_API_SECRET) {
        headers.set('X-Internal-Token', INTERNAL_API_SECRET)
      }
      return withCsp(NextResponse.next({ request: { headers } }))
    }
    if (pathname === '/' || pathname === '') {
      const rewriteUrl = request.nextUrl.clone()
      rewriteUrl.pathname = '/store'
      const { headers } = secureRequest(request)
      return withCsp(NextResponse.rewrite(rewriteUrl, { request: { headers } }))
    }
    if (pathname.startsWith('/store')) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = pathname.replace(/^\/store/, '') || '/'
      return NextResponse.redirect(redirectUrl, { status: 308 })
    }
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = `/store${pathname}`
    const { headers } = secureRequest(request)
    return withCsp(NextResponse.rewrite(rewriteUrl, { request: { headers } }))
  }

  // ── 6. Admin route protection ─────────────────────────────────────────────
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
  const { headers } = secureRequest(request)
  if (pathname.startsWith('/api/') && INTERNAL_API_SECRET) {
    headers.set('X-Internal-Token', INTERNAL_API_SECRET)
  }

  return withCsp(NextResponse.next({ request: { headers } }))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
