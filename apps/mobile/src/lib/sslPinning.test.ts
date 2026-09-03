import { describe, expect, it, vi, beforeEach } from 'vitest'

// Simulate Expo Go (no native module): requiring the lib throws.
vi.mock('react-native-ssl-pinning', () => {
  throw new Error('native module absent')
})

import { PINNED_HOSTS, isPinningAvailable, pinnedFetch } from './sslPinning'

describe('PINNED_HOSTS', () => {
  it('pins api.aifazi.net with well-formed SPKI hashes', () => {
    const pins = PINNED_HOSTS['api.aifazi.net']
    expect(pins.length).toBeGreaterThanOrEqual(2) // leaf + at least one backup
    for (const pin of pins) {
      expect(pin).toMatch(/^sha256\/[A-Za-z0-9+/]{43}=$/)
    }
  })
})

describe('pinnedFetch fallback (no native module)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
    )
  })

  it('reports pinning unavailable instead of throwing', () => {
    expect(isPinningAvailable()).toBe(false)
  })

  it('falls back to plain fetch for pinned hosts', async () => {
    const res = await pinnedFetch('https://api.aifazi.net/api/health')
    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('passes plain fetch through for unpinned hosts', async () => {
    const res = await pinnedFetch('https://example.com/')
    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
