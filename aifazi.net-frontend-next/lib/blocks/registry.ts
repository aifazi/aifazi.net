/**
 * lib/blocks/registry.ts — the block catalog (Odoo snippet list equivalent).
 *
 * ADDING A CUSTOM BLOCK:
 *  1. Write a renderer (see seedBlocks.tsx — vars only, no hex, text as text).
 *  2. Add a manifest below with schema (the editor builds the options panel
 *     from it — the Odoo "Customize tab" equivalent) + defaults.
 *  3. Done — renderer, editor palette, and options panel pick it up.
 */
import type { BlockManifest } from './types'
import { HeroBlock, FeaturesBlock, CtaBannerBlock } from './seedBlocks'

const MANIFESTS: BlockManifest[] = [
  {
    type: 'hero',
    label: 'Hero',
    icon: '◈',
    category: 'structure',
    schema: [
      { key: 'kicker', kind: 'text', label: 'Kicker', max: 60 },
      { key: 'title', kind: 'text', label: 'Title', max: 120 },
      { key: 'subtitle', kind: 'textarea', label: 'Subtitle', max: 300 },
      { key: 'align', kind: 'select', label: 'Alignment', options: ['left', 'center'] },
      { key: 'ctaLabel', kind: 'text', label: 'Button label', max: 40 },
      { key: 'ctaHref', kind: 'text', label: 'Button link', max: 200 },
    ],
    defaults: {
      kicker: 'WELCOME',
      title: 'Untitled',
      subtitle: '',
      align: 'center',
      ctaLabel: '',
      ctaHref: '/',
    },
    render: HeroBlock,
  },
  {
    type: 'features',
    label: 'Features grid',
    icon: '▦',
    category: 'content',
    schema: [
      { key: 'heading', kind: 'text', label: 'Heading', max: 120 },
      { key: 'item1Title', kind: 'text', label: 'Item 1 title', max: 60 },
      { key: 'item1Desc', kind: 'textarea', label: 'Item 1 text', max: 200 },
      { key: 'item2Title', kind: 'text', label: 'Item 2 title', max: 60 },
      { key: 'item2Desc', kind: 'textarea', label: 'Item 2 text', max: 200 },
      { key: 'item3Title', kind: 'text', label: 'Item 3 title', max: 60 },
      { key: 'item3Desc', kind: 'textarea', label: 'Item 3 text', max: 200 },
    ],
    defaults: { heading: '', item1Title: 'First', item1Desc: '', item2Title: '', item2Desc: '', item3Title: '', item3Desc: '' },
    render: FeaturesBlock,
  },
  {
    type: 'cta-banner',
    label: 'CTA banner',
    icon: '▶',
    category: 'content',
    schema: [
      { key: 'title', kind: 'text', label: 'Title', max: 120 },
      { key: 'subtitle', kind: 'textarea', label: 'Subtitle', max: 300 },
      { key: 'ctaLabel', kind: 'text', label: 'Button label', max: 40 },
      { key: 'ctaHref', kind: 'text', label: 'Button link', max: 200 },
    ],
    defaults: { title: 'Get started', subtitle: '', ctaLabel: '', ctaHref: '/' },
    render: CtaBannerBlock,
  },
]

const BY_TYPE = new Map(MANIFESTS.map((m) => [m.type, m]))

export function getBlockManifest(type: string): BlockManifest | null {
  return BY_TYPE.get(type) ?? null
}

export function listBlockManifests(): BlockManifest[] {
  return [...MANIFESTS]
}

/** Validate + coerce editor-edited props against the schema (fail closed). */
export function sanitizeProps(type: string, props: Record<string, unknown>): Record<string, string | number | boolean> {
  const manifest = getBlockManifest(type)
  const out: Record<string, string | number | boolean> = {}
  if (!manifest) return out
  for (const field of manifest.schema) {
    const v = (props as Record<string, unknown>)[field.key]
    switch (field.kind) {
      case 'toggle':
        out[field.key] = v === true
        break
      case 'number': {
        const n = typeof v === 'number' ? v : Number(v)
        out[field.key] = Number.isFinite(n) ? n : Number(manifest.defaults[field.key] ?? 0)
        break
      }
      case 'select': {
        const s = typeof v === 'string' ? v : ''
        out[field.key] = (field.options as string[]).includes(s) ? s : String(manifest.defaults[field.key] ?? '')
        break
      }
      default: {
        const fb = manifest.defaults[field.key]
        const raw = typeof v === 'string' && v !== '' ? v : typeof fb === 'string' ? fb : ''
        const cap = 'max' in field && typeof field.max === 'number' ? field.max : 5000
        out[field.key] = raw.slice(0, cap)
      }
    }
  }
  return out
}
