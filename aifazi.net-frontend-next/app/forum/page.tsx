export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import ForumHomeClient from '@/pages-src/ForumHome'

export const metadata: Metadata = {
  title: 'Forum',
  description: 'Community discussions, support threads and announcements.',
  alternates: { canonical: '/forum' },
}

export default function Page() { return <ForumHomeClient /> }
