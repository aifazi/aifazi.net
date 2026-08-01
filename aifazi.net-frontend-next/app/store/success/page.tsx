'use client'
import { useEffect } from 'react'
import { useFiveMRoute } from '@/lib/fivemRoutes'

export default function StoreSuccess() {
  const storeHref = useFiveMRoute('/store')
  useEffect(() => {
    const t = setTimeout(() => { window.location.href = storeHref }, 2500)
    return () => clearTimeout(t)
  }, [storeHref])
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)', fontFamily: 'var(--font-mono)', textAlign: 'center', padding: 24 }}>
      <div>
        <div style={{ fontSize: 56 }}>✅</div>
        <h1 style={{ fontSize: 24, letterSpacing: 2, margin: '12px 0 8px', color: '#00FF88' }}>SUBSCRIPTION ACTIVE</h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7, maxWidth: 420, margin: '0 auto' }}>
          Thanks for supporting AIFAZI RP! Your perks are being applied to your account and will sync to the server automatically within 30 seconds.
        </p>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 20 }}>Redirecting to the store…</p>
      </div>
    </div>
  )
}
