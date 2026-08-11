import { useState } from 'react'
import { ActivityIndicator, Text, TextStyle, View, TouchableOpacity } from 'react-native'

import { FONT, SPACE, buttonLabel, frameworkStyles } from '@/src/design'
import { useAuth } from '@/src/lib/auth'
import { OAuthProvider } from '@/src/lib/oauth'
import { useOverlay } from '@/src/components/overlay'
import { useTheme } from '@/src/theme'
import { BrandIcon, BRAND_COLORS, Brand } from '@/src/components/BrandIcon'

const PROVIDERS: { id: OAuthProvider; label: string; brand: Brand }[] = [
  { id: 'discord', label: 'Discord', brand: 'discord' },
  { id: 'steam', label: 'Steam', brand: 'steam' },
  { id: 'github', label: 'GitHub', brand: 'github' },
]

const LABEL: TextStyle = buttonLabel(13)

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
  const fw = frameworkStyles(theme)
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
      {PROVIDERS.map((p) => {
        const brand = BRAND_COLORS[p.brand]
        const isBusy = busy === p.id
        return (
          <TouchableOpacity
            key={p.id}
            onPress={() => handle(p.id)}
            disabled={!!busy}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              paddingVertical: 14,
              paddingHorizontal: 20,
              borderRadius: fw.buttonRadius,
              marginBottom: SPACE.md,
              backgroundColor: brand.bg,
              borderWidth: 1,
              borderColor: brand.border ?? brand.bg,
              opacity: busy && !isBusy ? 0.4 : 1,
            }}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color={brand.logo} />
            ) : (
              <BrandIcon brand={p.brand} color={brand.logo} />
            )}
            <Text style={[LABEL, { color: brand.logo }]}>
              {isBusy ? `Connecting to ${p.label}…` : `Continue with ${p.label}`}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
