import { useState, useEffect } from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTheme } from '@/src/theme'
import { FONT, SPACE } from '@/src/design'
import api from '@/src/lib/api'

export default function VerifyEmailScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const { token } = useLocalSearchParams<{ token: string }>()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('No verification token provided.'); return }
    api.get(`/verify-email/${token}`)
      .then(() => { setStatus('success'); setMessage('Email verified! You can now sign in.') })
      .catch((e: any) => { setStatus('error'); setMessage(e?.response?.data?.detail || 'Verification failed or token expired.') })
  }, [token])

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: SPACE.xl }}>
      {status === 'loading' && <ActivityIndicator size="large" color={c.accent} />}
      {status === 'success' && (
        <>
          <Text style={{ fontSize: 40, marginBottom: SPACE.lg }}>✅</Text>
          <Text style={{ color: c.text, fontSize: FONT.section, fontWeight: '800', marginBottom: SPACE.md, textAlign: 'center' }}>Verified!</Text>
          <Text style={{ color: c.muted, fontSize: FONT.base, textAlign: 'center', marginBottom: SPACE.xl }}>{message}</Text>
        </>
      )}
      {status === 'error' && (
        <>
          <Text style={{ fontSize: 40, marginBottom: SPACE.lg }}>❌</Text>
          <Text style={{ color: c.text, fontSize: FONT.section, fontWeight: '800', marginBottom: SPACE.md, textAlign: 'center' }}>Verification Failed</Text>
          <Text style={{ color: c.muted, fontSize: FONT.base, textAlign: 'center', marginBottom: SPACE.xl }}>{message}</Text>
        </>
      )}
      {status !== 'loading' && (
        <Text onPress={() => router.replace('/auth/login')} style={{ color: c.accent, fontSize: FONT.base }}>
          Go to Login
        </Text>
      )}
    </View>
  )
}
