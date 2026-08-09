import { useEffect, useRef } from 'react'
import { Animated, Easing, View, ViewStyle } from 'react-native'
import { withAlpha } from '@/src/lib/color'
import { useReducedMotion } from '@/src/lib/motion'

/**
 * Soft radial ambient glow that "breathes" behind a card (e.g. the Home server
 * status card). Gated on the OS reduced-motion setting: when reduced motion is
 * on, the glow renders static (no animation) so it never flickers or loops.
 */
export function AmbientGlow({
  color,
  size = 140,
  intensity = 0.35,
  style,
}: {
  color: string
  size?: number
  intensity?: number
  style?: ViewStyle
}) {
  const reduced = useReducedMotion()
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (reduced) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [reduced, pulse])

  const opacity = reduced ? intensity : pulse.interpolate({ inputRange: [0, 1], outputRange: [intensity * 0.55, intensity] })
  const scale = reduced ? 1 : pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] })

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: withAlpha(color, 0.001),
          opacity,
          transform: [{ scale }],
        },
        style,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: size / 2,
          backgroundColor: withAlpha(color, 0.9),
          shadowColor: color,
          shadowOpacity: 0.8,
          shadowRadius: size / 2.4,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </Animated.View>
  )
}

/**
 * Pulsing status dot with a soft halo — the "presence" indicator used for the
 * Home server status. When reduced motion is enabled the halo stays static.
 */
export function PulsingDot({
  color,
  size = 9,
  halo = true,
}: {
  color: string
  size?: number
  halo?: boolean
}) {
  const reduced = useReducedMotion()
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (reduced || !halo) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [reduced, pulse, halo])

  const haloOpacity = reduced ? 0.35 : pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.55] })
  const haloScale = reduced ? 1 : pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] })

  return (
    <View style={{ width: size * 3.2, height: size * 3.2, alignItems: 'center', justifyContent: 'center' }}>
      {halo ? (
        <Animated.View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: withAlpha(color, 0.9),
            opacity: haloOpacity,
            transform: [{ scale: haloScale }],
          }}
        />
      ) : null}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: 0.8,
          shadowRadius: size,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </View>
  )
}
