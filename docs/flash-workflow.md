---
title: Flash workflow
---

# Flash workflow

This is the end-to-end happy path: from opening the flasher in a fresh
browser tab to seeing the dash boot on its own access point. The same flow
covers a first flash, a routine update, and recovery from a half-written
firmware — there is no separate "repair" mode.

## Browser compatibility

The flasher needs the
[Web Serial API](https://developer.mozilla.org/docs/Web/API/Web_Serial_API),
which is only available in Chromium-based browsers: Chrome, Edge, Brave,
Arc, and Opera. Firefox and Safari will show an "Unsupported browser"
screen — they do not (and as of writing, will not) implement Web Serial.

If you see the unsupported screen on a Chromium browser, the page is
probably being served over plain HTTP. Web Serial requires HTTPS or
`localhost`.

<img src="/docs-assets/unsupported-browser.png" alt="UnsupportedBrowser screen" />

## Idle: pick what to flash

The default view (the **Idle** state) has three blocks:

### Channel and version

The **Channel** dropdown switches between `Stable` and `Beta` release feeds.
The **Version** dropdown defaults to "Latest" but lets you pick any of the
recent releases on that channel — useful for downgrading or testing a
specific tag. The list is fetched from the GitHub Releases API at page
load; if it fails to load you will see a banner explaining why (typically
a rate limit — see [Troubleshooting](/troubleshooting)).

<img src="/docs-assets/channel-picker-default.png" alt="ChannelPicker default state" />

### Local firmware (optional)

Below the channel picker, the **Or flash a local file** disclosure lets
you skip the channel/version dropdowns entirely and flash a `.bin` from
disk. Use this when you are building firmware yourself or when GitHub is
rate-limiting you. Full details on the [Local firmware](/local-firmware)
page.

### ECU profile

The **ECU profile** dropdown is mandatory — the **Connect** button stays
disabled until you pick one. The dropdown lists every signal profile
shipped with the flasher (MaxxECU, OBD-II, Blank, and any RealDash
imports). Pick **Skip — push my own profile via Studio** if your ECU is
not in the catalog yet. See [ECU profile](/ecu-profile) for the full
explanation.

<img src="/docs-assets/ecu-profile-picker-open.png" alt="EcuProfilePicker open" />

## Connect: serial port permission

Press **Connect**. The browser shows its native port-picker dialog listing
USB serial devices currently attached. Pick the ESP32 — it usually shows
up as `CP210x`, `CH340`, or `USB-SERIAL` depending on the board's USB
bridge chip. The flasher then auto-resets the chip into bootloader mode
(via the standard DTR/RTS handshake), so you do not normally need to hold
the BOOT button yourself.

If the port-picker is empty: the board is not visible to the OS. See
[Troubleshooting](/troubleshooting) for cable and driver checks.

<img src="/docs-assets/browser-port-picker.png" alt="Browser port picker" />

## Ready: chip detection

Once the bootloader handshake succeeds, the **Ready** view shows the
detected chip — for example `ESP32-D0WD-V3 (revision v3.1)` — and the
COM/tty port name. From here you can:

- Press **Flash** to write the firmware you picked in the Idle view.
- Open the **Advanced** disclosure to override the version tag or load a
  local file without going back to Idle.
- Press **Re-select port** if you picked the wrong device.

<img src="/docs-assets/ready-view.png" alt="ReadyView showing detected chip" />

## Flashing: progress bars

Pressing **Flash** moves to the **Flashing** view. You will see up to three
progress bars in sequence:

1. **Downloading firmware** — fetched from the GitHub release (or read
   from disk for local files). Skipped for already-cached releases.
2. **Downloading SPIFFS** — only when the release ships a SPIFFS image
   alongside the merged firmware.
3. **Writing to flash** — the actual chip write. This bar is the slow one
   (around 30–60 s for a typical build).

A `Do not unplug the ESP32 while flashing.` warning stays visible the
whole time. A **Cancel** button is available during the download phase
only; once `esptool` starts writing bytes, cancel is disabled — yanking
power mid-write is the fastest way to brick the chip.

The collapsible log at the bottom of the page shows raw `esptool` output
in real time. Useful when reporting issues.

<img src="/docs-assets/flashing-view.png" alt="FlashingView with progress bars" />

## Success: connect to the dash

When the write completes, the **Success** view appears with three
numbered steps:

1. **Disconnect from your home WiFi** — your laptop needs to leave its
   usual network so it can join the dash's access point.
2. **Connect to the `CANShift` access point** — the freshly flashed ESP32
   broadcasts its own SSID for first-time configuration.
3. **Open `canshift.local` in your browser** — that loads the Studio UI
   running on the dash itself.

If you picked an ECU profile other than **Blank**, the Success view also
shows a **Download signals.json** button. Until Phase 1b lands, you have
to upload that file via Studio on the dash so the ECU mapping ends up in
SPIFFS — see [ECU profile](/ecu-profile) for the why.

<img src="/docs-assets/success-view.png" alt="SuccessView with three steps" />

## What if it fails?

Any failure during connect, detection, or flashing drops you on the
**Failed** view with the error string, a `Retry` button (auto-focused),
and a downloadable log. Walk through [Troubleshooting](/troubleshooting)
for the common ones; if none of those match, download the log and attach
it to a GitHub issue.

## Screenshots needed

The image references on this page are placeholders. They should be filled
with:

- `unsupported-browser.png` — the unsupported-browser screen on Firefox or
  Safari.
- `channel-picker-default.png` — the Idle view showing Channel = Stable,
  Version = Latest.
- `ecu-profile-picker-open.png` — the ECU profile dropdown expanded with
  three or four options visible.
- `browser-port-picker.png` — the Chromium serial port-picker dialog.
- `ready-view.png` — the Ready view with a chip detected.
- `flashing-view.png` — mid-flash with the download bar full and the
  flash bar partial.
- `success-view.png` — the three-step success card.
