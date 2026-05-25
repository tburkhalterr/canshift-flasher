// src/lib/browser.ts

/**
 * Web Serial is currently Chromium-only (Chrome, Edge, Brave, Opera, Arc).
 * Safari and Firefox do not implement the spec, so the flasher cannot run.
 *
 * iOS is a hard "no" regardless of the browser brand: every iOS browser is a
 * WebKit shell (App Store policy), so Chrome/Brave/Edge/Opera on iOS expose
 * `navigator.serial` but `requestPort()` throws because WebKit has no Web
 * Serial implementation. The user-agent check filters those false positives.
 */
export function isWebSerialSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return false
  return 'serial' in navigator
}
