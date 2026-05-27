// src/components/help-topics.ts
//
// Static topic metadata extracted from `HelpZone.tsx` so non-drawer callers
// (e.g. `FailedView`) can map errors → topic ids without statically importing
// the heavy `HelpZone` component (which would collapse its lazy-loaded chunk
// back into the main bundle — see #165 PR review).

export const HELP_TOPIC_IDS = [
  'no-port',
  'flash-id-ffffff',
  'enter-bootloader',
  'no-boot',
  'browser-unsupported',
  'sha-mismatch',
] as const

export type HelpTopicId = (typeof HELP_TOPIC_IDS)[number]

/**
 * User-facing question strings for each topic id. Kept in sync with the
 * canonical list rendered inside `HelpZone`. A test asserts both sides agree.
 */
export const HELP_TOPIC_TITLES: Readonly<Record<HelpTopicId, string>> = {
  'no-port': 'No port shown when I click Connect',
  'flash-id-ffffff': '"Flash ID is ffffff"',
  'enter-bootloader': '"Could not enter ESP32 bootloader"',
  'no-boot': "Flash succeeds but ESP32 doesn't boot",
  'browser-unsupported': 'Browser says "not supported"',
  'sha-mismatch': '"SHA-256 mismatch"',
}

export function getHelpTopicTitle(id: HelpTopicId): string {
  return HELP_TOPIC_TITLES[id]
}
