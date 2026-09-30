import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SITE_URL } from '@/lib/config'
import { verifyAdminSession } from '@/lib/adminSession'
import BlockEditor from '@/components/blocks/BlockEditor'

export const metadata: Metadata = { title: 'Page Builder', robots: { index: false } }

export default async function AdminBlocksPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries((await searchParams) ?? {})) {
    if (Array.isArray(v)) v.forEach((item) => { if (item !== undefined) sp.append(k, item) })
    else if (v !== undefined) sp.append(k, v)
  }
  const { valid, user } = await verifyAdminSession(sp)

  const allowedRoles = ['admin', 'moderator', 'editor']
  const isStaff = valid && user && allowedRoles.includes(user.role)
  if (!isStaff) {
    const loginUrl = new URL('/login', SITE_URL)
    loginUrl.searchParams.set('tab', 'signin')
    loginUrl.searchParams.set('next', '/admin/blocks')
    redirect(loginUrl.toString())
  }

  return (
    <main style={{ width: '100%', maxWidth: 1400, margin: '0 auto', padding: '110px 28px 40px' }}>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: 'var(--cyan)', margin: '0 0 8px' }}>
        ADMIN · PAGE BUILDER
      </p>
      <h1 style={{ fontSize: 'clamp(24px, 3vw, 36px)', margin: '0 0 16px', color: 'var(--text)' }}>
        Page layouts
      </h1>
      <BlockEditor />
    </main>
  )
}
