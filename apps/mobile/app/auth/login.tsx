import { useState } from 'react'
import { View, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '@/src/components/Screen'
import { Title, Muted, Btn, Field } from '@/src/components/ui'
import { useAuth } from '@/src/lib/auth'

export default function LoginScreen() {
  const { login } = useAuth()
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!identifier.trim() || !password) {
      Alert.alert('Missing fields', 'Enter your username/email and password.')
      return
    }
    setBusy(true)
    try {
      await login(identifier.trim(), password)
      router.back()
    } catch (e: any) {
      Alert.alert('Login failed', e?.response?.data?.detail || e?.message || 'Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen>
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
