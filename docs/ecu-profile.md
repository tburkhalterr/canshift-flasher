---
title: ECU profile
---

# ECU profile

The **ECU profile** dropdown in the Idle view picks the `signals.json` the
dash will use to decode CAN traffic from your ECU. The picker is
mandatory — the **Connect** button is disabled until you choose one — and
this page explains why, what each option does, and how to deal with the
Studio upload step.

## What an ECU profile is

A profile is a JSON document — `signals.json` — that maps raw CAN frames
to named signals (RPM, coolant temp, oil pressure, etc.) with the byte
positions, scale factors, units, and frame IDs the dash should expect.
The dash firmware does no decoding without one. It listens to the CAN
bus, but every frame is just opaque bytes until a signal map tells it
which bytes are RPM and which are coolant temp.

Without a profile, the dash boots, talks to the network fine, and shows
the configuration UI — but every gauge stays at zero.

## Why the dash needs one explicitly

Earlier firmware shipped with a hardcoded MaxxECU profile baked in.
Newer firmware is ECU-agnostic by design: it ships without any default
mapping so the same `.bin` works for every supported ECU. The trade-off
is that the user has to make the choice up front.

## Catalog

The dropdown is populated from `public/profiles/index.json` at page load.
The current catalog (Phase 1a) ships with three profiles:

| Slug          | Name                                          | Vendor   | CAN speed | Signals |
| ------------- | --------------------------------------------- | -------- | --------- | ------- |
| `maxxecu`     | MaxxECU MTune                                 | MaxxECU  | 500 kbps  | 18      |
| `obd2-mode01` | OBD-II (Mode 01, polled)                      | Generic  | 500 kbps  | 6       |
| `blank`       | Skip — push my own profile via Studio         | —        | 500 kbps  | 0       |

More profiles (the RealDash imports — Bosch MS series, Haltech, Link,
MoTeC, AEM, Holley, MegaSquirt, and others) will appear in the dropdown
as they land in the catalog. No flasher update is needed; the catalog is
fetched fresh every time.

<img src="/docs-assets/ecu-profile-picker-open.png" alt="EcuProfilePicker open" />

## "Skip" / Blank — when to use it

Pick **Skip — push my own profile via Studio** when:

- Your ECU is not in the catalog yet and you have your own
  `signals.json` ready to upload.
- You are testing the dash on a bench without a real ECU connected.
- You want to start fresh and define signals from Studio.

The Blank profile ships an empty `signals.json` — the dash boots normally
and the configuration UI works, but no signals decode until you upload
your own mapping.

## Upload via Studio (Phase 1a)

After a successful flash, the **Success** view shows a **Download
`signals.json` for &lt;profile name&gt;** button when you picked a non-Blank
profile. The current upload flow is:

1. Press **Download `signals.json` for ...** on the Success view.
2. Connect your laptop to the `CANShift` access point (step 2 of the
   Success view).
3. Open `canshift.local/` in your browser — that is Studio running on the
   dash.
4. In Studio, use the **Upload signals.json** control to push the file
   you just downloaded.
5. The dash writes the file to SPIFFS, restarts the signal decoder, and
   your gauges start updating.

<img src="/docs-assets/studio-upload-signals.png" alt="Studio upload signals.json" />

::: tip Phase 1b — injection during flash
The longer-term plan is to inject the chosen profile directly into the
SPIFFS partition during flashing, so the dash boots with the right
profile already in place and no Studio round-trip is needed. Tracked as
Phase 1b — until that ships, the manual upload step above is the
workflow.
:::

## Changing the profile later

The ECU profile is not locked to the firmware version. You can upload a
different `signals.json` via Studio at any time without re-flashing the
ESP32. The flasher's picker is only relevant at flash time so the
Success view can hand you the right file to upload.

If your ECU is not in the catalog and you want it added, open an issue
against the
[canshift-flasher repo](https://github.com/tburkhalterr/canshift-flasher)
with the ECU's CAN broadcast spec.

## Screenshots needed

- `ecu-profile-picker-open.png` — the ECU profile dropdown expanded.
- `studio-upload-signals.png` — the Studio web UI on the dash, showing
  the upload control for `signals.json`. Lives in the
  `canshift-studio` repo; needs a fresh capture from the deployed Studio.
