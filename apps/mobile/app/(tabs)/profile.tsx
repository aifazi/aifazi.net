import { View, Text, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { Screen } from '@/src/components/Screen'
import { Card, Title, Muted, Btn, Field } from '@/src/components/ui'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { THEME_IDS, THEMES } from '@/src/themes'
import { useState } from 'react'

export default function ProfileScreen() {
  const { theme, setTheme } = useTheme()
  const c = theme.colors
  const { user, loading, isAuthed, logout, login } = useAuth()
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={c.accent} style={{ marginTop: 60 }} />
      </Screen>
    )
  }

  const submit = async () => {
    setErr('')
    setBusy(true)
    try {
      await login(identifier.trim(), password)
      setPassword('')
      setIdentifier('')
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e?.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Title>Profile</Title>

      {!isAuthed ? (
        <Card>
          <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>Sign in</Text>
          <View style={{ marginTop: 12 }}>
            <Field label="Username / Email" value={identifier} onChangeText={setIdentifier} placeholder="tanvir" autoCapitalize="none" />
            <Field label="Password" value={password} onChangeText={setPassword} secure placeholder="••••••••" autoCapitalize="none" />
          </View>
          {err ? <Muted>{err}</Muted> : null}
          <Btn title={busy ? 'Signing in…' : 'Sign In'} onPress={submit} disabled={busy} />
          <View style={{ marginTop: 12 }}>
            <Btn title="Create account" variant="ghost" onPress={() => router.push('/auth/register')} />
          </View>
        </Card>
      ) : (
        <Card>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>{user?.username}</Text>
          <Muted>{user?.email ?? ''}</Muted>
          <Muted>Role: {user?.role ?? 'member'}</Muted>
          <View style={{ marginTop: 14 }}>
            <Btn title="Log out" variant="danger" onPress={() => logout()} />
          </View>
        </Card>
      )}

      <View style={{ marginTop: 16 }}>
        <Card>
          <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>Theme</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {THEME_IDS.map((id) => (
              <Btn
                key={id}
                title={THEMES[id].name}
                variant={theme.id === id ? 'primary' : 'ghost'}
                onPress={() => setTheme(id)}
                style={{ paddingVertical: 8, paddingHorizontal: 12 }}
              />
            ))}
          </View>
        </Card>
      </View>
    </Screen>
  )
}
