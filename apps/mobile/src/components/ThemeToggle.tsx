import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useTheme } from '@/src/theme'
import { withAlpha } from '@/src/lib/color'

const TRACK_W = 56
const TRACK_H = 30
const KNOB = 24
const PAD = (TRACK_H - KNOB) / 2

/**
 * Animated light/dark flip switch. The knob springs across the track, the track
 * and knob colors animate to the new theme, and a soft accent halo pulses on
 * every flip so the toggle itself feels alive. Mirrors the web's Light/Dark
 * toggle, but with motion.
 */
export function ThemeToggle() {
  const { theme, toggleTheme, isLocked } = useTheme()
  const c = theme.colors
  const dark = theme.dark

  const slide = useRef(new Animated.Value(dark ? 1 : 0)).current
  const trackVal = useRef(new Animated.Value(dark ? 1 : 0)).current
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.spring(slide, { toValue: dark ? 1 : 0, useNativeDriver: true, damping: 15, stiffness: 210, mass: 0.7 }).start()
    Animated.timing(trackVal, { toValue: dark ? 1 : 0, duration: 280, useNativeDriver: false }).start()
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(pulse, { toValue: 0, useNativeDriver: true, damping: 10, stiffness: 80 }),
    ]).start()
  }, [dark, slide, trackVal, pulse])

  const knobX = slide.interpolate({ inputRange: [0, 1], outputRange: [PAD, TRACK_W - KNOB - PAD] })
  const knobBg = trackVal.interpolate({ inputRange: [0, 1], outputRange: [c.bg3, c.accent] })
  const trackBg = trackVal.interpolate({ inputRange: [0, 1], outputRange: [withAlpha(c.muted, 0.2), withAlpha(c.accent, 0.42)] })
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.7] })
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] })

  return (
    <TouchableOpacity
      onPress={toggleTheme}
      disabled={isLocked}
      activeOpacity={0.9}
      accessibilityRole="switch"
      accessibilityState={{ checked: dark, disabled: isLocked }}
      accessibilityLabel="Toggle light and dark mode"
      style={{ padding: 6, opacity: isLocked ? 0.5 : 1 }}
    >
      <View style={styles.wrap}>
        <Animated.View
          pointerEvents="none"
          style={[styles.halo, { backgroundColor: c.accent, opacity: haloOpacity, transform: [{ scale: haloScale }] }]}
        />
        <Animated.View style={[styles.track, { backgroundColor: trackBg, borderColor: withAlpha(c.border, 0.7) }]}>
          <Text style={[styles.icon, { color: '#fbbf24' }]}>☀</Text>
          <Text style={[styles.icon, { color: '#cfe0f5' }]}>☾</Text>
          <Animated.View
            style={[
              styles.knob,
              {
                backgroundColor: knobBg,
                transform: [{ translateX: knobX }],
                shadowColor: c.accent,
                shadowOpacity: dark ? 0.9 : 0.35,
              },
            ]}
          />
        </Animated.View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: TRACK_W + 12,
    height: TRACK_H + 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: TRACK_W + 6,
    height: TRACK_H + 6,
    borderRadius: (TRACK_H + 6) / 2,
  },
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  icon: {
    fontSize: 12,
    lineHeight: 14,
  },
  knob: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
})
