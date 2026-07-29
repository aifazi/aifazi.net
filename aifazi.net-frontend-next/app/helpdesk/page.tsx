'use client'

import dynamic from 'next/dynamic'

const HelpDeskClient = dynamic(() => import('@/pages-src/HelpDesk'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 14 }}>
      Loading help desk…
    </div>
  ),
})

export default function Page() { return <HelpDeskClient /> }