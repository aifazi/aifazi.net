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
import {
  SITE_URL, API_URL, CDN_URL, FIVEM_URL, STORE_URL, STATUS_URL,
  hostOf, isPublicDomain, wildcardHttps, wildcardWss, httpsOf,
} from './lib/config'

// Deployment hosts are driven by NEXT_PUBLIC_* env (see lib/config.ts). On a
// single-domain deploy (STORE_URL/FIVEM_URL/CDN_URL === SITE_URL) the matching
// subdomain branch is disabled so it never hijacks the main site.
const SITE_HOST        = hostOf(SITE_URL) || 'aifazi.net'
const CDN_HOSTNAME     = hostOf(CDN_URL)   || 'cdn.aifazi.net'
const FIVEM_HOSTNAME   = hostOf(FIVEM_URL) || 'fivem.aifazi.net'
const STORE_HOSTNAME   = hostOf(STORE_URL) || 'store.aifazi.net'
const STATUS_HOSTNAME  = hostOf(STATUS_URL) || 'status.aifazi.net'
const ROOT_HOSTNAMES   = new Set([SITE_HOST, `www.${SITE_HOST}`])
const CDN_ENABLED      = CDN_HOSTNAME !== SITE_HOST && isPublicDomain(CDN_HOSTNAME)
const FIVEM_ENABLED    = FIVEM_HOSTNAME !== SITE_HOST && isPublicDomain(FIVEM_HOSTNAME)
const STORE_ENABLED    = STORE_HOSTNAME !== SITE_HOST && isPublicDomain(STORE_HOSTNAME)
const STATUS_ENABLED   = STATUS_HOSTNAME !== SITE_HOST && isPublicDomain(STATUS_HOSTNAME)
const FIVEM_SHARED_PREFIXES = ['/api', '/auth', '/forum', '/forms', '/chat']
const FIVEM_SHARED_PATHS = new Set(['/robots.txt', '/sitemap.xml', '/manifest.webmanifest', '/sw.js'])
const STORE_SHARED_PREFIXES = ['/api', '/auth', '/forum', '/login', '/profile', '/forms', '/blog', '/contact', '/privacy', '/tools']
const STORE_SHARED_PATHS = new Set(['/robots.txt', '/sitemap.xml', '/favicon.ico', '/manifest.webmanifest', '/sw.js'])
const STATUS_SHARED_PREFIXES = ['/api', '/auth', '/login', '/admin']
const STATUS_SHARED_PATHS = new Set(['/robots.txt', '/sitemap.xml', '/favicon.ico'])
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET   || ''
const PASETO_SECRET       = process.env.PASETO_SECRET || ''
// Must match the backend's ADMIN_GATE_SECRET exactly. No fallback to
// INTERNAL_API_SECRET — the backend deliberately never falls back either,
// so reusing it here would break admin-gate verification when the keys differ.
const ADMIN_GATE_SECRET   = process.env.ADMIN_GATE_SECRET || ''
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

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ── H1: per-request internal token (HMAC-SHA256, time+method+path bound) ─────
// The backend gate no longer trusts a static X-Internal-Token value. Each /api/*
// request gets a short-lived token: base64url(ts).base64url(hmac(secret, `${method}:${pathname}:${ts}`)).
// Even if a token is captured it expires (~5 min) and can only be replayed to
// the same method+path it was minted for. The static secret itself is never sent.
async function makeInternalToken(method: string, pathname: string): Promise<string> {
  if (!INTERNAL_API_SECRET) return ''
  const ts = String(Math.floor(Date.now() / 1000))
  const msg = `${method}:${pathname}:${ts}`
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(INTERNAL_API_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg))
  return `${bytesToBase64Url(enc.encode(ts))}.${bytesToBase64Url(new Uint8Array(sig))}`
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
// Backend paseto_token.py computes this with `json.dumps({"v":"v4","t":"local"})`
// using Python's default separators (", ", ": "), which inserts spaces and yields
// a DIFFERENT base64 header than the compact form above. Accept both so tokens
// minted by the backend verify regardless of which format the backend emits.
// ADMIN_GATE_SECRET must match the backend's value exactly — there is no fallback
// chain, by design.
const PASETO_HEADER_B64_PY = 'eyJ2IjogInY0IiwgInQiOiAibG9jYWwifQ'

function isPasetoToken(token: string): boolean {
  return token.startsWith(`${PASETO_HEADER_B64}.`) ||
    token.startsWith(`${PASETO_HEADER_B64_PY}.`) ||
    token.startsWith('v4.local.')
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
  if (parts[0] !== PASETO_HEADER_B64 && parts[0] !== PASETO_HEADER_B64_PY) return null
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
  const secret = ADMIN_GATE_SECRET
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

// ── CSP (per-request nonce + strict-dynamic) ─────────────────────────────────
// Next.js 16 requires dynamic rendering to attach a nonce to its framework
// inline scripts (hydration bootstrap, page data, RSC payload). The root layout
// already calls `await headers()` (app/layout.tsx) and every route under it is
// `force-dynamic` (or inherits dynamic from the layout), so this app is fully
// dynamic and per-request nonces are safe to use.
//
// How it wires together (per the official Next.js CSP guide):
//   1. proxy.ts mints a fresh nonce per request, sets `x-nonce` AND the CSP
//      header on the REQUEST headers passed to NextResponse.next/rewrite.
//   2. Next.js reads the CSP header off the request during SSR, extracts the
//      nonce, and applies it to all of its own inline scripts automatically.
//   3. The root layout reads `x-nonce` and tags its own inline scripts
//      (FOUC / site-config) with the same nonce.
//   4. 'strict-dynamic' lets scripts that were loaded by a trusted (nonced)
//      script load further scripts, so runtime-injected CDN libs (lordicon,
//      pdf.js, mammoth, xlsx, tesseract) keep working without host allowlists.
//
// The host allowlist below is kept only as a fallback for browsers that do not
// support 'strict-dynamic'; supporting browsers ignore host sources in
// script-src when strict-dynamic is present.
function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development'
  // CSP hosts are driven by the deployment env (lib/config.ts) so a fresh clone
  // on its own domain gets a matching policy instead of the aifazi.net hosts.
  const siteWildHttps = wildcardHttps(SITE_HOST)
  const siteWildWss = wildcardWss(SITE_HOST)
  const apiHttps = httpsOf(hostOf(API_URL)) || API_URL
  const cdnHttps = httpsOf(hostOf(CDN_URL)) || CDN_URL
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval' " : ''}https://cdn.lordicon.com https://cdnjs.cloudflare.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${cdnHttps} https://*.supabase.co https://res.cloudinary.com https://api.dicebear.com ${siteWildHttps} https://*.imgur.com https://i.imgur.com https://*.cloudinary.com https://*.r2.cloudflarestorage.com https://*.amazonaws.com https://*.unsplash.com https://*.googleusercontent.com https://*.githubusercontent.com`,
    `connect-src 'self' ${isDev ? 'http://localhost:8000 http://127.0.0.1:8000 ' : ''}${apiHttps} ${siteWildHttps} ${siteWildWss} https://*.supabase.co wss://*.supabase.co ${cdnHttps} https://*.ingest.sentry.io https://fonts.googleapis.com https://fonts.gstatic.com https://ipwho.is https://ipapi.co https://ipwhois.app https://api64.ipify.org https://*.livekit.cloud wss://*.livekit.cloud`,
    `media-src 'self' ${cdnHttps} ${siteWildHttps} data: blob: https://*.supabase.co https://*.r2.cloudflarestorage.com https://*.amazonaws.com https://res.cloudinary.com`,
    "frame-src 'self' https://www.youtube.com https://player.vimeo.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

function secureRequest(request: NextRequest): { headers: Headers; nonce: string } {
  const nonce = generateNonce()
  const headers = new Headers(request.headers)
  // x-nonce is read by the root layout to tag its own inline scripts.
  headers.set('x-nonce', nonce)
  // The CSP header on the REQUEST is what Next.js parses during SSR to attach
  // the nonce to its framework inline scripts — response-only is not enough.
  headers.set('Content-Security-Policy', buildCsp(nonce))
  return { headers, nonce }
}

function withCsp(response: NextResponse, nonce: string): NextResponse {
  response.headers.set('Content-Security-Policy', buildCsp(nonce))
  return response
}

// Cross-subdomain CORS for redirects + responses (aifazi.net ⇄ store/fivem
// subdomains). Next.js RSC navigation fetches from aifazi.net to a redirected
// store.aifazi.net URL are cross-origin: the 308 AND the final response must
// carry ACAO, otherwise the browser blocks the fetch ("no 'Access-Control-
// Allow-Origin' header"). RSC sends non-simple headers (RSC: 1,
// Next-Router-State-Tree, Next-Url, ...), so a preflight is fired and those
// headers must also be allowed.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Allow https://<site> and https://*.<site> only (driven by SITE_URL). The
// optional subdomain MUST be dot-separated, so lookalikes like
// `evil-aifazi.net` never match. On localhost the origin set is empty (null).
const SITE_ORIGIN_RE = isPublicDomain(SITE_HOST)
  ? new RegExp(`^https:\\/\\/([a-z0-9-]+\\.)?${escapeRegExp(SITE_HOST)}$`)
  : null

function withCors(response: NextResponse, origin: string): NextResponse {
  const allow = !!origin && !!SITE_ORIGIN_RE && SITE_ORIGIN_RE.test(origin)
  // A reflected (dynamic) Allow-Origin means the response varies by Origin —
  // signal it up front so shared caches never reuse a credentialed response
  // across subdomains, otherwise a only-aifazi.net response's ACAO could be
  // served to store.aifazi.net (CORS cache poisoning).
  // Always emit, because even a non-allowed origin produced one of two outcomes.
  response.headers.append('Vary', 'Origin')
if (allow) {
      response.headers.set('Access-Control-Allow-Origin', origin)
      response.headers.set('Access-Control-Allow-Credentials', 'true')
      response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,RSC,Next-Router-State-Tree,Next-Url,Next-Router-Prefetch,Next-Router-Segment-Prefetch')
      response.headers.set('Access-Control-Expose-Headers', 'RSC,Next-Router-State-Tree,Next-Url,Next-Router-Prefetch,Next-Router-Segment-Prefetch')
    }
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

  // ── 6b. Admin API protection (defense-in-depth) ──────────────────────────
  // H2 — the backend's require_staff/require_permission remain authoritative;
  // this gate mirrors it in middleware so admin/content APIs are never reachable
  // without a valid admin_session cookie, matching how /admin pages are gated.
  // Public reads (banners, site-settings, content blocks) and self-auth webhooks
  // stay open — they mirror _OPEN_GET_PREFIXES / _OPEN_EXACT in the backend.
  // Checked before the hostname branches so it applies on every subdomain
  // (fivem/store/status shared /api prefixes return early below).
  const isAdminApiRoute =
    pathname.toLowerCase().startsWith('/api/admin/') ||
    pathname.toLowerCase().startsWith('/api/content/')
  if (isAdminApiRoute) {
    const isPreflight = request.method === 'OPTIONS'
    const isPublicAdminGet =
      request.method === 'GET' && (
        pathname.startsWith('/api/admin/banners') ||
        pathname.startsWith('/api/admin/site-settings')
      )
    const isPublicContentGet =
      request.method === 'GET' &&
      (pathname === '/api/content' || pathname.startsWith('/api/content/'))
    const isSelfAuthWebhook =
      pathname === '/api/admin/mail/queue/webhook/inbound' ||
      pathname === '/api/admin/mail/queue/process-pending'
    if (!isPreflight && !isPublicAdminGet && !isPublicContentGet && !isSelfAuthWebhook) {
      const sessionCookie = request.cookies.get('admin_session')?.value
      if (!sessionCookie || !(await isAdminSessionValid(sessionCookie, hostname))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }
  }

  // ── 1. CDN subdomain — true reverse proxy via /api/cdn ─────────────────
  if (CDN_ENABLED && hostname === CDN_HOSTNAME) {
    if (pathname === '/' || pathname === '') {
      return NextResponse.redirect(SITE_URL, { status: 301 })
    }
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = `/api/cdn${pathname}`
    const { headers, nonce } = secureRequest(request)
    return withCsp(NextResponse.rewrite(rewriteUrl, { request: { headers } }), nonce)
  }

  // ── 2. Canonicalize FiveM URLs to the fivem subdomain ───────────────────
  if (FIVEM_ENABLED && ROOT_HOSTNAMES.has(hostname)) {
    if (pathname === '/whitelist') {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.hostname = FIVEM_HOSTNAME
      redirectUrl.pathname = '/whitelist'
      return withCors(NextResponse.redirect(redirectUrl, { status: 308 }), request.headers.get('origin') || '')
    }
    if (pathname === '/fivem' || pathname.startsWith('/fivem/')) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.hostname = FIVEM_HOSTNAME
      redirectUrl.pathname = pathname === '/fivem' ? '/' : pathname.replace(/^\/fivem/, '')
      return withCors(NextResponse.redirect(redirectUrl, { status: 308 }), request.headers.get('origin') || '')
    }
  }

  // ── 3. fivem subdomain → /fivem/* routes ───────────────────────────────
  if (FIVEM_ENABLED && hostname === FIVEM_HOSTNAME) {
    const origin = request.headers.get('origin') || ''
    if (
      FIVEM_SHARED_PATHS.has(pathname) ||
      FIVEM_SHARED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
    ) {
      const { headers, nonce } = secureRequest(request)
      headers.set('x-fivem-domain', 'true')
      if (pathname.startsWith('/api/') && INTERNAL_API_SECRET) {
        headers.set('X-Internal-Token', await makeInternalToken(request.method, pathname))
      }
      return withCors(withCsp(NextResponse.next({ request: { headers } }), nonce), origin)
    }
    if (pathname === '/' || pathname === '') {
      const rewriteUrl = request.nextUrl.clone()
      rewriteUrl.pathname = '/fivem'
      const { headers, nonce } = secureRequest(request)
      headers.set('x-fivem-domain', 'true')
      return withCors(withCsp(NextResponse.rewrite(rewriteUrl, { request: { headers } }), nonce), origin)
    }
    if (pathname.startsWith('/fivem')) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = pathname.replace(/^\/fivem/, '') || '/'
      return withCors(NextResponse.redirect(redirectUrl, { status: 308 }), origin)
    }
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = `/fivem${pathname}`
    const { headers, nonce } = secureRequest(request)
    headers.set('x-fivem-domain', 'true')
    return withCors(withCsp(NextResponse.rewrite(rewriteUrl, { request: { headers } }), nonce), origin)
  }

  // ── 4. Store — canonicalize root /store to the store subdomain ───────────
  if (STORE_ENABLED && ROOT_HOSTNAMES.has(hostname)) {
    if (pathname === '/store' || pathname.startsWith('/store/')) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.hostname = STORE_HOSTNAME
      redirectUrl.pathname = pathname === '/store' ? '/' : pathname.replace(/^\/store/, '')
      const res = NextResponse.redirect(redirectUrl, { status: 308 })
      return withCors(res, request.headers.get('origin') || '')
    }
  }

  // ── 5. store subdomain → /store/* routes ───────────────────────────────
  if (STORE_ENABLED && hostname === STORE_HOSTNAME) {
    const origin = request.headers.get('origin') || ''
    if (
      STORE_SHARED_PATHS.has(pathname) ||
      STORE_SHARED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
    ) {
      const { headers, nonce } = secureRequest(request)
      headers.set('x-store-domain', 'true')
      if (pathname.startsWith('/api/') && INTERNAL_API_SECRET) {
        headers.set('X-Internal-Token', await makeInternalToken(request.method, pathname))
      }
      return withCors(withCsp(NextResponse.next({ request: { headers } }), nonce), origin)
    }
    if (pathname === '/' || pathname === '') {
      const rewriteUrl = request.nextUrl.clone()
      rewriteUrl.pathname = '/store'
      const { headers, nonce } = secureRequest(request)
      headers.set('x-store-domain', 'true')
      return withCors(withCsp(NextResponse.rewrite(rewriteUrl, { request: { headers } }), nonce), origin)
    }
    if (pathname.startsWith('/store')) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = pathname.replace(/^\/store/, '') || '/'
      return withCors(NextResponse.redirect(redirectUrl, { status: 308 }), origin)
    }
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = `/store${pathname}`
    const { headers, nonce } = secureRequest(request)
    headers.set('x-store-domain', 'true')
    return withCors(withCsp(NextResponse.rewrite(rewriteUrl, { request: { headers } }), nonce), origin)
  }

  // ── 5b. status subdomain → /status page (monitor) ─────────────────────
  if (STATUS_ENABLED && hostname === STATUS_HOSTNAME) {
    const origin = request.headers.get('origin') || ''
    if (
      STATUS_SHARED_PATHS.has(pathname) ||
      STATUS_SHARED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
    ) {
      const { headers, nonce } = secureRequest(request)
      headers.set('x-status-domain', 'true')
      if (pathname.startsWith('/api/') && INTERNAL_API_SECRET) {
        headers.set('X-Internal-Token', await makeInternalToken(request.method, pathname))
      }
      return withCors(withCsp(NextResponse.next({ request: { headers } }), nonce), origin)
    }
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = `/status${pathname === '/' || pathname === '' ? '/' : pathname}`
    const { headers, nonce } = secureRequest(request)
    headers.set('x-status-domain', 'true')
    return withCors(withCsp(NextResponse.rewrite(rewriteUrl, { request: { headers } }), nonce), origin)
  }

  // ── 6. Admin route protection ─────────────────────────────────────────────
  const isAdminRoute = pathname.toLowerCase().startsWith('/admin') ||
    pathname.toLowerCase() === '/forum/admin' || pathname.toLowerCase().startsWith('/forum/admin/') ||
    pathname.toLowerCase() === '/tools/db' || pathname.toLowerCase().startsWith('/tools/db/')
  if (isAdminRoute) {
    const sessionCookie = request.cookies.get('admin_session')?.value
    if (!sessionCookie || !(await isAdminSessionValid(sessionCookie, hostname))) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('tab', 'signin')
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // ── 5. Internal token injection + cookie + auth header forwarding ──────────────
  const { headers, nonce } = secureRequest(request)
  if (pathname.startsWith('/api/') && INTERNAL_API_SECRET) {
    headers.set('X-Internal-Token', await makeInternalToken(request.method, pathname))
  }
  // Forward cookies from frontend to backend for API routes
  if (pathname.startsWith('/api/')) {
    const cookieHeader = request.headers.get('cookie')
    if (cookieHeader) {
      headers.set('cookie', cookieHeader)
    }
    // Explicitly forward Authorization header (may not be preserved by NextResponse.next)
    const authHeader = request.headers.get('authorization')
    if (authHeader) {
      headers.set('authorization', authHeader)
    }
  }

  return withCsp(NextResponse.next({ request: { headers } }), nonce)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
