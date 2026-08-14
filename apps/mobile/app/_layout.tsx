import { useEffect, useRef } from 'react'
import { Stack, useSegments } from 'expo-router'
import * as Updates from 'expo-updates'
import { StatusBar } from 'expo-status-bar'
import { Animated, Easing, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ThemeProvider, useTheme } from '@/src/theme'
import { AuthProvider, useAuth } from '@/src/lib/auth'
import { OverlayProvider } from '@/src/components/overlay'
import { BootScreen } from '@/src/components/BootScreen'
import { AmbientBackground } from '@/src/components/motion'

export { ErrorBoundary } from '@/src/components/ErrorBoundary'

export const unstable_settings = {
  initialRouteName: '(tabs)',
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
  const { loading: authLoading } = useAuth()

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
    return () => {
      active = false
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
            <RootNav />
          </OverlayProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
