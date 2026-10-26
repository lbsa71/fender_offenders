# Online prediction facade evidence

Reviewed: 2026-10-25 for `arcade-v10` / protocol 2. *Predict the car. Do not predict that an unrun acceptance gate will probably be fine.*

```powershell
pnpm exec vitest run packages/net-client/src tests/prediction
node node_modules/typescript/bin/tsc --noEmit
```

Historical baseline, 2026-10-22 on Windows x64 / Node v25.8.1: two files, ten tests passed in 6.11 seconds; TypeScript passed too. This is not the current suite count. Real facade tests start the production server factory on dedicated port 2691 and connect through `createOnlineSession` and compact snapshots. They do not replace the SDK, scheduler, transport, predictor or acknowledgement loop with mocks.

Three existing interpolation behaviors have passing baseline coverage: positional interpolation and the shortest yaw arc across ±π; independent returned copies; immediate snapping on teleport/respawn discontinuities or wreck status transitions. No historical TDD red phase is claimed for baseline coverage.

The original facade checks cover:

- Submitting one throttle command synchronously moves the local render frame while the authoritative tick, pose and acknowledgement remain unchanged. The pending command later disappears on a real acknowledgement.
- Thirteen synchronous submissions trigger the bounded outgoing/prediction reset, and the subsequent real server resync clears pending movement and restores the confirmed pose.
- Terminating the established WebSocket produces a reconnect status, clears pending commands, ignores submissions while reconnecting, preserves vehicle/player identity, and resumes sequence zero in a new authoritative epoch.
- Content mismatch, malformed invite, unavailable endpoint and invalid nickname surface through typed status errors. Valid reusable invites now recreate vanished rooms, superseding the original missing-room assumption.

Current coverage additionally verifies bounded intentional disposal without reconnect retries, already-reconnecting or unanswered-close cleanup, nonce echoes/shared ping, hosting capacity versus full room, reusable invite/reservation retries, explicit initial baseline handshake, sparse same-match prop reconstruction and monotonic buffered playback. Campaign prediction freezes briefings/countdowns/results. Projectile presentation uses local prediction or buffered remote clocks; grenade warnings use a monotonic authority clock and reconstruct late-join hazards without throw events. Relevant tests live in `packages/net-client/src/`, this directory and real integration suites.

The 2026-10-24 full repository run passed 465 tests across 54 files, including these checks. App pacing independently limits online frames to four input ticks while allowing fifteen practice ticks; it does not increase network queue capacity. Current counts and historical handoffs are indexed in [execution status](../../spec/EXECUTION_STATUS.md).

## Observed TDD regression

The new invalid-nickname test first failed before production changes: the server rejected `invalid-name`, but the facade emitted status reason `network-error`. The eight other initial baseline checks passed, and the unavailable-endpoint baseline subsequently passed independently. This was a behavior failure, not an import, fixture or timeout failure.

After reporting the failure and coordinating with the integration owner, the smallest production change added `invalid-name` recognition in the connection error mapping. Rerunning the complete affected group produced ten passing tests, and the TypeScript check passed. No server, app, shared contract, rendering or deployment source was changed by this fix.

The app's separate error presentation/catch behavior requires its own browser regression. These tests establish facade outcomes; they do not certify visual correction quality, stressed remote car contact divergence, browser suspension, expired reconnect reservations, or human network playability.

Next work under S04/N03–N05/Q03–Q05 is actual correction-distance/angle traces for free driving and contacts, OS loss/stall/expiry scenarios and sustained eight-player/multi-room evidence. Follow [the acceptance queue](../../IMPLEMENTATION_PLAN.md#next-acceptance-work); a smooth localhost lap is useful, but the internet has its own driving style.

Unified-room checks cover authoritative solo pause, live backup joining, 15-minute empty retention, reserved-seat protection and oldest-empty capacity eviction. Controlled-clock inactivity checks ignore neutral packets and heartbeat traffic. Fixtures explicitly dispose their owned retained worlds during teardown. See [room sessions](../../spec/ROOM_SESSIONS.md).

The 2026-10-26 motion follow-up removes the six-tick acknowledgment gate from healthy local input. Controlled-clock regressions cover between-step motion, logical times within a delayed input batch, 350/900 ms latency, matching-authority phase stability, slow/fast correction recovery, stationary convergence, displayed-versus-unshown projection and 300 ms outage hold. Remote checks cover the 200 ms buffer, 300 ms extrapolation, clock slewing, late trajectory blending, explicit teleports and multi-second blackout recovery. The browser regression observes the actual delivered render frame under ordered latency/jitter without sampling twice or replacing the renderer, and checks frame-to-frame velocity consistency as well as forward continuity.

The artificial 20 Hz authority scenario now permits 300 ms at patrol top speed (8.4 m) instead of the former 3 m visual lead policy, following the user's explicit priority for immediate local controls. It additionally requires settled lead over six seconds, while retaining zero queue-reset and backward-jump guards. A separate 60 Hz run keeps the tighter 3 m bound. This is a deliberate acceptance change, not evidence that the old bound still passes. Full contact, minimum-device and sustained-host acceptance remain open; the steering wheel has stopped waiting for paperwork, but the paperwork remains.

Linux CI subsequently exposed a sustained rate mismatch hidden by the local timer cadence: the first half-speed correction cap let lead exceed 20 m. A deterministic 16 ms input / 50 ms authority / 150 ms publication fixture reproduces the failure independently of OS timers. Timed and untimed callers must now both settle below the unchanged 8.4 m bound, retain forward motion and apply fresh steering immediately. The 80% moving correction cap repays that rate mismatch without reversing the car.
