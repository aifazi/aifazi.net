/**
 * Per-block style fields (accent/pulse) survive sanitizeDoc validation.
 */
import { describe, expect, it } from 'vitest'
import { sanitizeDoc } from '@/data/hybrid-infra'

const base = {
  id: 'doc1',
  slug: 't',
  title: 'T',
  updatedAt: new Date().toISOString(),
  published: false,
  flows: [],
}

describe('sanitizeDoc style fields', () => {
  it('keeps a valid accent + pulse', () => {
    const clean = sanitizeDoc({
      ...base,
      nodes: [{ id: 'n1', name: 'N', category: 'network', layer: 'edge', accent: '#ff00aa', pulse: true }],
    })
    expect(clean?.nodes[0]).toMatchObject({ accent: '#ff00aa', pulse: true })
  })

  it('drops malformed accent and non-boolean pulse', () => {
    const clean = sanitizeDoc({
      ...base,
      nodes: [{ id: 'n1', name: 'N', category: 'network', layer: 'edge', accent: 'red', pulse: 'yes' }],
    })
    expect(clean?.nodes[0].accent).toBeUndefined()
    expect(clean?.nodes[0].pulse).toBeUndefined()
  })

  it('omits style keys when absent (backward compatible)', () => {
    const clean = sanitizeDoc({
      ...base,
      nodes: [{ id: 'n1', name: 'N', category: 'network', layer: 'edge' }],
    })
    expect('accent' in (clean?.nodes[0] ?? {})).toBe(false)
    expect('pulse' in (clean?.nodes[0] ?? {})).toBe(false)
  })
})
