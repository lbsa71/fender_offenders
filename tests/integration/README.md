# Live room integration evidence

Run from the repository root:

```powershell
node node_modules/vitest/vitest.mjs run tests/integration packages/sim/src/core/simulation.test.ts
```

Baseline observed on 2026-10-22: three test files, 32 tests passed in 13.16 seconds on Windows x64 / Node v25.8.1. This consisted of 23 simulation tests, eight real Colyseus scenarios and one TCP harness ordering regression. Three safety regressions were subsequently added using the strict TDD cycle documented below. `rooms.test.ts` starts the actual `createGameServer` factory, connects actual Colyseus SDK clients, consumes the production compact snapshot format through `unpackSnapshot`, and closes all rooms/server after the run. Ports 2677 and 2678 must be free; the independent TCP echo regression uses 2680 and 2681.

The real-room scenarios verify:

- Eight clients join one room, receive unique player vehicles/epochs and coherent participant lists; a ninth is rejected.
- Protocol, map and gameplay mismatches, and empty names, are rejected by the real admission path.
- Duplicate/stale sequence numbers, another client's epoch, invalid/nonfinite actions, excess command batches, huge sequence jumps and fabricated state/damage payloads cannot change authoritative health or boost movement.
- Input backlog is bounded and discarded-command acknowledgments/reset reasons reach the client. A stalled sender cannot leave its automatic weapon firing indefinitely.
- Ten unique authoritative hits produce one wreck/point, with at least twelve ticks between shots; the victim respawns after three real seconds with fresh protection and a discontinuity increment.
- Terminating an established server-side WebSocket triggers the SDK's real reconnect flow. Other clients see a reconnect reservation; identity is retained, epoch changes, stale epoch commands are rejected and the fresh epoch can start at sequence zero.
- Only the creator starts a round, late joins receive its current phase/protection, creator departure preserves the room, tied results stay tied, and the oldest remaining player controls rematch.
- Delayed/jittered reliable traffic with a 550 ms byte-stream stall retains ordered authoritative ticks, bounded speed, fire cadence and post-neutralization safety.

Combat/lifecycle tests place cars and shorten round transitions through a **trusted in-process server checkpoint fixture**. They never authorize client positions, health, damage or hit claims. Inputs, snapshots, acknowledgments, reconnects and events still traverse real sockets. The three-second wreck respawn uses actual elapsed server time. Full five-minute round progression is separately covered by the deterministic 18,600-tick benchmark in `packages/sim/bench.ts`; the real room lifecycle fixture does not wait five wall-clock minutes.

The TCP proxy introduces 45 ± 15 ms per-direction delay and one 550 ms stall in both directions. It queues bytes in order and does not discard messages. This tests reliable transport latency/backlog behavior. It is not packet-loss emulation, a substitute for OS-level TCP impairment, a browser correction trace, a remote geographic network, or a human playability test. The separate echo regression proves that timer granularity cannot reorder same-deadline chunks in the harness.

The first live eight-client run exposed a real admission race: moving traffic could temporarily occupy the last safe spawn, rejecting a player despite a free room slot. The simulation now admits that player as a non-colliding respawning participant and retries safe placement; a regression test covers occupancy clearing. The first impairment harness exposed a timer-rounding issue in the proxy itself; one FIFO pump per direction and the exact-byte echo regression corrected that harness bug before accepting impairment evidence.

Browser/OS/controller acceptance, human handling/visual review, extended reconnect expiry, operating-system packet impairment, client prediction contact divergence and multi-room density remain separate integration/release gates. This report does not mark them passed.

## Strict TDD safety-braking regression

After the repository adopted strict TDD, three focused real-client/server tests were written before changing server behavior: `safely brakes stale controls without reversing or continuing fire`, and the corresponding `neutralize` and `disconnect` cases. A trusted fixture gives the car 12 m/s forward momentum and an accepted fire command; each case then observes 75 authoritative ticks without fresh controls, including an actual WebSocket termination for disconnect.

Red was observed with the original server: all three tests failed specifically because the car still traveled at 6.635/6.685/6.685 m/s instead of below 3 m/s. The clean red rerun had no setup or teardown failures. The smallest production change sets `handbrake: true` only in the server's safety fallback input; fresh commands and the existing short jitter hold keep their actions. Explicit neutralize already clears held/queued input and therefore enters that fallback immediately. A held reverse action is never used for safety braking.

Green was observed by rerunning those exact tests: three passed. The full affected integration suite then passed, two files / 12 tests in 21.72 seconds, and `tsc --noEmit` passed. The tests also assert nonnegative forward velocity throughout the stopping observation and no later stale-fire events. The earlier baseline predates this TDD cycle; no historical red phase is claimed for it.

```powershell
node node_modules/vitest/vitest.mjs run tests/integration/rooms.test.ts -t 'safely brakes'
node node_modules/vitest/vitest.mjs run tests/integration
node node_modules/typescript/bin/tsc --noEmit
```
