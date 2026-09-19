import { useEffect, useRef, type ReactNode } from 'react'
import {
  Stack,
  useSegments,
  useRouter,
  ThemeProvider as NavigationThemeProvider,
  DefaultTheme,
  DarkTheme,
  type Theme as NavigationTheme,
  type Href,
} from 'expo-router'
import * as Updates from 'expo-updates'
import { StatusBar } from 'expo-status-bar'
import { Animated, AppState, Easing, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ThemeProvider, useTheme } from '@/src/theme'
import { AuthProvider, useAuth } from '@/src/lib/auth'
import { OverlayProvider } from '@/src/components/overlay'
import { BootScreen } from '@/src/components/BootScreen'
import { AmbientBackground } from '@/src/components/motion'
import { configurePushNotifications, registerPushToken, unregisterPushToken } from '@/src/lib/push'
import * as Notifications from 'expo-notifications'

export { ErrorBoundary } from '@/src/components/ErrorBoundary'

export const unstable_settings = {
  initialRouteName: '(tabs)',
}

/**
 * Room/thread ids are interpolated into router URLs from push payloads and
 * notification links. Only alphanumerics, dash, and underscore (max 128
 * chars) may navigate — anything else is dropped so a crafted payload can
 * never drive the router to an unexpected route.
 */
const ROUTE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

/**
 * Route a push payload to the right screen. Handles chat rooms, DM threads
 * (call invites + DM text), forum threads, and blog posts — never oauth.
 * Returns true when a navigation was performed.
 */
function routePushData(data: Record<string, any>, push: (href: Href) => void): boolean {
  if (!data || typeof data !== 'object') return false
  const s = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const room = s(data.room)
  if (room && ROUTE_ID_RE.test(room)) {
    push(`/chat-room?room=${encodeURIComponent(room)}` as Href)
    return true
  }
  // DM text or incoming call invite — land on the thread where the call card
  // (type: 'call') renders with an Accept button.
  const threadId = s(data.thread_id)
  if (threadId && ROUTE_ID_RE.test(threadId)) {
    push(`/dm-thread?thread_id=${encodeURIComponent(threadId)}` as Href)
    return true
  }
  if (data.call) return false
  const forumId = s(data.forum_id) ?? s(data.threadId) ?? (data.type === 'forum' ? s(data.id) : undefined)
  if (forumId && ROUTE_ID_RE.test(forumId)) {
    push(`/forum-thread?id=${encodeURIComponent(forumId)}` as Href)
    return true
  }
  const slug = s(data.slug) ?? (data.type === 'blog' ? s(data.id) : undefined)
  if (slug && /^[A-Za-z0-9_.-]{1,160}$/.test(slug)) {
    push(`/blog-post?slug=${encodeURIComponent(slug)}` as Href)
    return true
  }
  return false
}

/**
 * Feeds the active app theme into React Navigation so the native-stack
 * container and scenes use the app's background instead of the light default
 * (`rgb(242, 242, 242)`). Without this, any transparent area in a screen leaks
 * the white default background in dark themes.
 */
function ThemedNavigation({ children }: { children: ReactNode }) {
  const { theme } = useTheme()
  const c = theme.colors
  const base = theme.dark ? DarkTheme : DefaultTheme
  const navTheme: NavigationTheme = {
    ...base,
    dark: theme.dark,
    colors: {
      primary: c.accent,
      background: c.bg,
      card: c.bg2,
      text: c.text,
      border: c.border,
      notification: c.danger,
    },
  }
  return <NavigationThemeProvider value={navTheme}>{children}</NavigationThemeProvider>
}

/**
 * Full-screen radial pulse that plays whenever the active theme changes, so a
 * light↔dark flip (or a pick from the theme menu) lands with an animated
 * transition instead of a hard snap. Sits above the navigator, never intercepts
 * touches, and is a no-op on first mount.
 */
function ThemeTransitionOverlay() {
  const { theme } = useTheme()
  const prev = useRef(theme.id)
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (prev.current === theme.id) return
    prev.current = theme.id
    pulse.setValue(0)
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 340, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start()
  }, [theme.id, pulse])

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 3.2] })
  const opacity = pulse.interpolate({ inputRange: [0, 0.16, 1], outputRange: [0, 0.55, 0] })

  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          width: 300,
          height: 300,
          borderRadius: 150,
          backgroundColor: theme.colors.accent,
          opacity,
          transform: [{ scale }],
        }}
      />
    </View>
  )
}

function RootNav() {
  const { theme } = useTheme()
  const c = theme.colors
  const { loading: authLoading, isAuthed, user } = useAuth()
  const router = useRouter()
  // Push token held for this session, keyed by user id so an account switch
  // never unregisters (or leaks) another user's registration.
  const pushTokenRef = useRef<{ userId: string; token: string } | null>(null)

  // NOTE: runtime integrity checks were removed — src/lib/integrity.js was a
  // no-op stub (always-true) with no real-check dep installed, so wiring it at
  // boot provided only a false sense of security.

  // Native push (expo-notifications). Configure the foreground handler + Android
  // channel once; register the Expo push token with the backend once the user is
  // authed; on notification tap, deep-link into the room carried in the payload.
  useEffect(() => {
    configurePushNotifications()
    let tokenRegistered = false
    let sub: ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | undefined
    const userId = user?.id ?? user?._id
    if (isAuthed && userId) {
      registerPushToken(userId).then((token) => {
        if (token) {
          pushTokenRef.current = { userId, token }
          tokenRegistered = true
        }
      })
    }
    sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = (response.notification.request.content.data ?? {}) as Record<string, any>
      routePushData(data, (href) => router.push(href))
    })
    // Cold start: the tap that launched the app never fires the listener above.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return
        const data = (response.notification.request.content.data ?? {}) as Record<string, any>
        routePushData(data, (href) => router.push(href))
      })
      .catch(() => {})
    return () => {
      if (sub) sub.remove()
      if (tokenRegistered && pushTokenRef.current) {
        unregisterPushToken(pushTokenRef.current.token)
        pushTokenRef.current = null
      }
    }
  }, [isAuthed, user?.id, user?._id, router])

  // EAS Update OTA wiring: native side is configured with checkAutomatically
  // "NEVER", so this is the single place that checks for a newer bundle for the
  // current runtime. If one exists it is downloaded and applied by reloading —
  // but never while a call is in progress (it would then apply on next launch).
  // Best-effort only; a failed check must never block boot. Skipped in __DEV__.
  const segments = useSegments()
  const segmentsRef = useRef(segments)
  segmentsRef.current = segments
  // Set when an update was downloaded while the user was on a call/auth route
  // and the reload had to be deferred — retried once they navigate away.
  const otaPendingRef = useRef(false)
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return
    let active = true
    const applyOtaUpdate = async () => {
      try {
        const update = await Updates.checkForUpdateAsync()
        if (!active || !update.isAvailable) return
        await Updates.fetchUpdateAsync()
        if (!active) return
        const route = segmentsRef.current.join('/')
        // Never hot-reload mid-flow: the access token is memory-only (H4), so a
        // reload while signing in / verifying 2FA / calling wipes it and the app
        // lands back on the boot screen mid-auth. Defer until the route clears.
        if (route.startsWith('call') || route.startsWith('auth')) {
          otaPendingRef.current = true
          return
        }
        otaPendingRef.current = false
        await Updates.reloadAsync()
      } catch {
        // Best-effort OTA — never block boot on network/update failures.
      }
    }
    applyOtaUpdate()
    let lastCheck = Date.now()
    const subAppState = AppState.addEventListener('change', (s: any) => {
      if (s === 'active' && Date.now() - lastCheck > 30 * 60 * 1000) {
        lastCheck = Date.now()
        applyOtaUpdate()
      }
    })
    return () => {
      active = false
      subAppState.remove()
    }
  }, [])

  // Retry a deferred OTA reload after leaving call/auth routes.
  useEffect(() => {
    if (!otaPendingRef.current || __DEV__ || !Updates.isEnabled) return
    const route = segments.join('/')
    if (route.startsWith('call') || route.startsWith('auth')) return
    otaPendingRef.current = false
    Updates.reloadAsync().catch(() => {})
  }, [segments])

  if (authLoading) return <BootScreen label="LOADING PLATFORM" />
  return (
    <>
      <AmbientBackground />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
        <Stack.Screen name="call" options={{ headerShown: false }} />
        <Stack.Screen name="chat-room" options={{ headerShown: false }} />
        <Stack.Screen name="store" options={{ headerShown: false }} />
        <Stack.Screen name="store-item" options={{ headerShown: false }} />
        <Stack.Screen name="projects" options={{ headerShown: false }} />
        <Stack.Screen name="forum-thread" options={{ headerShown: false }} />
        <Stack.Screen name="blog-post" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
        <Stack.Screen name="auth/register" options={{ headerShown: false }} />
        <Stack.Screen name="auth/forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="oauth/callback/[provider]" options={{ headerShown: false }} />
        <Stack.Screen name="vpn" options={{ headerShown: false }} />
        <Stack.Screen name="verify-email" options={{ headerShown: false }} />
        <Stack.Screen name="status" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="dm-thread" options={{ headerShown: false }} />
        <Stack.Screen name="dm-requests" options={{ headerShown: false }} />
        <Stack.Screen name="dm-new" options={{ headerShown: false }} />
        <Stack.Screen name="channel-manage" options={{ headerShown: false }} />
        <Stack.Screen name="channel-edit" options={{ headerShown: false }} />
        <Stack.Screen name="chat-admin" options={{ headerShown: false }} />
        <Stack.Screen name="chat-admin-recent" options={{ headerShown: false }} />
        <Stack.Screen name="chat-admin-members" options={{ headerShown: false }} />
        <Stack.Screen name="chat-admin-mutes" options={{ headerShown: false }} />
        <Stack.Screen name="chat-admin-bans" options={{ headerShown: false }} />
        <Stack.Screen name="chat-admin-dm" options={{ headerShown: false }} />
        <Stack.Screen name="forum-new" options={{ headerShown: false }} />
        <Stack.Screen name="helpdesk-new" options={{ headerShown: false }} />
        <Stack.Screen name="helpdesk-detail" options={{ headerShown: false }} />
        <Stack.Screen name="store-cart" options={{ headerShown: false }} />
        <Stack.Screen name="store-success" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <ThemeTransitionOverlay />
    </>
  )
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <OverlayProvider>
            <ThemedNavigation>
              <RootNav />
            </ThemedNavigation>
          </OverlayProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
