import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSyncExternalStore, useCallback } from 'react'

const KEY = 'aifazi_wishlist'
let _cache: string[] = []
let _cacheRaw = '[]'
let _listeners = new Set<() => void>()

function read(): string[] {
  return _cache
}

async function load() {
  try {
    const raw = (await AsyncStorage.getItem(KEY)) || '[]'
    if (raw !== _cacheRaw) {
      _cacheRaw = raw
      _cache = JSON.parse(raw)
      _listeners.forEach(cb => cb())
    }
  } catch {}
}

function write(ids: string[]) {
  _cache = ids
  _cacheRaw = JSON.stringify(ids)
  AsyncStorage.setItem(KEY, _cacheRaw).catch(() => {})
  _listeners.forEach(cb => cb())
}

function subscribe(cb: () => void) {
  _listeners.add(cb)
  return () => _listeners.delete(cb)
}

// init
load()

export function getWishlist() { return read() }
export function isWishlisted(id: string | number) { return read().includes(String(id)) }
export function toggleWishlist(id: string | number) {
  const sid = String(id)
  const ids = read()
  const next = ids.includes(sid) ? ids.filter(x => x !== sid) : [...ids, sid]
  write(next)
  return next.includes(sid)
}
export function clearWishlist() { write([]) }

export function useWishlist() {
  const ids = useSyncExternalStore(subscribe, read, () => [])
  const toggle = useCallback((id: string | number) => toggleWishlist(id), [])
  return {
    ids,
    count: ids.length,
    has: (id: string | number) => ids.includes(String(id)),
    toggle,
  }
}
