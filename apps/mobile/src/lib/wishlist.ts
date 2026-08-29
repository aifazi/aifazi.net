import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSyncExternalStore, useCallback, useEffect, useState } from 'react'
import { api } from './api'

const KEY = 'aifazi_wishlist'
let _cache: string[] = []
let _cacheRaw = '[]'
let _listeners = new Set<() => void>()
let _hydrated = false

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

async function loadFromServer() {
  try {
    const res = await api.get('/store/wishlist')
    if (res.data?.ids) {
      write(res.data.ids)
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

export async function toggleWishlist(id: string | number): Promise<boolean> {
  const sid = String(id)
  const ids = read()
  const next = ids.includes(sid) ? ids.filter(x => x !== sid) : [...ids, sid]
  write(next)
  // Fire-and-forget sync to backend
  try {
    if (ids.includes(sid)) {
      await api.delete(`/store/wishlist/${sid}`)
    } else {
      await api.post('/store/wishlist', { product_id: sid })
    }
  } catch {}
  return next.includes(sid)
}

export function clearWishlist() { write([]) }

export function useWishlist() {
  const [ready, setReady] = useState(false)
  const ids = useSyncExternalStore(subscribe, read, () => [])
  const toggle = useCallback((id: string | number) => toggleWishlist(id), [])

  useEffect(() => {
    if (!_hydrated) {
      _hydrated = true
      loadFromServer().then(() => setReady(true))
    }
  }, [])

  return {
    ids,
    count: ids.length,
    has: (id: string | number) => ids.includes(String(id)),
    toggle,
    ready,
  }
}
