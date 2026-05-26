# Profile catalog — TODO

Phase 1a ships the infrastructure plus three entries:

- `maxxecu` — MaxxECU MTune baseline (copied from canshift-firmware/data/config/signals.json)
- `obd2-mode01` — minimal OBD-II Mode 01 polled profile (RPM, speed, throttle, coolant, IAT, battery)
- `blank` — empty signals.json escape hatch

The catalog should not lie about coverage. The following ECUs need real
protocol research before being shipped — DO NOT add skeleton entries until
the frame IDs, byte positions and scaling factors are verified against the
respective ECU's CAN output documentation:

- Haltech (Elite series broadcast frames)
- Link ECU (G4+ / G4X CAN streams)
- AEM Infinity / AEM CAN spec
- Adaptronic Select / Modular CAN

Open a follow-up issue per ECU; reference CANShift#1151.
