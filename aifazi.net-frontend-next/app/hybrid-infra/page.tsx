import type { Metadata } from 'next'
import HybridInfraLoader from '@/components/HybridInfraLoader'

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

export default function HybridInfraPage() {
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
        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: 3,
              color: 'var(--cyan)',
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            CASE STUDY · IT MODERNIZATION
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(30px, 4vw, 54px)',
              fontWeight: 800,
              color: 'var(--text)',
              margin: '0 0 8px',
              letterSpacing: -0.5,
            }}
          >
            Plan A — Hybrid Infrastructure
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'var(--muted)',
              margin: 0,
              maxWidth: 760,
              lineHeight: 1.6,
            }}
          >
            On-premises core + Microsoft 365 / Entra ID / Defender / Purview.
            Select any component to inspect its role, workloads, and
            dependencies.
          </p>
        </div>
        <HybridInfraLoader />
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--muted)',
            lineHeight: 1.6,
            marginTop: 18,
            maxWidth: 900,
          }}
        >
          Plan A is hybrid: on-premises AD + Entra ID · Synology +
          SharePoint/OneDrive · Proxmox compute · Veeam + QNAP + off-site
          immutable copy. Presented as an interactive case study; identifying
          client details are omitted.
        </p>
      </div>
    </main>
    </>
  )
}
