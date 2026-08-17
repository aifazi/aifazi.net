import { ReactNode, useEffect, useRef } from 'react'
import { Animated, Easing, useWindowDimensions, View, ViewStyle, StyleProp, DimensionValue } from 'react-native'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'

const CELL = 58

export function AmbientBackground() {
  const { theme } = useTheme()
  const c = theme.colors
  const { width, height } = useWindowDimensions()
  const drift = useRef(new Animated.Value(0)).current
  const scan = useRef(new Animated.Value(0)).current
  const orb1 = useRef(new Animated.Value(0)).current
  const orb2 = useRef(new Animated.Value(0)).current
  const orb3 = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const d = Animated.loop(
      Animated.timing(drift, { toValue: 1, duration: 22000, easing: Easing.linear, useNativeDriver: true }),
    )
    const s = Animated.loop(
      Animated.timing(scan, { toValue: 1, duration: 8000, easing: Easing.linear, useNativeDriver: true }),
    )
    const o1 = Animated.loop(
      Animated.sequence([
        Animated.timing(orb1, { toValue: 1, duration: 14000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(orb1, { toValue: 0, duration: 14000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    const o2 = Animated.loop(
      Animated.sequence([
        Animated.timing(orb2, { toValue: 1, duration: 18000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(orb2, { toValue: 0, duration: 18000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    const o3 = Animated.loop(
      Animated.sequence([
        Animated.timing(orb3, { toValue: 1, duration: 16000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(orb3, { toValue: 0, duration: 16000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    d.start(); s.start(); o1.start(); o2.start(); o3.start()
    return () => { d.stop(); s.stop(); o1.stop(); o2.stop(); o3.stop() }
  }, [drift, scan, orb1, orb2, orb3])

  const gridLine = withAlpha(c.accent2, theme.dark ? 0.04 : 0.06)
  const cols = Math.ceil(width / CELL) + 2
  const rows = Math.ceil(height / CELL) + 2
  const driftX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -CELL] })
  const driftY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -CELL] })
  const scanY = scan.interpolate({ inputRange: [0, 1], outputRange: [-2, height] })

  const Orb = ({ val, size, color, baseX, baseY, dx, dy }: {
    val: Animated.Value; size: number; color: string; baseX: number; baseY: number; dx: number; dy: number
  }) => {
    const tx = val.interpolate({ inputRange: [0, 1], outputRange: [0, dx] })
    const ty = val.interpolate({ inputRange: [0, 1], outputRange: [0, dy] })
    const sc = val.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.08, 1] })
    return (
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: baseX, top: baseY, width: size, height: size, borderRadius: size / 2,
          backgroundColor: withAlpha(color, 0.05),
          transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
          shadowColor: color, shadowOpacity: 0.18, shadowRadius: size / 2, shadowOffset: { width: 0, height: 0 },
        }}
      />
    )
  }

  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, backgroundColor: c.bg, overflow: 'hidden' }}>
      <Orb val={orb1} size={260} color={c.accent} baseX={-40} baseY={-20} dx={50} dy={40} />
      <Orb val={orb2} size={300} color={c.accent2} baseX={width - 200} baseY={height - 240} dx={-40} dy={-50} />
      <Orb val={orb3} size={220} color={c.accent2} baseX={width / 2 - 110} baseY={height / 2 - 120} dx={30} dy={-30} />

      <Animated.View style={{ position: 'absolute', inset: -CELL, transform: [{ translateX: driftX }, { translateY: driftY }] }}>
        {Array.from({ length: cols }).map((_, i) => (
          <View key={`v${i}`} style={{ position: 'absolute', left: i * CELL, top: -CELL, bottom: -CELL, width: 1, backgroundColor: gridLine }} />
        ))}
        {Array.from({ length: rows }).map((_, i) => (
          <View key={`h${i}`} style={{ position: 'absolute', top: i * CELL, left: -CELL, right: -CELL, height: 1, backgroundColor: gridLine }} />
        ))}
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute', left: 0, right: 0, top: 0, height: 2,
          transform: [{ translateY: scanY }],
          backgroundColor: withAlpha(c.accent, theme.dark ? 0.05 : 0.04),
        }}
      />
    </View>
  )
}

type RevealDir = 'up' | 'down' | 'left' | 'right' | 'scale'

export function Reveal({
  children, delay = 0, duration = 520, dir = 'up', distance = 22, style, skip,
}: {
  children: ReactNode
  delay?: number
  duration?: number
  dir?: RevealDir
  distance?: number
  style?: StyleProp<ViewStyle>
  skip?: boolean
}) {
  const a = useRef(new Animated.Value(skip ? 1 : 0)).current
  useEffect(() => {
    if (skip) return
    const t = setTimeout(() => {
      Animated.timing(a, { toValue: 1, duration, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }).start()
    }, delay)
    // Guarantee visibility: if the animation is interrupted or the native
    // driver silently fails (e.g. after an interrupted tab transition), force
    // the node fully opaque so content never stays invisible behind the theme
    // background — that presents as a blank "gray" screen.
    const failSafe = setTimeout(() => {
      a.setValue(1)
    }, delay + duration + 150)
    return () => {
      clearTimeout(t)
      clearTimeout(failSafe)
    }
  }, [a, delay, duration, skip])

  const yOut = dir === 'up' ? distance : dir === 'down' ? -distance : 0
  const xOut = dir === 'left' ? distance : dir === 'right' ? -distance : 0
  const transform =
    dir === 'scale'
      ? [
          { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
          { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
        ]
      : [
          { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [yOut, 0] }) },
          { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [xOut, 0] }) },
        ]
  return (
    <Animated.View style={[{ opacity: a, transform }, style]}>
      {children}
    </Animated.View>
  )
}

export function stagger(index: number, base = 0.06, start = 60) {
  return start + index * base * 1000
}

export function GlowPulse({ children, color, style, active = true }: { children: ReactNode; color?: string; style?: StyleProp<ViewStyle>; active?: boolean }) {
  const { theme } = useTheme()
  const c = theme.colors
  const a = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [a])
  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] })
  const tint = color ?? c.accent
  const opacity = a.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] })
  return (
    <View style={style}>
      {active ? <Animated.View pointerEvents="none" style={{ position: 'absolute', inset: 0, borderRadius: 999, backgroundColor: tint, opacity }} /> : null}
      <Animated.View style={[{ transform: [{ scale }] }, { zIndex: 1 }]}>{children}</Animated.View>
    </View>
  )
}

export function Shimmer({ width, height, radius = 8 }: { width: DimensionValue; height: number; radius?: number }) {
  const { theme } = useTheme()
  const c = theme.colors
  const pos = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(pos, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [pos])
  const tx = pos.interpolate({ inputRange: [0, 1], outputRange: [-1.2, 1.2] })
  return (
    <View style={{ width, height, borderRadius: theme.mono ? 0 : radius, backgroundColor: withAlpha(c.border, 0.4), overflow: 'hidden' }}>
      <Animated.View
        style={{
          position: 'absolute', top: 0, bottom: 0, width: '60%',
          transform: [{ translateX: tx }],
          backgroundColor: withAlpha(c.text2, 0.08),
        }}
      />
    </View>
  )
}