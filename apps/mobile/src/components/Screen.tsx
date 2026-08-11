import { ReactNode } from 'react'
import { SPACE } from '@/src/design'
import { View, ScrollView, StyleSheet, type ScrollViewProps } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export function Screen({ children, scroll = true, refreshControl }: { children: ReactNode; scroll?: boolean; refreshControl?: ScrollViewProps['refreshControl'] }) {
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: 'transparent' }]} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={refreshControl} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
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