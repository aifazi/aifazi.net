import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'

export default function TabLayout() {
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()

  const icon =
    (e: string) =>
    ({ color }: { color: any }) =>
      <Text style={{ fontSize: 18, color }}>{e}</Text>

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          backgroundColor: theme.dark ? withAlpha(c.bg2, 0.96) : c.bg2,
          borderTopColor: withAlpha(c.accent, 0.2),
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: insets.bottom > 0 ? insets.bottom + 6 : 10,
          borderRadius: 22,
          height: 62,
          paddingTop: 6,
          paddingBottom: 6,
          borderWidth: 1,
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        },
        tabBarActiveBackgroundColor: withAlpha(c.accent, 0.14),
        tabBarItemStyle: { borderRadius: 16 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
        tabBarIconStyle: { marginTop: 1 },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="forum" options={{ title: 'Forum', tabBarIcon: icon('💬') }} />
      <Tabs.Screen name="blog" options={{ title: 'Blog', tabBarIcon: icon('📝') }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: icon('🗨️') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('👤') }} />
    </Tabs>
  )
}