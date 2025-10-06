const CACHE_NAME = 'music-player-v1'
const STATIC_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_CACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    }).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  
  if (url.origin !== location.origin || request.method !== 'GET') {
    return
  }
  
  if (request.destination === 'document') {
    event.respondWith(
      caches.match(request)
        .then(response => {
          if (response) {
            return response
          }
          return fetch(request).then(response => {
            if (response.ok) {
              const responseClone = response.clone()
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseClone)
              })
            }
            return response
          }).catch(() => {
            return caches.match('/index.html')
          })
        })
    )
    return
  }
  
  if (request.destination === 'style' || 
      request.destination === 'script' || 
      request.destination === 'image') {
    event.respondWith(
      caches.match(request)
        .then(response => {
          if (response) {
            return response
          }
          return fetch(request).then(response => {
            if (response.ok) {
              const responseClone = response.clone()
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseClone)
              })
            }
            return response
          })
        })
    )
    return
  }
  
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok && request.method === 'GET') {
            const responseClone = response.clone()
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(() => {
          if (request.method === 'GET') {
            return caches.match(request)
          }
          return new Response('Network error', { status: 503 })
        })
    )
    return
  }
})
