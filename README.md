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
HTTPS is **required** by Web Serial; HTTP origins (other than `localhost`)
cannot prompt for serial port access.

## Configuration

| Env var              | Default                                      | Purpose                              |
| -------------------- | -------------------------------------------- | ------------------------------------ |
| `VITE_FIRMWARE_URL`  | `https://canshift.tmbk.ch/firmware/latest.bin` | Where to fetch the firmware binary from |

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

## Brand assets

The flasher mirrors `canshift-studio`'s visual identity so it feels like a
member of the same product family:

| Asset                                    | Source of truth                                                       |
| ---------------------------------------- | --------------------------------------------------------------------- |
| Logo (`public/canshift_studio_logo.png`) | `canshift-studio/assets/CANShift_studio_logo.png`                     |
| Favicon (`public/favicon.png`)           | `canshift-studio/assets/icon.png` (the Electron app icon)             |
| Color tokens (`src/styles/tokens.css`)   | `canshift-core/src/design-tokens.ts` (`DARK_TOKENS.colors`)           |
| Header font                              | [Orbitron](https://fonts.google.com/specimen/Orbitron) (Google Fonts) |

The flasher intentionally does **not** depend on `canshift-core` or
`canshift-studio` — values are copied. If Studio's identity moves, re-sync
the logo PNG, the favicon, and the CSS variables in `src/styles/tokens.css`
manually.

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
