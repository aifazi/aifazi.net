import { View, Text, TouchableOpacity } from 'react-native'
import { FONT, SPACE } from '@/src/design'
import { useTheme } from '@/src/theme'
import { useAuth } from '@/src/lib/auth'
import { Avatar } from '@/src/components/Avatar'
import { Chip } from '@/src/components/ui'
import { statusTone, withAlpha } from '@/src/lib/color'

/**
 * Home-header profile pill. Combines the user's avatar, username and role chip
 * into a single tappable element so the bare avatar circle is replaced with a
 * richer, web-matching pill. Falls back to a plain "Sign in" pill when logged out.
 */
export function ProfilePill({ onPress, compact = false }: { onPress: () => void; compact?: boolean }) {
  const { theme } = useTheme()
  const c = theme.colors
  const { user, isAuthed } = useAuth()

  if (!isAuthed || !user) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
          paddingHorizontal: SPACE.xl,
          paddingVertical: 7,
          borderWidth: 1,
          borderColor: withAlpha(c.accent, 0.5),
          borderRadius: 999,
          backgroundColor: withAlpha(c.accent, 0.08),
        }}
      >
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.accent }} />
        <Text style={{ color: c.accent, fontSize: FONT.md, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Sign in
        </Text>
      </TouchableOpacity>
    )
  }

  const roleColor = statusTone(user.role ?? '', c) ?? c.accent2

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        paddingVertical: SPACE.xs,
        paddingLeft: SPACE.xs,
        paddingRight: SPACE.lg,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 999,
        backgroundColor: c.bg2,
      }}
    >
      <Avatar name={user.username} avatar={user.avatar} size={compact ? 28 : 32} />
      {!compact ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Text style={{ color: c.text, fontSize: FONT.md, fontWeight: '800', maxWidth: 90 }} numberOfLines={1}>
            {user.username}
          </Text>
          <Chip label={user.role ?? 'member'} color={roleColor} dot={false} />
        </View>
      ) : null}
    </TouchableOpacity>
  )
}
