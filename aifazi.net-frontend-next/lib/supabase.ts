/**
 * lib/supabase.ts — Supabase browser client (anon key for Realtime, with auth support)
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
 *   ALTER TABLE chat_mutes    REPLICA IDENTITY FULL;
 *   ALTER TABLE chat_bans     REPLICA IDENTITY FULL;
 *   ALTER TABLE chat_members  REPLICA IDENTITY FULL;
 *   ALTER PUBLICATION supabase_realtime ADD TABLE chat_mutes;
 *   ALTER PUBLICATION supabase_realtime ADD TABLE chat_bans;
 *   ALTER PUBLICATION supabase_realtime ADD TABLE chat_members;
 *
 * Without REPLICA IDENTITY FULL, UPDATE and DELETE events will not fire.
 */
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null
let _authedClient: SupabaseClient | null = null

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

/**
 * Get authenticated Supabase client for Realtime subscriptions with user JWT.
 * Uses the user's access token from the auth cookie.
 */
export function getAuthedSupabase(): SupabaseClient | null {
  if (_authedClient) return _authedClient
  if (typeof window === 'undefined') return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  if (!url || !key) {
    console.warn('[Supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.')
    return null
  }

  // Create a client that will use the auth token for Realtime
  _authedClient = createClient(url, key, {
    realtime: { params: { eventsPerSecond: 20 } },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
  return _authedClient
}

/**
 * Set the auth token on the authed Supabase client for Realtime subscriptions.
 * Call this after user login or when token refreshes.
 */
export function setSupabaseAuthToken(accessToken: string): void {
  if (_authedClient) {
    _authedClient.auth.setSession({
      access_token: accessToken,
      refresh_token: '', // We don't have refresh token in frontend, cookie handles it
    }).catch(() => {})
  }
}

/**
 * Clear the auth token (on logout)
 */
export function clearSupabaseAuthToken(): void {
  if (_authedClient) {
    _authedClient.auth.signOut().catch(() => {})
  }
}

// Lazy getter that works with ESM — returns null on server, real client on browser
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