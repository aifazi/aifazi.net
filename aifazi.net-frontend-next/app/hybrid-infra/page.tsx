import type { Metadata } from 'next'
import HybridInfraBody from '@/components/HybridInfraBody'
import EditSiteFab from '@/components/blocks/EditSiteFab'

const SITE = 'https://aifazi.net'

export const metadata: Metadata = {
  title: 'Hybrid Infrastructure — Interactive Case Study',
  description:
    'Interactive Plan A hybrid infrastructure case study: on-premises Proxmox core with Microsoft 365 identity, security, and immutable backup. By Tanvir.',
  alternates: { canonical: `${SITE}/hybrid-infra` },
  openGraph: {
    type: 'article',
    url: `${SITE}/hybrid-infra`,
    siteName: 'aifazi.net',
    title: 'Hybrid Infrastructure — Interactive Case Study | aifazi.net',
    description:
      'Explore an interactive enterprise data center: HA edge, Proxmox cluster, Entra ID sync, and immutable backup.',
  },
  twitter: {
    card: 'summary',
    title: 'Hybrid Infrastructure — Interactive Case Study | aifazi.net',
    description:
      'On-premises core + Microsoft 365 / Entra ID / Defender / Purview, presented as an interactive diagram.',
  },
}

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'Plan A — Hybrid Infrastructure',
  description:
    'Interactive case study: on-premises Proxmox core with Microsoft 365 identity, security, and immutable backup.',
  author: { '@type': 'Person', name: 'Tanvir', url: SITE },
  mainEntityOfPage: `${SITE}/hybrid-infra`,
}

export default async function HybridInfraPage({
  searchParams,
}: {
  searchParams?: Promise<{ diagram?: string }>
}) {
  const params = (await searchParams) ?? {}
  const hasDiagram = typeof params.diagram === 'string' && params.diagram.trim() !== ''
  const activeSlug = hasDiagram ? (params.diagram as string) : 'plan-a'
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
    <main
      style={{
        width: '100%',
        maxWidth: '100%',
        padding: '110px 28px 40px',
        background: 'transparent',
      }}
    >
      <div style={{ maxWidth: 1440, margin: '0 auto' }}>
        <HybridInfraBody initialSlug={activeSlug} initialEntered={hasDiagram} />
        <EditSiteFab />
      </div>
    </main>
    </>
  )
}
