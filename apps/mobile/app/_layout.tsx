import { useEffect, useRef } from 'react'
import { Stack, useSegments } from 'expo-router'
import * as Updates from 'expo-updates'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ThemeProvider, useTheme } from '@/src/theme'
import { AuthProvider, useAuth } from '@/src/lib/auth'
import { OverlayProvider } from '@/src/components/overlay'
import { BootScreen } from '@/src/components/BootScreen'
import { AmbientBackground } from '@/src/components/motion'

export { ErrorBoundary } from 'expo-router'

export const unstable_settings = {
  initialRouteName: '(tabs)',
}

function RootNav() {
  const { theme } = useTheme()
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
        if (segmentsRef.current.join('/').startsWith('call')) return
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
          contentStyle: { backgroundColor: 'transparent' },
        }}
      >
        <Stack.Screen name="(tabs)" />
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
