import { ReactNode } from 'react'
import { SPACE } from '@/src/design'
import { View, ScrollView, StyleSheet, type ScrollViewProps } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

export function Screen({ children, scroll = true, refreshControl }: { children: ReactNode; scroll?: boolean; refreshControl?: ScrollViewProps['refreshControl'] }) {
  const insets = useSafeAreaInsets()
  const tabBarHeight = 64
  const bottomPad = Math.max(SPACE.page, insets.bottom + tabBarHeight + 16)
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: 'transparent' }]} edges={['top']}>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]} keyboardShouldPersistTaps="handled" refreshControl={refreshControl} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.contentFixed, { paddingBottom: bottomPad }]}>{children}</View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: SPACE.xxxl },
  contentFixed: { flex: 1, padding: SPACE.xxxl },
})