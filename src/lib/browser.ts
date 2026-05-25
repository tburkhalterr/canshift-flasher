// src/lib/browser.ts

/**
 * Web Serial is currently Chromium-only (Chrome, Edge, Brave, Opera, Arc).
 * Safari and Firefox do not implement the spec, so the flasher cannot run.
 */
export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}
