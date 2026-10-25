# Live room integration evidence

Reviewed: 2026-10-25 for `arcade-v9` / protocol 2. *Real sockets, real authority, and no accepting a client's handwritten claim that it has 900 horsepower.*

Run from the repository root:

```powershell
pnpm test:integration
pnpm exec vitest run packages/sim/src/core/simulation.test.ts
```

Historical baseline observed on 2026-10-22: three files, 32 tests passed in 13.16 seconds on Windows x64 / Node v25.8.1. This consisted of 23 simulation tests, eight real Colyseus scenarios and one TCP ordering regression; it is not the current suite count. Later safety and campaign/combat suites extend that evidence. The 2026-10-24 repository aggregate passed 465 tests across 54 files, including these integration tests; see [execution status](../../spec/EXECUTION_STATUS.md).

`rooms.test.ts` starts the actual `createGameServer` factory, connects Colyseus SDK clients, decodes production compact snapshots and closes rooms/server after the run. Ports 2677 and 2678 must be free; the TCP echo regression uses 2680 and 2681. Other files use their own dedicated test ports. Run Vitest through its configured suite rather than starting conflicting ad-hoc copies.

The real-room scenarios verify:

- Eight clients join one room, receive unique player vehicles/epochs and coherent participant lists; a ninth is rejected.
- Protocol, map and gameplay mismatches, and empty names, are rejected by the real admission path.
- Duplicate/stale sequence numbers, another client's epoch, invalid/nonfinite actions, excess command batches, huge sequence jumps and fabricated state/damage payloads cannot change authoritative health or boost movement.
- Input backlog is bounded and discarded-command acknowledgments/reset reasons reach the client. A stalled sender cannot leave its automatic weapon firing indefinitely.
- Ten paired volleys produce twenty unique 5-damage hits and one patrol wreck/point, with at least twelve ticks between volleys; the victim respawns after three real seconds with fresh protection and a discontinuity increment.
- Terminating an established server-side WebSocket triggers the SDK's real reconnect flow. Other clients see a reconnect reservation; identity is retained, epoch changes, stale epoch commands are rejected and the fresh epoch can start at sequence zero.
- Any connected member starts a campaign dispatch, including alone; late joins receive its current phase/protection, creator departure preserves the room, tied results stay tied, and any connected member can advance campaign results.
- Delayed/jittered reliable traffic with a 550 ms byte-stream stall retains ordered authoritative ticks, bounded speed, fire cadence and post-neutralization safety.

Combat/lifecycle tests place cars and shorten round transitions through a **trusted in-process server checkpoint fixture**. They never authorize client positions, health, damage or hit claims. Inputs, snapshots, acknowledgments, reconnects and events still traverse real sockets. The three-second wreck respawn uses actual elapsed server time. Full five-minute round progression is separately covered by the deterministic 18,600-tick benchmark in `packages/sim/bench.ts`; the real room lifecycle fixture does not wait five wall-clock minutes.

The TCP proxy introduces 45 ± 15 ms per-direction delay and one 550 ms stall in both directions. It queues bytes in order and does not discard messages. This tests reliable transport latency/backlog behavior. It is not packet-loss emulation, a substitute for OS-level TCP impairment, a browser correction trace, a remote geographic network, or a human playability test. The separate echo regression proves that timer granularity cannot reorder same-deadline chunks in the harness.

Current integration files also verify saved six-car selection and countdown locks, independent pursuit winners, shared campaign arrest/wreck progression and casefiles, connected-member next briefing, sparse physical scenery and real armed-target shots/grenades for both peers and a late joiner. [Invite restart/race tests](../hosting/invite-links.test.ts) and [the production facade](../prediction/README.md) cover additional real adapters outside this directory. Generic fixtures can omit campaign state; production rooms explicitly enable it.

The first live eight-client run exposed a real admission race: moving traffic could temporarily occupy the last safe spawn, rejecting a player despite a free room slot. The simulation now admits that player as a non-colliding respawning participant and retries safe placement; a regression test covers occupancy clearing. The first impairment harness exposed a timer-rounding issue in the proxy itself; one FIFO pump per direction and the exact-byte echo regression corrected that harness bug before accepting impairment evidence.

Browser/OS/controller acceptance, human handling/visual review, extended reconnect expiry, operating-system packet impairment, client prediction contact divergence and multi-room density remain separate integration/release gates. This report does not mark them passed.

Next work is ordered in [the acceptance queue](../../IMPLEMENTATION_PLAN.md#next-acceptance-work). Keep current regression greens and report newly observed RED/GREEN for future fixes. The strict-TDD record below is historical evidence, not a red phase claimed for this documentation refresh.

## Strict TDD safety-braking regression

After the repository adopted strict TDD, three focused real-client/server tests were written before changing server behavior: `safely brakes stale controls without reversing or continuing fire`, and the corresponding `neutralize` and `disconnect` cases. A trusted fixture gives the car 12 m/s forward momentum and an accepted fire command; each case then observes 75 authoritative ticks without fresh controls, including an actual WebSocket termination for disconnect.

Red was observed with the original server: all three tests failed specifically because the car still traveled at 6.635/6.685/6.685 m/s instead of below 3 m/s. The clean red rerun had no setup or teardown failures. The smallest production change sets `handbrake: true` only in the server's safety fallback input; fresh commands and the existing short jitter hold keep their actions. Explicit neutralize already clears held/queued input and therefore enters that fallback immediately. A held reverse action is never used for safety braking.

Green was observed by rerunning those exact tests: three passed. The full affected integration suite then passed, two files / 12 tests in 21.72 seconds, and `tsc --noEmit` passed. The tests also assert nonnegative forward velocity throughout the stopping observation and no later stale-fire events. The earlier baseline predates this TDD cycle; no historical red phase is claimed for it.

```powershell
node node_modules/vitest/vitest.mjs run tests/integration/rooms.test.ts -t 'safely brakes'
node node_modules/vitest/vitest.mjs run tests/integration
node node_modules/typescript/bin/tsc --noEmit
```

Unified-room checks cover authoritative solo pause, live backup joining, 15-minute empty retention, reserved-seat protection and oldest-empty capacity eviction. Controlled-clock inactivity checks ignore neutral packets and heartbeat traffic. Fixtures explicitly dispose their owned retained worlds during teardown. See [room sessions](../../spec/ROOM_SESSIONS.md).
