import { View, Text } from 'react-native'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'
import { Loader } from '@/src/components/Loader'
import { SPACE, micro } from '@/src/design'

/**
 * Themed full-screen boot/loading screen. Mirrors the web LoadingScreen but
 * themed from the mobile palette. Rendered during auth/theme hydration and by
 * screens while their first payload loads.
 */
export function BootScreen({ label = 'LOADING' }: { label?: string }) {
  const { theme } = useTheme()
  const c = theme.colors
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
      <Loader size={64} label={label} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginTop: 22 }}>
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: withAlpha(c.accent, 0.6) }} />
        <Text style={[micro(9, 3), { color: c.muted }]}>AIFAZI.NET</Text>
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: withAlpha(c.accent2, 0.6) }} />
      </View>
    </View>
  )
}
