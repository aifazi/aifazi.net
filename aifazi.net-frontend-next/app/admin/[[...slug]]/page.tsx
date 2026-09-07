import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SITE_URL, API_URL } from '@/lib/config'

const BACKEND_URL = API_URL

async function verifyAdminSession(): Promise<{ valid: boolean; user?: any }> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  // NOTE: client X-Forwarded-For / X-Real-IP are deliberately NOT forwarded.
  // They are attacker-controlled and the backend only trusts CF-Connecting-IP
  // behind CF-Ray — forwarding them could only pollute audit logs, never help.

  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/verify`, {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
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

  // 'chat' included: chat staff land on the Live Chat section via the
  // dashboard's first-permitted redirect instead of a login loop.
  const allowedRoles = ['admin', 'moderator', 'editor', 'chat']
  const isStaff = valid && user && allowedRoles.includes(user.role)

  if (!isStaff) {
    const loginUrl = new URL('/login', SITE_URL)
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