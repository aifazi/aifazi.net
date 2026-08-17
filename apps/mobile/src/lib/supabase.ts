import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

let _client: SupabaseClient | null = null

/**
 * Supabase browser/RN client used ONLY for Realtime subscriptions
 * (chat messages, DM messages, presence, typing). Auth is PASETO on the
 * FastAPI backend — never Supabase JWT — so the chat tables expose anon
 * SELECT via RLS and the client uses the publishable anon key. If the env
 * vars are missing the client is null and screens fall back to polling.
 */
export function getSupabase(): SupabaseClient | null {
  if (_client) return _client
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null
  }
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: { params: { eventsPerSecond: 20 } },
  })
  return _client
}

export function removeChannel(channel: RealtimeChannel | undefined | null) {
  if (channel) {
    try {
      getSupabase()?.removeChannel(channel)
    } catch {
      // ignore — channel may already be removed
    }
  }
}