'use client'
const KEY = 'aifazi_wishlist'

let _cache = []
let _cacheRaw = '[]'
function read() {
  if (typeof window === 'undefined') return _cache
  const raw = localStorage.getItem(KEY) || '[]'
  if (raw === _cacheRaw) return _cache
  _cacheRaw = raw
  try { _cache = JSON.parse(raw) } catch { _cache = [] }
  return _cache
}
function write(ids) {
  _cache = ids
  _cacheRaw = JSON.stringify(ids)
  localStorage.setItem(KEY, _cacheRaw)
  window.dispatchEvent(new CustomEvent('wishlist-change', { detail: ids }))
}

export function getWishlist() { return read() }
export function isWishlisted(id) { return read().includes(String(id)) }
export function toggleWishlist(id) {
  const sid = String(id)
  const ids = read()
  const next = ids.includes(sid) ? ids.filter(x => x !== sid) : [...ids, sid]
  write(next)
  return next.includes(sid)
}
export function clearWishlist() { write([]) }

import { useSyncExternalStore } from 'react'
function subscribe(cb) {
  window.addEventListener('wishlist-change', cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener('wishlist-change', cb); window.removeEventListener('storage', cb) }
}
export function useWishlist() {
  const ids = useSyncExternalStore(subscribe, read, () => [])
  return {
    ids,
    count: ids.length,
    has: (id) => ids.includes(String(id)),
    toggle: (id) => toggleWishlist(id),
  }
}
