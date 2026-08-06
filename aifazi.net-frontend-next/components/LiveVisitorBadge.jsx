'use client'
/**
 * LiveVisitorBadge â€” #14
 * Shows active visitor count.
 *
 * Security: visitor_sessions is fail-closed (anon/authenticated can't read it â€”
 * migration 022). The public count is served ONLY by the backend
 * /stats/visitors/live endpoint (service role). Polling that endpoint keeps the
 * count fresh without exposing raw visitor rows to the browser.
 */
import { useState, useEffect } from 'react'
import api from '@/lib/api'

export default function LiveVisitorBadge({ style = {} }) {
  const [count, setCount] = useState(null)

  const fetchCount = async () => {
    try {
      const r = await api.get('/stats/visitors/live')
      const nextCount = typeof r.data?.count === 'number' ? r.data.count : r.data?.online
      if (typeof nextCount === 'number') setCount(nextCount)
    } catch {}
  }

  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 30_000)
    return () => clearInterval(interval)
  }, [])

  if (count === null) return null

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1,
      padding: '4px 10px', borderRadius: 99,
      background: 'color-mix(in srgb, var(--green) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--green) 25%, transparent)',
      color: 'var(--green)', ...style }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)',
        boxShadow: '0 0 6px var(--green)', flexShrink: 0,
        animation: 'lvbPulse 2s ease-in-out infinite' }} />
      <span>{count} online</span>
      <style>{`@keyframes lvbPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.7)}}`}</style>
    </div>
  )
}
