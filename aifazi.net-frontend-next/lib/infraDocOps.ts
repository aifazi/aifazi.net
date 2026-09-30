/**
 * lib/infraDocOps.ts — pure DiagramDoc transformations used by the editor.
 *
 * No React and no side effects: each function takes a doc (plus arguments)
 * and returns the next doc — or null when the operation is a no-op — so the
 * logic is unit-testable and the editor keeps undo/notice concerns.
 */
import type { DiagramDoc, InfraComponent, InfraCategory } from '@/data/hybrid-infra'

export type Axis = 'x' | 'y'

/** Fresh-id factory: called with a seed (source node id / flow pair). */
export type NextId = (seed: string) => string

const isFree = (n: InfraComponent) => n.layer !== 'rack'

/** Remove nodes plus their flows and dep refs that would dangle. */
export function deleteNodesDoc(doc: DiagramDoc, ids: string[]): DiagramDoc | null {
  if (!ids.length) return null
  const set = new Set(ids)
  if (!doc.nodes.some((n) => set.has(n.id))) return null
  return {
    ...doc,
    nodes: doc.nodes
      .filter((n) => !set.has(n.id))
      .map((n) => ({ ...n, deps: n.deps.filter((d) => !set.has(d)) })),
    flows: doc.flows.filter((f) => !set.has(f.from) && !set.has(f.to)),
  }
}

export interface DocOpResult {
  doc: DiagramDoc
  newIds: string[]
}

/**
 * Duplicate the given nodes with fresh ids at `offset` px. Flows between two
 * duplicated nodes are duplicated too; deps remap to the copy when the target
 * was copied, otherwise they keep pointing at the original.
 */
export function duplicateNodesDoc(
  doc: DiagramDoc,
  ids: string[],
  nextId: NextId,
  offset = 40,
): DocOpResult | null {
  const set = new Set(ids)
  const idMap = new Map<string, string>()
  const srcMap = new Map<string, InfraComponent>()
  const copies: InfraComponent[] = []
  for (const src of doc.nodes) {
    if (!set.has(src.id)) continue
    const frag = nextId(src.id)
    const nid = `${src.id}-${frag}`
    idMap.set(src.id, nid)
    srcMap.set(nid, src)
    copies.push({
      ...src,
      id: nid,
      name: `${src.name} (copy)`,
      workloads: [...src.workloads],
      deps: [],
      x: src.x !== undefined ? src.x + offset : undefined,
      y: src.y !== undefined ? src.y + offset : undefined,
      rackU: src.rackU !== undefined ? Math.min(42, src.rackU + (src.rackH ?? 1)) : undefined,
    })
  }
  if (!copies.length) return null
  for (const c of copies) {
    c.deps = (srcMap.get(c.id)?.deps ?? []).map((d) => idMap.get(d) ?? d)
  }
  const flows = doc.flows
    .filter((f) => idMap.has(f.from) && idMap.has(f.to))
    .map((f) => ({
      ...f,
      id: `${f.from}${f.to}-${nextId(`${f.from}:${f.to}`)}`,
      from: idMap.get(f.from)!,
      to: idMap.get(f.to)!,
    }))
  return {
    doc: { ...doc, nodes: [...doc.nodes, ...copies], flows: [...doc.flows, ...flows] },
    newIds: [...idMap.values()],
  }
}

/**
 * Paste clipboard nodes with fresh ids at an accumulating offset. Intra-clip
 * deps and flows (both endpoints copied) are remapped; external deps stay.
 */
export function pasteNodesDoc(
  doc: DiagramDoc,
  clip: InfraComponent[],
  nextId: NextId,
  offset = 24,
): DocOpResult | null {
  if (!clip.length) return null
  const idMap = new Map<string, string>()
  const newIds: string[] = []
  for (const n of clip) {
    const nid = `${n.id}-${nextId(n.id)}`
    idMap.set(n.id, nid)
    newIds.push(nid)
  }
  const nodes = clip.map((n, i) => ({
    ...n,
    id: newIds[i],
    deps: n.deps.map((d) => idMap.get(d) ?? d),
    x: n.x !== undefined ? n.x + offset : undefined,
    y: n.y !== undefined ? n.y + offset : undefined,
    rackU: n.rackU !== undefined ? Math.min(42, n.rackU + (n.rackH ?? 1)) : undefined,
  }))
  const flows = doc.flows
    .filter((f) => idMap.has(f.from) && idMap.has(f.to))
    .map((f) => ({
      ...f,
      id: `${f.from}${f.to}-${nextId(`${f.from}:${f.to}`)}`,
      from: idMap.get(f.from)!,
      to: idMap.get(f.to)!,
    }))
  return {
    doc: { ...doc, nodes: [...doc.nodes, ...nodes], flows: [...doc.flows, ...flows] },
    newIds,
  }
}

function alignTargets(doc: DiagramDoc, ids: string[] | null): InfraComponent[] {
  const sel = ids && ids.length >= 2 ? new Set(ids) : null
  const base = sel ? doc.nodes.filter((n) => sel.has(n.id)) : doc.nodes.filter(isFree)
  return base.filter(isFree)
}

/** Align to left/top edge. Selection-aware (2+), else all free nodes. */
export function alignNodesDoc(doc: DiagramDoc, ids: string[] | null, axis: Axis): DiagramDoc | null {
  const targets = alignTargets(doc, ids)
  if (targets.length < 2) return null
  const set = new Set(targets.map((n) => n.id))
  const v = Math.min(...targets.map((n) => (axis === 'x' ? n.x ?? 0 : n.y ?? 0)))
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (isFree(n) && set.has(n.id) ? { ...n, [axis]: v } : n)),
  }
}

/** Evenly distribute. Selection-aware (3+), else all free nodes. */
export function spreadNodesDoc(doc: DiagramDoc, ids: string[] | null, axis: Axis): DiagramDoc | null {
  const targets = [...alignTargets(doc, ids)].sort((a, b) =>
    axis === 'x' ? (a.x ?? 0) - (b.x ?? 0) : (a.y ?? 0) - (b.y ?? 0),
  )
  if (targets.length < 3) return null
  const set = new Set(targets.map((n) => n.id))
  const lo = axis === 'x' ? (targets[0].x ?? 0) : (targets[0].y ?? 0)
  const hi = axis === 'x' ? (targets[targets.length - 1].x ?? 0) : (targets[targets.length - 1].y ?? 0)
  const step = (hi - lo) / (targets.length - 1)
  const pos = new Map(targets.map((n, i) => [n.id, Math.round(lo + step * i)]))
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (isFree(n) && set.has(n.id) ? { ...n, [axis]: pos.get(n.id) } : n)),
  }
}

const LAYER_ORDER = ['edge', 'rack', 'vm', 'cloud', 'users', 'legacy']

/** Auto-arrange into per-layer columns, rows stacked (Odoo-style). */
export function arrangeNodesDoc(doc: DiagramDoc): DiagramDoc {
  const nextY: Record<string, number> = {}
  const nodes = doc.nodes.map((n) => {
    const li = Math.max(0, LAYER_ORDER.indexOf(n.layer || 'cloud'))
    const y = nextY[n.layer] ?? 40
    const w = n.w || 160
    const h = n.h || 60
    nextY[n.layer] = y + h + 24
    return {
      ...n,
      x: Math.max(0, Math.min(40 + li * 210, 1480 - w)),
      y: Math.max(0, Math.min(y, 1020 - h)),
    }
  })
  return { ...doc, nodes }
}

/** Reassign nodes/flows off a removed custom category (fallback Network). */
export function remapCategoryDoc(doc: DiagramDoc, from: string, to: InfraCategory): DiagramDoc {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.category === from ? { ...n, category: to } : n)),
    flows: doc.flows.map((f) => (f.cat === from ? { ...f, cat: to } : f)),
  }
}

/** Human-readable change summary between two diagram states (plan B4). */
export interface DiagramDiff {
  addedNodes: string[]
  removedNodes: string[]
  changedNodes: string[]
  flowAdded: number
  flowRemoved: number
  titleChanged: boolean
}

/**
 * Compare a revision (prev) against the current doc (next) by node/flow id.
 * Names are taken from the doc they belong to, so a rename shows up under
 * changedNodes with the current name.
 */
export function diffDiagramDocs(prev: DiagramDoc, next: DiagramDoc): DiagramDiff {
  const prevById = new Map(prev.nodes.map((n) => [n.id, n]))
  const nextById = new Map(next.nodes.map((n) => [n.id, n]))
  const addedNodes: string[] = []
  const removedNodes: string[] = []
  const changedNodes: string[] = []
  for (const [id, n] of nextById) {
    const p = prevById.get(id)
    if (!p) addedNodes.push(n.name)
    else if (JSON.stringify(p) !== JSON.stringify(n)) changedNodes.push(n.name)
  }
  for (const [id, p] of prevById) {
    if (!nextById.has(id)) removedNodes.push(p.name)
  }
  const prevFlows = new Set(prev.flows.map((f) => `${f.from}->${f.to}:${f.id}`))
  const nextFlows = new Set(next.flows.map((f) => `${f.from}->${f.to}:${f.id}`))
  let flowAdded = 0
  let flowRemoved = 0
  for (const f of nextFlows) if (!prevFlows.has(f)) flowAdded++
  for (const f of prevFlows) if (!nextFlows.has(f)) flowRemoved++
  return {
    addedNodes,
    removedNodes,
    changedNodes,
    flowAdded,
    flowRemoved,
    titleChanged: prev.title !== next.title,
  }
}
