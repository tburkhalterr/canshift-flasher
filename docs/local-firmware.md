---
title: Local firmware
---

# Local firmware

The **Or flash a local file** disclosure in the Idle and Ready views lets
you flash a `.bin` from disk instead of pulling a build from GitHub
Releases. This page covers when to use it, the SHA-256 verification step,
and what happens on mismatch.

## When you would use this

- You are **building firmware yourself** out of the
  [canshift-firmware](https://github.com/tburkhalterr/canshift-firmware)
  repo and want to flash the merged image you just compiled.
- GitHub is **rate-limiting** the page (`HTTP 403`) — the local path
  bypasses the Releases API entirely.
- The flasher is **offline** (no internet, but USB to the dash still
  works).
- You want to flash a **custom build** an engineer or contractor sent
  you out of band.

Regular users updating to the latest release should stick with the
channel/version dropdowns — they are easier and include integrity
checking automatically.

## File picker

Expand **Or flash a local file** and click the dashed drop zone labelled
**Click to choose a .bin firmware file**. The system file picker opens
filtered to `.bin` files (and the generic `application/octet-stream`
fallback so unmarked binaries still show up).

The flasher refuses files larger than **16 MiB**, which is well above any
realistic dash firmware size.

<img src="/docs-assets/local-firmware-collapsed.png" alt="LocalFirmwareInput collapsed" />

## SHA-256 verification

After picking a file, the flasher reads it into memory and computes its
SHA-256 hash locally — in your browser, no upload. The hash is shown
under **Computed SHA-256** so you can copy it for the record.

<img src="/docs-assets/local-firmware-loaded.png" alt="LocalFirmwareInput with file loaded" />

### Expected SHA-256 input

Below the computed hash, the **Expected SHA-256** field is where you tell
the flasher what the hash should be:

- **Paste a hex digest** — exactly 64 hex characters. The flasher
  validates the format as you type; an invalid string shows in red.
- **Load a `.sha256` file** — the **…or pick a .sha256 file** link below
  the input accepts a `.sha256` or `.txt` sidecar (the conventional
  `sha256sum`-style format: digest, two spaces, filename). The flasher
  parses out just the digest.

The verification states are:

- **Verified — checksum matches.** Green. The file is safe to flash.
- **Mismatch — the file does not match the expected SHA-256. Refusing
  to flash.** Red. The flash button stays disabled. Either you have the
  wrong file or the wrong digest — re-download from your trusted source
  and try again.
- **No checksum provided — flashing unverified bytes is your
  responsibility.** Grey. The flasher will let you proceed, but you are
  the one vouching for the file.

## Mismatch behaviour

On a digest mismatch, the **Flash** button stays disabled. There is no
override — the flasher will not write bytes it has been told do not
match. This is a deliberate safety against confusing two firmware builds
with similar filenames, or downloading a corrupted file.

To recover: clear the file with **Remove**, re-download the firmware
from a trusted source, and reload it.

## Removing a local file

The **Remove** button in the top-right of the loaded-file card clears the
selection and switches the picker back to the channel/version dropdowns.
You can also collapse the disclosure — but the file is still selected
until you press **Remove**.

## Relation to channel picker

The channel/version dropdowns and the local file picker are mutually
exclusive: if a local file is selected, the channel picker disappears,
and the **Flash** button is labelled `Flash <filename>` instead of
`Flash <tag>`. Re-selecting from the dropdowns requires clearing the
local file first.

## Related pages

- [Flash workflow](/flash-workflow) — the full flow, with screenshots of
  each state.
- [Troubleshooting](/troubleshooting) — what to do if a flash with a
  local file still fails (cable issues, bootloader retries, etc.).

## Screenshots needed

- `local-firmware-collapsed.png` — the **Or flash a local file**
  disclosure closed, in the Idle view.
- `local-firmware-loaded.png` — the disclosure open with a file loaded,
  showing the computed SHA-256, expected SHA-256 input, and the
  Verified / Mismatch banner.
