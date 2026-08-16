/**
 * lib/contentServer.ts — server-side content-blocks fetch with a global cache.
 *
 * The root layout (server component) calls getContentBlocksServer() and injects
 * the result into the page HTML on every request. The EditProvider reads that
 * embedded blob as its initial state, so every EditableText renders the ADMIN'S
 * saved value on first paint — no flash of the component's defaultValue, then a
 * swap to the custom content when the client fetch resolves.
 *
 * Caching mirrors siteSettingsServer.ts:
 *  - Next.js Data Cache via fetch `revalidate: 30` (stale-while-revalidate)
 *  - module-level TTL fallback (in-memory per instance)
 *  - on fetch error we serve the previous good value so the page never breaks
 */
const TTL_MS = 30_000
const FETCH_TIMEOUT_MS = 4_000

let _cache: { data: Record<string, any>; at: number } | null = null

function backendBaseUrl(): string {
  if (process.env.INTERNAL_API_URL) return process.env.INTERNAL_API_URL.replace(/\/+$/, '')
  const pub = process.env.NEXT_PUBLIC_API_URL
  if (pub && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(pub)) {
    return pub.replace(/\/+$/, '')
  }
  return ''
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

export async function getContentBlocksServer(): Promise<Record<string, any>> {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.data
  const base = backendBaseUrl()
  if (!base) return _cache?.data ?? {}
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const res = await fetch(`${base}/api/content`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      next: { revalidate: 30 },
    })
    clearTimeout(timer)
    if (!res.ok) return _cache?.data ?? {}
    const data = await res.json()
    if (!isPlainObject(data)) return _cache?.data ?? {}
    _cache = { data, at: Date.now() }
    return data
  } catch {
    return _cache?.data ?? {}
  }
}