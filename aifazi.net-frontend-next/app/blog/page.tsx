import type { Metadata } from 'next'
import BlogClient from '@/pages-src/Blog'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Articles, tutorials, and thoughts on software development.',
  openGraph: { title: 'Blog | aifazi.net' },
}

// ISR: the post grid is cached and revalidated every 5 minutes. The client
// component still re-fetches for search/category/tag filters and live-syncs
// through its Realtime channel, but visitors get content on first paint.
export const revalidate = 300

function backendBaseUrl(): string {
  if (process.env.INTERNAL_API_URL) return process.env.INTERNAL_API_URL.replace(/\/+$/, '')
  const pub = process.env.NEXT_PUBLIC_API_URL
  if (pub && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(pub)) {
    return pub.replace(/\/+$/, '')
  }
  return ''
}

async function getPosts() {
  const base = backendBaseUrl()
  if (!base) return []
  try {
    const res = await fetch(`${base}/api/blog?limit=12`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data.posts) ? data.posts : []
  } catch {
    return []
  }
}

export default async function Page() {
  const posts = await getPosts()
  return <BlogClient initialPosts={posts} />
}
