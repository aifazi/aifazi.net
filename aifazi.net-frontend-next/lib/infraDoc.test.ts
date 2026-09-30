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

describe('sanitizeDoc category palette', () => {
  it('keeps valid hex overrides and drops bad keys/values', () => {
    const clean = sanitizeDoc({
      ...base,
      nodes: [{ id: 'n1', name: 'N', category: 'network', layer: 'edge' }],
      categoryColors: {
        network: '#123abc',
        compute: 'purple',
        'Bad Key!': '#123abc',
        storage: '#zzzzzz',
      },
    })
    expect(clean?.categoryColors).toEqual({ network: '#123abc' })
  })

  it('omits the palette when empty or malformed', () => {
    const nodes = [{ id: 'n1', name: 'N', category: 'network', layer: 'edge' }]
    expect(sanitizeDoc({ ...base, nodes, categoryColors: { compute: 'nope' } })?.categoryColors).toBeUndefined()
    expect(sanitizeDoc({ ...base, nodes, categoryColors: 'red' })?.categoryColors).toBeUndefined()
    expect('categoryColors' in (sanitizeDoc({ ...base, nodes }) ?? {})).toBe(false)
  })
})

describe('sanitizeDoc flow styling', () => {
  const nodes = [
    { id: 'n1', name: 'A', category: 'network', layer: 'edge' },
    { id: 'n2', name: 'B', category: 'compute', layer: 'cloud' },
  ]

  it('keeps valid label/dashed/color and drops bad ones', () => {
    const clean = sanitizeDoc({
      ...base,
      nodes,
      flows: [
        { id: 'f1', from: 'n1', to: 'n2', cat: 'network', label: '  VPN tunnel  ', dashed: true, color: '#ff0000' },
        { id: 'f2', from: 'n1', to: 'n2', cat: 'network', label: 'x'.repeat(80), dashed: 'yes', color: 'red' },
      ],
    })
    expect(clean?.flows[0]).toMatchObject({ label: 'VPN tunnel', dashed: true, color: '#ff0000' })
    expect(clean?.flows[1].label).toBe('x'.repeat(40))
    expect(clean?.flows[1].dashed).toBeUndefined()
    expect(clean?.flows[1].color).toBeUndefined()
  })

  it('omits styling keys when absent (backward compatible)', () => {
    const clean = sanitizeDoc({
      ...base,
      nodes,
      flows: [{ id: 'f1', from: 'n1', to: 'n2', cat: 'network' }],
    })
    expect('label' in (clean?.flows[0] ?? {})).toBe(false)
    expect('dashed' in (clean?.flows[0] ?? {})).toBe(false)
    expect('color' in (clean?.flows[0] ?? {})).toBe(false)
  })
})
