// public/sw-register.js — registers the service worker on window load.
// Kept as an external script so the strict CSP `script-src 'self'` applies
// (an inline <script> would require 'unsafe-inline' or a nonce).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js')
  })
}
