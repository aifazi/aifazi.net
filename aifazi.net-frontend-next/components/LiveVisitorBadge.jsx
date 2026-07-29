'use client'
/**
 * LiveVisitorBadge — #14
 * Shows active visitor count, updated via:
 *   1. Supabase Realtime on visitor_sessions table (instant)
 *   2. REST polling GET /stats/visitors/live every 30s (fallback)
 *
 * Required SQL (run once in Supabase SQL editor):
 *   CREATE TABLE IF NOT EXISTS visitor_sessions (
 *     id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     session_id TEXT NOT NULL,
 *     last_seen  TIMESTAMPTZ DEFAULT now(),
 *     page       TEXT
 *   );
 *   ALTER TABLE visitor_sessions REPLICA IDENTITY FULL;
 *   ALTER PUBLICATION supabase_realtime ADD TABLE visitor_sessions;
 */
import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { getSupabase } from '@/lib/supabase'

export default function LiveVisitorBadge({ style = {} }) {
  const [count, setCount] = useState(null)

  const fetchCount = async () => {
    try {
      const r = await api.get('/stats/visitors/live')
      const nextCount = typeof r.data?.count === 'number' ? r.data.count : r.data?.online
      if (typeof nextCount === 'number') setCount(nextCount)
    } catch {
      // Fallback: count from Supabase directly (last 5 min)
      try {
        const sb = getSupabase()
        if (!sb) return
        const since = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const { count: c } = await sb
          .from('visitor_sessions')
          .select('*', { count: 'exact', head: true })
          .gte('last_seen', since)
        if (typeof c === 'number') setCount(c)
      } catch {}
    }
  }

  useEffect(() => {
    const sb = getSupabase()
    fetchCount()
    const interval = setInterval(fetchCount, 30_000)

    // Instant update via Supabase Realtime
    const channel = sb
      ? sb
          .channel('visitor-sessions-live')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_sessions' }, fetchCount)
          .subscribe()
      : null

    return () => {
      clearInterval(interval)
      if (sb && channel) sb.removeChannel(channel)
    }
  }, [])

  if (count === null) return null

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
      padding: '4px 10px', borderRadius: 99,
      background: 'rgba(0,255,136,0.08)', border: '1px solid rgba(0,255,136,0.25)',
      color: 'var(--green)', ...style }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)',
        boxShadow: '0 0 6px var(--green)', flexShrink: 0,
        animation: 'lvbPulse 2s ease-in-out infinite' }} />
      <span>{count} online</span>
      <style>{`@keyframes lvbPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.7)}}`}</style>
    </div>
  )
}
