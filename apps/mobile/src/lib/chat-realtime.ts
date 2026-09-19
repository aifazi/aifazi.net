import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabase, removeChannel } from './supabase'
import { normalizeTypingActivity, type TypingActivity, type TypingActivityKind } from '@fazi/shared'

type MessageHandlers<T> = {
  onInsert?: (row: T) => void
  onUpdate?: (row: T) => void
  onDelete?: (oldRow: T) => void
}

export interface MessageLike {
  id: string
}

/**
 * Subscribe to postgres_changes for chat/DM messages filtered by a single
 * column (room_id for chat_messages, thread_id for dm_messages). Returns
 * `active` so screens can fall back to polling when Realtime is unavailable
 * (no anon key configured, project not enabled, etc.). Handlers are held in a
 * ref, so the subscription never churns on re-render.
 *
 * NOTE: anon-key realtime depends on Supabase RLS (see supabase.ts) — the
 * server-side filter is not a security boundary by itself. As defense in
 * depth, every incoming row is re-checked against the requested id here and
 * rows for other rooms/threads are dropped before reaching handlers.
 */
export function useMessagesRealtime<T extends MessageLike>(
  table: 'chat_messages' | 'dm_messages',
  id: string | null | undefined,
  column: 'room_id' | 'thread_id',
  handlers: MessageHandlers<T>,
): { active: boolean } {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!id) return
    const client = getSupabase()
    if (!client) {
      setActive(false)
      return
    }
    // Runtime guard: drop rows that don't belong to the requested room/thread.
    const matchesId = (row: unknown): row is T => {
      if (!row || typeof row !== 'object') return false
      return (row as Record<string, unknown>)[column] === id
    }
    setActive(false)
    const channel: RealtimeChannel = client
      .channel(`${table}:${column}:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `${column}=eq.${id}` }, (payload) => {
        const row = payload.new as T
        if (matchesId(row)) handlersRef.current.onInsert?.(row)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `${column}=eq.${id}` }, (payload) => {
        const row = payload.new as T
        if (matchesId(row)) handlersRef.current.onUpdate?.(row)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table, filter: `${column}=eq.${id}` }, (payload) => {
        const row = payload.old as T
        if (matchesId(row)) handlersRef.current.onDelete?.(row)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setActive(true)
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setActive(false)
      })
    return () => {
      setActive(false)
      removeChannel(channel)
    }
  }, [table, column, id])

  return { active }
}

/**
 * Subscribe to typing broadcast events on a per-room channel. Mirrors the web
 * app's `typing:<roomId>` broadcast channel so mobile users see web users type
 * instantly (and vice versa). Payload carries `{username, activity}` so the
 * indicator can show what the peer is doing (typing / image / file / voice).
 */
export function useTypingBroadcast(id: string | null | undefined, onTyping: (t: TypingActivity) => void) {
  const onTypingRef = useRef(onTyping)
  onTypingRef.current = onTyping

  useEffect(() => {
    if (!id) return
    const client = getSupabase()
    if (!client) return
    const channel = client.channel(`typing:${id}`)
    channel.on('broadcast', { event: 'typing' }, (payload) => {
      const t = normalizeTypingActivity((payload as { payload?: unknown }).payload)
      if (t.username) onTypingRef.current(t)
    })
    channel.subscribe()
    return () => removeChannel(channel)
  }, [id])
}

/**
 * Broadcast that the current user is active. Returns true when sent (realtime
 * available); callers should keep the REST heartbeat as a fallback otherwise.
 */
export function sendTypingBroadcast(id: string, username: string, activity: TypingActivityKind = 'typing'): boolean {
  const client = getSupabase()
  if (!client) return false
  try {
    void client
      .channel(`typing:${id}`)
      .send({ type: 'broadcast', event: 'typing', payload: { username, activity } })
      .then((ok) => ok === 'ok')
    return true
  } catch {
    return false
  }
}