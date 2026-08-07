import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { useTheme } from '@/src/theme'

export default function TabLayout() {
  const { theme } = useTheme()
  const c = theme.colors

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
        tabBarStyle: { backgroundColor: c.bg2, borderTopColor: c.border },
        tabBarLabelStyle: { fontSize: 10 },
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
