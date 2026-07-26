export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import BlogClient from '@/pages-src/Blog'

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Articles, tutorials, and thoughts on software development.',
  openGraph: { title: 'Blog | aifazi.net' },
}

export default function Page() {
  return <BlogClient />
}
