import { useState } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '@/src/components/Screen'
import { Title, Muted, Btn, Field } from '@/src/components/ui'
import { useAuth } from '@/src/lib/auth'
import { OAuthButtons } from '@/src/components/OAuthButtons'
import { useTheme } from '@/src/theme'
import { useOverlay } from '@/src/components/overlay'
import { Reveal } from '@/src/components/motion'

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
        <Reveal dir="up" duration={420}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.md }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Text style={{ color: c.text, fontSize: FONT.lead, fontFamily: theme.mono ? 'monospace' : undefined }}>←</Text>
          </TouchableOpacity>
        </View>
        </Reveal>
        <Reveal dir="up" delay={120} duration={520}><Title>Create account</Title></Reveal>
        <Reveal dir="up" delay={160} duration={520}><Muted>Join the aifazi.net community</Muted></Reveal>
        <Reveal dir="up" delay={200} duration={520}>
        <View style={{ marginTop: SPACE.huge }}>
          <Field label="Username" value={username} onChangeText={setUsername} placeholder="tanvir" autoCapitalize="none" />
          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" />
          <Field label="Password" value={password} onChangeText={setPassword} secure placeholder="At least 8 characters" autoCapitalize="none" />
          <Btn title={busy ? 'Creating…' : 'Create Account'} onPress={submit} disabled={busy} />
        </View>
        </Reveal>
        <Reveal dir="up" delay={240} duration={520}>
        <OAuthButtons
          onSuccess={() => {
            alert({ message: 'Signed in — your account is ready.' })
            router.back()
          }}
        />
        </Reveal>
      </Screen>
    </KeyboardAvoidingView>
  )
}