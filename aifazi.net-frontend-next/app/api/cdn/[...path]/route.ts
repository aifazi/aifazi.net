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

  // Build asset path — strip cloud-name prefix if the caller included it
  const { path } = await params
  if (path.length > 32 || path.join('/').length > 1024) {
    return NextResponse.json({ error: 'CDN path too long' }, { status: 414 })
  }
  let assetPath = '/' + path.join('/')
  if (assetPath.startsWith('/' + cloud + '/')) {
    assetPath = assetPath.slice(('/' + cloud).length)
  }

  const { search } = new URL(request.url)
  if (search.length > 512) {
    return NextResponse.json({ error: 'CDN query too long' }, { status: 414 })
  }
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
    for (const h of ['content-type', 'content-length', 'etag', 'last-modified']) {
      const v = up.headers.get(h)
      if (v) out.set(h, v)
    }
    out.set(
      'Cache-Control',
      up.headers.get('cache-control') ?? 'public, max-age=31536000, immutable'
    )
    out.set('Access-Control-Allow-Origin', '*')

    return new NextResponse(up.body, { status: up.status, headers: out })
  } catch (err) {
    return NextResponse.json(
      { error: 'CDN proxy error', detail: String(err) },
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
