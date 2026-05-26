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

## Advanced (recovery)

A collapsed `<details>` block under the "Flash latest" button exposes three
power-user escape hatches **for support flows only**:

| Control            | Purpose                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Full erase         | Sets `eraseAll=true` on `writeFlash` — wipes the entire chip before the new image lands.  |
| Baud rate          | Drops the esptool stub baud from `921600` → `460800` / `230400` / `115200`. Useful on flaky CH340 dashes with long USB cables. |
| Version override   | Pins a specific release tag (e.g. `v0.9.1`). Hits `/releases/tags/{tag}` — same SHA-256 + SPIFFS rules apply. Leave blank to use latest. |

The panel is collapsed by default and never persists across reloads — power
users re-set per session, which keeps the default flow boring and prevents a
mis-configured default from haunting a non-technical user.

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
| `VITE_FIRMWARE_URL`  | `https://canshift.tmbk.ch/firmware/latest.bin` | **Deprecated.** Static fallback used only when the GitHub Releases API is unreachable. |
| `VITE_TELEMETRY_URL` | _(unset → telemetry disabled)_               | Endpoint that receives anonymous flash-outcome events |

The default flow now pulls release metadata + asset URLs directly from the
canonical GitHub repository — set the URL by appending `?prerelease=1` to the
flasher origin to opt into pre-release builds. `VITE_FIRMWARE_URL` is kept
only for back-compat with deployments that pinned a self-hosted mirror; the
same SHA-256 verification applies to it.

### Firmware artifact format

The flasher pulls release metadata from the canonical GitHub repo
(`tburkhalterr/CANShift`) and writes:

1. The **merged firmware image** at flash offset `0x0`. Asset name pattern:
   `canshift-firmware-*-crowpanel_28-merged.bin`. This is the bootloader +
   partition table + app produced by `esptool merge_bin`.
2. The **SPIFFS partition image** at flash offset `0x310000` **when the
   release includes one**. Asset name pattern:
   `canshift-spiffs-*-crowpanel_28.bin`. Released images that omit this asset
   are still supported — the flasher just skips the SPIFFS write.

Each asset MUST be accompanied by a sibling `<asset>.sha256` file in coreutils
format (`<64-hex>  <filename>`) — the flasher hard-fails when the manifest is
missing or doesn't match.

If you self-host a fallback binary via `VITE_FIRMWARE_URL`, it MUST be the
merged image and MUST publish `${VITE_FIRMWARE_URL}.sha256` next to it.
Uploading the app-only `firmware.bin` (intended for `0x10000`) at the same
URL would brick boot — the ROM bootloader would fail with `flash read err,
1000` because the bootloader bytes would land at `0x10000` instead of
`0x1000`.

Build the merged image with:

```bash
esptool merge_bin -o canshift-firmware-vX.Y.Z-crowpanel_28-merged.bin \
  0x1000  bootloader.bin \
  0x8000  partitions.bin \
  0x10000 firmware.bin
```

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
  "firmwareVersion": "vX.Y.Z" | null,
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

The flasher fetches the firmware from a public CDN and then writes it raw to
flash. Every downloaded artifact is **SHA-256 verified before flashing** against
the sibling `.sha256` file published next to the binary in the GitHub release
(coreutils format). A mismatch, a missing `.sha256` sibling, or a malformed
manifest hard-fails the flash — there is no opt-out flag.

The same gate applies to the `VITE_FIRMWARE_URL` fallback path: any deployment
serving a self-hosted mirror **MUST** publish a sibling `.sha256` file next to
the binary, or the flasher will refuse to flash.

A separate HMAC pre-flash gate (closer to the in-firmware OTA verification) is
tracked as a future hardening item in
[tburkhalterr/CANShift#1081](https://github.com/tburkhalterr/CANShift/issues/1081).

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
