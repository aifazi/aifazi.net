import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SITE_URL } from '@/lib/config'
import { verifyAdminSession, escapeJsonForInline } from '@/lib/adminSession'

export const metadata: Metadata = { title: 'Admin Portal', robots: { index: false } }

export default async function AdminPage({ params, searchParams }: { params: Promise<{ slug?: string[] }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries((await searchParams) ?? {})) {
    if (Array.isArray(v)) v.forEach(item => { if (item !== undefined) sp.append(k, item) })
    else if (v !== undefined) sp.append(k, v)
  }
  const { valid, user } = await verifyAdminSession(sp)

  // 'chat' included: chat staff land on the dashboard's first-permitted
  // section via the redirect instead of a login loop (in-house chat UI
  // was removed; chat + calls live in Nextcloud Talk).
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
            // P1-9 — default role is '' (no access), never 'admin': a missing
            // role must fail closed on the client until the server says staff.
            role: user?.role || '',
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