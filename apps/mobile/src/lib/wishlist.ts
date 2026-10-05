import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSyncExternalStore, useCallback, useEffect, useState } from 'react'
import { api } from './api'

// NOTE: AsyncStorage is unencrypted — the wishlist holds NON-SECRET product
// ids only. Never store tokens, keys, or secrets in this module.

const KEY = 'aifazi_wishlist'
let _cache: string[] = []
let _cacheRaw = '[]'
let _listeners = new Set<() => void>()
let _hydrated = false
// R7-18 — offline-divergence guard. Toggles whose server sync failed stay
// recorded here (sid -> wishlisted?) until a sync succeeds. The server list
// only ever OVERWRITES local state when this map is empty; otherwise the
// server list is MERGED with the pending local decisions so an offline toggle
// is never clobbered by a later fetch. Deliberately minimal (dirty flag, not
// a full sync queue).
let _unsynced = new Map<string, boolean>()

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
      const serverIds = res.data.ids as string[]
      if (_unsynced.size === 0) {
        write(serverIds)
      } else {
        // A sync failed earlier — re-apply the still-pending local decisions
        // on top of the fresh server list instead of overwriting them.
        const merged = new Set(serverIds)
        for (const [sid, wishlisted] of _unsynced) {
          if (wishlisted) merged.add(sid)
          else merged.delete(sid)
        }
        write([...merged])
      }
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
  const wishlisted = next.includes(sid)
  // Local state (persisted to AsyncStorage in write()) wins immediately and
  // survives until the server confirms — an offline toggle is never reverted.
  write(next)
  // Fire-and-forget sync to backend
  try {
    if (ids.includes(sid)) {
      await api.delete(`/store/wishlist/${sid}`)
    } else {
      await api.post('/store/wishlist', { product_id: sid })
    }
    _unsynced.delete(sid)
  } catch {
    _unsynced.set(sid, wishlisted)
  }
  return wishlisted
}

export function clearWishlist() { _unsynced.clear(); write([]) }

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
