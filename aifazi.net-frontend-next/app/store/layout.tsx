'use client'
import type { ReactNode } from 'react'
import StoreHeader from '@/components/StoreHeader'
import StoreFooter from '@/components/StoreFooter'

export default function StoreRootLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <StoreHeader />
      <main style={{ flex: 1 }}>{children}</main>
      <StoreFooter />
    </div>
  )
}
