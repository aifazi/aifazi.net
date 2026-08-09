import { useState } from 'react'
import { View, Text, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '@/src/components/Screen'
import { Title, Muted, Btn, Field } from '@/src/components/ui'
import { useAuth } from '@/src/lib/auth'
import { OAuthButtons } from '@/src/components/OAuthButtons'
import { useTheme } from '@/src/theme'
import { useOverlay } from '@/src/components/overlay'

export default function RegisterScreen() {
  const { register } = useAuth()
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const { alert } = useOverlay()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (username.trim().length < 3 || !email.includes('@') || password.length < 8) {
      alert({ message: 'Username ≥3 chars, a valid email, and password ≥8 chars.' })
      return
    }
    setBusy(true)
    try {
      const msg = await register(username.trim(), email.trim(), password)
      alert({ message: msg })
      router.back()
    } catch (e: any) {
      alert({ message: e?.response?.data?.detail || e?.message || 'Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Text style={{ color: c.text, fontSize: 18, fontFamily: theme.mono ? 'monospace' : undefined }}>←</Text>
          </TouchableOpacity>
        </View>
        <Title>Create account</Title>
        <Muted>Join the aifazi.net community</Muted>
        <View style={{ marginTop: 18 }}>
          <Field label="Username" value={username} onChangeText={setUsername} placeholder="tanvir" autoCapitalize="none" />
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" />
          <Field label="Password" value={password} onChangeText={setPassword} secure placeholder="At least 8 characters" autoCapitalize="none" />
          <Btn title={busy ? 'Creating…' : 'Create Account'} onPress={submit} disabled={busy} />
        </View>
        <OAuthButtons
          onSuccess={() => {
            alert({ message: 'Signed in — your account is ready.' })
            router.back()
          }}
        />
      </Screen>
    </KeyboardAvoidingView>
  )
}