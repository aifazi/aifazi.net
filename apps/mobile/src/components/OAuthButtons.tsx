import { useState } from 'react'
import { FONT, SPACE } from '@/src/design'
import { View, Text } from 'react-native'
import { Btn } from '@/src/components/ui'
import { useAuth } from '@/src/lib/auth'
import { OAuthProvider } from '@/src/lib/oauth'
import { useOverlay } from '@/src/components/overlay'
import { useTheme } from '@/src/theme'

const PROVIDERS: { id: OAuthProvider; label: string; color: string; glyph: string }[] = [
  { id: 'discord', label: 'Discord', color: '#5865F2', glyph: '💬' },
  { id: 'steam', label: 'Steam', color: '#66C0F4', glyph: '🎮' },
  { id: 'github', label: 'GitHub', color: '#8B949E', glyph: '🐙' },
]

/**
 * Provider OAuth buttons for login/signup. Opens the native auth session, then
 * either stores the session (onSuccess), hands off to a 2FA step (on2FA), or
 * alerts on error. Silent when the user closes the browser (cancelled).
 */
export function OAuthButtons({
  onSuccess,
  on2FA,
}: {
  onSuccess?: () => void
  on2FA?: (partialToken: string, username?: string) => void
}) {
  const { loginWithOAuth } = useAuth()
  const { theme } = useTheme()
  const c = theme.colors
  const { alert } = useOverlay()
  const [busy, setBusy] = useState<OAuthProvider | null>(null)

  const handle = async (provider: OAuthProvider) => {
    if (busy) return
    setBusy(provider)
    try {
      const res = await loginWithOAuth(provider)
      if (res.cancelled) return
      if (res.requires2fa) {
        on2FA?.(res.partialToken || '', res.username)
        return
      }
      onSuccess?.()
    } catch (e: any) {
      alert({ message: e?.message || 'Sign-in failed. Please try again.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <View style={{ marginTop: SPACE.xxl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.xl }}>
        <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
        <Text style={{ color: c.muted, fontSize: FONT.sm, marginHorizontal: SPACE.lg, fontFamily: theme.mono ? 'monospace' : undefined }}>
          OR CONTINUE WITH
        </Text>
        <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
      </View>
      {PROVIDERS.map((p) => (
        <Btn
          key={p.id}
          title={busy === p.id ? `Connecting to ${p.label}…` : `Continue with ${p.label}`}
          variant="ghost"
          disabled={!!busy}
          loading={busy === p.id}
          leading={
            busy === p.id ? undefined : (
              <Text style={{ fontSize: FONT.card, lineHeight: 18 }}>{p.glyph}</Text>
            )
          }
          onPress={() => handle(p.id)}
          style={{ marginBottom: SPACE.md, borderColor: busy === p.id ? c.border : p.color, opacity: busy && busy !== p.id ? 0.4 : 1 }}
        />
      ))}
    </View>
  )
}
