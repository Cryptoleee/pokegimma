/*
 * Stormbreak's service worker: makes the game installable and keeps it quick.
 * - Pages: always fresh from the network; the last copy when offline.
 * - Built files (/assets/…, names change with every build): from the cache once fetched.
 * - Icons and other static files: the cache first, refreshed in the background.
 * - The API and anything from other sites are never touched.
 * Bump VERSION to drop everything cached by an older worker.
 */
const VERSION = 'v1'
const PAGES = `sb-pages-${VERSION}`
const STATIC = `sb-static-${VERSION}`

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.add('/')).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== PAGES && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return

  // Pages: network first, the cached shell when offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(PAGES).then((c) => c.put('/', copy))
          }
          return res
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    )
    return
  }

  // Hashed build files never change: cache first
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(STATIC).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  // Everything else on our site: the cached copy now, a fresh one for next time
  e.respondWith(
    caches.open(STATIC).then((c) =>
      c.match(req).then((hit) => {
        const fresh = fetch(req)
          .then((res) => {
            if (res.ok) c.put(req, res.clone())
            return res
          })
          .catch(() => hit)
        return hit || fresh
      }),
    ),
  )
})
