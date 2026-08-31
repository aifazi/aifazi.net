import type { Metadata } from 'next'
import StatusPage from '@/pages-src/StatusPage'

export const metadata: Metadata = {
  title: 'AIFAZI · System Status',
  description: 'Live uptime, response times and incident history for the aifazi.net platform — website, API, database, game servers and scheduled jobs.',
  openGraph: {
    title: 'AIFAZI · System Status',
    description: 'Live uptime, response times and incident history for the aifazi.net platform.',
  },
}

function backendBaseUrl(): string {
  if (process.env.INTERNAL_API_URL) return process.env.INTERNAL_API_URL.replace(/\/+$/, '')
  const pub = process.env.NEXT_PUBLIC_API_URL
  if (pub && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(pub)) {
    return pub.replace(/\/+$/, '')
  }
  return ''
}

async function fetchStatusServer(): Promise<Record<string, any> | null> {
  const base = backendBaseUrl()
  if (!base) return null
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25000)
    const res = await fetch(`${base}/api/monitor/status`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 30 },
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!res.ok) return null
    const data = await res.json()
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

export default async function Page() {
  const data = await fetchStatusServer()
  return <StatusPage initialData={data} />
}