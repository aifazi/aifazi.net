// Minimal offline cache — same-origin GET only
// Bump CACHE on deploy to invalidate stale chunks
const CACHE = 'aifazi-v5'
const OFFLINE_URLS = ['/', '/blog', '/forum']

// Every respondWith path MUST resolve a Response — resolving undefined throws
// "Failed to convert value to 'Response'" and surfaces as net::ERR_FAILED.
const offlineFallback = () =>
  caches.match('/').then((cached) => cached || Response.error());

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
    // API is network-only; on failure reject cleanly (never undefined).
    e.respondWith(fetch(req).then((res) => res).catch(() => Response.error()))
    return
  }
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(fetch(req).then((res) => {
      const clone = res.clone()
      caches.open(CACHE).then((c) => c.put(req, clone))
      return res
    }).catch(() => caches.match(req).then((cached) => cached || offlineFallback())))
    return
  }
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res.ok && req.url.startsWith('http')) {
        const clone = res.clone()
        caches.open(CACHE).then((c) => c.put(req, clone))
      }
      return res
    }).catch(() => offlineFallback()))
  )
})
