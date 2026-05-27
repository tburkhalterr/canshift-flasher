---
title: Overview
---

# CANShift Flasher — Documentation

The CANShift Flasher is a browser-based tool that writes the dash firmware
onto an ESP32 over USB. These pages cover the full flow end-to-end, plus the
ECU profile picker, local-file flashing, and the most common errors.

## What you need

- A Chromium-based browser (Chrome, Edge, Brave, Arc, Opera). The flasher
  uses [Web Serial](https://developer.mozilla.org/docs/Web/API/Web_Serial_API),
  which Firefox and Safari do not implement.
- An ESP32 board (any DevKit variant works) connected over USB-C / USB Micro-B.
- A USB cable that supports data, not just power. Cheap "charging cables"
  often miss the data lines — see [Troubleshooting](/troubleshooting).

## Where to start

- New to the flasher? Read the [Flash workflow](/flash-workflow) page first —
  it walks through every screen in order.
- Already familiar with the flow but stuck on the ECU dropdown? Jump to
  [ECU profile](/ecu-profile).
- Flashing a build you compiled yourself or downloaded manually? See
  [Local firmware](/local-firmware).
- Got an error message? Check [Troubleshooting](/troubleshooting).

## Permanent links

Every page in this site has a stable URL — feel free to link them from
support emails, GitHub issues, or chat. The slugs match the filenames and
will not change.

## Source

This documentation lives in the
[canshift-flasher](https://github.com/tburkhalterr/canshift-flasher) repo
under `docs/`. Use the "Edit this page on GitHub" link in the footer to
suggest a change.
