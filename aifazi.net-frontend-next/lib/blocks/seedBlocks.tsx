'use client'

/**
 * lib/blocks/seedBlocks.tsx — first three block renderers.
 *
 * THEME CONTRACT (enforced): blocks may only use site CSS vars
 * (--comp-*, --bg, --text, --muted, --cyan, ...) — never hardcoded hex.
 * This is what keeps every theme + light/dark toggle working.
 */
import type { BlockPropValue } from './types'
import { safeHref } from '../safeHref'

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
          href={safeHref(str(props, 'ctaHref'))}
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
          href={safeHref(str(props, 'ctaHref'))}
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

export function FaqBlock({ props }: { props: P }) {
  const items = [1, 2, 3]
    .map((i) => ({ q: str(props, `q${i}`), a: str(props, `a${i}`) }))
    .filter((it) => it.q)
  return (
    <section style={{ padding: '48px 24px', maxWidth: 800, margin: '0 auto' }}>
      {str(props, 'heading') && (
        <h2 style={{ textAlign: 'center', color: 'var(--text)', margin: '0 0 24px' }}>
          {str(props, 'heading')}
        </h2>
      )}
      {items.map((it, i) => (
        <details
          key={i}
          open={i === 0}
          style={{
            background: 'var(--comp-card-bg, var(--bg))',
            border: '1px solid var(--comp-card-border, var(--border))',
            borderRadius: 'var(--comp-card-radius, 14px)',
            padding: '14px 18px',
            marginBottom: 10,
          }}
        >
          <summary style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--text)', fontSize: 15 }}>
            {it.q}
          </summary>
          {it.a && (
            <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
              {it.a}
            </p>
          )}
        </details>
      ))}
    </section>
  )
}

export function PricingBlock({ props }: { props: P }) {
  const plans = [1, 2, 3]
    .map((i) => ({
      name: str(props, `plan${i}Name`),
      price: str(props, `plan${i}Price`),
      note: str(props, `plan${i}Note`),
      ctaLabel: str(props, `plan${i}CtaLabel`),
      ctaHref: str(props, `plan${i}CtaHref`),
    }))
    .filter((p) => p.name)
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
          maxWidth: 960,
          margin: '0 auto',
        }}
      >
        {plans.map((p, i) => (
          <div
            key={i}
            style={{
              background: 'var(--comp-card-bg, var(--bg))',
              border: '1px solid var(--comp-card-border, var(--border))',
              borderRadius: 'var(--comp-card-radius, 14px)',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <h3 style={{ margin: '0 0 6px', fontSize: 16, color: 'var(--text)' }}>{p.name}</h3>
            {p.price && (
              <p style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 800, color: 'var(--cyan)' }}>
                {p.price}
              </p>
            )}
            {p.note && <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--muted)' }}>{p.note}</p>}
            {p.ctaLabel && p.ctaHref && (
              <a
                href={safeHref(p.ctaHref)}
                style={{
                  display: 'inline-block',
                  padding: '10px 20px',
                  borderRadius: 'var(--comp-button-radius, 8px)',
                  background: 'var(--comp-button-bg, var(--cyan))',
                  color: 'var(--comp-button-text, #fff)',
                  fontWeight: 700,
                  textDecoration: 'none',
                  fontSize: 13,
                }}
              >
                {p.ctaLabel}
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export function GalleryBlock({ props }: { props: P }) {
  const imgs = [1, 2, 3]
    .map((i) => ({ src: str(props, `img${i}Href`), alt: str(props, `img${i}Alt`) }))
    .filter((im) => im.src)
  if (!imgs.length) return null
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
          gap: 12,
          maxWidth: 1000,
          margin: '0 auto',
        }}
      >
        {imgs.map((im, i) => (
          // Arbitrary remote sources aren't configured in next.config image
          // domains, and the builder accepts any https URL — plain <img>.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={safeHref(im.src)}
            alt={im.alt}
            loading="lazy"
            style={{
              width: '100%',
              borderRadius: 'var(--comp-card-radius, 14px)',
              border: '1px solid var(--comp-card-border, var(--border))',
              display: 'block',
            }}
          />
        ))}
      </div>
    </section>
  )
}

export function TestimonialsBlock({ props }: { props: P }) {
  const items = [1, 2, 3]
    .map((i) => ({
      quote: str(props, `quote${i}`),
      author: str(props, `author${i}`),
      role: str(props, `role${i}`),
    }))
    .filter((it) => it.quote)
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
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
          maxWidth: 1000,
          margin: '0 auto',
        }}
      >
        {items.map((it, i) => (
          <figure
            key={i}
            style={{
              background: 'var(--comp-card-bg, var(--bg))',
              border: '1px solid var(--comp-card-border, var(--border))',
              borderRadius: 'var(--comp-card-radius, 14px)',
              padding: 20,
              margin: 0,
            }}
          >
            <blockquote style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
              “{it.quote}”
            </blockquote>
            {it.author && (
              <figcaption style={{ fontSize: 12, color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--text)' }}>{it.author}</strong>
                {it.role ? ` — ${it.role}` : ''}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  )
}
