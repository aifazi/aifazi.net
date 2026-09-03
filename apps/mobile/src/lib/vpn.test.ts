import { describe, expect, it, vi } from 'vitest'

// react-native is not loadable in node — mock the pieces vpn.ts needs.
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
}))

// vpn.ts talks to the backend through ./api — stub the transport entirely.
vi.mock('./api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

import { detectDeviceOs, formatBytes, formatDuration } from './vpn'

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
