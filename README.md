# CANShift Flasher

A single-screen web app whose only job is to **USB-flash an ESP32 with the
latest CANShift dash firmware**. Hosted at
[canshift.tmbk.ch](https://canshift.tmbk.ch).

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

User flow: plug dash → open canshift.tmbk.ch → "Connect" → "Flash latest" → done.

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

> **HTTPS is required.** Web Serial silently refuses on plain HTTP origins
> other than `localhost`. Use Traefik / Caddy / Let's Encrypt to terminate
> TLS.

## Configuration

| Env var              | Default                                      | Purpose                              |
| -------------------- | -------------------------------------------- | ------------------------------------ |
| `VITE_FIRMWARE_URL`  | `https://canshift.tmbk.ch/firmware/latest.bin` | Where to fetch the firmware binary from |
| `VITE_TELEMETRY_URL` | _(unset → telemetry disabled)_               | Endpoint that receives anonymous flash-outcome events |

Set at build time. The firmware binary is **not** stored in this repo — the
maintainer uploads it to the hosting origin on each firmware release.

### Firmware artifact format

`latest.bin` **MUST** be the **merged** image (bootloader + partition table +
app), not the app-only firmware. The flasher writes it at flash offset `0x0`,
which matches how `canshift-studio` flashes the merged image.

Build the merged image with:

```bash
esptool merge_bin -o latest.bin \
  0x1000  bootloader.bin \
  0x8000  partitions.bin \
  0x10000 firmware.bin
```

Uploading the app-only `firmware.bin` (intended for `0x10000`) at `latest.bin`
would brick boot — the ROM bootloader would fail with `flash read err, 1000`
because the bootloader bytes would land at `0x10000` instead of `0x1000`.

## Telemetry

**Off by default.** Telemetry only activates if you build with
`VITE_TELEMETRY_URL=<your endpoint>` — there is no default destination, so
the stock build emits nothing.

When enabled, the flasher sends **one tiny anonymous JSON blob per flash
attempt**, fired with `keepalive: true` so it doesn't block the UI and
silently swallows any error:

```jsonc
{
  "outcome": "success" | "failed" | "cancelled",
  "chipFamily": "ESP32-S3" | null,
  "firmwareVersion": null,        // reserved — not currently populated
  "durationMs": 28412,
  "errorClass":
    "flash-id-ffffff" | "sync-failed" | "sha256-mismatch" |
    "disconnect" | "http" | "cancelled" | "unknown" | null,
  "browser": "Chrome" | "Edge" | "Brave" | "Opera" | "Arc" | "Other",
  "os":      "Windows" | "macOS" | "Linux" | "Other"
}
```

What is **never** sent: port VID/PID, full user agent (only coarse
buckets), raw log contents, error messages, IP-derived fields, or
anything the user typed. Browser/OS are bucketed without version.

### Per-user opt-out

Even when the build is configured with a telemetry endpoint, individual
users can opt out from their browser's DevTools console:

```js
localStorage.setItem('canshift-flasher.telemetry.optout', '1')
```

The flag short-circuits the send entirely — nothing leaves the device.

### CSP

If `VITE_TELEMETRY_URL` points to an origin other than `'self'` /
`canshift.tmbk.ch`, append that origin to the `connect-src` directive in
`nginx.conf`, otherwise the browser will block the request.

## Threat model

The USB flash path writes raw bytes to flash and bypasses the HMAC verification
that the running firmware applies to OTA payloads. For v1 this residual risk is
accepted because the user is on a trusted local USB connection. HMAC pre-flash
verification and a SHA-256 integrity check on the downloaded firmware are
tracked as v2 items in
[tburkhalterr/CANShift#1081](https://github.com/tburkhalterr/CANShift/issues/1081)
and
[tburkhalterr/canshift-flasher#4](https://github.com/tburkhalterr/canshift-flasher/issues/4).

Security disclosures: see [`public/.well-known/security.txt`](./public/.well-known/security.txt).
<!-- TODO: confirm contact — currently security@tmbk.ch -->


## Offline support

The flasher ships a minimal hand-rolled service worker (`public/sw.js`) and
a Web App Manifest (`public/manifest.webmanifest`), so it is installable as
a PWA and the SPA shell loads offline.

What is cached:

- Navigation requests → network-first with `/index.html` as the offline
  fallback (cached during the first visit).
- `/assets/*` (Vite's hashed output) → cache-first / immutable.

What is **not** cached (always requires network):

- `/firmware/*` — never cached, never served stale.
- Cross-origin requests (GitHub Releases, `canshift.tmbk.ch`, telemetry).

In practice: the UI loads when you're offline, but the **firmware download
still needs an internet connection** — the bytes are deliberately fetched
fresh every time.

## Reset reliability

Web Serial cannot drive `DTR/RTS` as reliably as Node's `serialport` library
(which `canshift-studio` uses from its Electron main process). To compensate,
the flasher automatically retries up to three reset sequences before giving
up:

1. **classic** — DTR=boot, RTS=reset (canonical CH340/CH9102 wiring).
2. **inverted** — RTS=boot, DTR=reset (some FTDI/PL2303 boards).
3. **usb-jtag** — single reset pulse, for ESP32-S3 native USB.

Timings are widened from esptool defaults (120 / 80 ms instead of 100 / 50 ms)
to give slow CH340 boards on macOS extra latch time on the boot pin.

This covers most macOS CH340 cases hands-off. Stubborn boards still need a
manual **BOOT-button press**: hold BOOT, tap RESET (or unplug/replug USB
while holding BOOT), then click **Retry**.

## Supported USB-UART bridges

The Web Serial port picker is filtered to the chips shipped on supported
CANShift boards (same allowlist as `canshift-studio`):

| Chip   | VID    | PID    |
| ------ | ------ | ------ |
| CH340  | 0x1a86 | 0x7523 |
| CH9102 | 0x1a86 | 0x55d4 |
| CP210x | 0x10c4 | 0xea60 |

## Brand assets

The flasher mirrors `canshift-studio`'s visual identity so it feels like a
member of the same product family:

| Asset                                    | Source of truth                                                       |
| ---------------------------------------- | --------------------------------------------------------------------- |
| Logo (`public/canshift_studio_logo.png`) | `canshift-studio/assets/CANShift_studio_logo.png`                     |
| Favicon (`public/favicon.png`)           | `canshift-studio/assets/icon.png` (the Electron app icon)             |
| Color tokens (`src/styles/tokens.css`)   | `canshift-core/src/design-tokens.ts` (`DARK_TOKENS.colors`)           |
| Header font (`public/fonts/orbitron-*.woff2`) | [Orbitron](https://fonts.google.com/specimen/Orbitron) (self-hosted from [Fontsource](https://fontsource.org/fonts/orbitron)) |

The flasher intentionally does **not** depend on `canshift-core` or
`canshift-studio` — values are copied. If Studio's identity moves, re-sync
the logo PNG, the favicon, and the CSS variables in `src/styles/tokens.css`
manually.

### One-command sync

```bash
npm run sync-brand
```

Runs `scripts/sync-brand-assets.mjs`, which copies the logo and favicon from
`../canshift-studio/assets/` and regenerates the `:root` block of
`src/styles/tokens.css` from `../canshift-core/src/design-tokens.ts`
(`DARK_TOKENS.colors`). Run this after any studio identity update; commit
the resulting diff. The script bails with a clear message if the sibling
repos are not checked out next to this one.

The script is **not** wired into CI — sibling repos are not available
there. It is a maintenance-time tool only; the manual sync paragraph above
remains the fallback for ad-hoc updates.

## Deploy

This project does not include any deploy automation. The maintainer wires
their own pipeline (static-hosting any `dist/`). Just upload the `dist/`
contents to your origin and you are good.

## Self-hosting

The repo ships everything needed to self-host on a Docker Swarm + Dokploy +
Traefik v3 stack:

- `Dockerfile` — multi-stage build (node:20-alpine → nginx:alpine), runs as
  the non-root `nginx` user, exposes port 8080.
- `nginx.conf` — SPA fallback, gzip, long-cache for fingerprinted assets,
  `no-cache` for `index.html`, security headers (CSP, HSTS, XCTO, XFO,
  Referrer-Policy, Permissions-Policy with `serial=(self)`).
- `docker-compose.yml` — Dokploy-friendly stack snippet, no published port,
  joins the external Traefik network.
- `traefik/canshift-flasher.yml` — Traefik v3 dynamic config (file provider).
  Router on `canshift.tmbk.ch`, ACME resolver placeholder `le`,
  `secure-headers` + `compress` middlewares, service on port 8080.

```bash
docker build -t canshift-flasher:latest .
docker compose up -d
```

> **HTTPS is required.** Web Serial silently refuses on plain HTTP origins
> other than `localhost`. TLS is terminated by Traefik (Let's Encrypt) in
> front of the container — never expose port 8080 directly.

The CSP `connect-src` directive in `nginx.conf` allows `'self'` plus
`https://canshift.tmbk.ch`. If the firmware binary is served from a
different origin, add that origin to `connect-src` or the fetch will be
blocked.

The default Traefik network is named `traefik-public`; rename in
`docker-compose.yml` to match your swarm (Dokploy sometimes uses
`dokploy-network`).

## License

MIT — see [LICENSE](./LICENSE).
