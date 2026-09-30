import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSyncExternalStore, useCallback, useEffect, useState } from 'react'
import { api } from './api'

// NOTE: AsyncStorage is unencrypted - saved articles are PUBLIC content
// snapshots (title/body/cover) kept for offline reading. Never store tokens,
// keys, or secrets in this module.

export interface SavedArticle {
  id: string
  slug: string
  title: string
  content?: string
  excerpt?: string
  cover_image?: string
  author_name?: string
  category?: string
  created_at?: string
  views?: number
  savedAt: number
}

export type SavedArticleInput = Omit<SavedArticle, 'savedAt'>

const KEY = 'aifazi_saved_articles'
const MAX_SAVED = 200
let _cache: SavedArticle[] = []
let _cacheRaw = '[]'
const _listeners = new Set<() => void>()
let _ready: Promise<void> | null = null

function notify() {
  _listeners.forEach(cb => cb())
}

function hydrate(): Promise<void> {
  if (!_ready) {
    _ready = AsyncStorage.getItem(KEY)
      .then(raw => {
        const value = raw || '[]'
        if (value !== _cacheRaw) {
          _cacheRaw = value
          _cache = JSON.parse(value)
          notify()
        }
      })
      .catch(() => {})
  }
  return _ready
}
// Warm the cache at import time so sync readers are ready on first mount.
hydrate()

function persist() {
  _cacheRaw = JSON.stringify(_cache)
  AsyncStorage.setItem(KEY, _cacheRaw).catch(() => {})
  notify()
}

function subscribe(cb: () => void) {
  _listeners.add(cb)
  return () => _listeners.delete(cb)
}

function read(): SavedArticle[] {
  return _cache
}

export function getSaved(): SavedArticle[] {
  return read()
}

export function isSaved(slug: string): boolean {
  return read().some(a => a.slug === slug)
}

export function getSavedBySlug(slug: string): SavedArticle | null {
  return read().find(a => a.slug === slug) ?? null
}

/** Awaited variant - safe for offline fallbacks where hydration may not have
 * finished yet (cold start straight into a deep link). */
export async function getSavedBySlugAsync(slug: string): Promise<SavedArticle | null> {
  await hydrate()
  return getSavedBySlug(slug)
}

/** Save (returns true) or unsave (returns false) a local snapshot of the
 * article. Saving also fires a best-effort fetch of the full body so the copy
 * is readable offline even if the reader never opens it online. */
export function toggleSaved(post: SavedArticleInput): boolean {
  const existing = _cache.findIndex(a => a.slug === post.slug)
  if (existing >= 0) {
    _cache = _cache.filter(a => a.slug !== post.slug)
    persist()
    return false
  }
  _cache = [{ ...post, savedAt: Date.now() }, ..._cache].slice(0, MAX_SAVED)
  persist()
  api
    .get(`/blog/${encodeURIComponent(post.slug)}`)
    .then(r => upsertContent(post.slug, (r.data ?? {}) as Partial<SavedArticle>))
    .catch(() => {})
  return true
}

/** Merge fresh article fields into a saved copy. No-op for unsaved articles -
 * only saved ones keep a local snapshot. */
export function upsertContent(slug: string, fields: Partial<SavedArticle>): void {
  const idx = _cache.findIndex(a => a.slug === slug)
  if (idx < 0) return
  const prev = _cache[idx]
  _cache[idx] = { ...prev, ...fields, slug: prev.slug, savedAt: prev.savedAt }
  persist()
}

export function clearSaved() {
  _cache = []
  persist()
}

export function useSavedArticles() {
  const [ready, setReady] = useState(false)
  const items = useSyncExternalStore(subscribe, read, () => [])
  const toggle = useCallback((post: SavedArticleInput) => toggleSaved(post), [])

  useEffect(() => {
    hydrate().then(() => setReady(true))
  }, [])

  return {
    items,
    count: items.length,
    ready,
    has: (slug: string) => items.some(a => a.slug === slug),
    toggle,
  }
}
