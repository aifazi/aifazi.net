/**
 * app/api/cdn/[...path]/route.ts
 *
 * CDN proxy — built into Next.js, no Cloudflare Worker needed.
 * Serves:  cdn.aifazi.net/<path>  (rewritten by middleware)
 *      or: aifazi.net/api/cdn/<path>  (direct relative URL)
 *
 * Cloud name is read exclusively from the CLOUDINARY_CLOUD_NAME env var.
 * Set it in Vercel → Project Settings → Environment Variables.
 *
 * Flow:
 *   cdn.aifazi.net/image/upload/v1/photo.jpg
 *   → middleware rewrites → /api/cdn/image/upload/v1/photo.jpg
 *   → this route fetches → https://res.cloudinary.com/<cloud>/image/upload/v1/photo.jpg
 *   → returns with 1-year cache headers
 */

import { NextRequest, NextResponse } from 'next/server'
import { SITE_URL } from '@/lib/config'

// ── Cloud name — read from env var only ──────────────────────────────────────
function resolveCloudName(): string {
  return (process.env.CLOUDINARY_CLOUD_NAME ?? '').trim()
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const cloud = resolveCloudName()

  if (!cloud) {
    return NextResponse.json(
      {
        error: 'CDN not configured.',
        hint:  'Set the CLOUDINARY_CLOUD_NAME environment variable in Vercel → Project Settings → Environment Variables.',
      },
      { status: 503 }
    )
  }

  // Build asset path — strip cloud-name prefix if the caller included it.
  // Each segment is validated: no traversal (., ..), no backslashes, no
  // control characters. The upstream host is fixed to res.cloudinary.com,
  // so the remaining risk is cost/content confusion via exotic paths —
  // normalized + length-capped here.
  const { path } = await params
  if (path.length > 32 || path.join('/').length > 1024) {
    return NextResponse.json({ error: 'CDN path too long' }, { status: 414 })
  }
  for (const seg of path) {
    const s = (() => {
      try {
        return decodeURIComponent(seg)
      } catch {
        return seg
      }
    })()
    if (s === '' || s === '.' || s === '..' || s.includes('\\') || /[\0-\x1f\x7f]/.test(s)) {
      return NextResponse.json({ error: 'Invalid CDN path' }, { status: 400 })
    }
  }
  let assetPath = '/' + path.join('/')
  if (assetPath.startsWith('/' + cloud + '/')) {
    assetPath = assetPath.slice(('/' + cloud).length)
  }

  // Query allowlist: Cloudinary delivery params only (w/h/crop/quality/
  // format + a small set of common modifiers). Arbitrary query strings
  // would let anyone burn transformations on our bill.
  const QUERY_KEY_ALLOW = new Set([
    'w', 'h', 'c', 'q', 'f', 'ar', 'dpr', 'cs', 'cm', 'pg', 'dn', 'fl',
    'a', 'e', 'g', 'x', 'y', 'r', 'b', 'd', 't', 'o', 'v', 'ik',
  ])
  const QUERY_VAL_RE = /^[A-Za-z0-9_.,:\-/]+$/
  const incoming = new URL(request.url).searchParams
  const fwd = new URLSearchParams()
  for (const [k, v] of incoming) {
    if (!QUERY_KEY_ALLOW.has(k) || v.length > 128 || !QUERY_VAL_RE.test(v)) {
      return NextResponse.json({ error: 'Invalid CDN query' }, { status: 400 })
    }
    fwd.append(k, v)
  }
  const search = fwd.size ? `?${fwd.toString()}` : ''
  const upstream   = `https://res.cloudinary.com/${cloud}${assetPath}${search}`

  try {
    const up = await fetch(upstream, {
      headers: {
        'Accept':            request.headers.get('accept')            ?? '*/*',
        'Accept-Encoding':   request.headers.get('accept-encoding')   ?? 'gzip, deflate, br',
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
    // Active content (SVG/HTML/XML) served same-origin would execute in
    // the site origin when navigated to directly — force download instead.
    // Raster/vector-safe image, video, audio and font types render inline.
    if (!/^(image\/(png|jpe?g|gif|webp|avif|bmp|ico)|video\/|audio\/|font\/|application\/font-|text\/css)/i.test(ctype)) {
      out.set('Content-Disposition', 'attachment; filename="file"')
    }
    // M12 — restrict CORS to the site origin (SITE_URL); never an open cross-origin proxy
    out.set('Access-Control-Allow-Origin', SITE_URL)
    out.set('Vary', 'Origin')
    if (up.ok) {
      out.set(
        'Cache-Control',
        up.headers.get('cache-control') ?? 'public, max-age=31536000, immutable'
      )
    } else {
      // M12 — never cache errors for a year
      out.set('Cache-Control', 'no-store')
    }

    return new NextResponse(up.body, { status: up.status, headers: out })
  } catch (err) {
    // M12 — generic 502; never echo upstream error text
    return NextResponse.json(
      { error: 'CDN proxy error' },
      { status: 502 }
    )
  }
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const res = await GET(request, context)
  return new NextResponse(null, { status: res.status, headers: res.headers })
}
