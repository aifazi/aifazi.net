import { useState } from 'react'
import { View, Text, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '@/src/components/Screen'
import { Title, Muted, Btn, Field } from '@/src/components/ui'
import { useAuth } from '@/src/lib/auth'
import { OAuthButtons } from '@/src/components/OAuthButtons'
import { useTheme } from '@/src/theme'
import { useOverlay } from '@/src/components/overlay'

export default function LoginScreen() {
  const { login, verify2FA } = useAuth()
  const router = useRouter()
  const { theme } = useTheme()
  const c = theme.colors
  const { alert } = useOverlay()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending2FA, setPending2FA] = useState<{ partialToken: string; username?: string } | null>(null)
  const [code, setCode] = useState('')

  const submit = async () => {
    if (!identifier.trim() || !password) {
      alert({ message: 'Enter your username/email and password.' })
      return
    }
    setBusy(true)
    try {
      const res = await login(identifier.trim(), password)
      if (res.requires2fa) {
        setPending2FA({ partialToken: res.partialToken || '', username: res.username })
        setCode('')
      } else {
        router.back()
      }
    } catch (e: any) {
      alert({ message: e?.response?.data?.detail || e?.message || 'Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  const submit2FA = async () => {
    if (!pending2FA) return
    setBusy(true)
    try {
      await verify2FA(pending2FA.partialToken, code)
      router.back()
    } catch (e: any) {
      alert({ message: e?.response?.data?.detail || e?.message || 'Invalid code' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <TouchableOpacity onPress={() => (pending2FA ? setPending2FA(null) : router.back())} hitSlop={10}>
            <Text style={{ color: c.text, fontSize: 18, fontFamily: theme.mono ? 'monospace' : undefined }}>←</Text>
          </TouchableOpacity>
        </View>
        {pending2FA ? (
          <>
            <Title>Two-factor code</Title>
            <Muted>
              Enter the 6-digit code from your authenticator app{pending2FA.username ? ` for @${pending2FA.username}` : ''}.
            </Muted>
            <View style={{ marginTop: 18 }}>
              <Field
                label="Authenticator code"
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
              <Btn title={busy ? 'Verifying…' : 'Verify'} onPress={submit2FA} disabled={busy || code.length < 6} />
            </View>
          </>
        ) : (
          <>
            <Title>Sign in</Title>
            <Muted>Welcome back to aifazi.net</Muted>
            <View style={{ marginTop: 18 }}>
              <Field label="Username / Email" value={identifier} onChangeText={setIdentifier} placeholder="tanvir" autoCapitalize="none" />
              <Field label="Password" value={password} onChangeText={setPassword} secure placeholder="••••••••" autoCapitalize="none" />
              <Btn title={busy ? 'Signing in…' : 'Sign In'} onPress={submit} disabled={busy} />
            </View>
            <OAuthButtons
              onSuccess={() => router.back()}
              on2FA={(partialToken, username) => {
                setPending2FA({ partialToken, username })
                setCode('')
              }}
            />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  )
}