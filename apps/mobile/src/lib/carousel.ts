import { Platform } from 'react-native'
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native'

type SnapProps = Pick<ScrollViewProps, 'pagingEnabled' | 'snapToInterval' | 'snapToAlignment' | 'decelerationRate' | 'contentContainerStyle'>

const content = (endPad: number): StyleProp<ViewStyle> => ({ paddingRight: endPad })

/**
 * Per-card scroll-snap for horizontal card lists. react-native-web maps
 * `pagingEnabled` to CSS `scroll-snap-type: x mandatory` with
 * `scroll-snap-align: start` on every child, so each card snaps to the left
 * edge with the next card peeking past the right edge. On native we use
 * `snapToInterval` for the same per-card behaviour. `endPad` keeps the last
 * card clear of the hard right clip edge.
 */
export function carouselSnap(interval: number, endPad = 24): SnapProps {
  if (Platform.OS === 'web') return { pagingEnabled: true, contentContainerStyle: content(endPad) }
  return {
    snapToInterval: interval,
    snapToAlignment: 'start',
    decelerationRate: 'fast',
    contentContainerStyle: content(endPad),
  }
}

/**
 * Same snap affordance for variable-width pill/tab rows (e.g. category pills),
 * which have no fixed interval to snap to. Web only; a no-op on native.
 */
export function webPillSnap(): SnapProps {
  if (Platform.OS === 'web') return { pagingEnabled: true, contentContainerStyle: content(16) }
  return {}
}
