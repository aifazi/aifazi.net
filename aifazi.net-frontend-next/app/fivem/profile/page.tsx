'use client'
export const dynamic = 'force-dynamic'
import { useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useForum } from '@/context/ForumContext'
import { useFiveMLoginRoute } from '@/lib/fivemRoutes'

function RedirectHandler() {
  const router = useRouter()
  const { user, loading: authLoading } = useForum()
  const loginHref = useFiveMLoginRoute('/profile')

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      window.location.href = loginHref
      return
    }
    router.replace('/profile')
  }, [authLoading, user, router, loginHref])

  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
      Loading...
    </div>
  )
  return null
}

export default function FiveMProfile() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>Loading...</div>}>
      <RedirectHandler />
    </Suspense>
  )
}
