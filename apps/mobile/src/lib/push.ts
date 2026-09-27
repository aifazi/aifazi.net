import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { api } from './api'

/**
 * Native push notifications — "our own style".
 *
 * The app's notifications are styled like the in-app cyber theme: the default
 * Android channel uses the brand accent (#00ff88) as the light color, and the
 * chat fan-out sends a title of "New message in <room>" with the sender + a
 * snippet as the body (same copy the in-app notifications list uses). Tapping a
 * push deep-links into the native chat-room via the `room` id carried in data.
 */

let channelConfigured = false

async function ensureChannel() {
  if (Platform.OS !== 'android' || channelConfigured) return
  channelConfigured = true
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'aifazi notifications',
      importance: Notifications.AndroidImportance.MAX,
      // Native-only LED/tint color — no theme context here (runs outside the
      // React tree). Intentionally a fixed brand value, not a theme token.
      lightColor: '#00ff88',
      vibrationPattern: [0, 250, 250, 250],
    })
  } catch {
    // Channel creation is best-effort; the plugin already wires a default.
  }
}

export async function configurePushNotifications() {
  // Foreground handler: show the banner/alert while the app is open too (the
  // default is to suppress). `shouldShowBanner`+`shouldShowList` control the
  // heads-up banner vs the notification list entry on Android.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  })
  await ensureChannel()
}

/**
 * Current push registration, keyed by user id so a token registered for user
 * A is never unregistered as (or leaked to) user B after account switching.
 * The AuthProvider logout flow calls unregisterCurrentPushToken() so the
 * backend fan-out stops targeting this device on every logout path.
 */
let currentPush: { userId: string; token: string } | null = null

/** Acquire the Expo push token for this install and register it with the
 * backend so the chat fan-out can reach this device.
 *
 * Ordering matters: the EAS projectId guard runs BEFORE any permission
 * request, so a dev/Expo-Go build without EAS config logs + skips without
 * ever showing a pointless OS prompt. A denial is remembered per user id
 * (non-secret AsyncStorage flag) so we never nag: a second call skips the
 * request silently — but if the user later grants permission in OS settings,
 * getPermissionsAsync reports granted and we register normally (self-heal).
 * Never throws — returns the token string or null. */
const deniedCache = new Set<string>()
const deniedKey = (userId?: string) => `pushPermDenied:${userId ?? 'anon'}`

async function wasDenied(userId?: string): Promise<boolean> {
  const key = deniedKey(userId)
  if (deniedCache.has(key)) return true
  try {
    if ((await AsyncStorage.getItem(key)) === '1') {
      deniedCache.add(key)
      return true
    }
  } catch {
    // Storage failure — fall through and ask; the OS prompt is the backstop.
  }
  return false
}

async function rememberDenied(userId?: string) {
  const key = deniedKey(userId)
  deniedCache.add(key)
  try {
    await AsyncStorage.setItem(key, '1')
  } catch {
    // Non-fatal — the in-memory entry still covers this session.
  }
}

async function clearDenied(userId?: string) {
  const key = deniedKey(userId)
  deniedCache.delete(key)
  try {
    await AsyncStorage.removeItem(key)
  } catch {
    // Non-fatal.
  }
}

export async function registerPushToken(userId?: string) {
  try {
    // v57 docs: projectId lives under extra.eas (app.json) with an easConfig
    // fallback. Without it getExpoPushTokenAsync cannot work — skip before
    // touching permissions so there is no prompt loop and no crash.
    const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
    const easConfig = (Constants as { easConfig?: { projectId?: string } }).easConfig
    const projectId = extra?.eas?.projectId ?? easConfig?.projectId
    if (!projectId) {
      console.warn('[push] skipping registration: missing EAS projectId (extra.eas.projectId)')
      return null
    }
    const perms = await Notifications.getPermissionsAsync()
    if (perms.granted) {
      await clearDenied(userId)
    } else {
      if (await wasDenied(userId)) return null // Asked before, denied — never nag.
      const asked = await Notifications.requestPermissionsAsync()
      if (!asked.granted) {
        await rememberDenied(userId)
        return null
      }
    }
    const token = await Notifications.getExpoPushTokenAsync({ projectId })
    if (!token?.data) return null
    await api.post('/push/register', { token: token.data })
    if (userId) currentPush = { userId, token: token.data }
    return token.data
  } catch {
    return null // Best-effort — never break boot/auth over push.
  }
}

export async function unregisterPushToken(token: string | null) {
  if (!token) return
  try {
    await api.post('/push/unregister', { token })
  } catch {
    // Non-fatal; the token row is cleaned on next app open if it 400s.
  } finally {
    if (currentPush?.token === token) currentPush = null
  }
}

/** Unregister whichever token is currently held (logout flow). Never throws. */
export async function unregisterCurrentPushToken() {
  const held = currentPush
  currentPush = null
  if (held) await unregisterPushToken(held.token)
}
