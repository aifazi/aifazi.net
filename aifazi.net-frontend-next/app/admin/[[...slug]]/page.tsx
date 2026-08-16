import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.aifazi.net'

async function verifyAdminSession(): Promise<{ valid: boolean; user?: any }> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  const requestHeaders = await headers()
  const forwardedFor = requestHeaders.get('x-forwarded-for')
  const realIp = requestHeaders.get('x-real-ip')

  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/verify`, {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
        ...(forwardedFor && { 'X-Forwarded-For': forwardedFor }),
        ...(realIp && { 'X-Real-IP': realIp }),
      },
      cache: 'no-store',
    })

    if (!res.ok) return { valid: false }
    const data = await res.json()
    return { valid: data.valid === true, user: data.user }
  } catch {
    return { valid: false }
  }
}

export const metadata: Metadata = { title: 'Admin Portal', robots: { index: false } }

/** Escape JSON so it can never break out of an inline <script> (`</script>`). */
function escapeJsonForInline(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

export default async function AdminPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { valid, user } = await verifyAdminSession()

  if (!valid) {
    const loginUrl = new URL('/login', 'https://aifazi.net')
    loginUrl.searchParams.set('tab', 'signin')
    loginUrl.searchParams.set('next', '/admin')
    redirect(loginUrl.toString())
  }

  // Page is always dynamic (cookies/headers/fetch no-store), so no
  // revalidatePath here — calling it during render throws.

  // Server-side render the admin shell - client component for interactivity
  const AdminClient = (await import('@/pages-src/Admin')).default

  return (
    <>
      {/* Server-rendered user context for layout */}
      <script
        id="admin-user-data"
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: escapeJsonForInline({
            role: user?.role || 'admin',
            username: user?.username || '',
            permissions: user?.permissions || {},
            staffAccount: user?.staff_account || false,
          }),
        }}
      />
      <AdminClient serverUser={user} />
    </>
  )
}