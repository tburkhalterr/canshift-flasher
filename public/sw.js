// public/sw.js — minimal hand-rolled service worker for the CANShift Flasher.
//
// Strategy:
//   - Navigation requests → network-first, fall back to cached `/index.html`.
//   - `/assets/*` (Vite hashed output) → cache-first, immutable.
//   - `/firmware/*` and external hosts → network-only (never cached).
//   - On install: warm the shell cache + skipWaiting.
//   - On activate: delete old caches + clients.claim.

const CACHE_VERSION = 'v1'
const SHELL_CACHE = `canshift-flasher-shell-${CACHE_VERSION}`
const ASSETS_CACHE = `canshift-flasher-assets-${CACHE_VERSION}`
const SHELL_URLS = ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSETS_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never cache cross-origin requests (firmware, GitHub Releases, telemetry).
  if (url.origin !== self.location.origin) return

  // Never cache firmware payloads even when same-origin.
  if (url.pathname.startsWith('/firmware/')) return

  // Navigation → network-first, fall back to cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then((cached) => cached ?? Response.error()),
      ),
    )
    return
  }

  // Hashed assets → cache-first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(ASSETS_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
      }),
    )
  }
})
