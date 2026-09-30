import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as Notifications from 'expo-notifications'
import { api } from './api'
import { isPushEnabled, registerPushToken, setPushEnabled } from './push'

// In-memory AsyncStorage - react-native is not loadable in node.
const store = new Map<string, string>()
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      store.set(k, v)
    }),
    removeItem: vi.fn(async (k: string) => {
      store.delete(k)
    }),
  },
}))

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { eas: { projectId: 'test-project' } } } },
}))
vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  AndroidImportance: { MAX: 5 },
}))
vi.mock('./api', () => ({
  api: { get: vi.fn(), post: vi.fn().mockResolvedValue({}), delete: vi.fn() },
}))

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
  vi.mocked(api.post).mockResolvedValue({} as never)
})

describe('push opt-out flag', () => {
  it('defaults to enabled', async () => {
    expect(await isPushEnabled('u1')).toBe(true)
  })

  it('disable stores the flag, enable clears it', async () => {
    expect(await setPushEnabled('u2', false)).toBe(false)
    expect(await isPushEnabled('u2')).toBe(false)
    expect(store.get('pushOptOut:u2')).toBe('1')

    expect(await setPushEnabled('u2', true)).toBe(true)
    expect(await isPushEnabled('u2')).toBe(true)
    expect(store.has('pushOptOut:u2')).toBe(false)
  })
})

describe('registerPushToken honors the opt-out', () => {
  it('skips registration entirely when opted out (no permission prompt)', async () => {
    await setPushEnabled('u3', false)
    const token = await registerPushToken('u3')
    expect(token).toBeNull()
    expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('registers normally when enabled and permission granted', async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      granted: true,
      status: 'granted',
    } as never)
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
      data: 'Expo[push-token]',
    } as never)

    const token = await registerPushToken('u4')
    expect(token).toBe('Expo[push-token]')
    expect(api.post).toHaveBeenCalledWith('/push/register', { token: 'Expo[push-token]' })
  })

  it('re-enables registration after the flag is cleared', async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      granted: true,
      status: 'granted',
    } as never)
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
      data: 'Expo[again]',
    } as never)

    await setPushEnabled('u5', false)
    await setPushEnabled('u5', true) // enable path calls registerPushToken itself
    expect(Notifications.getPermissionsAsync).toHaveBeenCalled()
  })
})
