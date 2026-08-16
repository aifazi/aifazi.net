export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import BuilderPageClient from '@/pages-src/BuilderPage'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  return {
    title: `${slug} | aifazi.net`,
    description: `Builder page — /pages/${slug} on aifazi.net`,
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <BuilderPageClient slug={slug} />
}