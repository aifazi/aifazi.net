// Minimal offline cache — same-origin GET only, network-first for API
// Bump version on deploy (or inject BUILD_ID) to invalidate stale chunks
const CACHE = 'aifazi-v2'
const OFFLINE_URLS = ['/', '/blog', '/forum']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(OFFLINE_URLS.map(u => new Request(u, { cache: 'reload' })))) )
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))) )
  self.clients.claim()
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Only cache same-origin navigations/assets; never cache API POST or cross-origin
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) {
    // API: network-first, no cache
    e.respondWith(fetch(req).catch(() => caches.match(req)))
    return
  }
  // Static/assets: cache-first with network fallback
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      if (res.ok && req.url.startsWith('http')) {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(req, clone))
      }
      return res
    }).catch(() => caches.match('/')))
  )
})
