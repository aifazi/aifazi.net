import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ThemeProvider, useTheme } from '@/src/theme'
import { AuthProvider } from '@/src/lib/auth'

export { ErrorBoundary } from 'expo-router'

export const unstable_settings = {
  initialRouteName: '(tabs)',
}

function RootNav() {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="call" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ headerShown: true, title: 'Sign In' }} />
        <Stack.Screen name="auth/register" options={{ headerShown: true, title: 'Create Account' }} />
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
          <RootNav />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
