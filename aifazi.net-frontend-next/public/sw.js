// Minimal offline cache — same-origin GET only
// Bump CACHE on deploy to invalidate stale chunks (or inject BUILD_ID via next.config.js env)
const CACHE = 'aifazi-v3'
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
  if (url.origin !== location.origin) return
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)))
    return
  }
  // Navigations: network-first (fresh HTML), fallback to cache
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(fetch(req).then(res => {
      const clone = res.clone()
      caches.open(CACHE).then(c => c.put(req, clone))
      return res
    }).catch(() => caches.match(req).then(cached => cached || caches.match('/'))))
    return
  }
  // Assets: cache-first
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
