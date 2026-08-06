'use client'
import dynamic from 'next/dynamic'

const StatusClient = dynamic(() => import('@/pages-src/StatusPage').then(m => m.default || m), { ssr: false })

export default function Page() {
  return <StatusClient />
}
