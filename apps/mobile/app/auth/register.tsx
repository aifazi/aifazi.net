import { useState } from 'react'
import { View, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { Screen } from '@/src/components/Screen'
import { Title, Muted, Btn, Field } from '@/src/components/ui'
import { useAuth } from '@/src/lib/auth'

export default function RegisterScreen() {
  const { register } = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (username.trim().length < 3 || !email.includes('@') || password.length < 8) {
      Alert.alert('Check your details', 'Username ≥3 chars, a valid email, and password ≥8 chars.')
      return
    }
    setBusy(true)
    try {
      const msg = await register(username.trim(), email.trim(), password)
      Alert.alert('Registered', msg)
    } catch (e: any) {
      Alert.alert('Could not register', e?.response?.data?.detail || e?.message || 'Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen>
        <Title>Create account</Title>
        <Muted>Join the aifazi.net community</Muted>
        <View style={{ marginTop: 18 }}>
          <Field label="Username" value={username} onChangeText={setUsername} placeholder="tanvir" autoCapitalize="none" />
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" />
          <Field label="Password" value={password} onChangeText={setPassword} secure placeholder="At least 8 characters" autoCapitalize="none" />
          <Btn title={busy ? 'Creating…' : 'Create Account'} onPress={submit} disabled={busy} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  )
}
