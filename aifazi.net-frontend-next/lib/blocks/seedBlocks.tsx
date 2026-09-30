'use client'

/**
 * lib/blocks/seedBlocks.tsx — first three block renderers.
 *
 * THEME CONTRACT (enforced): blocks may only use site CSS vars
 * (--comp-*, --bg, --text, --muted, --cyan, ...) — never hardcoded hex.
 * This is what keeps every theme + light/dark toggle working.
 */
import type { BlockPropValue } from './types'

type P = Record<string, BlockPropValue>
const str = (p: P, k: string, fb = ''): string => (typeof p[k] === 'string' ? (p[k] as string) : fb) || fb

export function HeroBlock({ props }: { props: P }) {
  const align = str(props, 'align', 'center')
  return (
    <section
      style={{
        textAlign: align as 'left' | 'center',
        padding: '64px 24px',
        background: 'var(--comp-card-bg, var(--bg))',
        border: '1px solid var(--comp-card-border, var(--border))',
        borderRadius: 'var(--comp-card-radius, 14px)',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: 3,
          color: 'var(--cyan)',
          margin: '0 0 12px',
        }}
      >
        {str(props, 'kicker')}
      </p>
      <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', margin: '0 0 12px', color: 'var(--text)' }}>
        {str(props, 'title', 'Untitled')}
      </h2>
      {str(props, 'subtitle') && (
        <p style={{ fontSize: 15, color: 'var(--muted)', margin: '0 auto', maxWidth: 640, lineHeight: 1.6 }}>
          {str(props, 'subtitle')}
        </p>
      )}
      {str(props, 'ctaLabel') && str(props, 'ctaHref') && (
        <a
          href={str(props, 'ctaHref')}
          style={{
            display: 'inline-block',
            marginTop: 20,
            padding: '12px 24px',
            borderRadius: 'var(--comp-button-radius, 8px)',
            background: 'var(--comp-button-bg, var(--cyan))',
            color: 'var(--comp-button-text, #fff)',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          {str(props, 'ctaLabel')}
        </a>
      )}
    </section>
  )
}

export function FeaturesBlock({ props }: { props: P }) {
  const items = [1, 2, 3]
    .map((i) => ({
      title: str(props, `item${i}Title`),
      desc: str(props, `item${i}Desc`),
    }))
    .filter((it) => it.title)
  return (
    <section style={{ padding: '48px 24px' }}>
      {str(props, 'heading') && (
        <h2 style={{ textAlign: 'center', color: 'var(--text)', margin: '0 0 24px' }}>
          {str(props, 'heading')}
        </h2>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          maxWidth: 1000,
          margin: '0 auto',
        }}
      >
        {items.map((it, i) => (
          <div
            key={i}
            style={{
              background: 'var(--comp-card-bg, var(--bg))',
              border: '1px solid var(--comp-card-border, var(--border))',
              borderRadius: 'var(--comp-card-radius, 14px)',
              padding: 20,
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: 16, color: 'var(--text)' }}>{it.title}</h3>
            {it.desc && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{it.desc}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}

export function CtaBannerBlock({ props }: { props: P }) {
  return (
    <section
      style={{
        margin: '24px',
        padding: '40px 24px',
        textAlign: 'center',
        borderRadius: 'var(--comp-card-radius, 14px)',
        background: 'var(--comp-button-bg, var(--cyan))',
        color: 'var(--comp-button-text, #fff)',
      }}
    >
      <h2 style={{ margin: '0 0 8px' }}>{str(props, 'title', 'Get started')}</h2>
      {str(props, 'subtitle') && <p style={{ margin: '0 0 16px', opacity: 0.85 }}>{str(props, 'subtitle')}</p>}
      {str(props, 'ctaLabel') && str(props, 'ctaHref') && (
        <a
          href={str(props, 'ctaHref')}
          style={{
            display: 'inline-block',
            padding: '12px 24px',
            borderRadius: 'var(--comp-button-radius, 8px)',
            background: 'var(--comp-button-text, #fff)',
            color: 'var(--comp-button-bg, var(--cyan))',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          {str(props, 'ctaLabel')}
        </a>
      )}
    </section>
  )
}
