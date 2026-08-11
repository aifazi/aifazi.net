import { useEffect, useRef } from 'react'
import { Animated, Easing, View, Text } from 'react-native'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'
import { SPACE, micro } from '@/src/design'

function dot(size: number, color: string) {
  return { width: size, height: size, borderRadius: size / 2, backgroundColor: color, position: 'absolute' as const }
}

/**
 * Orbit loader matching the web's signature orbiting-dots loader: concentric
 * rings + pulsing core + dots sweeping around. Pure JS, no extra deps.
 */
export function Loader({ label, size = 56, compact = false }: { label?: string; size?: number; compact?: boolean }) {
  const { theme } = useTheme()
  const c = theme.colors
  const angle = useRef(new Animated.Value(0)).current
  const angle2 = useRef(new Animated.Value(0)).current
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const spin1 = Animated.loop(
      Animated.timing(angle, { toValue: 1, duration: 2600, easing: Easing.linear, useNativeDriver: true }),
    )
    const spin2 = Animated.loop(
      Animated.timing(angle2, { toValue: 1, duration: 4000, easing: Easing.linear, useNativeDriver: true }),
    )
    const breathing = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    spin1.start()
    spin2.start()
    breathing.start()
    return () => {
      spin1.stop()
      spin2.stop()
      breathing.stop()
    }
  }, [angle, angle2, pulse])

  const rot = (value: Animated.Value, offset = 0) => ({
    transform: [
      {
        rotate: value.interpolate({
          inputRange: [0, 1],
          outputRange: [`${offset}deg`, `${360 + offset}deg`],
        }),
      },
    ],
  })

  const coreScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.72] })

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: compact ? 10 : 28 }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {/* outer ring */}
        <View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1.5,
            borderColor: withAlpha(c.accent2, 0.45),
            borderTopColor: withAlpha(c.accent2, 0.9),
          }}
        />
        {/* inner counter-ring */}
        <Animated.View style={{ position: 'absolute', width: size * 0.72, height: size * 0.72, ...rot(angle2, 180) }}>
          <View
            style={{
              position: 'absolute',
              width: size * 0.72,
              height: size * 0.72,
              borderRadius: (size * 0.72) / 2,
              borderWidth: 1.5,
              borderColor: withAlpha(c.accent, 0.4),
              borderBottomColor: withAlpha(c.accent, 0.9),
            }}
          />
        </Animated.View>
        {/* core */}
        <Animated.View
          style={[
            dot(Math.max(8, size * 0.16), withAlpha(c.accent, 0.85)),
            { transform: [{ scale: coreScale }] },
          ]}
        />
        {/* orbiting dots */}
        {[0, 120, 240].map((off) => (
          <Animated.View key={off} style={{ position: 'absolute', width: size, height: size, ...rot(angle, off) }}>
            <View style={[dot(11, c.accent), { top: -6, left: size / 2 - 6 }]} />
          </Animated.View>
        ))}
        {[60, 180, 300].map((off2) => (
          <Animated.View key={`b${off2}`} style={{ position: 'absolute', width: size, height: size, ...rot(angle2, off2) }}>
            <View style={[dot(6, c.accent2), { top: -3, left: size / 2 - 3 }]} />
          </Animated.View>
        ))}
      </View>
      {label ? (
        <Text style={[micro(10, 3), { color: c.accent2, marginTop: SPACE.xxl }]}>{label}</Text>
      ) : null}
    </View>
  )
}