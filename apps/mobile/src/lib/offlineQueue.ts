import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'

const KEY = 'aifazi_offline_queue'
let _queue: any[] = []
let _online = true

NetInfo.addEventListener(state => {
  _online = !!state.isConnected
})

export async function loadQueue() {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    _queue = raw ? JSON.parse(raw) : []
  } catch { _queue = [] }
  return _queue
}

export async function enqueue(item: any) {
  _queue.push({ ...item, _ts: Date.now() })
  await AsyncStorage.setItem(KEY, JSON.stringify(_queue))
}

export async function dequeue() {
  const item = _queue.shift()
  if (item) await AsyncStorage.setItem(KEY, JSON.stringify(_queue))
  return item
}

export function isOnline() { return _online }

export async function flushQueue(sendFn: (item: any) => Promise<void>) {
  if (!_online || _queue.length === 0) return
  const pending = [..._queue]
  for (const item of pending) {
    try {
      await sendFn(item)
      _queue.shift()
      await AsyncStorage.setItem(KEY, JSON.stringify(_queue))
    } catch {
      break
    }
  }
}

// init
loadQueue()
