import { ReactNode } from 'react'
import { SPACE } from '@/src/design'
import { View, ScrollView, StyleSheet, Dimensions, type ScrollViewProps } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'

/**
 * Faint 40px cyber grid over the screen background — mirrors the web's fixed
 * `--grid-line` overlay. Purely decorative; sits behind content.
 */
function Grid() {
  const { theme } = useTheme()
  const c = theme.colors
  const color = withAlpha(c.accent2, theme.mono ? 0.07 : 0.04)
  const { width } = Dimensions.get('window')
  const cols = Math.ceil(width / 42)
  const rows = 16
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={`r${i}`} style={{ position: 'absolute', top: i * 44, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: color }} />
      ))}
      {Array.from({ length: cols }, (_, i) => (
        <View key={`c${i}`} style={{ position: 'absolute', left: i * 42, top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: color }} />
      ))}
    </View>
  )
}

export function Screen({ children, scroll = true, refreshControl }: { children: ReactNode; scroll?: boolean; refreshControl?: ScrollViewProps['refreshControl'] }) {
  const { theme } = useTheme()
  const c = theme.colors
  const bg = { backgroundColor: c.bg }
  const icy = !theme.mono
  return (
    <SafeAreaView style={[styles.safe, bg]} edges={['top', 'bottom']}>
      <Grid />
      {icy ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 16,
            right: 16,
            height: 2,
            borderRadius: 1,
            backgroundColor: withAlpha(c.accent, 0.4),
          }}
        />
      ) : null}
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>
          {children}
        </ScrollView>
      ) : (
        // flex:1 bounds the child list/scroll so it scrolls within the screen
        // instead of overflowing behind the floating bottom nav bar.
        <View style={styles.contentFixed}>{children}</View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: SPACE.xxxl, paddingBottom: SPACE.page },
  contentFixed: { flex: 1, padding: SPACE.xxxl, paddingBottom: SPACE.page },
})