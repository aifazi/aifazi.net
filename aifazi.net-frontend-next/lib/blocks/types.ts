/**
 * lib/blocks/types.ts — PageBlocks document model (Odoo-snippet equivalent).
 *
 * A layout is an ordered block tree. `children` enables column slots
 * (max depth 2, enforced server-side). Props stay FLAT (string/number/
 * boolean only) — no nested objects, no HTML: text renders as React text,
 * so blocks are XSS-safe by construction.
 */

export type BlockPropValue = string | number | boolean

export interface PageBlock {
  id: string
  /** Registry type, e.g. 'hero'. Unknown types render as nothing. */
  type: string
  props: Record<string, BlockPropValue>
  children?: PageBlock[]
}

export interface PageLayout {
  id: string
  slug: string
  title: string
  updatedAt: string
  published: boolean
  /** SEO overrides for <title>/description on /p/[slug]; '' = derive from title. */
  seoTitle: string
  seoDescription: string
  blocks: PageBlock[]
}

export interface LayoutMeta {
  id: string
  slug: string
  title: string
  updatedAt: string
  published: boolean
  blockCount: number
}

/** Revision history entry (pre-update snapshot; metas only). */
export interface LayoutRevision {
  id: string
  createdAt: string | null
  title: string
  published: boolean
}

export interface LayoutRevisionDetail extends LayoutRevision {
  seoTitle: string
  seoDescription: string
  blocks: PageBlock[]
}

/** Odoo "Customize tab" equivalent: declares a block's editable props. */
export type PropEditor =
  | { key: string; kind: 'text'; label: string; max?: number }
  | { key: string; kind: 'textarea'; label: string; max?: number }
  | { key: string; kind: 'select'; label: string; options: string[] }
  | { key: string; kind: 'toggle'; label: string }
  | { key: string; kind: 'color'; label: string }
  | { key: string; kind: 'number'; label: string; min?: number; max?: number }

export interface BlockManifest {
  type: string
  label: string
  /** Short glyph for the palette (emoji/text only, no assets). */
  icon: string
  category: 'structure' | 'content' | 'media' | 'commerce' | 'custom'
  schema: PropEditor[]
  defaults: Record<string, BlockPropValue>
  render: React.ComponentType<{ props: Record<string, BlockPropValue> }>
}
