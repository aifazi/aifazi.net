import { describe, expect, it, vi } from 'vitest'
import {
  detectDeviceOs,
  formatBytes,
  formatDuration,
  deriveConnectionState,
  wireGuardStoreUrl,
  openWireGuardApp,
  WIREGUARD_DEEP_LINK,
} from './vpn'

// react-native is not loadable in node — mock the pieces vpn.ts needs
// (vi.mock calls are hoisted above imports by vitest, so this still mocks).
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
}))

// vpn.ts talks to the backend through ./api — stub the transport entirely.
vi.mock('./api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

describe('formatBytes', () => {
  it('formats zero and byte values', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(924)).toBe('924 B')
  })

  it('scales through KB/MB/GB', () => {
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
    expect(formatBytes( Math.round(1.5 * 1024 ** 3))).toBe('1.5 GB')
  })
})

describe('formatDuration', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatDuration(45)).toBe('45s')
    expect(formatDuration(125)).toBe('2m 5s')
    expect(formatDuration(3700)).toBe('1h 1m')
  })
})

describe('detectDeviceOs', () => {
  it('maps the mocked platform (android)', () => {
    expect(detectDeviceOs()).toBe('android')
  })
})

describe('deriveConnectionState (M3.2)', () => {
  it('connected when any peer is up', () => {
    expect(
      deriveConnectionState([
        { connected: false },
        { connected: true, last_connected_at: new Date().toISOString() },
      ]),
    ).toBe('connected')
  })

  it('connecting when a peer dropped within the last 90s', () => {
    const now = Date.now()
    expect(
      deriveConnectionState([{ connected: false, last_connected_at: new Date(now - 30_000).toISOString() }], now),
    ).toBe('connecting')
  })

  it('disconnected otherwise (incl. empty peer list)', () => {
    const now = Date.now()
    expect(deriveConnectionState([], now)).toBe('disconnected')
    expect(
      deriveConnectionState([{ connected: false, last_connected_at: new Date(now - 10 * 60_000).toISOString() }], now),
    ).toBe('disconnected')
    expect(deriveConnectionState([{ connected: false }], now)).toBe('disconnected')
  })
})

describe('WireGuard handoff (M3.3)', () => {
  it('uses the right store URL per OS', () => {
    expect(wireGuardStoreUrl('ios')).toContain('apps.apple.com')
    expect(wireGuardStoreUrl('android')).toContain('play.google.com')
  })

  it('prefers the deep link and falls back to the store page', async () => {
    let urls: string[] = []
    const open = (ok: (url: string) => boolean) => async (url: string) => {
      urls.push(url)
      return ok(url)
    }
    expect(await openWireGuardApp('android', open((u) => u === WIREGUARD_DEEP_LINK))).toBe('deep-link')
    expect(urls).toEqual([WIREGUARD_DEEP_LINK])

    urls = []
    expect(await openWireGuardApp('android', open((u) => u !== WIREGUARD_DEEP_LINK))).toBe('store')
    expect(urls).toEqual([WIREGUARD_DEEP_LINK, wireGuardStoreUrl('android')])

    expect(await openWireGuardApp('android', async () => false)).toBe('none')
  })
})
