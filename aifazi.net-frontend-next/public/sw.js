// Minimal offline cache — same-origin GET only
// Bump CACHE on deploy to invalidate stale chunks
const CACHE = 'aifazi-v4'
const OFFLINE_URLS = ['/', '/blog', '/forum']

self.addEventListener('install', (e) => {
  // Never fail install because one URL is unavailable (403 / redirect).
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.allSettled(
        OFFLINE_URLS.map((u) =>
          fetch(new Request(u, { cache: 'reload' }))
            .then((res) => { if (res && res.ok) return c.put(u, res.clone()) })
            .catch(() => {})
        )
      )
    )
  )
  self.skipWaiting()
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
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
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(fetch(req).then((res) => {
      const clone = res.clone()
      caches.open(CACHE).then((c) => c.put(req, clone))
      return res
    }).catch(() => caches.match(req).then((cached) => cached || caches.match('/'))))
    return
  }
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok && req.url.startsWith('http')) {
        const clone = res.clone()
        caches.open(CACHE).then((c) => c.put(req, clone))
      }
      return res
    }).catch(() => caches.match('/')))
  )
})
