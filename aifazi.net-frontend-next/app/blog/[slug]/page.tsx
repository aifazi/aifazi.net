import type { Metadata } from 'next'
import BlogPostClient from '@/pages-src/BlogPost'

interface Props { params: Promise<{ slug: string }> }

// ISR: revalidate blog posts every 5 minutes
export const revalidate = 300

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { slug } = await params
    const apiBase = process.env.NEXT_PUBLIC_API_URL || ''
    const res = await fetch(`${apiBase}/api/blog/${slug}`, { next: { revalidate: 300 } })
    if (!res.ok) return { title: 'Post Not Found' }
    const post = await res.json()
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

export default function Page() {
  return <BlogPostClient />
}
