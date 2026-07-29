export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import HomeClient from '@/pages-src/Home'

export const metadata: Metadata = {
  title: 'Tanvir | Full-Stack Developer',
  description: 'Portfolio, blog, forum and tools by Tanvir — aifazi.net',
}

export default function Page() {
  return <HomeClient />
}
