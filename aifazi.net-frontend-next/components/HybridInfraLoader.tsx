'use client'

/**
 * HybridInfraLoader — client boundary for the diagram island.
 * next/dynamic ssr:false is only allowed in client components, so the
 * server page renders this tiny loader instead of importing directly.
 */
import dynamic from 'next/dynamic'

const HybridInfraEditor = dynamic(() => import('./HybridInfraEditor'), {
  ssr: false,
  loading: () => (
    <div
      aria-label="Loading interactive diagram"
      style={{
        width: '100%',
        minHeight: 480,
        borderRadius: 18,
        border: '1px solid var(--border)',
        background:
          'linear-gradient(180deg, rgba(12,27,45,.95), rgba(8,18,32,.98))',
      }}
    />
  ),
})

export default function HybridInfraLoader({ autoEdit }: { autoEdit?: boolean }) {
  return <HybridInfraEditor startEditing={autoEdit} />
}
