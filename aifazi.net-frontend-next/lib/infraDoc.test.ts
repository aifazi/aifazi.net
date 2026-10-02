/**
 * Per-block style fields (accent/pulse) survive sanitizeDoc validation.
 */
import { describe, expect, it } from 'vitest'
import {
  sanitizeDoc,
  catLabel,
  mergedCatColors,
  planADecorations,
  planADoc,
  newDecoration,
  isDecorColor,
} from '@/data/hybrid-infra'

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

describe('sanitizeDoc decorations', () => {
  const nodes = [{ id: 'n1', name: 'N', category: 'network', layer: 'edge' }]
  const box = {
    id: 'd1', kind: 'box', z: 'back',
    x: 10, y: 20, w: 200, h: 100, r: 8,
    fill: '#0c1c308c', stroke: '#78aade',
    lines: [{ text: 'ZONE', dx: 14, dy: 18, size: 10, weight: '700', color: 'cyan' }],
    connects: ['n1'],
  }
  const anchored = {
    id: 'd2', kind: 'label', z: 'front',
    text: 'Caption', size: 11, weight: '700', align: 'center', color: 'amber',
    anchor: { id: 'n1', dx: 4, dy: 46 },
  }
  const free = { id: 'd3', kind: 'label', text: 'Free', x: 5, y: 6 }

  it('keeps valid boxes, anchored and free labels', () => {
    const clean = sanitizeDoc({ ...base, nodes, decorations: [box, anchored, free] })
    expect(clean?.decorations).toHaveLength(3)
    expect(clean?.decorations?.[0]).toMatchObject({ kind: 'box', z: 'back', connects: ['n1'] })
    expect(clean?.decorations?.[0].lines).toEqual(box.lines)
    expect(clean?.decorations?.[1].anchor).toEqual({ id: 'n1', dx: 4, dy: 46 })
    expect(clean?.decorations?.[1]).not.toHaveProperty('x')
    expect(clean?.decorations?.[2]).toMatchObject({ x: 5, y: 6 })
  })

  it('drops malformed entries and invalid sub-fields', () => {
    const clean = sanitizeDoc({
      ...base,
      nodes,
      decorations: [
        { ...box, id: 'bad-kind', kind: 'circle' },
        { ...box, id: 'no-geom', x: undefined },
        { id: 'no-pos', kind: 'label', text: 'x' },
        { ...free, id: 'bad-color', color: 'chartreuse' },
        { ...box, id: 'bad-z', z: 'middle' },
      ],
    })
    const ids = (clean?.decorations ?? []).map((d) => d.id)
    expect(ids).not.toContain('bad-kind')
    expect(ids).not.toContain('no-geom')
    expect(ids).not.toContain('no-pos')
    const badColor = clean?.decorations?.find((d) => d.id === 'bad-color')
    expect(badColor?.color).toBeUndefined()
    expect(clean?.decorations?.find((d) => d.id === 'bad-z')?.z).toBeUndefined()
  })

  it('caps at 100 entries and omits the key when nothing survives', () => {
    const many = Array.from({ length: 105 }, (_, i) => ({ ...free, id: `lab-${i}` }))
    expect(sanitizeDoc({ ...base, nodes, decorations: many })?.decorations).toHaveLength(100)
    const none = sanitizeDoc({ ...base, nodes, decorations: [{ id: 'x', kind: 'circle' }] })
    expect('decorations' in (none ?? {})).toBe(false)
    const absent = sanitizeDoc({ ...base, nodes })
    expect('decorations' in (absent ?? {})).toBe(false)
  })
})

describe('planADecorations seed', () => {
  it('exposes 16 layer-ordered annotations on planADoc', () => {
    const decos = planADecorations()
    expect(decos).toHaveLength(16)
    expect(new Set(decos.map((d) => d.id)).size).toBe(16)
    for (const d of decos) expect(['back', 'panel', 'front']).toContain(d.z ?? 'front')
    expect(decos.find((d) => d.id === 'dec-cluster')?.connects).toEqual(['px1', 'px2', 'px3'])
    // The collaboration bar must draw last so it tints the rack titles.
    expect(decos.at(-1)?.id).toBe('dec-collab')
    expect(planADoc().decorations).toHaveLength(16)
  })

  it('newDecoration seeds usable box/label annotations', () => {
    const b = newDecoration('box', 100, 50)
    expect(b).toMatchObject({ kind: 'box', x: 100, y: 50, w: 240, h: 140, z: 'front', fill: '#0c1c308c' })
    const l = newDecoration('label', 10, 20)
    expect(l).toMatchObject({ kind: 'label', x: 10, y: 20, text: 'New label', z: 'front' })
    expect(b.id).not.toBe(l.id)
    expect(isDecorColor(b.fill)).toBe(true)
    expect(isDecorColor(l.color)).toBe(true)
  })
})
