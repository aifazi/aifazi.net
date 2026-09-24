/**
 * app/api/cdn/[...path]/route.ts
 *
 * CDN proxy — built into Next.js.
 * Serves:  cdn.aifazi.net/<path>  (rewritten by middleware)
 *      or: aifazi.net/api/cdn/<path>  (direct relative URL)
 *
 * Routes requests through imgproxy for on-the-fly image transforms.
 * imgproxy runs on the VPS Docker network and fetches from Supabase Storage.
 *
 * Flow:
 *   cdn.aifazi.net/media/uuid.jpg?w=800&h=600
 *   → middleware rewrites → /api/cdn/media/uuid.jpg?w=800&h=600
 *   → this route fetches → http://imgproxy:8080/rs:fill/w:800/h:600/<encoded_source>
 *   → returns with 1-year cache headers
 *
 * Also supports direct Supabase Storage paths and legacy Cloudinary paths.
 */

import { NextRequest, NextResponse } from 'next/server'
import { SITE_URL } from '@/lib/config'

// ── Configuration ────────────────────────────────────────────────────────────
const IMGPROXY_URL = (process.env.IMGPROXY_URL ?? '').trim().replace(/\/+$/, '')
const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
const CLOUDINARY_CLOUD_NAME = (process.env.CLOUDINARY_CLOUD_NAME ?? '').trim()

// ── imgproxy URL signing (optional) ──────────────────────────────────────────
const IMGPROXY_KEY = (process.env.IMGPROXY_KEY ?? '').trim()
const IMGPROXY_SALT = (process.env.IMGPROXY_SALT ?? '').trim()

async function signPath(key: string, salt: string, path: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = hexToBytes(key)
  const saltData = hexToBytes(salt)
  const data = new Uint8Array([...saltData, ...encoder.encode(path)])
  const signature = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', signature, data)
  return base64UrlEncode(new Uint8Array(sig))
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

function base64UrlEncode(data: Uint8Array): string {
  let binary = ''
  for (const byte of data) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function encodeSourceUrl(sourceUrl: string): string {
  const plain = `plain/${sourceUrl}`
  return base64UrlEncode(new TextEncoder().encode(plain))
}

// ── Param validation ─────────────────────────────────────────────────────────
// Every value below is interpolated into the imgproxy path / upstream URL, so
// it is validated here (400 on violation) before any string interpolation.
// Buckets that exist in Supabase Storage: 'media' (upload/blog routers) and
// 'store-files' (backend STORE_FILES_BUCKET default in store_ecommerce.py).
const DIM_RE = /^\d{1,4}$/
const OPT_RE = /^[A-Za-z-]{1,16}$/
const CDN_BUCKETS: ReadonlySet<string> = new Set(['media', 'store-files'])

function validateCdnParams(params: URLSearchParams): string | null {
  for (const key of ['w', 'width', 'h', 'height']) {
    const v = params.get(key)
    if (v !== null && !DIM_RE.test(v)) return `Invalid ${key} param`
  }
  for (const key of ['q', 'quality']) {
    const v = params.get(key)
    if (v === null) continue
    if (!/^\d{1,3}$/.test(v)) return `Invalid ${key} param`
    const n = Number(v)
    if (!Number.isInteger(n) || n < 1 || n > 100) return `Invalid ${key} param`
  }
  for (const key of ['rs', 'resize', 'g', 'gravity', 'f', 'format']) {
    const v = params.get(key)
    if (v !== null && !OPT_RE.test(v)) return `Invalid ${key} param`
  }
  return null
}

// ── Build imgproxy processing path ──────────────────────────────────────────
// NB: callers must run validateCdnParams() first — values are interpolated raw.
function buildImgproxyPath(sourceUrl: string, params: URLSearchParams): string {
  const parts: string[] = []

  // Extract imgproxy-specific params
  const w = params.get('w') || params.get('width')
  const h = params.get('h') || params.get('height')
  const q = params.get('q') || params.get('quality')
  const f = params.get('f') || params.get('format')
  const resize = params.get('rs') || params.get('resize') || 'fill'
  const gravity = params.get('g') || params.get('gravity') || 'sm'

  if (resize) parts.push(`rs:${resize}`)
  if (w) parts.push(`w:${w}`)
  if (h) parts.push(`h:${h}`)
  if (gravity) parts.push(`g:${gravity}`)
  if (q) parts.push(`q:${q}`)
  if (f) parts.push(`f:${f}`)
  if (params.get('el') === '1' || params.get('enlarge') === '1') parts.push('el:1')

  const processing = parts.length > 0 ? parts.join(':') : 'rs:fill'
  const encoded = encodeSourceUrl(sourceUrl)

  return `/${processing}/${encoded}`
}

// ── Cloudinary fallback (legacy) ────────────────────────────────────────────
function buildCloudinaryPath(assetPath: string, params: URLSearchParams): string {
  const QUERY_KEY_ALLOW = new Set([
    'w', 'h', 'c', 'q', 'f', 'ar', 'dpr', 'cs', 'cm', 'pg', 'dn', 'fl',
    'a', 'e', 'g', 'x', 'y', 'r', 'b', 'd', 't', 'o', 'v', 'ik',
  ])
  const QUERY_VAL_RE = /^[A-Za-z0-9_.,:\-\/]+$/
  const fwd = new URLSearchParams()
  for (const [k, v] of params) {
    if (!QUERY_KEY_ALLOW.has(k) || v.length > 128 || !QUERY_VAL_RE.test(v)) continue
    fwd.append(k, v)
  }
  const search = fwd.size ? `?${fwd.toString()}` : ''
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}${assetPath}${search}`
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params

  // Path length validation
  if (path.length > 32 || path.join('/').length > 1024) {
    return NextResponse.json({ error: 'CDN path too long' }, { status: 414 })
  }

  // Path segment validation
  for (const seg of path) {
    const s = (() => {
      try { return decodeURIComponent(seg) } catch { return seg }
    })()
    if (s === '' || s === '.' || s === '..' || s.includes('\\') || /[\0-\x1f\x7f]/.test(s)) {
      return NextResponse.json({ error: 'Invalid CDN path' }, { status: 400 })
    }
  }

  const assetPath = '/' + path.join('/')
  const searchParams = new URL(request.url).searchParams

  // Reject out-of-spec transform params before they reach the imgproxy path/URL
  const paramError = validateCdnParams(searchParams)
  if (paramError) {
    return NextResponse.json({ error: paramError }, { status: 400 })
  }

  // ── imgproxy path (primary) ──────────────────────────────────────────────
  if (IMGPROXY_URL && SUPABASE_URL) {
    // Build Supabase Storage source URL
    const bucket = path[0]
    if (!CDN_BUCKETS.has(bucket)) {
      return NextResponse.json({ error: 'Unknown CDN bucket' }, { status: 400 })
    }
    const storagePath = path.slice(1).join('/')
    if (!storagePath) {
      return NextResponse.json({ error: 'Missing CDN asset path' }, { status: 400 })
    }
    const sourceUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${storagePath}`

    const imgproxyPath = buildImgproxyPath(sourceUrl, searchParams)
    let upstreamPath = imgproxyPath

    // Sign if keys configured
    if (IMGPROXY_KEY && IMGPROXY_SALT) {
      const sig = await signPath(IMGPROXY_KEY, IMGPROXY_SALT, imgproxyPath)
      upstreamPath = `/${sig}${imgproxyPath}`
    }

    const upstream = `${IMGPROXY_URL}${upstreamPath}`

    try {
      const up = await fetch(upstream, {
        headers: {
          'Accept': request.headers.get('accept') ?? '*/*',
          'Accept-Encoding': request.headers.get('accept-encoding') ?? 'gzip, deflate, br',
          ...(request.headers.get('if-none-match')
            ? { 'If-None-Match': request.headers.get('if-none-match')! } : {}),
          ...(request.headers.get('if-modified-since')
            ? { 'If-Modified-Since': request.headers.get('if-modified-since')! } : {}),
        },
        next: { revalidate: 31536000 },
      })

      const out = new Headers()
      const ctype = up.headers.get('content-type') ?? ''
      for (const h of ['content-length', 'etag', 'last-modified']) {
        const v = up.headers.get(h)
        if (v) out.set(h, v)
      }
      out.set('Content-Type', ctype || 'application/octet-stream')
      out.set('X-Content-Type-Options', 'nosniff')
      if (!/^(image\/(png|jpe?g|gif|webp|avif|bmp|ico)|video\/|audio\/|font\/|application\/font-|text\/css)/i.test(ctype)) {
        out.set('Content-Disposition', 'attachment; filename="file"')
      }
      out.set('Access-Control-Allow-Origin', SITE_URL)
      out.set('Vary', 'Origin')
      if (up.ok) {
        out.set('Cache-Control', up.headers.get('cache-control') ?? 'public, max-age=31536000, immutable')
      } else {
        out.set('Cache-Control', 'no-store')
      }

      return new NextResponse(up.body, { status: up.status, headers: out })
    } catch {
      return NextResponse.json({ error: 'CDN proxy error' }, { status: 502 })
    }
  }

  // ── Cloudinary fallback (legacy, when imgproxy not configured) ────────────
  if (CLOUDINARY_CLOUD_NAME) {
    let cleanedPath = assetPath
    if (cleanedPath.startsWith('/' + CLOUDINARY_CLOUD_NAME + '/')) {
      cleanedPath = cleanedPath.slice(('/' + CLOUDINARY_CLOUD_NAME).length)
    }
    const upstream = buildCloudinaryPath(cleanedPath, searchParams)

    try {
      const up = await fetch(upstream, {
        headers: {
          'Accept': request.headers.get('accept') ?? '*/*',
          'Accept-Encoding': request.headers.get('accept-encoding') ?? 'gzip, deflate, br',
          ...(request.headers.get('if-none-match')
            ? { 'If-None-Match': request.headers.get('if-none-match')! } : {}),
          ...(request.headers.get('if-modified-since')
            ? { 'If-Modified-Since': request.headers.get('if-modified-since')! } : {}),
        },
        next: { revalidate: 31536000 },
      })

      const out = new Headers()
      const ctype = up.headers.get('content-type') ?? ''
      for (const h of ['content-length', 'etag', 'last-modified']) {
        const v = up.headers.get(h)
        if (v) out.set(h, v)
      }
      out.set('Content-Type', ctype || 'application/octet-stream')
      out.set('X-Content-Type-Options', 'nosniff')
      if (!/^(image\/(png|jpe?g|gif|webp|avif|bmp|ico)|video\/|audio\/|font\/|application\/font-|text\/css)/i.test(ctype)) {
        out.set('Content-Disposition', 'attachment; filename="file"')
      }
      out.set('Access-Control-Allow-Origin', SITE_URL)
      out.set('Vary', 'Origin')
      if (up.ok) {
        out.set('Cache-Control', up.headers.get('cache-control') ?? 'public, max-age=31536000, immutable')
      } else {
        out.set('Cache-Control', 'no-store')
      }

      return new NextResponse(up.body, { status: up.status, headers: out })
    } catch {
      return NextResponse.json({ error: 'CDN proxy error' }, { status: 502 })
    }
  }

  return NextResponse.json(
    { error: 'CDN not configured. Set IMGPROXY_URL or CLOUDINARY_CLOUD_NAME.' },
    { status: 503 }
  )
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const res = await GET(request, context)
  return new NextResponse(null, { status: res.status, headers: res.headers })
}
