/**
 * lib/siteSettings.ts — Site settings cache
 * Replaces utils/siteSettings.js
 */
import api from './api'

let _cache: Record<string, any> | null = null
let _inflight: Promise<any> | null = null

/** Returns true if the response is a character-indexed string corruption {"0":"<","1":"!"...} */
function _isCorrupted(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return true
  const keys = Object.keys(data as object)
  if (keys.length === 0) return false
  return keys.slice(0, 5).every((k) => /^\d+$/.test(k))
}

export async function getSiteSettings({ fresh = false } = {}): Promise<Record<string, any>> {
  if (!fresh && _cache) return _cache
  if (!fresh && _inflight) return _inflight
  _inflight = api
    .get('/admin/site-settings')
    .then((r) => {
      const d = r.data
      // Guard: reject corrupted or non-plain-object responses
      _cache = (!d || typeof d !== 'object' || Array.isArray(d) || _isCorrupted(d)) ? {} : d
      return _cache
    })
    .catch(() => { _cache = {}; return {} })
    .finally(() => { _inflight = null })
  return _inflight
}

export function clearSiteSettingsCache() {
  _cache = null
  _inflight = null
}
