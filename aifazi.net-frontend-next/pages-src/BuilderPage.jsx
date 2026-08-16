'use client'
// pages-src/BuilderPage.jsx — public renderer for Page Builder pages at
// /pages/<slug>. Reads the saved `layout.<slug>` content block (seeded from the
// server-injected content, so no default flash) and renders it via BlockRenderer.
import { useEdit } from '@/context/EditContext'
import BlockRenderer from '@/components/BlockRenderer'

export default function BuilderPage({ slug }) {
  const ctx = useEdit()
  const layout = ctx?.content?.[`layout.${slug}`]
  const hasLayout = Array.isArray(layout)

  return (
    <main style={{ maxWidth: 1080, margin: '0 auto', padding: '2.5rem 1.5rem 4rem' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: '2rem' }}>
        /pages/{slug}
      </div>
      <BlockRenderer slug={slug} layout={hasLayout ? layout : []} />
    </main>
  )
}