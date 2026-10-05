import type { Metadata } from 'next'
import ForumThreadClient from '@/pages-src/ForumThread'
import { SITE_URL } from '@/lib/config'
import { jsonLdScript } from '@/lib/seo'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

function backendBaseUrl(): string {
  if (process.env.INTERNAL_API_URL) return process.env.INTERNAL_API_URL.replace(/\/+$/, '')
  const pub = process.env.NEXT_PUBLIC_API_URL
  if (pub && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(pub)) {
    return pub.replace(/\/+$/, '')
  }
  return ''
}

// Best-effort server fetch for SEO only — the client component below still
// owns all interactive behavior and error states.
async function getThread(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return null
  const base = backendBaseUrl()
  if (!base) return null
  try {
    const res = await fetch(`${base}/api/forum/threads/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json()
    return (data?.thread ?? null) as {
      title?: string
      content?: string
      createdAt?: string
      replyCount?: number
      reply_count?: number
    } | null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const canonical = `/forum/thread/${id}`
  try {
    const t = await getThread(id)
    if (!t?.title) {
      return { title: 'Forum Thread', alternates: { canonical } }
    }
    const description = (t.content || t.title).slice(0, 160)
    return {
      title: t.title,
      description,
      alternates: { canonical },
      openGraph: {
        title: t.title,
        description,
        url: `${SITE_URL}${canonical}`,
        type: 'article',
      },
      twitter: { card: 'summary', title: t.title, description },
    }
  } catch {
    return { title: 'Forum Thread', alternates: { canonical } }
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params
  const url = `${SITE_URL}/forum/thread/${id}`
  let ld: Record<string, unknown> | null = null
  try {
    const t = await getThread(id)
    if (t?.title) {
      // F2: escaped DiscussionForumPosting JSON-LD (neutralizes `<` so the
      // payload can never break out of the script tag).
      ld = {
        '@context': 'https://schema.org',
        '@type': 'DiscussionForumPosting',
        headline: t.title,
        text: (t.content || t.title).slice(0, 5000),
        url,
        datePublished: t.createdAt,
        interactionStatistic: {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/CommentAction',
          userInteractionCount: t.replyCount ?? t.reply_count ?? 0,
        },
        isPartOf: { '@type': 'WebSite', name: 'aifazi.net', url: SITE_URL },
      }
    }
  } catch {
    ld = null
  }
  return (
    <>
      {ld ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }}
        />
      ) : null}
      <ForumThreadClient />
    </>
  )
}
