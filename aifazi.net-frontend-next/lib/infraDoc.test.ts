/**
 * Per-block style fields (accent/pulse) survive sanitizeDoc validation.
 */
import { describe, expect, it } from 'vitest'
import { sanitizeDoc, catLabel, mergedCatColors } from '@/data/hybrid-infra'

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

describe('sanitizeDoc group id', () => {
  it('keeps a well-formed gid and drops anything else', () => {
    const ok = sanitizeDoc({
      ...base,
      nodes: [{ id: 'n1', name: 'N', category: 'network', layer: 'edge', gid: 'g-abc-1' }],
    })
    expect(ok?.nodes[0].gid).toBe('g-abc-1')
    for (const bad of ['x'.repeat(41), 'UPPER!', 42 as unknown as string, ['g-1'] as unknown as string]) {
      const clean = sanitizeDoc({
        ...base,
        nodes: [{ id: 'n1', name: 'N', category: 'network', layer: 'edge', gid: bad }],
      })
      expect(clean?.nodes[0].gid).toBeUndefined()
    }
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

describe('sanitizeDoc custom categories', () => {
  const nodes = [
    { id: 'n1', name: 'A', category: 'iot', layer: 'edge' },
    { id: 'n2', name: 'B', category: 'network', layer: 'cloud' },
  ]

  it('keeps valid custom categories and lets nodes/flows reference them', () => {
    const clean = sanitizeDoc({
      ...base,
      nodes,
      flows: [{ id: 'f1', from: 'n1', to: 'n2', cat: 'iot' }],
      customCategories: { iot: { label: '  IoT  ', color: '#123456' } },
    })
    expect(clean?.customCategories).toEqual({ iot: { label: 'IoT', color: '#123456' } })
    expect(clean?.nodes[0].category).toBe('iot')
    expect(clean?.flows[0].cat).toBe('iot')
  })

  it('drops bad entries, built-in shadowing, and resets unknown categories', () => {
    const clean = sanitizeDoc({
      ...base,
      nodes,
      flows: [{ id: 'f1', from: 'n1', to: 'n2', cat: 'iot' }],
      customCategories: {
        'Bad Key!': { label: 'X', color: '#123456' },
        network: { label: 'Shadow', color: '#123456' },
        bad: { label: 'X', color: 'red' },
        ok: { label: 42, color: '#123456' },
      },
    })
    // Bad key, built-in shadow, and bad color are dropped; an invalid label
    // falls back to the key. Unknown category ids reset to 'network'.
    expect(clean?.customCategories).toEqual({ ok: { label: 'ok', color: '#123456' } })
    expect(clean?.nodes[0].category).toBe('network')
    expect(clean?.flows[0].cat).toBe('network')
  })

  it('omits the key when absent (backward compatible)', () => {
    const clean = sanitizeDoc({ ...base, nodes: [nodes[1]] })
    expect('customCategories' in (clean ?? {})).toBe(false)
  })

  it('catLabel resolves custom → built-in → uppercase id', () => {
    const custom = { iot: { label: 'IoT', color: '#123456' } }
    expect(catLabel('iot', custom)).toBe('IoT')
    expect(catLabel('network')).toBe('Network')
    expect(catLabel('unknown', custom)).toBe('UNKNOWN')
  })

  it('mergedCatColors layers palette overrides over custom defaults', () => {
    expect(mergedCatColors(null)).toBeNull()
    expect(mergedCatColors({})).toBeNull()
    expect(
      mergedCatColors({
        customCategories: { iot: { label: 'IoT', color: '#123456' } },
        categoryColors: { iot: '#654321', network: '#ff0000' },
      }),
    ).toEqual({ iot: '#654321', network: '#ff0000' })
  })
})
