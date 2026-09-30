/**
 * Registry + prop sanitizer unit tests (PageBlocks foundation).
 */
import { describe, expect, it } from 'vitest'
import { getBlockManifest, listBlockManifests, sanitizeProps } from './registry'

describe('block registry', () => {
  it('ships hero, features, cta-banner with schema + defaults', () => {
    const types = listBlockManifests().map((m) => m.type).sort()
    expect(types).toEqual(['cta-banner', 'features', 'hero'])
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
})
