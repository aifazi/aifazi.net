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
        <Reveal dir="up" duration={420}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.md }}>
          <TouchableOpacity onPress={() => (pending2FA ? setPending2FA(null) : router.back())} hitSlop={10}>
            <Text style={{ color: c.text, fontSize: FONT.lead, fontFamily: theme.mono ? 'monospace' : undefined }}>←</Text>
          </TouchableOpacity>
        </View>
        </Reveal>
        {pending2FA ? (
          <>
            <Reveal dir="up" delay={120} duration={520}><Title>Two-factor code</Title></Reveal>
            <Reveal dir="up" delay={160} duration={520}>
            <Muted>
              Enter the 6-digit code from your authenticator app{pending2FA.username ? ` for @${pending2FA.username}` : ''}.
            </Muted>
            </Reveal>
            <Reveal dir="up" delay={200} duration={520}>
            <View style={{ marginTop: SPACE.huge }}>
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
            </Reveal>
          </>
        ) : (
          <>
            <Reveal dir="up" delay={120} duration={520}><Title>Sign in</Title></Reveal>
            <Reveal dir="up" delay={160} duration={520}><Muted>Welcome back to aifazi.net</Muted></Reveal>
            <Reveal dir="up" delay={200} duration={520}>
            <View style={{ marginTop: SPACE.huge }}>
              <Field label="Username / Email" value={identifier} onChangeText={setIdentifier} placeholder="tanvir" autoCapitalize="none" />
              <Field label="Password" value={password} onChangeText={setPassword} secure placeholder="••••••••" autoCapitalize="none" />
              <TouchableOpacity onPress={() => router.push('/auth/forgot-password')} style={{ alignSelf: 'flex-end', marginBottom: SPACE.lg }}>
                <Text style={{ color: c.accent, fontSize: FONT.sm }}>Forgot password?</Text>
              </TouchableOpacity>
              <Btn title={busy ? 'Signing in…' : 'Sign In'} onPress={submit} disabled={busy} />
            </View>
            </Reveal>
            <Reveal dir="up" delay={240} duration={520}>
            <OAuthButtons
              onSuccess={() => router.back()}
              on2FA={(partialToken, username) => {
                setPending2FA({ partialToken, username })
                setCode('')
              }}
            />
            </Reveal>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  )
}