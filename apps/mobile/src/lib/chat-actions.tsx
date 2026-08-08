import { useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import { Animated, PanResponder, GestureResponderEvent, PanResponderGestureState } from 'react-native'
import { useOverlay, MenuOption } from '@/src/components/overlay'

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
export function useMessageActions() {
  const { menu } = useOverlay()

  const showMessageActions = useCallback(
    async (a: MessageActions) => {
      const options: MenuOption[] = [
        { value: 'reply', label: '💬 Reply' },
        { value: 'react', label: '😀 React' },
      ]
      if (a.isMine) {
        if (a.onEdit) options.push({ value: 'edit', label: '✏️ Edit' })
        if (a.onDelete) options.push({ value: 'delete', label: '🗑 Delete', destructive: true })
      }
      const picked = await menu({ title: 'Message', options })
      if (picked === 'reply') a.onReply()
      else if (picked === 'react') a.onReact()
      else if (picked === 'edit') a.onEdit?.()
      else if (picked === 'delete') a.onDelete?.()
    },
    [menu],
  )

  const showEmojiPicker = useCallback(
    async (onPick: (emoji: string) => void) => {
      const picked = await menu({
        title: 'React',
        options: QUICK_EMOJIS.map((e) => ({ value: e, label: e, icon: e })),
      })
      if (picked) onPick(picked)
    },
    [menu],
  )

  return { showMessageActions, showEmojiPicker }
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
