# CANShift Flasher

A single-screen web app whose only job is to **USB-flash an ESP32 with the
latest CANShift dash firmware**. Hosted at
[canshift.tmbk.app](https://canshift.tmbk.app).

This is a support project for the main
[CANShift](https://github.com/tburkhalterr/CANShift) repo — kept separate to
avoid polluting the monorepo CI and to host independently.

## What it does

Three use cases, **exactly one flow**:

1. **First flash** — ESP32 sortant du carton, no firmware yet.
2. **Normal update** — alternative to the in-Studio OTA path. Some users
   prefer USB: faster, more predictable, full control.
3. **Recovery** — after a failed OTA, broken boot loop, or KO partition.
   USB-flash gets the dash back to a clean state.

User flow: plug dash → open canshift.tmbk.app → "Connect" → "Flash latest" → done.

No version picker. The flasher always pulls the latest published firmware.

## Stack

- [Vite](https://vitejs.dev/) + [React 19](https://react.dev/) + TypeScript (strict)
- [Tailwind CSS v3](https://tailwindcss.com/) with design tokens mirrored from
  `canshift-core` (see `src/styles/tokens.css`)
- [esptool-js](https://github.com/espressif/esptool-js) **v0.6.0** for Web Serial flashing
- Chromium-only (Chrome, Edge, Brave, Arc, Opera) — Safari and Firefox do not
  implement [Web Serial](https://wicg.github.io/serial/)

## Local development

```bash
npm install
npm run dev
```

Open the printed local URL in a Chromium browser. The browser-support detector
flips to the "Chromium required" banner automatically in non-Chromium browsers.

## Build

```bash
npm run build      # → dist/
npm run typecheck  # strict TS
npm run preview    # serve dist/ locally
```

The `dist/` folder is a static SPA — host it on any HTTPS-capable origin.
HTTPS is **required** by Web Serial; HTTP origins (other than `localhost`)
cannot prompt for serial port access.

## Configuration

| Env var              | Default                                      | Purpose                              |
| -------------------- | -------------------------------------------- | ------------------------------------ |
| `VITE_FIRMWARE_URL`  | `https://canshift.tmbk.app/firmware/latest.bin` | Where to fetch the firmware binary from |

Set at build time. The firmware binary is **not** stored in this repo — the
maintainer uploads it to the hosting origin on each firmware release.

## Threat model

The USB flash path writes raw bytes to flash and bypasses the HMAC verification
that the running firmware applies to OTA payloads. For v1 this residual risk is
accepted because the user is on a trusted local USB connection. HMAC pre-flash
verification is tracked as a v2 item in
[tburkhalterr/CANShift#1081](https://github.com/tburkhalterr/CANShift/issues/1081).

## Supported USB-UART bridges

The Web Serial port picker is filtered to the chips shipped on supported
CANShift boards (same allowlist as `canshift-studio`):

| Chip   | VID    | PID    |
| ------ | ------ | ------ |
| CH340  | 0x1a86 | 0x7523 |
| CH9102 | 0x1a86 | 0x55d4 |
| CP210x | 0x10c4 | 0xea60 |

## Replacing the placeholder logo

`src/components/CanshiftLogo.tsx` ships with a placeholder "CS" badge. Replace
the component body with the real CANShift mark when it's available.

## Deploy

This project does not include any deploy automation. The maintainer wires
their own pipeline (static-hosting any `dist/`). Just upload the `dist/`
contents to your origin and you are good.

## License

MIT — see [LICENSE](./LICENSE).
