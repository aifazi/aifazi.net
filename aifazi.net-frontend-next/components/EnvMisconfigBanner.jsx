'use client'
import { useState } from 'react'

/**
 * EnvMisconfigBanner — fail-visible (not fail-silent) for missing critical
 * client env vars in production. Empty NEXT_PUBLIC_SUPABASE_URL/KEY etc.
 * otherwise degrade silently (realtime/auth off, push dead, CDN rewrite off).
 * Localhost and preview deploys never show this.
 */
// NOTE: Next.js only inlines statically-analyzable process.env.NEXT_PUBLIC_*
// references at build time. A dynamic lookup (process.env[k]) is NEVER
// substituted and always reads empty client-side — so the check below must
// stay fully static or the banner false-positives on every production load.
const CLIENT_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
}

export default function EnvMisconfigBanner() {
  const [dismissed, setDismissed] = useState(false)
  const [missing] = useState(() => {
    if (typeof window === 'undefined') return []
    const host = window.location.hostname || ''
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.vercel.app')) return []
    if (!(host === 'aifazi.net' || host.endsWith('.aifazi.net'))) return []
    return Object.entries(CLIENT_ENV)
      .filter(([, v]) => !v)
      .map(([k]) => k)
  })
  if (dismissed || missing.length === 0) return null
  return (
    <div role="alert" style={{
      position: 'sticky', top: 0, zIndex: 99990, background: '#3a0d12',
      borderBottom: '1px solid #ff4757', color: '#ffd7db',
      fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 0.5,
      padding: '8px 14px', display: 'flex', gap: 12, alignItems: 'center',
      justifyContent: 'center', flexWrap: 'wrap',
    }}>
      <span>⚠ Missing production env: {missing.join(', ')} — some features are disabled.</span>
      <button
        type="button" onClick={() => setDismissed(true)} aria-label="Dismiss"
        style={{ background: 'transparent', border: '1px solid #ff4757', color: '#ffd7db', borderRadius: 4, cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}
      >
        DISMISS
      </button>
    </div>
  )
}
