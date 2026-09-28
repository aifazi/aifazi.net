import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SITE_URL, API_URL } from '@/lib/config'

const BACKEND_URL = API_URL
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || ''

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return Buffer.from(binary, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// P2 — mint the same per-request HMAC X-Internal-Token that proxy.ts stamps
// on /api/* traffic (method + path + sorted-query + timestamp, ~5 min TTL),
// so the SSR verify call passes the backend gate exactly like a proxied
// browser request. The canonical-query encoding below mirrors proxy.ts
// makeInternalToken EXACTLY (sort decoded pairs by code point, then
// percent-encode with Python quote(safe='') semantics); searchParams are
// threaded through so a future query string can't silently mint a token for
// the wrong canonical query and break the gate.
const _rfcencode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
function canonicalQuery(searchParams?: URLSearchParams): string {
  return [...(searchParams?.entries() ?? [])]
    .sort(([ak, av], [bk, bv]) => (ak < bk ? -1 : ak > bk ? 1 : av < bv ? -1 : av > bv ? 1 : 0))
    .map(([k, v]) => `${_rfcencode(k)}=${_rfcencode(v)}`)
    .join('&')
}
async function makeInternalToken(method: string, pathname: string, searchParams?: URLSearchParams): Promise<string> {
  if (!INTERNAL_API_SECRET) return ''
  const ts = String(Math.floor(Date.now() / 1000))
  const query = canonicalQuery(searchParams)
  const msg = `${method}:${pathname}:${query}:${ts}`
  const { createHmac } = await import('crypto')
  const sig = createHmac('sha256', INTERNAL_API_SECRET).update(msg).digest()
  return `${bytesToBase64Url(new TextEncoder().encode(ts))}.${bytesToBase64Url(sig)}`
}

async function verifyAdminSession(searchParams?: URLSearchParams): Promise<{ valid: boolean; user?: any }> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  // NOTE: client X-Forwarded-For / X-Real-IP are deliberately NOT forwarded.
  // They are attacker-controlled and the backend only trusts CF-Connecting-IP
  // behind CF-Ray — forwarding them could only pollute audit logs, never help.

  try {
    const headers: Record<string, string> = { Cookie: cookieHeader }
    const internalToken = await makeInternalToken('GET', '/api/auth/verify', searchParams)
    if (internalToken) headers['X-Internal-Token'] = internalToken
    const url = `${BACKEND_URL}/api/auth/verify${searchParams?.size ? `?${searchParams.toString()}` : ''}`
    const res = await fetch(url, {
      method: 'GET',
      headers,
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