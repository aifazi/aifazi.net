/**
 * lib/blocks/blocksApi.ts — client for the page-layout backend.
 * Reads are public (published layouts); writes require an admin session
 * (enforced server-side via require_admin).
 */
import api from '../api'
import type { LayoutMeta, PageLayout } from './types'

export async function listLayouts(): Promise<LayoutMeta[]> {
  const r = await api.get('/blocks/layouts')
  return Array.isArray(r.data?.layouts) ? r.data.layouts : []
}

export async function getLayout(slug: string): Promise<PageLayout | null> {
  const r = await api.get(`/blocks/layouts/${encodeURIComponent(slug)}`)
  return (r.data?.layout as PageLayout) ?? null
}

export async function createLayout(input: {
  slug: string
  title: string
  published: boolean
  blocks: unknown[]
}): Promise<PageLayout> {
  const r = await api.post('/blocks/layouts', input)
  if (!r.data?.layout) throw new Error('Create failed')
  return r.data.layout as PageLayout
}

export async function updateLayout(
  id: string,
  input: { slug: string; title: string; published: boolean; blocks: unknown[] },
): Promise<PageLayout> {
  const r = await api.put(`/blocks/layouts/${encodeURIComponent(id)}`, input)
  if (!r.data?.layout) throw new Error('Update failed')
  return r.data.layout as PageLayout
}

export async function deleteLayout(id: string): Promise<void> {
  await api.delete(`/blocks/layouts/${encodeURIComponent(id)}`)
}
