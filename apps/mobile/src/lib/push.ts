import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
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
 * backend so the chat fan-out can reach this device. */
export async function registerPushToken(userId?: string) {
  try {
    const perms = await Notifications.getPermissionsAsync()
    let granted = perms.granted
    if (!granted) {
      const asked = await Notifications.requestPermissionsAsync()
      granted = asked.granted
    }
    if (!granted) return null
    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    if (!projectId) return null
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
