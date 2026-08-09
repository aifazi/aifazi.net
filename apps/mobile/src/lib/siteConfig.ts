import { api } from './api'

/**
 * lib/siteConfig.ts — Site settings cache (mirrors web lib/siteSettings.ts).
 * The admin settings endpoint is public GET, so no auth token is required.
 */
export interface SiteConfig {
  globalTheme?: string
  lockTheme?: boolean
  followOsTheme?: boolean
  animationPreset?: string
  maintenanceMode?: boolean
  [k: string]: any
}

let _cache: SiteConfig | null = null
let _inflight: Promise<SiteConfig> | null = null
let _fetchedAt = 0

const TTL_MS = 90_000

/** True if the response is a character-indexed corruption like {"0":"<","1":"!"...} */
function _isCorrupted(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return true
  const keys = Object.keys(data as object)
  if (keys.length === 0) return false
  return keys.slice(0, 5).every((k) => /^\d+$/.test(k))
}

export async function getSiteConfig({ fresh = false } = {}): Promise<SiteConfig> {
  if (!fresh) {
    if (_cache && Date.now() - _fetchedAt < TTL_MS) return _cache
    if (_inflight) return _inflight
  }
  _inflight = api
    .get<SiteConfig>('/admin/site-settings')
    .then((r) => {
      const d = r.data
      _cache = !d || typeof d !== 'object' || Array.isArray(d) || _isCorrupted(d) ? {} : d
      _fetchedAt = Date.now()
      return _cache
    })
    .catch(() => {
      _cache = {}
      _fetchedAt = Date.now()
      return {}
    })
    .finally(() => {
      _inflight = null
    })
  return _inflight
}

export function clearSiteConfigCache() {
  _cache = null
  _inflight = null
  _fetchedAt = 0
}