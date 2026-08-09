import { ReactNode } from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const { theme } = useTheme()
  const c = theme.colors
  const bg = { backgroundColor: c.bg }
  const icy = !theme.mono
  return (
    <SafeAreaView style={[styles.safe, bg]} edges={['top', 'bottom']}>
      {icy ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 24,
            right: 24,
            height: 2,
            borderRadius: 1,
            backgroundColor: withAlpha(c.accent, 0.35),
          }}
        />
      ) : null}
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 100 },
})