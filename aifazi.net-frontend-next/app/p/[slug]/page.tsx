import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PageBlocks from '@/lib/blocks/PageBlocks'
import type { PageBlock } from '@/lib/blocks/types'
import { SITE_URL } from '@/lib/config'

interface Props {
  params: Promise<{ slug: string }>
}

// ISR: published PageBlocks layouts revalidate every 5 minutes
export const revalidate = 300

interface FetchedLayout {
  slug: string
  title: string
  published: boolean
  seoTitle?: string
  seoDescription?: string
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

async function getLayout(slug: string): Promise<FetchedLayout | null> {
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return null
  const base = backendBaseUrl()
  if (!base) return null
  try {
    const res = await fetch(`${base}/api/blocks/layouts/${slug}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    })
    if (res.status === 404) return null
    if (!res.ok) return null
    const data = (await res.json()) as { layout?: FetchedLayout }
    const layout = data.layout
    // Server-side fetch carries no admin session, so drafts already 404 —
    // this is belt-and-braces so a misconfigured auth path can't leak one.
    if (!layout || !layout.published) return null
    return layout
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { slug } = await params
    const layout = await getLayout(slug)
    if (!layout) return { title: 'Page Not Found' }
    const title = layout.seoTitle?.trim() || layout.title
    const description = layout.seoDescription?.trim() || layout.title
    return {
      title,
      description,
      alternates: { canonical: `/p/${slug}` },
      openGraph: {
        title,
        description,
        url: `${SITE_URL}/p/${slug}`,
        type: 'website',
      },
      twitter: { card: 'summary', title, description },
    }
  } catch {
    return { title: 'Page' }
  }
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  const layout = await getLayout(slug)
  if (!layout) notFound()
  return (
    <main>
      <PageBlocks blocks={layout.blocks} />
    </main>
  )
}
