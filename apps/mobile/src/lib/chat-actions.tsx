import { useRef } from 'react'
import type { ReactNode } from 'react'
import { Alert, Animated, PanResponder, GestureResponderEvent, PanResponderGestureState } from 'react-native'

export interface MessageActions {
  isMine: boolean
  onReply: () => void
  onReact: () => void
  onEdit?: () => void
  onDelete?: () => void
}

const QUICK_EMOJIS = ['👍', '❤️', '🔥', '😂', '🎉', '😮', '👀', '💯']

/**
 * Long-press action menu for a chat message. Shows Reply / React always,
 * plus Edit + Delete when the message is the user's own.
 */
export function showMessageActions(a: MessageActions) {
  const buttons: any[] = [
    { text: 'Cancel', style: 'cancel' },
    { text: '💬 Reply', onPress: a.onReply },
    { text: '😀 React', onPress: a.onReact },
  ]
  if (a.isMine) {
    if (a.onEdit) buttons.push({ text: '✏️ Edit', onPress: a.onEdit })
    if (a.onDelete) buttons.push({ text: '🗑 Delete', style: 'destructive', onPress: a.onDelete })
  }
  Alert.alert('Message', 'Choose an action', buttons)
}

/** Quick emoji picker for reactions. */
export function showEmojiPicker(onPick: (emoji: string) => void) {
  const flat: any[] = QUICK_EMOJIS.map((e) => ({ text: e, onPress: () => onPick(e) }))
  flat.push({ text: 'Cancel', style: 'cancel' })
  Alert.alert('React', 'Pick an emoji', flat, { cancelable: true })
}

export interface SwipeToReplyOptions {
  onReply: () => void
  threshold?: number
  disabled?: boolean
}

/**
 * Swipe-left-to-reply. Wrap a message row with the returned view props.
 * Horizontal swipes trigger reply; vertical swipes are left to the list.
 */
export function useSwipeToReply({ onReply, threshold = 60, disabled = false }: SwipeToReplyOptions) {
  const pan = useRef(new Animated.ValueXY()).current

  const release = (dx: number) => {
    if (dx < -threshold && !disabled) onReply()
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start()
  }

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e: GestureResponderEvent, g: PanResponderGestureState) =>
        !disabled && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => {
        pan.setValue({ x: Math.max(g.dx, -90), y: 0 })
      },
      onPanResponderRelease: (_e: GestureResponderEvent, g: PanResponderGestureState) => release(g.dx),
      onPanResponderTerminate: () => release(0),
      onPanResponderTerminationRequest: () => true,
    }),
  ).current

  return {
    pan,
    panHandlers: responder.panHandlers,
  }
}

/**
 * Presentational wrapper that adds swipe-left-to-reply to arbitrary message
 * content. Renders an inline "Reply" hint when the user swipes right (cancels).
 */
export function SwipeReplyRow({
  children,
  onReply,
  disabled = false,
  style,
}: {
  children: ReactNode
  onReply: () => void
  disabled?: boolean
  style?: any
}) {
  const { pan, panHandlers } = useSwipeToReply({ onReply, disabled })
  return (
    <Animated.View style={[{ transform: [{ translateX: pan.x }] }, style]} {...panHandlers}>
      {children}
    </Animated.View>
  )
}
