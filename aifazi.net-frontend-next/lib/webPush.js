// ── #17 Web Push Utility ──────────────────────────────────────────────────────
// Handles: permission request → PushSubscription → POST to backend → local state

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

/**
 * Returns the current push permission state.
 * 'granted' | 'denied' | 'default' | 'unsupported'
 */
export function getPushPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

/**
 * Returns true if the browser supports Web Push.
 */
export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Subscribe the current browser to Web Push and POST the subscription
 * to the backend at /forum/push/subscribe.
 *
 * Returns: { ok: true } on success, { ok: false, reason: string } on failure.
 */
export async function subscribeToPush(apiInstance) {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }

  // Ask permission
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'denied' }

  try {
    const reg = await navigator.serviceWorker.ready

    // Get or create subscription
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      if (!VAPID_PUBLIC_KEY) return { ok: false, reason: 'no_vapid_key' }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    // Send to backend
    await apiInstance.post('/forum/push/subscribe', sub.toJSON())
    return { ok: true }
  } catch (err) {
    console.error('[webPush] subscribe error', err)
    return { ok: false, reason: err.message }
  }
}

/**
 * Unsubscribe from Web Push and DELETE from backend.
 */
export async function unsubscribeFromPush(apiInstance) {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await apiInstance.delete('/forum/push/unsubscribe', { data: { endpoint: sub.endpoint } })
      await sub.unsubscribe()
    }
    return { ok: true }
  } catch (err) {
    console.error('[webPush] unsubscribe error', err)
    return { ok: false, reason: err.message }
  }
}
