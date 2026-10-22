# Online prediction facade evidence

```powershell
node node_modules/vitest/vitest.mjs run packages/net-client/src/index.test.ts tests/prediction/online-session.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

Observed 2026-10-22 on Windows x64 / Node v25.8.1: two files, ten tests passed in 6.11 seconds; TypeScript also passed. The real facade tests start the production server factory on dedicated port 2691. They connect through the production `createOnlineSession` adapter and compact wire snapshots. They do not replace the SDK, scheduler, transport, prediction helper, or acknowledgement loop with mocks.

Three existing interpolation behaviors have passing baseline coverage: positional interpolation and the shortest yaw arc across ±π; independent returned copies; immediate snapping on teleport/respawn discontinuities or wreck status transitions. No historical TDD red phase is claimed for baseline coverage.

Seven real facade behaviors are verified:

- Submitting one throttle command synchronously moves the local render frame while the authoritative tick, pose and acknowledgement remain unchanged. The pending command later disappears on a real acknowledgement.
- Thirteen synchronous submissions trigger the bounded outgoing/prediction reset, and the subsequent real server resync clears pending movement and restores the confirmed pose.
- Terminating the established WebSocket produces a reconnect status, clears pending commands, ignores submissions while reconnecting, preserves vehicle/player identity, and resumes sequence zero in a new authoritative epoch.
- Content mismatch, missing room, unavailable endpoint and invalid nickname surface through typed status errors.

## Observed TDD regression

The new invalid-nickname test first failed before production changes: the server rejected `invalid-name`, but the facade emitted status reason `network-error`. The eight other initial baseline checks passed, and the unavailable-endpoint baseline subsequently passed independently. This was a behavior failure, not an import, fixture or timeout failure.

After reporting the failure and coordinating with the integration owner, the smallest production change added `invalid-name` recognition in the connection error mapping. Rerunning the complete affected group produced ten passing tests, and the TypeScript check passed. No server, app, shared contract, rendering or deployment source was changed by this fix.

The app's separate error presentation/catch behavior requires its own browser regression. These tests establish facade outcomes; they do not certify visual correction quality, stressed remote car contact divergence, browser suspension, expired reconnect reservations, or human network playability.
