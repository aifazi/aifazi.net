/**
 * ConnectionRing — animated power button for VPN connect/disconnect.
 * Shows a glowing ring that pulses when connecting, solid when connected.
 */
import { useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, Animated, Easing } from 'react-native'
import { useTheme } from '@/src/theme'

type ConnectionState = 'disconnected' | 'connecting' | 'connected'

interface Props {
  state: ConnectionState
  onPress: () => void
  location?: string
}

export function ConnectionRing({ state, onPress, location }: Props) {
  const { theme } = useTheme()
  const c = theme.colors
  const pulse = useRef(new Animated.Value(0)).current
  const glow = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (state === 'connecting') {
      pulse.setValue(0)
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ).start()
      glow.setValue(0)
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0.3, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ).start()
    } else if (state === 'connected') {
      pulse.setValue(0)
      glow.setValue(1)
    } else {
      pulse.setValue(0)
      glow.setValue(0)
    }
  }, [state])

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] })
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] })
  const glowOpacity = glow

  const ringColor = state === 'connected' ? '#00ff88' : state === 'connecting' ? '#a855f7' : c.text2
  const bgColor = state === 'connected' ? '#00ff8820' : state === 'connecting' ? '#a855f720' : c.bg2

  return (
    <View style={{ alignItems: 'center', paddingVertical: 32 }}>
      {/* Status text */}
      <Text style={{ color: state === 'connected' ? '#00ff88' : state === 'connecting' ? '#a855f7' : c.text2, fontSize: 14, fontWeight: '600', marginBottom: 24, textTransform: 'uppercase', letterSpacing: 2 }}>
        {state === 'connected' ? 'Protected' : state === 'connecting' ? 'Connecting...' : 'Not Connected'}
      </Text>

      {/* Glow layer */}
      <Animated.View
        style={{
          position: 'absolute',
          width: 220,
          height: 220,
          borderRadius: 110,
          backgroundColor: ringColor,
          opacity: glowOpacity.interpolate({ inputRange: [0, 1], outputRange: [0, 0.15] }),
        }}
      />

      {/* Pulse ring */}
      {(state === 'connecting' || state === 'connected') && (
        <Animated.View
          style={{
            position: 'absolute',
            width: 200,
            height: 200,
            borderRadius: 100,
            borderWidth: 2,
            borderColor: ringColor,
            transform: [{ scale: ringScale }],
            opacity: ringOpacity,
          }}
        />
      )}

      {/* Main button */}
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={{
          width: 160,
          height: 160,
          borderRadius: 80,
          backgroundColor: bgColor,
          borderWidth: 3,
          borderColor: ringColor,
          justifyContent: 'center',
          alignItems: 'center',
          shadowColor: ringColor,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: state === 'connected' ? 0.4 : 0.2,
          shadowRadius: 20,
          elevation: 10,
        }}
      >
        {/* Power icon */}
        <View style={{ width: 48, height: 48 }}>
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 18,
              width: 12,
              height: 20,
              backgroundColor: ringColor,
              borderRadius: 6,
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 8,
              left: 4,
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 4,
              borderColor: ringColor,
              borderLeftColor: 'transparent',
              transform: [{ rotate: '-30deg' }],
            }}
          />
        </View>
      </TouchableOpacity>

      {/* Location */}
      {location && state === 'connected' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20, backgroundColor: c.bg2, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#00ff88', marginRight: 8 }} />
          <Text style={{ color: c.text, fontSize: 13, fontWeight: '500' }}>{location}</Text>
        </View>
      )}
    </View>
  )
}
