/**
 * components/AuthGate.tsx — Redirects to login if not authenticated.
 * Wraps sensitive screens (chat, profile, store cart, etc.)
 */
import { useEffect } from 'react'
import { useRouter } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '@/src/lib/auth'

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthed, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !isAuthed) {
      router.replace('/auth/login')
    }
  }, [loading, isAuthed, router])

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (!isAuthed) return null

  return <>{children}</>
}
