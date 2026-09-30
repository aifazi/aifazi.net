import { describe, expect, it, vi, beforeEach } from 'vitest'
import { api } from './api'
import {
  clearSaved,
  getSaved,
  getSavedBySlug,
  getSavedBySlugAsync,
  isSaved,
  toggleSaved,
  upsertContent,
} from './savedArticles'

// In-memory AsyncStorage - react-native and friends are not loadable in node.
const store = new Map<string, string>()
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      store.set(k, v)
    }),
    removeItem: vi.fn(async (k: string) => {
      store.delete(k)
    }),
  },
}))

// ./api is used for the best-effort full-body enrichment fetch.
vi.mock('./api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))

const article = (slug: string) => ({
  id: `id-${slug}`,
  slug,
  title: `Title ${slug}`,
  excerpt: `Excerpt ${slug}`,
})

beforeEach(() => {
  clearSaved()
  store.clear()
  vi.mocked(api.get).mockReset()
  vi.mocked(api.get).mockResolvedValue({ data: {} })
})

describe('toggleSaved', () => {
  it('saves and unsaves an article', () => {
    expect(toggleSaved(article('a'))).toBe(true)
    expect(isSaved('a')).toBe(true)
    expect(getSavedBySlug('a')?.title).toBe('Title a')

    expect(toggleSaved(article('a'))).toBe(false)
    expect(isSaved('a')).toBe(false)
    expect(getSaved()).toHaveLength(0)
  })

  it('fires a best-effort body fetch and merges content when it lands', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { content: '# Hello' } })
    expect(toggleSaved(article('b'))).toBe(true)
    expect(api.get).toHaveBeenCalledWith('/blog/b')

    await new Promise(r => setTimeout(r, 0))
    expect(getSavedBySlug('b')?.content).toBe('# Hello')
  })

  it('keeps the local copy when the enrichment fetch fails', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('offline'))
    expect(toggleSaved(article('c'))).toBe(true)
    await new Promise(r => setTimeout(r, 0))
    expect(isSaved('c')).toBe(true)
    expect(getSavedBySlug('c')?.content).toBeUndefined()
  })

  it('caps the store at 200 entries', () => {
    for (let i = 0; i < 205; i++) toggleSaved(article(`p${i}`))
    expect(getSaved()).toHaveLength(200)
    expect(isSaved('p204')).toBe(true)
    expect(isSaved('p0')).toBe(false)
  })
})

describe('upsertContent', () => {
  it('merges fresh fields into a saved article', () => {
    toggleSaved(article('d'))
    upsertContent('d', { content: 'body', title: 'New title' })
    const entry = getSavedBySlug('d')
    expect(entry?.content).toBe('body')
    expect(entry?.title).toBe('New title')
  })

  it('ignores unsaved slugs', () => {
    upsertContent('never-saved', { content: 'body' })
    expect(getSavedBySlug('never-saved')).toBeNull()
  })

  it('preserves savedAt across merges', () => {
    toggleSaved(article('e'))
    const before = getSavedBySlug('e')?.savedAt
    upsertContent('e', { content: 'body', savedAt: 99999999999 as number })
    expect(getSavedBySlug('e')?.savedAt).toBe(before)
  })
})

describe('persistence', () => {
  it('round-trips through storage', async () => {
    toggleSaved(article('f'))
    // A second reader awaiting hydration sees the same entry.
    await getSavedBySlugAsync('f')
    expect(getSavedBySlug('f')?.slug).toBe('f')
  })

  it('getSavedBySlugAsync returns null for unknown slugs', async () => {
    expect(await getSavedBySlugAsync('nope')).toBeNull()
  })
})
