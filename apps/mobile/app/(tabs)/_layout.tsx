import { Tabs } from 'expo-router'
import { Text, ColorValue } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'
import { tagLabel } from '@/src/design'
import { Icon } from '@/src/components/icon'
import type { IconName } from '@/src/components/icon'

function TabIcon({ name, color, focused }: { name: IconName; color?: ColorValue; focused?: boolean }) {
  return (
    <Text style={{ lineHeight: 24 }}>
      <Icon name={name} size={focused ? 21 : 19} color={color} />
    </Text>
  )
}

export default function TabLayout() {
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const radius = theme.radius || 18

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: {
          backgroundColor: theme.dark ? withAlpha(c.bg2, 0.92) : c.bg2,
          borderTopColor: withAlpha(c.accent2, 0.2),
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: insets.bottom > 0 ? insets.bottom + 6 : 10,
          borderRadius: theme.radius,
          height: 64,
          paddingTop: 6,
          paddingBottom: 6,
          paddingHorizontal: 8,
          borderWidth: 1,
          shadowColor: '#000',
          shadowOpacity: 0.5,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 14,
        },
        tabBarActiveBackgroundColor: withAlpha(c.accent, 0.16),
        tabBarItemStyle: { borderRadius: radius - 3, marginHorizontal: 2 },
        tabBarLabelStyle: { ...tagLabel(8.5, 1.2), marginBottom: 4 },
        tabBarIconStyle: { marginTop: 2 },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: (p) => <TabIcon name="home" {...p} /> }} />
      <Tabs.Screen name="forum" options={{ title: 'Forum', tabBarIcon: (p) => <TabIcon name="forum" {...p} /> }} />
      <Tabs.Screen name="blog" options={{ title: 'Blog', tabBarIcon: (p) => <TabIcon name="blog" {...p} /> }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat', tabBarIcon: (p) => <TabIcon name="chat" {...p} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: (p) => <TabIcon name="profile" {...p} /> }} />
    </Tabs>
  )
}