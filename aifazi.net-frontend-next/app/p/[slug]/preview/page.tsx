/**
 * Staff-only draft preview: renders /p/[slug] for unpublished layouts using
 * the viewer's session cookie (the backend's _optional_admin decides — a
 * non-admin session just gets 404, same as the public route). The cookie
 * never leaves the server: it is forwarded on the server-side fetch only.
 */
export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import PageBlocks from '@/lib/blocks/PageBlocks'
import type { PageBlock } from '@/lib/blocks/types'

interface Props {
  params: Promise<{ slug: string }>
}

interface FetchedLayout {
  slug: string
  title: string
  published: boolean
  blocks: PageBlock[]
}

function backendBaseUrl(): string {
  if (process.env.INTERNAL_API_URL) return process.env.INTERNAL_API_URL.replace(/\/+$/, '')
  const pub = process.env.NEXT_PUBLIC_API_URL
  if (pub && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(pub)) {
    return pub.replace(/\/+$/, '')
  }
  return ''
}

export default async function PreviewPage({ params }: Props) {
  const { slug } = await params
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) notFound()
  const base = backendBaseUrl()
  const jar = await cookies()
  const cookieHeader = jar.getAll().map((c) => `${c.name}=${c.value}`).join('; ')
  if (!base || !cookieHeader) notFound()
  let layout: FetchedLayout | null = null
  try {
    const res = await fetch(`${base}/api/blocks/layouts/${slug}`, {
      headers: { Accept: 'application/json', Cookie: cookieHeader },
      cache: 'no-store',
    })
    if (res.ok) {
      const data = (await res.json()) as { layout?: FetchedLayout }
      layout = data.layout ?? null
    }
  } catch {
    layout = null
  }
  if (!layout) notFound()
  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'center',
          padding: '10px 16px',
          background: 'var(--comp-button-bg, #b45309)',
          color: 'var(--comp-button-text, #fff)',
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
        }}
      >
        <strong>PREVIEW</strong>
        <span>{layout.published ? 'published layout' : 'draft — visitors cannot see this'}</span>
        <a href={`/admin/blocks?slug=${encodeURIComponent(slug)}`} style={{ color: 'inherit' }}>
          edit →
        </a>
        <a href={`/p/${encodeURIComponent(slug)}`} style={{ color: 'inherit' }}>
          public page →
        </a>
      </div>
      <main>
        <PageBlocks blocks={layout.blocks} />
      </main>
    </>
  )
}
