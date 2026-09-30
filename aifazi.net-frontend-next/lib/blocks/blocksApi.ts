/**
 * lib/blocks/blocksApi.ts — client for the page-layout backend.
 * Reads are public (published layouts); writes require an admin session
 * (enforced server-side via require_admin).
 */
import api from '../api'
import type { LayoutMeta, LayoutRevision, LayoutRevisionDetail, PageLayout } from './types'

export interface LayoutInput {
  slug: string
  title: string
  published: boolean
  seo_title?: string
  seo_description?: string
  blocks: unknown[]
}

export async function listLayouts(): Promise<LayoutMeta[]> {
  const r = await api.get('/blocks/layouts')
  return Array.isArray(r.data?.layouts) ? r.data.layouts : []
}

export async function listAllLayouts(): Promise<LayoutMeta[]> {
  const r = await api.get('/blocks/layouts/admin/all')
  return Array.isArray(r.data?.layouts) ? r.data.layouts : []
}

export async function getLayout(slug: string): Promise<PageLayout | null> {
  const r = await api.get(`/blocks/layouts/${encodeURIComponent(slug)}`)
  return (r.data?.layout as PageLayout) ?? null
}

export async function createLayout(input: LayoutInput): Promise<PageLayout> {
  const r = await api.post('/blocks/layouts', input)
  if (!r.data?.layout) throw new Error('Create failed')
  return r.data.layout as PageLayout
}

export async function updateLayout(id: string, input: LayoutInput): Promise<PageLayout> {
  const r = await api.put(`/blocks/layouts/${encodeURIComponent(id)}`, input)
  if (!r.data?.layout) throw new Error('Update failed')
  return r.data.layout as PageLayout
}

export async function deleteLayout(id: string): Promise<void> {
  await api.delete(`/blocks/layouts/${encodeURIComponent(id)}`)
}

export async function listRevisions(layoutId: string): Promise<LayoutRevision[]> {
  const r = await api.get(`/blocks/layouts/${encodeURIComponent(layoutId)}/revisions`)
  return Array.isArray(r.data?.revisions) ? r.data.revisions : []
}

export async function getRevision(layoutId: string, revisionId: string): Promise<LayoutRevisionDetail | null> {
  const r = await api.get(
    `/blocks/layouts/${encodeURIComponent(layoutId)}/revisions/${encodeURIComponent(revisionId)}`,
  )
  return (r.data?.revision as LayoutRevisionDetail) ?? null
}

export async function restoreRevision(layoutId: string, revisionId: string): Promise<PageLayout> {
  const r = await api.post(
    `/blocks/layouts/${encodeURIComponent(layoutId)}/revisions/${encodeURIComponent(revisionId)}/restore`,
  )
  if (!r.data?.layout) throw new Error('Restore failed')
  return r.data.layout as PageLayout
}
