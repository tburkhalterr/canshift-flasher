// public/sw-register.js — registers the service worker on window load.
// Kept as an external script so the strict CSP `script-src 'self'` applies
// (an inline <script> would require 'unsafe-inline' or a nonce).
//
// SEC-007: when a new SW takes over and posts `{type:'sw-updated'}`, reload
// the page so the user picks up the fresh CSP / asset bundle without having
// to close every tab. A sessionStorage flag prevents reload loops in the
// unlikely case the new SW immediately broadcasts again on the next session.
(function () {
  if (!('serviceWorker' in navigator)) return

  var RELOAD_FLAG = 'canshift-sw-reloaded'

  navigator.serviceWorker.addEventListener('message', function (event) {
    var data = event && event.data
    if (!data || data.type !== 'sw-updated') return
    try {
      if (sessionStorage.getItem(RELOAD_FLAG) === '1') return
      sessionStorage.setItem(RELOAD_FLAG, '1')
    } catch (_err) {
      // sessionStorage can throw in private mode / sandboxed contexts —
      // proceed without the guard rather than getting stuck on stale CSP.
    }
    location.reload()
  })

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {
      // Registration failure must never break the app — the flasher works
      // without a service worker, just no offline shell.
    })
  })
})()
