import { Tabs } from 'expo-router'
import { ColorValue, TouchableOpacity, View, Animated, Easing } from 'react-native'
import { BlurView } from 'expo-blur'
import { useEffect, useRef } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'
import { SPACE, tagLabel } from '@/src/design'
import { Icon } from '@/src/components/icon'
import type { IconName } from '@/src/components/icon'
import { CommandPaletteProvider, useCommandPalette } from '@/src/components/command-palette'

/**
 * Tab icon with an animated active state: springs up + glows when focused and
 * renders a small accent indicator dot underneath, replacing the flat
 * tabBarActiveBackgroundColor fill with a motion-based active cue.
 */
function TabIcon({ name, color, focused }: { name: IconName; color?: ColorValue; focused?: boolean }) {
  const { theme } = useTheme()
  const c = theme.colors
  const scale = useRef(new Animated.Value(focused ? 1 : 0.85)).current
  const dot = useRef(new Animated.Value(focused ? 1 : 0)).current

  useEffect(() => {
    Animated.spring(scale, { toValue: focused ? 1 : 0.85, useNativeDriver: true, speed: 28, bounciness: 6 }).start()
    Animated.timing(dot, { toValue: focused ? 1 : 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start()
  }, [focused, scale, dot])

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', height: 26 }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Icon name={name} size={focused ? 21 : 19} color={color} />
      </Animated.View>
      <Animated.View
        style={{
          position: 'absolute',
          bottom: -2,
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: c.accent,
          opacity: dot,
          transform: [{ scaleX: dot }],
          shadowColor: c.accent,
          shadowOpacity: 0.8,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </View>
  )
}

/**
 * Every tab button long-presses to open the command palette — the tab bar is
 * the global "search / navigate anywhere" trigger.
 */
function TabBarButton({ children, onPress, ...rest }: any) {
  const { open } = useCommandPalette()
  return (
    <TouchableOpacity {...rest} onPress={onPress} onLongPress={open} delayLongPress={350} activeOpacity={0.6}>
      {children}
    </TouchableOpacity>
  )
}

function TabNavigator() {
  const { theme } = useTheme()
  const c = theme.colors
  const insets = useSafeAreaInsets()
  const radius = theme.radius || 18
  const isGlass = theme.id.includes('glass') || theme.id.includes('macos')

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarBackground: isGlass ? () => <BlurView intensity={60} tint={theme.dark ? 'dark' : 'light'} style={{ flex: 1, borderRadius: theme.radius, overflow: 'hidden' }} /> : undefined,
        tabBarStyle: {
          backgroundColor: isGlass ? 'transparent' : theme.dark ? withAlpha(c.bg2, 0.92) : c.bg2,
          borderTopColor: withAlpha(c.accent2, 0.2),
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: insets.bottom > 0 ? insets.bottom + 6 : 10,
          borderRadius: theme.radius,
          height: 64,
          paddingTop: SPACE.sm,
          paddingBottom: SPACE.sm,
          paddingHorizontal: SPACE.md,
          borderWidth: 1,
          shadowColor: '#000',
          shadowOpacity: 0.5,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 14,
          overflow: isGlass ? 'hidden' : undefined,
        },
        tabBarActiveBackgroundColor: 'transparent',
        tabBarItemStyle: { borderRadius: radius - 3, marginHorizontal: SPACE.xxs },
        tabBarLabelStyle: { ...tagLabel(8.5, 1.2), marginBottom: SPACE.xs },
        tabBarIconStyle: { marginTop: SPACE.xxs },
        tabBarHideOnKeyboard: true,
        tabBarButton: (props) => <TabBarButton {...props} />,
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

export default function TabLayout() {
  return (
    <CommandPaletteProvider>
      <TabNavigator />
    </CommandPaletteProvider>
  )
}
