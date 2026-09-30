import type { Metadata } from 'next'
import HybridInfraLoader from '@/components/HybridInfraLoader'
import HybridInfraErrorBoundary from '@/components/HybridInfraErrorBoundary'

/**
 * /hybrid-infra/embed — chrome-free read-only view for iframe embeds
 * (round-2 plan B2). providers.tsx treats this path as "full screen", so the
 * navbar, footer, banner, and floating nav are not rendered; this page adds
 * only the diagram island with compact padding.
 */
export const metadata: Metadata = {
  title: 'Embedded diagram',
  description: 'Read-only embedded infrastructure diagram.',
  robots: { index: false, follow: false },
}

export default async function HybridInfraEmbedPage({
  searchParams,
}: {
  searchParams?: Promise<{ diagram?: string }>
}) {
  const params = (await searchParams) ?? {}
  const activeSlug =
    typeof params.diagram === 'string' && params.diagram.trim() !== ''
      ? params.diagram.trim().slice(0, 64)
      : 'plan-a'
  return (
    <main
      style={{
        width: '100%',
        maxWidth: '100%',
        padding: '14px 14px 24px',
        background: 'transparent',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: 2,
          color: 'var(--muted)',
          margin: '0 0 8px',
        }}
      >
        EMBEDDED DIAGRAM · <a href={`/hybrid-infra?diagram=${encodeURIComponent(activeSlug)}`}>OPEN FULL VIEW ↗</a>
      </p>
      <HybridInfraErrorBoundary>
        <HybridInfraLoader />
      </HybridInfraErrorBoundary>
    </main>
  )
}
