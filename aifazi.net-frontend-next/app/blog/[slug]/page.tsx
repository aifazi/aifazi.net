import type { Metadata } from 'next'
import BlogPostClient from '@/pages-src/BlogPost'

interface Props { params: Promise<{ slug: string }> }

// ISR: revalidate blog posts every 5 minutes
export const revalidate = 300

function backendBaseUrl(): string {
  if (process.env.INTERNAL_API_URL) return process.env.INTERNAL_API_URL.replace(/\/+$/, '')
  const pub = process.env.NEXT_PUBLIC_API_URL
  if (pub && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(pub)) {
    return pub.replace(/\/+$/, '')
  }
  return ''
}

async function getPost(slug: string) {
  const base = backendBaseUrl()
  if (!base) return null
  try {
    const res = await fetch(`${base}/api/blog/${slug}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { slug } = await params
    const post = await getPost(slug)
    if (!post) return { title: 'Post Not Found' }
    return {
      title: post.title,
      description: post.excerpt || post.title,
      openGraph: {
        title: post.title,
        description: post.excerpt,
        images: post.cover_image ? [post.cover_image] : [],
        type: 'article',
        publishedTime: post.created_at,
      },
      twitter: { card: 'summary_large_image', title: post.title, description: post.excerpt },
    }
  } catch {
    return { title: 'Blog Post' }
  }
}

export default async function Page({ params }: Props) {
  const { slug } = await params
  const post = await getPost(slug)
  return <BlogPostClient initialPost={post} />
}
