export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import AppClient from '@/pages-src/AppPage'

export const metadata: Metadata = {
  title: 'aifazi Mobile App | Android App',
  description: 'Download the aifazi Android app — chat, voice & video calls, blog, forum, store and live server status in your pocket.',
}

export default function Page() {
  return <AppClient />
}