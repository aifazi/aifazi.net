import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as Notifications from 'expo-notifications'
import { api } from './api'
import {
  isPushEnabled,
  registerPushToken,
  setPushEnabled,
  unregisterCurrentPushToken,
} from './push'

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

// In-memory SecureStore (R7-16 persistence) - native module not loadable in node.
const secureStore = new Map<string, string>()
vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
  getItemAsync: vi.fn(async (k: string) => secureStore.get(k) ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => {
    secureStore.set(k, v)
  }),
  deleteItemAsync: vi.fn(async (k: string) => {
    secureStore.delete(k)
  }),
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
  secureStore.clear()
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

describe('R7-16 push token persistence', () => {
  const granted = () =>
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      granted: true,
      status: 'granted',
    } as never)

  it('register persists the token per user in SecureStore', async () => {
    granted()
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
      data: 'Expo[persist-a]',
    } as never)

    await registerPushToken('alice')
    expect(secureStore.get('aifazi_push_token:alice')).toBe('Expo[persist-a]')
    expect(secureStore.has('aifazi_push_token:bob')).toBe(false)
  })

  it('post-restart logout unregisters the persisted token (no memory state)', async () => {
    granted()
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
      data: 'Expo[restart]',
    } as never)
    await registerPushToken('carol')
    expect(secureStore.get('aifazi_push_token:carol')).toBe('Expo[restart]')

    // Simulate an app restart: fresh module (memory-only currentPush is gone),
    // same persisted SecureStore map, same hoisted mocks.
    vi.resetModules()
    const freshPush = await import('./push')
    const freshApi = (await import('./api')).api
    vi.mocked(freshApi.post).mockResolvedValue({} as never)
    await freshPush.unregisterCurrentPushToken('carol')
    expect(freshApi.post).toHaveBeenCalledWith('/push/unregister', { token: 'Expo[restart]' })
    expect(secureStore.has('aifazi_push_token:carol')).toBe(false)
  })

  it('user B logout never clears user A persisted token', async () => {
    granted()
    vi.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({
      data: 'Expo[token-a]',
    } as never)
    await registerPushToken('userA')
    vi.mocked(api.post).mockClear()

    await unregisterCurrentPushToken('userB')
    expect(api.post).not.toHaveBeenCalled()
    expect(secureStore.get('aifazi_push_token:userA')).toBe('Expo[token-a]')
  })
})
