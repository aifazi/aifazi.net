/**
 * Pure editor doc operations (delete/duplicate/paste/align/spread/arrange).
 */
import { describe, expect, it } from 'vitest'
import {
  alignNodesDoc,
  arrangeNodesDoc,
  deleteNodesDoc,
  diffDiagramDocs,
  draftRestoreDocId,
  duplicateNodesDoc,
  pasteNodesDoc,
  remapCategoryDoc,
  spreadNodesDoc,
} from '@/lib/infraDocOps'
import type { DiagramDoc, InfraComponent } from '@/data/hybrid-infra'

const node = (id: string, extra: Partial<InfraComponent> = {}): InfraComponent => ({
  id,
  name: id.toUpperCase(),
  category: 'compute',
  layer: 'edge',
  role: 'role',
  desc: '',
  workloads: [],
  deps: [],
  x: 100,
  y: 100,
  ...extra,
})

const doc = (nodes: InfraComponent[], flows: DiagramDoc['flows'] = []): DiagramDoc => ({
  id: 'd1',
  slug: 'd',
  title: 'T',
  updatedAt: new Date(0).toISOString(),
  published: false,
  nodes,
  flows,
})

const ids = (() => {
  let n = 0
  return () => `u${++n}`
})()

describe('deleteNodesDoc', () => {
  it('removes nodes, their flows, and dangling dep refs', () => {
    const d = doc(
      [node('a'), node('b', { deps: ['a'] }), node('c', { deps: ['a', 'b'] })],
      [{ id: 'f1', from: 'a', to: 'b', cat: 'network' }],
    )
    const next = deleteNodesDoc(d, ['a'])!
    expect(next.nodes.map((n) => n.id)).toEqual(['b', 'c'])
    expect(next.flows).toHaveLength(0)
    expect(next.nodes[1].deps).toEqual(['b'])
    expect(d.nodes).toHaveLength(3) // input untouched
  })

  it('returns null for empty or unknown ids', () => {
    const d = doc([node('a')])
    expect(deleteNodesDoc(d, [])).toBeNull()
    expect(deleteNodesDoc(d, ['nope'])).toBeNull()
  })
})

describe('duplicateNodesDoc', () => {
  it('copies with offset, remaps intra-set deps, and duplicates pair flows', () => {
    const d = doc(
      [node('a'), node('b', { deps: ['a'], x: 200, y: 150 })],
      [{ id: 'f1', from: 'a', to: 'b', cat: 'network' }],
    )
    const res = duplicateNodesDoc(d, ['a', 'b'], ids)!
    expect(res.newIds).toHaveLength(2)
    const [a2, b2] = res.doc.nodes.filter((n) => res.newIds.includes(n.id))
    expect(a2.x).toBe(140)
    expect(b2.deps).toEqual([a2.id])
    expect(res.doc.flows).toHaveLength(2)
    const newFlow = res.doc.flows.find((f) => res.newIds.includes(f.from))!
    expect(newFlow.from).toBe(a2.id)
    expect(newFlow.to).toBe(b2.id)
    expect(a2.name).toBe('A (copy)')
  })

  it('keeps external deps pointing at originals', () => {
    const d = doc([node('a', { deps: ['outside'] }), node('b')])
    const res = duplicateNodesDoc(d, ['a'], ids)!
    const a2 = res.doc.nodes.find((n) => n.id === res.newIds[0])!
    expect(a2.deps).toEqual(['outside'])
  })

  it('returns null when nothing matches', () => {
    expect(duplicateNodesDoc(doc([node('a')]), ['nope'], ids)).toBeNull()
  })
})

describe('pasteNodesDoc', () => {
  it('pastes at an offset with remapped clip refs', () => {
    const d = doc([node('a'), node('b', { deps: ['a'] })])
    const clip = [node('a'), node('b', { deps: ['a'], x: 300 })]
    const res = pasteNodesDoc(d, clip, ids, 24)!
    expect(res.newIds).toHaveLength(2)
    const [a2, b2] = res.doc.nodes.slice(2)
    expect(a2.x).toBe(124)
    expect(b2.deps).toEqual([a2.id])
    expect(res.doc.nodes).toHaveLength(4)
  })

  it('returns null for an empty clipboard', () => {
    expect(pasteNodesDoc(doc([node('a')]), [], ids)).toBeNull()
  })
})

describe('alignNodesDoc / spreadNodesDoc', () => {
  const d = doc([
    node('a', { x: 10, y: 50 }),
    node('b', { x: 200, y: 90 }),
    node('rack', { layer: 'rack', x: 5, y: 5 }),
  ])

  it('aligns the selection when 2+ are selected, skipping rack nodes', () => {
    const next = alignNodesDoc(d, ['a', 'b'], 'x')!
    expect(next.nodes.find((n) => n.id === 'a')!.x).toBe(10)
    expect(next.nodes.find((n) => n.id === 'b')!.x).toBe(10)
    expect(next.nodes.find((n) => n.id === 'rack')!.x).toBe(5)
  })

  it('falls back to all free nodes without a selection', () => {
    const next = alignNodesDoc(d, null, 'y')!
    expect(next.nodes.find((n) => n.id === 'a')!.y).toBe(50)
    expect(next.nodes.find((n) => n.id === 'b')!.y).toBe(50)
  })

  it('returns null below the node threshold', () => {
    // A 1-node selection falls back to all free nodes (documented behavior);
    // only docs with <2 free nodes are a true no-op.
    expect(alignNodesDoc(doc([node('a'), node('r', { layer: 'rack' })]), null, 'x')).toBeNull()
    expect(spreadNodesDoc(doc([node('a'), node('b')]), null, 'x')).toBeNull()
  })

  it('a 1-node selection falls back to all free nodes', () => {
    const next = alignNodesDoc(d, ['a'], 'x')!
    expect(next.nodes.find((n) => n.id === 'b')!.x).toBe(10)
  })

  it('spreads free nodes evenly across the axis', () => {
    const base = doc([node('a', { x: 0 }), node('b', { x: 50 }), node('c', { x: 200 })])
    const next = spreadNodesDoc(base, null, 'x')!
    expect(next.nodes.map((n) => n.x)).toEqual([0, 100, 200])
  })
})

describe('arrangeNodesDoc / remapCategoryDoc', () => {
  it('arranges nodes into per-layer columns', () => {
    const next = arrangeNodesDoc(doc([node('a', { layer: 'edge', y: 900 }), node('b', { layer: 'edge' })]))
    const [a, b] = next.nodes
    expect(a.x ?? -1).toBe(b.x ?? -2)
    expect(a.y ?? 1e9).toBeLessThan(b.y ?? -1)
    expect(a.y ?? -1).toBeGreaterThanOrEqual(0)
  })

  it('remaps a removed category to the fallback', () => {
    const d = doc(
      [node('a', { category: 'iot' }), node('b')],
      [{ id: 'f1', from: 'a', to: 'b', cat: 'iot' }],
    )
    const next = remapCategoryDoc(d, 'iot', 'network')
    expect(next.nodes[0].category).toBe('network')
    expect(next.flows[0].cat).toBe('network')
    expect(next.nodes[1].category).toBe('compute')
  })
})

describe('diffDiagramDocs', () => {
  it('reports added, removed, changed nodes and flow deltas', () => {
    const prev = doc([node('a'), node('b')], [{ id: 'f1', from: 'a', to: 'b', cat: 'network' }])
    const next = doc(
      [node('a', { name: 'Gateway v2' }), node('c')],
      [{ id: 'f1', from: 'a', to: 'c', cat: 'network' }],
    )
    const d = diffDiagramDocs(prev, next)
    expect(d.addedNodes).toEqual([next.nodes[1].name])
    expect(d.removedNodes).toEqual([prev.nodes[1].name])
    expect(d.changedNodes).toEqual([next.nodes[0].name])
    expect(d.flowAdded).toBe(1)
    expect(d.flowRemoved).toBe(1)
    expect(d.titleChanged).toBe(false)
    expect(d.decoChanged).toBe(false)
  })

  it('flags annotation changes between the two states', () => {
    const a = doc([node('a')])
    const b = doc([node('a')])
    b.decorations = [
      { id: 'd1', kind: 'box', x: 10, y: 20, w: 100, h: 50, z: 'front' },
    ]
    expect(diffDiagramDocs(a, b).decoChanged).toBe(true)
    expect(diffDiagramDocs(b, structuredClone(b)).decoChanged).toBe(false)
  })

  it('flags a title change and is empty for identical docs', () => {
    const a = doc([node('a')])
    expect(diffDiagramDocs(a, doc([node('a')]))).toMatchObject({
      addedNodes: [],
      removedNodes: [],
      changedNodes: [],
      flowAdded: 0,
      flowRemoved: 0,
      titleChanged: false,
    })
    const b = doc([node('a')])
    b.title = 'Renamed'
    expect(diffDiagramDocs(a, b).titleChanged).toBe(true)
  })
})

describe('draftRestoreDocId (A5-7)', () => {
  it('keeps a server row uuid so the draft re-attaches to the saved row', () => {
    const id = '8f1c2a90-4b7d-4e3a-9c5f-0d2e6b8a1f34'
    expect(draftRestoreDocId(id)).toBe(id)
  })

  it('accepts uppercase uuids (Postgres echoes either case)', () => {
    const id = '8F1C2A90-4B7D-4E3A-9C5F-0D2E6B8A1F34'
    expect(draftRestoreDocId(id)).toBe(id)
  })

  it('rejects client-generated doc-* ids (never-saved docs stay unattached)', () => {
    expect(draftRestoreDocId('doc-1730000000000')).toBeNull()
  })

  it('rejects malformed or non-string ids', () => {
    expect(draftRestoreDocId('8f1c2a90-4b7d-4e3a-9c5f')).toBeNull()
    expect(draftRestoreDocId('x'.repeat(36))).toBeNull()
    expect(draftRestoreDocId('')).toBeNull()
    expect(draftRestoreDocId(null)).toBeNull()
    expect(draftRestoreDocId(undefined)).toBeNull()
    expect(draftRestoreDocId(42)).toBeNull()
  })
})
