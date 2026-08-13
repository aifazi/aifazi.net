import { useState } from 'react'
import { FONT, SPACE, micro } from '@/src/design'
import { ScrollView, View, Text } from 'react-native'
import { Title, Card, Muted, Btn, Field } from '@/src/components/ui'
import { Screen } from '@/src/components/Screen'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { OAuthButtons } from '@/src/components/OAuthButtons'
import { useRouter } from 'expo-router'
import { PulsingDot } from '@/src/components/glow'
import { withAlpha } from '@/src/lib/color'

/**
 * Shared sign-in + 2FA challenge card, used by the Profile tab and the
 * dedicated auth screens so the flow never drifts between copies.
 */
export function LoginCard({ onAuthed }: { onAuthed?: () => void }) {
  const { theme } = useTheme()
  const c = theme.colors
  const { login, verify2FA } = useAuth()
  const router = useRouter()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [twoFA, setTwoFA] = useState<{ partialToken: string; username: string } | null>(null)
  const [twoFACode, setTwoFACode] = useState('')

  const submit = async () => {
    setErr(''); setBusy(true)
    try {
      const res = await login(identifier.trim(), password)
      if (res.requires2fa) {
        setTwoFA({ partialToken: res.partialToken || '', username: res.username || identifier })
        setTwoFACode('')
      } else {
        setPassword(''); setIdentifier('')
        onAuthed?.()
      }
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e?.message || 'Login failed')
    } finally { setBusy(false) }
  }

  const submit2FA = async () => {
    if (!twoFA) return
    setErr(''); setBusy(true)
    try {
      await verify2FA(twoFA.partialToken, twoFACode)
      setTwoFA(null); setTwoFACode(''); setIdentifier(''); setPassword('')
      onAuthed?.()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e?.message || 'Invalid code')
    } finally { setBusy(false) }
  }

  if (twoFA) {
    return (
      <ScrollView keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={{ color: c.text, fontSize: FONT.body, fontWeight: '700' }}>Two-factor authentication</Text>
          <Muted style={{ marginTop: SPACE.xs }}>
            Enter the 6-digit code from your authenticator app{twoFA.username ? ` for @${twoFA.username}` : ''}, or a backup recovery code.
          </Muted>
          <View style={{ marginTop: SPACE.xl }}>
            <Field
              label="Authenticator / recovery code"
              value={twoFACode}
              onChangeText={setTwoFACode}
              placeholder="000000  ·  XXXX-XXXX-XXXX"
              autoCapitalize="characters"
              autoFocus
            />
          </View>
          {err ? <Muted>{err}</Muted> : null}
          <Btn title={busy ? 'Verifying…' : 'Verify'} onPress={submit2FA} disabled={busy || twoFACode.trim().length < 6} />
          <View style={{ marginTop: SPACE.xl }}>
            <Btn title="Back" variant="ghost" onPress={() => { setTwoFA(null); setErr('') }} />
          </View>
        </Card>
      </ScrollView>
    )
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Card>
        <View style={{ alignItems: 'center', marginBottom: SPACE.xl }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: withAlpha(c.accent, 0.12), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: withAlpha(c.accent, 0.4) }}>
            <PulsingDot color={c.accent} size={16} halo={false} />
          </View>
          <Text style={{ color: c.text, fontSize: FONT.h3, fontWeight: '900', marginTop: SPACE.lg, letterSpacing: 0.5 }}>aifazi.net</Text>
          <Text style={[micro(10, 3, '700'), { color: c.accent2, marginTop: SPACE.xs }]}>SIGN IN TO CONTINUE</Text>
        </View>
        <Field label="Username / Email" value={identifier} onChangeText={setIdentifier} placeholder="tanvir" autoCapitalize="none" />
        <Field label="Password" value={password} onChangeText={setPassword} secure placeholder="••••••••" autoCapitalize="none" />
        {err ? <Muted style={{ color: c.danger, marginBottom: SPACE.lg }}>{err}</Muted> : null}
        <Btn title={busy ? 'Signing in…' : 'Sign In'} onPress={submit} disabled={busy} full />
        <View style={{ marginTop: SPACE.xl }}>
          <Btn title="Create account" variant="ghost" onPress={() => router.push('/auth/register')} full />
        </View>
        <OAuthButtons
          onSuccess={() => {
            setPassword('')
            setIdentifier('')
            onAuthed?.()
          }}
          on2FA={(partialToken, username) => {
            setTwoFA({ partialToken, username: username || '' })
            setTwoFACode('')
          }}
        />
      </Card>
    </ScrollView>
  )
}

/** Login screen wrapper for the Profile tab (title + shared card). */
export function ProfileLoginScreen() {
  return (
    <Screen scroll={false}>
      <Title>Profile</Title>
      <LoginCard />
    </Screen>
  )
}