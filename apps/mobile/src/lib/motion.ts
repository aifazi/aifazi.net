import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * Respect the OS "reduce motion" accessibility setting.
 *
 * `useReducedMotion()` returns true when the user has asked for reduced
 * motion, so animated accents (glow, pulses, loops) can be gated off.
 * Expo/RN doesn't expose a live hook, so we read the setting on mount and
 * subscribe to changes while the caller is mounted.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v)
    })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      setReduced(v)
    })
    return () => {
      mounted = false
      sub.remove()
    }
  }, [])

  return reduced
}
