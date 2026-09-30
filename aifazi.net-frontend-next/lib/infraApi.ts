/**
 * lib/infraApi.ts — client for the infra diagram builder backend.
 * Reads are public (published docs); writes require an admin session
 * (enforced server-side via require_admin).
 */
import api from './api'
import type { DiagramDoc } from '@/data/hybrid-infra'

export interface DiagramMeta {
  id: string
  slug: string
  title: string
  updatedAt: string
  published: boolean
  nodeCount: number
  flowCount: number
}

export async function listDiagrams(): Promise<DiagramMeta[]> {
  const r = await api.get('/infra/diagrams')
  return Array.isArray(r.data?.diagrams) ? r.data.diagrams : []
}

export async function getDiagram(slug: string): Promise<DiagramDoc | null> {
  const r = await api.get(`/infra/diagrams/${encodeURIComponent(slug)}`)
  return (r.data?.diagram as DiagramDoc) ?? null
}

export async function createDiagram(doc: DiagramDoc): Promise<DiagramDoc> {
  const r = await api.post('/infra/diagrams', {
    slug: doc.slug,
    title: doc.title,
    published: doc.published,
    nodes: doc.nodes,
    flows: doc.flows,
    categoryColors: doc.categoryColors,
    customCategories: doc.customCategories,
  })
  if (!r.data?.diagram) throw new Error('Create failed')
  return r.data.diagram as DiagramDoc
}

export async function updateDiagram(doc: DiagramDoc): Promise<DiagramDoc> {
  const r = await api.put(`/infra/diagrams/${encodeURIComponent(doc.id)}`, {
    slug: doc.slug,
    title: doc.title,
    published: doc.published,
    nodes: doc.nodes,
    flows: doc.flows,
    categoryColors: doc.categoryColors,
    customCategories: doc.customCategories,
  })
  if (!r.data?.diagram) throw new Error('Update failed')
  return r.data.diagram as DiagramDoc
}

export async function deleteDiagram(id: string): Promise<void> {
  await api.delete(`/infra/diagrams/${encodeURIComponent(id)}`)
}
