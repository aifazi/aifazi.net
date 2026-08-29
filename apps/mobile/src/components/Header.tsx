import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { useRouter } from 'expo-router'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'
import { SPACE, FONT } from '@/src/design'
import { Icon } from '@/src/components/icon'

export function Header({
  title,
  subtitle,
  showBack = true,
  onBack,
  right,
  transparent = false,
}: {
  title: string
  subtitle?: string
  showBack?: boolean
  onBack?: () => void
  right?: React.ReactNode
  transparent?: boolean
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const isGlass = theme.id.includes('glass') || theme.id.includes('macos')
  const bg = transparent ? 'transparent' : isGlass ? withAlpha(c.bg2, 0.72) : c.bg2

  const content = (
    <View style={[styles.row, { paddingTop: insets.top + 8, height: 56 + insets.top, borderBottomColor: withAlpha(c.border, 0.6) }]}>
      {showBack ? (
        <TouchableOpacity
          onPress={onBack || (() => router.back())}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
        >
          <Icon name="back" size={22} color={c.text} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 44 }} />
      )}
      <View style={{ flex: 1, alignItems: 'center', minWidth: 0 }}>
        <Text style={{ color: c.text, fontSize: FONT.card, fontWeight: '800', textAlign: 'center' }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: c.muted, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ width: 44, alignItems: 'flex-end' }}>{right ?? null}</View>
    </View>
  )

  if (isGlass) {
    return (
      <BlurView intensity={30} tint={theme.dark ? 'dark' : 'light'} style={[styles.header, { backgroundColor: bg }]}>
        {content}
      </BlurView>
    )
  }
  return <View style={[styles.header, { backgroundColor: bg, borderBottomColor: withAlpha(c.border, 0.6) }]}>{content}</View>
}

const styles = StyleSheet.create({
  header: {
    borderBottomWidth: 1,
    zIndex: 10,
  },
  row: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.xxl,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
})
