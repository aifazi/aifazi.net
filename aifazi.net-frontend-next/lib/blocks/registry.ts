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
import { safeHref } from '../safeHref'
import { HeroBlock, FeaturesBlock, CtaBannerBlock, FaqBlock, PricingBlock, GalleryBlock, TestimonialsBlock } from './seedBlocks'

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
  {
    type: 'faq',
    label: 'FAQ',
    icon: '?',
    category: 'content',
    schema: [
      { key: 'heading', kind: 'text', label: 'Heading', max: 120 },
      { key: 'q1', kind: 'text', label: 'Question 1', max: 160 },
      { key: 'a1', kind: 'textarea', label: 'Answer 1', max: 800 },
      { key: 'q2', kind: 'text', label: 'Question 2', max: 160 },
      { key: 'a2', kind: 'textarea', label: 'Answer 2', max: 800 },
      { key: 'q3', kind: 'text', label: 'Question 3', max: 160 },
      { key: 'a3', kind: 'textarea', label: 'Answer 3', max: 800 },
    ],
    defaults: { heading: 'Frequently asked questions', q1: '', a1: '', q2: '', a2: '', q3: '', a3: '' },
    render: FaqBlock,
  },
  {
    type: 'pricing',
    label: 'Pricing plans',
    icon: '$',
    category: 'commerce',
    schema: [
      { key: 'heading', kind: 'text', label: 'Heading', max: 120 },
      { key: 'plan1Name', kind: 'text', label: 'Plan 1 name', max: 40 },
      { key: 'plan1Price', kind: 'text', label: 'Plan 1 price', max: 30 },
      { key: 'plan1Note', kind: 'text', label: 'Plan 1 note', max: 80 },
      { key: 'plan1CtaLabel', kind: 'text', label: 'Plan 1 button', max: 30 },
      { key: 'plan1CtaHref', kind: 'text', label: 'Plan 1 link', max: 200 },
      { key: 'plan2Name', kind: 'text', label: 'Plan 2 name', max: 40 },
      { key: 'plan2Price', kind: 'text', label: 'Plan 2 price', max: 30 },
      { key: 'plan2Note', kind: 'text', label: 'Plan 2 note', max: 80 },
      { key: 'plan2CtaLabel', kind: 'text', label: 'Plan 2 button', max: 30 },
      { key: 'plan2CtaHref', kind: 'text', label: 'Plan 2 link', max: 200 },
      { key: 'plan3Name', kind: 'text', label: 'Plan 3 name', max: 40 },
      { key: 'plan3Price', kind: 'text', label: 'Plan 3 price', max: 30 },
      { key: 'plan3Note', kind: 'text', label: 'Plan 3 note', max: 80 },
      { key: 'plan3CtaLabel', kind: 'text', label: 'Plan 3 button', max: 30 },
      { key: 'plan3CtaHref', kind: 'text', label: 'Plan 3 link', max: 200 },
    ],
    defaults: {
      heading: 'Pricing',
      plan1Name: 'Basic', plan1Price: '', plan1Note: '', plan1CtaLabel: '', plan1CtaHref: '/',
      plan2Name: '', plan2Price: '', plan2Note: '', plan2CtaLabel: '', plan2CtaHref: '/',
      plan3Name: '', plan3Price: '', plan3Note: '', plan3CtaLabel: '', plan3CtaHref: '/',
    },
    render: PricingBlock,
  },
  {
    type: 'gallery',
    label: 'Image gallery',
    icon: '▣',
    category: 'media',
    schema: [
      { key: 'heading', kind: 'text', label: 'Heading', max: 120 },
      { key: 'img1Href', kind: 'text', label: 'Image 1 URL', max: 500 },
      { key: 'img1Alt', kind: 'text', label: 'Image 1 alt text', max: 120 },
      { key: 'img2Href', kind: 'text', label: 'Image 2 URL', max: 500 },
      { key: 'img2Alt', kind: 'text', label: 'Image 2 alt text', max: 120 },
      { key: 'img3Href', kind: 'text', label: 'Image 3 URL', max: 500 },
      { key: 'img3Alt', kind: 'text', label: 'Image 3 alt text', max: 120 },
    ],
    defaults: {
      heading: '',
      img1Href: '', img1Alt: '', img2Href: '', img2Alt: '', img3Href: '', img3Alt: '',
    },
    render: GalleryBlock,
  },
  {
    type: 'testimonials',
    label: 'Testimonials',
    icon: '❝',
    category: 'content',
    schema: [
      { key: 'heading', kind: 'text', label: 'Heading', max: 120 },
      { key: 'quote1', kind: 'textarea', label: 'Quote 1', max: 400 },
      { key: 'author1', kind: 'text', label: 'Author 1', max: 60 },
      { key: 'role1', kind: 'text', label: 'Author 1 role', max: 60 },
      { key: 'quote2', kind: 'textarea', label: 'Quote 2', max: 400 },
      { key: 'author2', kind: 'text', label: 'Author 2', max: 60 },
      { key: 'role2', kind: 'text', label: 'Author 2 role', max: 60 },
      { key: 'quote3', kind: 'textarea', label: 'Quote 3', max: 400 },
      { key: 'author3', kind: 'text', label: 'Author 3', max: 60 },
      { key: 'role3', kind: 'text', label: 'Author 3 role', max: 60 },
    ],
    defaults: {
      heading: 'What people say',
      quote1: '', author1: '', role1: '',
      quote2: '', author2: '', role2: '',
      quote3: '', author3: '', role3: '',
    },
    render: TestimonialsBlock,
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
        // Href-ish fields go through the scheme allowlist (javascript:/data: → '#').
        out[field.key] = /href/i.test(field.key) && raw ? safeHref(raw.slice(0, cap)) : raw.slice(0, cap)
      }
    }
  }
  return out
}
