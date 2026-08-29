'use client'
// components/BlockRenderer.jsx — renders a saved page layout (`layout.<slug>`)
// from the Page Builder. Scalar text stays inline-editable via EditableText,
// images via EditableImage, lists via EditableList — so a builder-made page is
// fully editable from the public site too (Ctrl/Cmd+E when signed in as admin).
import { EditableText, EditableImage, EditableList, EditableLink } from '@/context/EditContext'
import DOMPurify from 'isomorphic-dompurify'
import { BLOCKS } from '@/pages-src/admin/builder/blockLibrary'
import { normalizeRow } from '@/pages-src/admin/builder/layoutUtils'

const key = (slug, item, field) => `page.${slug}.${item.id}.${field}`

function BlockItem({ slug, item }) {
  const p = key(slug, item, '')
  switch (item.type) {
    case 'heading':
      return (
        <EditableText
          contentKey={key(slug, item, 'text')}
          defaultValue={item.text ?? ''}
          as={item.level || 'h2'}
          style={{ textAlign: item.align || 'left', fontFamily: 'var(--font-display)', fontWeight: 700, margin: '0 0 1rem' }}
        />
      )
    case 'paragraph':
      return (
        <EditableText
          contentKey={key(slug, item, 'text')}
          defaultValue={item.text ?? ''}
          style={{ textAlign: item.align || 'left', color: 'var(--muted)', lineHeight: 1.8, margin: '0 0 1.5rem', fontSize: '1.05rem' }}
        />
      )
    case 'quote':
      return (
        <figure style={{ margin: '1.5rem 0', padding: '1.5rem 2rem', borderLeft: '3px solid var(--green)', background: 'rgba(0,255,136,0.05)' }}>
          <blockquote style={{ margin: 0, fontStyle: 'italic', color: 'var(--text)' }}>
            <EditableText contentKey={key(slug, item, 'text')} defaultValue={item.text ?? ''} />
          </blockquote>
          <figcaption style={{ marginTop: '0.75rem', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
            <EditableText contentKey={key(slug, item, 'author')} defaultValue={item.author ?? ''} />
          </figcaption>
        </figure>
      )
    case 'divider':
      return (
        <div
          style={{
            margin: '2rem 0',
            borderTop: item.style === 'dashed' ? '1px dashed var(--green)' : item.style === 'gradient' ? '1px solid transparent' : '1px solid var(--border)',
            background: item.style === 'gradient' ? 'linear-gradient(90deg, transparent, var(--green), transparent)' : 'none',
            height: item.style === 'gradient' ? 2 : 0,
            opacity: 0.5,
          }}
        />
      )
    case 'spacer':
      return <div style={{ height: Math.max(0, Number(item.height) || 48) }} />
    case 'hero':
      return (
        <section style={{ padding: '3rem 0', textAlign: item.align || 'center' }}>
          <EditableText
            contentKey={key(slug, item, 'title')}
            defaultValue={item.title ?? ''}
            as="h1"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(2rem, 5vw, 3.5rem)', margin: '0 0 1rem' }}
          />
          <EditableText
            contentKey={key(slug, item, 'subtitle')}
            defaultValue={item.subtitle ?? ''}
            style={{ color: 'var(--muted)', fontSize: '1.2rem', maxWidth: 720, margin: '0 auto 2rem', lineHeight: 1.7 }}
          />
          {item.ctaLabel && (
            <EditableLink
              contentKey={key(slug, item, 'ctaLabel')}
              hrefKey={key(slug, item, 'ctaHref')}
              defaultValue={item.ctaLabel}
              defaultHref={item.ctaHref || '#'}
              style={{ display: 'inline-block', padding: '0.9rem 2rem', background: 'var(--green)', color: '#0a0a0f', fontWeight: 700, textDecoration: 'none', borderRadius: 8 }}
            />
          )}
        </section>
      )
    case 'image':
      return (
        <div style={{ textAlign: 'center', margin: '1.5rem 0' }}>
          <EditableImage
            contentKey={key(slug, item, 'src')}
            altKey={key(slug, item, 'alt')}
            defaultValue={item.src ?? ''}
            defaultAlt={item.alt ?? ''}
            imgStyle={{ maxWidth: Math.max(0, Number(item.width) || 640), width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--border)' }}
          />
        </div>
      )
    case 'cta':
      return (
        <div style={{ textAlign: 'center', margin: '1.5rem 0' }}>
          <EditableLink
            contentKey={key(slug, item, 'label')}
            hrefKey={key(slug, item, 'href')}
            defaultValue={item.label ?? ''}
            defaultHref={item.href || '#'}
            style={{
              display: 'inline-block', padding: '0.85rem 2rem', borderRadius: 8, fontWeight: 700, textDecoration: 'none',
              background: item.variant === 'outline' ? 'transparent' : 'var(--green)',
              color: item.variant === 'outline' ? 'var(--green)' : '#0a0a0f',
              border: item.variant === 'outline' ? '1px solid var(--green)' : 'none',
            }}
          />
        </div>
      )
    case 'features':
      return (
        <section style={{ margin: '2rem 0' }}>
          {item.title && <EditableText contentKey={key(slug, item, 'title')} defaultValue={item.title} as="h2" style={{ fontFamily: 'var(--font-display)', marginBottom: '1.5rem' }} />}
          <EditableList
            contentKey={key(slug, item, 'items')}
            defaultValue={item.items ?? []}
            addLabel="+ Add feature"
            fields={BLOCKS.features.listField.itemFields}
            renderItem={(it, i) => (
              <div key={i} style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg2)' }}>
                <div style={{ fontSize: 26 }}>{it.icon}</div>
                <div style={{ fontWeight: 700, margin: '0.5rem 0 0.25rem' }}>{it.title}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>{it.desc}</div>
              </div>
            )}
          />
        </section>
      )
    case 'stats':
      return (
        <section style={{ margin: '2rem 0' }}>
          {item.title && <EditableText contentKey={key(slug, item, 'title')} defaultValue={item.title} as="h2" style={{ fontFamily: 'var(--font-display)', marginBottom: '1.5rem' }} />}
          <EditableList
            contentKey={key(slug, item, 'items')}
            defaultValue={item.items ?? []}
            addLabel="+ Add stat"
            fields={BLOCKS.stats.listField.itemFields}
            renderItem={(it, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg2)' }}>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--green)', fontFamily: 'var(--font-display)' }}>{it.value}</div>
                <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 4 }}>{it.label}</div>
              </div>
            )}
          />
        </section>
      )
    case 'faq':
      return (
        <section style={{ margin: '2rem 0' }}>
          {item.title && <EditableText contentKey={key(slug, item, 'title')} defaultValue={item.title} as="h2" style={{ fontFamily: 'var(--font-display)', marginBottom: '1.5rem' }} />}
          <EditableList
            contentKey={key(slug, item, 'items')}
            defaultValue={item.items ?? []}
            addLabel="+ Add question"
            fields={BLOCKS.faq.listField.itemFields}
            renderItem={(it, i) => (
              <details key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, marginBottom: 10, background: 'var(--bg2)', padding: '0 1rem' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, padding: '0.9rem 0', fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}>{it.q}</summary>
                <div style={{ padding: '0 0 1rem', color: 'var(--muted)', lineHeight: 1.7 }}>{it.a}</div>
              </details>
            )}
          />
        </section>
      )
    case 'list':
      return (
        <EditableList
          contentKey={key(slug, item, 'items')}
          defaultValue={item.items ?? []}
          addLabel="+ Add item"
          fields={BLOCKS.list.listField.itemFields}
          renderItem={(it, i) => (
            <div key={i} style={{ padding: '0.35rem 0', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--green)' }}>▸</span><span>{it.text}</span>
            </div>
          )}
        />
      )
    case 'html': {
      const cfg = { FORBID_TAGS: ['style','script','iframe','form'], FORBID_ATTR: ['style','onerror','onload','onclick','onmouseover'] }
      return (
        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.html ?? '', cfg) }} style={{ margin: '1rem 0' }} />
      )
    }
    case 'row': {
      // Multi-column grid container. Each column is its own block list, so there
      // is no shared coordinate space for blocks to overlap in — CSS Grid places
      // them side by side. Blocks inside columns render recursively via this same
      // component, so every existing block type (incl. nested rows) just works.
      const row = normalizeRow(item)
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${row.columns}, 1fr)`, gap: Number(row.gap) || 16 }}>
          {row.children.slice(0, row.columns).map((col, ci) => (
            <div key={ci} style={{ display: 'grid', gap: 12, alignContent: 'start', minWidth: 0 }}>
              {col.map((child, j) => (
                <BlockItem key={child.id || `${item.id}-c${ci}-b${j}`} slug={slug} item={child} />
              ))}
            </div>
          ))}
        </div>
      )
    }
    default:
      return null
  }
}

export default function BlockRenderer({ slug, layout, style = {} }) {
  if (!Array.isArray(layout) || layout.length === 0) {
    return <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--muted)' }}>This page has no blocks yet — build it in the Page Builder.</div>
  }
  return (
    <div style={{ ...style }} className="block-renderer">
      {layout.map((item, i) => <BlockItem key={item.id || `b-${i}`} slug={slug} item={item} />)}
    </div>
  )
}