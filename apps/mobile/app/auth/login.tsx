import { useState } from 'react'
import { View, Text, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '@/src/components/Screen'
import { Title, Muted, Btn, Field } from '@/src/components/ui'
import { useAuth } from '@/src/lib/auth'
import { useTheme } from '@/src/theme'
import { useOverlay } from '@/src/components/overlay'

export default function LoginScreen() {
  const { login } = useAuth()
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const { alert } = useOverlay()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!identifier.trim() || !password) {
      alert({ message: 'Enter your username/email and password.' })
      return
    }
    setBusy(true)
    try {
      await login(identifier.trim(), password)
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
        <Title>Sign in</Title>
        <Muted>Welcome back to aifazi.net</Muted>
        <View style={{ marginTop: 18 }}>
          <Field label="Username / Email" value={identifier} onChangeText={setIdentifier} placeholder="tanvir" autoCapitalize="none" />
          <Field label="Password" value={password} onChangeText={setPassword} secure placeholder="••••••••" autoCapitalize="none" />
          <Btn title={busy ? 'Signing in…' : 'Sign In'} onPress={submit} disabled={busy} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  )
}