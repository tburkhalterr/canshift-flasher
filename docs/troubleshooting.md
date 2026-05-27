---
title: Troubleshooting
---

# Troubleshooting

Common errors users hit when flashing, and how to recover from them. If
your problem is not listed, download the log from the Failed view and
attach it to an issue on the
[canshift-flasher repo](https://github.com/tburkhalterr/canshift-flasher).

## "Flash ID is ffffff"

The flasher could read from the chip's SPI bus but every byte came back
as `0xFF`, which means no flash chip is responding. Causes, in
descending likelihood:

- **Insufficient USB power.** Cheap USB hubs and laptop ports under load
  can drop the rail below the ESP32 module's brownout threshold while
  reading flash. Plug directly into the laptop, or use a powered hub.
- **GPIO interference.** Wires on GPIO0, GPIO2, GPIO15, or GPIO5 (the
  strapping pins) being pulled the wrong way by an external circuit can
  put the chip into a state where flash reads return junk. Disconnect
  everything except USB before flashing.
- **Dead module.** Rare, but if a board was previously over-volted or
  reverse-polarised the flash chip itself can be damaged. Try another
  ESP32.

## "Invalid head of packet" / "No serial data received"

The bootloader handshake worked but the SLIP frames coming back from the
chip are garbled. This used to be a frequent failure on long or noisy
USB cables — the flasher now auto-falls-back to lower baud rates when it
sees this error, so it should self-recover.

If it still happens:

- Replace the USB cable with a known-good short one.
- Plug directly into the laptop (skip the dock or hub).
- Move away from other USB 3.0 devices on the same controller — USB 3.0
  is famously RF-noisy in the 2.4 GHz band.

## "Could not enter ESP32 bootloader after 3 attempts"

The DTR/RTS auto-reset handshake did not put the chip into download
mode. The flasher retries three times before giving up.

Recovery sequence:

1. Hold the **BOOT** button on the ESP32 board.
2. Tap the **EN** / **RST** button while still holding BOOT.
3. Release BOOT.
4. In the flasher, press **Retry** on the Failed view (or **Re-select
   port** on the Ready view if it stalled there).

If the board has no BOOT button (some bare modules don't): unplug it,
short GPIO0 to GND with a jumper, plug it back in, press Retry, then
remove the jumper.

## "Failed to fetch" / Content Security Policy errors

The flasher uses a Vercel-side proxy and a strict CSP to avoid mixed
content and rate-limit issues. If you see `Failed to fetch` or a CSP
violation in the browser console:

- **Hard refresh** (Cmd-Shift-R / Ctrl-Shift-R) — most often this is a
  stale service worker still enforcing an older CSP. The SW versions
  itself per build, so a refresh kicks the new one in.
- **Clear site data** for `canshift.tmbk.ch` in your browser if the
  hard refresh does not help.

## "Latest release has no firmware asset matching the merged image pattern"

The selected release on GitHub does not have an asset with a name the
flasher recognises (it looks for `*.merged.bin` or similar). This was a
real bug for a while (#173) and is fixed — make sure you are on the
latest deployment of the flasher.

If you are flashing a release you cut yourself, name the merged image
to match the pattern in
[`src/lib/releases.ts`](https://github.com/tburkhalterr/canshift-flasher/blob/main/src/lib/releases.ts),
or use the [Local firmware](/local-firmware) path instead.

## GitHub rate limit (HTTP 403)

Unauthenticated GitHub API requests are capped at 60/hour per IP. If a
shared corporate IP or a CI runner has burned through that, the
flasher's channel/version dropdowns refuse to load and show a rate-limit
banner.

Options:

- Wait up to an hour for the limit to reset.
- Use [Local firmware](/local-firmware) — it does not touch the GitHub
  API at all. Download the `.bin` and matching `.sha256` from the
  release page directly (browsers handle that as a normal HTTP fetch,
  not an API call).

## "USB connection lost mid-flash"

The serial port disconnected while bytes were being written. The dash is
probably in an inconsistent state but is not bricked — the bootloader
itself lives in mask ROM and survives any flash content.

Recovery:

1. Unplug and re-plug the ESP32.
2. Press **Retry** on the Failed view.
3. If Retry keeps failing, press **Start over** to go back to Idle and
   re-pick the port. Use the BOOT-button sequence under [Could not
   enter ESP32 bootloader](#could-not-enter-esp32-bootloader-after-3-attempts)
   if needed.

If the disconnect happens reliably at the same point, the cable or hub
is the cause — see the next section.

## USB cable and hub recommendations

The single biggest source of flashing problems is a bad USB cable.
"Charging only" cables look identical to data cables but only wire up
power and ground. Specific recommendations:

- Use a **USB 2.0 data cable** rated for at least 500 mA. USB-IF
  compliant cables almost always work.
- Keep the cable **short** — ideally under 1 m. Long cables drop voltage
  and pick up RF.
- Plug **directly into the laptop**. If you must use a hub, use a
  **powered** USB 2.0 hub. Avoid passing through USB-C docks — they
  add latency and sometimes drop bytes during serial bursts.
- On Apple Silicon laptops, avoid the side ports if you are also
  charging on the other side simultaneously — there is a documented PHY
  noise issue with simultaneous high-current charging.

## Still stuck?

Open an issue with:

1. The exact error message from the Failed view.
2. The downloaded log (button on the Failed view).
3. Browser and OS version.
4. ESP32 board model and USB cable / hub setup.

[Open a new issue](https://github.com/tburkhalterr/canshift-flasher/issues/new)
