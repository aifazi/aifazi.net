import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'

const KEY = 'aifazi_offline_queue'
const MAX_QUEUE = 100
const TTL_MS = 7 * 24 * 60 * 60 * 1000
let _queue: any[] = []
let _online = true
let _loaded: Promise<void> | null = null
let _flushing = false

NetInfo.addEventListener(state => {
  _online = !!state.isConnected && state.isInternetReachable !== false
})

export async function loadQueue() {
  if (_loaded) return _loaded
  _loaded = (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY)
      const parsed = raw ? JSON.parse(raw) : []
      // drop expired
      const now = Date.now()
      _queue = Array.isArray(parsed) ? parsed.filter((x: any) => !x?._ts || now - x._ts < TTL_MS).slice(-MAX_QUEUE) : []
    } catch { _queue = [] }
  })()
  return _loaded.then(() => _queue)
}

export async function enqueue(item: any) {
  await loadQueue()
  if (_queue.length >= MAX_QUEUE) _queue.shift()
  _queue.push({ ...item, _ts: Date.now() })
  await AsyncStorage.setItem(KEY, JSON.stringify(_queue))
}

export async function dequeue() {
  await loadQueue()
  const item = _queue.shift()
  if (item) await AsyncStorage.setItem(KEY, JSON.stringify(_queue))
  return item
}

export function isOnline() { return _online }

export async function flushQueue(sendFn: (item: any) => Promise<void>) {
  await loadQueue()
  if (_flushing || !_online || _queue.length === 0) return
  _flushing = true
  try {
    let i = 0
    while (i < _queue.length) {
      const item = _queue[i]
      if (item?._ts && Date.now() - item._ts > TTL_MS) {
        _queue.splice(i, 1)
        continue
      }
      try {
        await sendFn(item)
        _queue.splice(i, 1)
        await AsyncStorage.setItem(KEY, JSON.stringify(_queue))
      } catch {
        break
      }
    }
  } finally {
    _flushing = false
  }
}

// init
loadQueue()
