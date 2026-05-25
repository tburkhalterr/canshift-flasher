// src/components/CanshiftLogo.tsx
import type { CSSProperties, ReactElement } from 'react'

// Logo asset is served from /public — Vite copies it to dist/ root at build
// time. Source of truth: canshift-studio/assets/CANShift_studio_logo.png.
// If the studio's logo file moves, re-sync this PNG (see README).
const LOGO_SRC = '/canshift_studio_logo.png'

// Mirror the BootScreen treatment in canshift-studio
// (src/components/shared/BootScreen.tsx): same width/maxHeight/objectFit so
// the flasher and the studio splash feel like the same product surface.
const LOGO_STYLE: CSSProperties = {
  width: 240,
  height: 'auto',
  maxHeight: 80,
  objectFit: 'contain',
  userSelect: 'none',
}

export function CanshiftLogo(): ReactElement {
  return (
    <img
      src={LOGO_SRC}
      alt="CANShift"
      width={240}
      height={80}
      draggable={false}
      style={LOGO_STYLE}
    />
  )
}
