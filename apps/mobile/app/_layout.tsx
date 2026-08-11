import { Stack } from 'expo-router'
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
