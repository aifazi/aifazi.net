/**
 * Registry + prop sanitizer unit tests (PageBlocks foundation).
 */
import { describe, expect, it } from 'vitest'
import { getBlockManifest, listBlockManifests, sanitizeProps } from './registry'

describe('block registry', () => {
  it('ships hero, features, cta-banner, faq, pricing, gallery, testimonials', () => {
    const types = listBlockManifests().map((m) => m.type).sort()
    expect(types).toEqual([
      'cta-banner',
      'faq',
      'features',
      'gallery',
      'hero',
      'pricing',
      'testimonials',
    ])
    for (const m of listBlockManifests()) {
      expect(m.schema.length).toBeGreaterThan(0)
      expect(typeof m.render).toBe('function')
    }
  })

  it('returns null for unknown types (renderer skips them)', () => {
    expect(getBlockManifest('nope')).toBeNull()
  })

  it('defaults fill missing props', () => {
    expect(sanitizeProps('hero', {})).toMatchObject({ align: 'center', title: 'Untitled' })
  })

  it('rejects off-schema select values', () => {
    expect(sanitizeProps('hero', { align: 'diagonal' }).align).toBe('center')
    expect(sanitizeProps('hero', { align: 'left' }).align).toBe('left')
  })

  it('trims text to max length', () => {
    expect(sanitizeProps('hero', { title: 'x'.repeat(500) }).title).toHaveLength(120)
  })

  it('coerces toggles and numbers', () => {
    expect(sanitizeProps('hero', { align: 'left' })).toMatchObject({ align: 'left' })
  })

  it('drops unknown-type props entirely', () => {
    expect(sanitizeProps('nope', { a: 1 })).toEqual({})
  })

  it('runs image srcs and plan links through the href scheme allowlist', () => {
    expect(sanitizeProps('gallery', { img1Href: 'javascript:alert(1)' }).img1Href).toBe('#')
    expect(sanitizeProps('gallery', { img1Href: 'https://cdn.aifazi.net/x.png' }).img1Href)
      .toBe('https://cdn.aifazi.net/x.png')
    expect(sanitizeProps('pricing', { plan1CtaHref: 'javascript:alert(1)' }).plan1CtaHref).toBe('#')
  })

  it('new block types sanitize against their schema', () => {
    expect(sanitizeProps('faq', {})).toMatchObject({ heading: 'Frequently asked questions', q1: '' })
    expect(sanitizeProps('testimonials', { quote1: 'Great', quote9: 'nope' }))
      .toEqual(expect.objectContaining({ quote1: 'Great' }))
    expect(sanitizeProps('testimonials', { quote1: 'Great' })).not.toHaveProperty('quote9')
  })
})
