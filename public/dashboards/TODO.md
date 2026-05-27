# Dashboard catalog — TODO

Phase 1a ships the infrastructure plus five entries. Same honesty policy as
the ECU profiles catalog: don't ship layouts that lie about coverage.

Status:

- `blank` — real. Empty single-page dashboard, no widgets. Always pick when
  you plan to design from scratch in Studio.
- `track-day` — real. Lap timer, gear, coolant, oil temp, battery, RPM bar.
  Uses signals that ship in the firmware demo (`coolant_temp_c`,
  `oil_temp_c`, `battery_volts`, `rpm`, `gear`) plus the built-in `timer`
  widget. Works out of the box if your `signals.json` exposes those names.
- `dyno` — real. RPM arc + boost arc + AFR / ECT / TPS / IAT bars. Uses
  baseline signals (`rpm`, `map_kpa`, `lambda_1`, `coolant_temp_c`,
  `throttle_pos`, `iat_c`).
- `cruise` — WIP. Speed + fuel + battery only. Odometer is missing — the
  baseline signal catalog doesn't expose one yet. Re-bind in Studio if
  your ECU broadcasts an odo signal.
- `drift` — WIP. References placeholder signals (`steering_angle_deg`,
  `lateral_g`, `handbrake_engaged`) that aren't in the baseline catalog.
  The layout renders fine but those gauges will show "invalid" until you
  point them at the right CAN frames in Studio.

Follow-ups (open an issue per layout, reference CANShift#1151):

- Land an IMU signal extension so `lateral_g` is a first-class signal name.
- Add steering-angle decoding to the catalog (vehicle-specific frames).
- Promote `cruise` to "real" once odometer support lands.
