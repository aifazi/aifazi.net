/**
 * lib/supabase.ts — Supabase browser client (anon key, for Realtime subscriptions)
 *
 * REQUIRED — run once in Supabase SQL editor to enable Realtime on these tables:
 *
 *   ALTER TABLE chat_messages REPLICA IDENTITY FULL;
 *   ALTER TABLE chat_rooms    REPLICA IDENTITY FULL;
 *   ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
 *   ALTER PUBLICATION supabase_realtime ADD TABLE chat_rooms;
 *   ALTER TABLE posts       REPLICA IDENTITY FULL;
 *   ALTER PUBLICATION supabase_realtime ADD TABLE posts;
 *   ALTER TABLE site_config REPLICA IDENTITY FULL;
 *   ALTER PUBLICATION supabase_realtime ADD TABLE site_config;
 *   ALTER TABLE banners REPLICA IDENTITY FULL;
 *   ALTER PUBLICATION supabase_realtime ADD TABLE banners;
 *
 * Without REPLICA IDENTITY FULL, UPDATE and DELETE events will not fire.
 */
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (_client) return _client
  if (typeof window === 'undefined') return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) {
    console.warn('[Supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.')
    return null
  }

  _client = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 20 } },
  })
  return _client
}

// Lazy getter that works with ESM — returns null on server, real client on browser
// Existing `import { supabase }` calls will get this getter
let _supabaseProxy: SupabaseClient | null = null

export function getSupabaseProxy(): SupabaseClient | null {
  if (_supabaseProxy) return _supabaseProxy
  if (typeof window === 'undefined') return null
  _supabaseProxy = getSupabase()
  return _supabaseProxy
}

// Backward-compatible named export: null on server, client on browser
// Components should use getSupabase() in useEffect (after mount) to avoid SSR issues
export const supabase: SupabaseClient | null = typeof window !== 'undefined' ? getSupabase() : null