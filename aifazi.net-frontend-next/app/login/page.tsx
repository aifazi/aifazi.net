export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import LoginClient from '@/pages-src/Login'

export const metadata: Metadata = { title: 'Sign In' }

// LoginClient uses useSearchParams() via router-compat's useLocation().
// Next.js App Router requires useSearchParams() to be wrapped in <Suspense>.
// Without this, the page crashes with a React minified error #31.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  )
}
