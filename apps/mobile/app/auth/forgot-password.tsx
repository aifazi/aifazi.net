import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/src/theme'
import { FONT, SPACE } from '@/src/design'
import { withAlpha } from '@/src/lib/color'
import api from '@/src/lib/api'

export default function ForgotPasswordScreen() {
  const { theme } = useTheme()
  const c = theme.colors
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!email.trim()) return
    setLoading(true)
    setError('')
    try {
      await api.post('/forgot-password', { email: email.trim().toLowerCase() })
      setSent(true)
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: SPACE.xl }}>
        <Text style={{ fontSize: 40, marginBottom: SPACE.lg }}>📧</Text>
        <Text style={{ color: c.text, fontSize: FONT.section, fontWeight: '800', marginBottom: SPACE.md, textAlign: 'center' }}>Check your email</Text>
        <Text style={{ color: c.muted, fontSize: FONT.base, textAlign: 'center', marginBottom: SPACE.xl }}>
          We sent a password reset link to {email}. Check your inbox and click the link to set a new password.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace('/auth/login')}
          style={{ backgroundColor: c.accent, borderRadius: theme.buttonRadius, paddingVertical: SPACE.md, paddingHorizontal: SPACE.xl }}
        >
          <Text style={{ color: '#000', fontSize: FONT.base, fontWeight: '700' }}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, justifyContent: 'center', padding: SPACE.xl }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: SPACE.xl }}>
          <Text style={{ color: c.accent, fontSize: FONT.base }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: FONT.heading, fontWeight: '800', marginBottom: SPACE.xs }}>Forgot Password</Text>
        <Text style={{ color: c.muted, fontSize: FONT.base, marginBottom: SPACE.xl }}>Enter your email and we&apos;ll send you a reset link.</Text>
        {error ? <Text style={{ color: '#ff4444', fontSize: FONT.sm, marginBottom: SPACE.md }}>{error}</Text> : null}
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={c.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          style={{ backgroundColor: c.bg2, color: c.text, borderRadius: theme.buttonRadius, borderWidth: 1, borderColor: withAlpha(c.accent2, 0.3), padding: SPACE.lg, fontSize: FONT.base, marginBottom: SPACE.lg }}
        />
        <TouchableOpacity
          onPress={submit}
          disabled={loading || !email.trim()}
          style={{ backgroundColor: loading ? withAlpha(c.accent, 0.5) : c.accent, borderRadius: theme.buttonRadius, paddingVertical: SPACE.lg, alignItems: 'center' }}
        >
          {loading ? <ActivityIndicator color="#000" /> : <Text style={{ color: '#000', fontSize: FONT.base, fontWeight: '700' }}>Send Reset Link</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}
