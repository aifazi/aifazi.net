/**
 * lib/siteSettingsServer.ts — server-side site-config fetch with a global cache.
 *
 * The root layout (server component) calls getSiteConfigServer() and injects the
 * result into the page HTML on every request, so visitors see the admin's global
 * theme/settings on first paint — no dependency on the visitor's localStorage,
 * no flash of the default theme.
 *
 * Caching (a "global cache" — not stored in any browser):
 *  - Next.js Data Cache via fetch `revalidate: 30` (shared across Vercel lambda
 *    instances, stale-while-revalidate — no request ever blocks on the backend)
 *  - module-level TTL fallback (in-memory per instance)
 *  - on any fetch error we serve the previous good value so the page never breaks
 *
 * A Redis cache on the backend would only speed up the API itself; the frontend
 * fix for FOUC is embedding the config in the HTML, which this module enables.
 */
const TTL_MS = 10_000
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

export async function getSiteConfigServer(): Promise<Record<string, any>> {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.data
  const base = backendBaseUrl()
  if (!base) return _cache?.data ?? {}
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const res = await fetch(`${base}/api/admin/site-settings`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      next: { revalidate: 10 },
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
