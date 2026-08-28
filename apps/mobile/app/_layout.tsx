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
import { startIntegrityChecks, stopIntegrityChecks } from '@/src/lib/integrity'
import { configurePushNotifications, registerPushToken, unregisterPushToken } from '@/src/lib/push'
import * as Notifications from 'expo-notifications'

export { ErrorBoundary } from '@/src/components/ErrorBoundary'

export const unstable_settings = {
  initialRouteName: '(tabs)',
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
  const { loading: authLoading, isAuthed } = useAuth()
  const router = useRouter()
  const pushTokenRef = useRef<string | null>(null)

  // Start anti-tamper integrity checks
  useEffect(() => {
    startIntegrityChecks()
    return () => stopIntegrityChecks()
  }, [])

  // Native push (expo-notifications). Configure the foreground handler + Android
  // channel once; register the Expo push token with the backend once the user is
  // authed; on notification tap, deep-link into the room carried in the payload.
  useEffect(() => {
    configurePushNotifications()
    let tokenRegistered = false
    let sub: ReturnType<typeof Notifications.addNotificationResponseReceivedListener> | undefined
    if (isAuthed) {
      registerPushToken().then((token) => {
        if (token) {
          pushTokenRef.current = token
          tokenRegistered = true
        }
      })
    }
    sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data ?? {}
      const room = data.room as string | undefined
      if (room) {
        router.push(`/chat-room?room=${encodeURIComponent(room)}` as Href)
        return
      }
      // Incoming call invite — land on the DM thread where the call card
      // (type: 'call') renders with an Accept button.
      if (data.call) {
        const threadId = data.thread_id as string | undefined
        if (threadId) {
          router.push(`/dm-thread?thread_id=${encodeURIComponent(threadId)}` as Href)
        }
      }
    })
    return () => {
      if (sub) sub.remove()
      if (tokenRegistered && pushTokenRef.current) {
        unregisterPushToken(pushTokenRef.current)
        pushTokenRef.current = null
      }
    }
  }, [isAuthed, router])

  // EAS Update OTA wiring: native side is configured with checkAutomatically
  // "NEVER", so this is the single place that checks for a newer bundle for the
  // current runtime. If one exists it is downloaded and applied by reloading —
  // but never while a call is in progress (it would then apply on next launch).
  // Best-effort only; a failed check must never block boot. Skipped in __DEV__.
  const segments = useSegments()
  const segmentsRef = useRef(segments)
  segmentsRef.current = segments
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
        // lands back on the boot screen mid-auth. Apply on next launch instead.
        if (route.startsWith('call') || route.startsWith('auth')) return
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
