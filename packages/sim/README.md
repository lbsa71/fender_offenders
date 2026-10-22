# Shared simulation

`await initPhysics()` once before calling `createSimulation(map, options)` in either browser or server. This initializes the pinned Rapier 0.21.0 WASM module. The simulation has no DOM, rendering, transport, wall-clock, or audio dependency.

```ts
await initPhysics();
const sim = createSimulation(map, { mode: 'practice', trafficCount: 8, seed: 42 });
const car = sim.addPlayer({ playerId: 'local', nickname: 'Officer', sessionEpoch: 'local-1' });
sim.step(new Map([[car.entityId, {
  actions,
  sessionEpoch: 'local-1',
  sourceCommandSequence: 0,
}]]));
const confirmed = sim.snapshot('local');
const effects = sim.drainEvents();
sim.dispose();
```

`step` always advances exactly 1/60 second. Scheduling and the bounded catch-up accumulator belong to the app/server. Inputs are keyed by vehicle entity ID and are already admitted by the session adapter. Invalid action values and unknown vehicle IDs are ignored defensively. Epoch changes are trusted adapter operations: this API is not an untrusted transport boundary. The network adapter must reject spoofed membership/epochs, rate-limit input, and avoid accepting old commands. Repeated admitted commands preserve held analog/fire state; siren/recovery edges execute once per command identity.

The factory exposes `addPlayer`, `removePlayer`, `setConnection`, `startRound`, `rematch`, `authority`, `restoreAuthority`, `checkpoint`, `restore`, `drainEvents`, and `dispose`. `addPlayer` returns a copy of the spawned vehicle. `snapshot(playerId)` supplies that player's epoch, complete controller state and consumed-sequence boundary. All public snapshots/checkpoints are copied; mutating them does not mutate the live world. Checkpoints contain counters, RNG, timers, entities, creator, traffic routes and pursuit progress, and are rejected across map/config/match versions. Restoring clears pending presentation events. Replayed effects retain stable event IDs; replay callers suppress presentation until reconciliation completes.

`predictVehicle(map, vehicle, driver, actions, proxies?, gameplayConfig?)` advances one tick, returns fresh vehicle/controller state, and never emits combat or presentation events. Supply remote proxies from the matching replay tick. Its bounded kinematic contact response deliberately differs from a two-body authoritative contact. `restoreAuthority` is a convenience rebuild for a simulation-backed predictor; the pure helper is preferable for local movement prediction.

## Physics decision and measured scope

Rapier runs immutable map collision queries for projectile sweeps. A real WASM fixture verifies planar rigid-body locks under impulse/torque, body/static contact, ray queries and full snapshot restoration. Directly assigning velocity on a locked axis can bypass the intended planar constraint; the fixture therefore tests force/torque locking rather than assigning invalid Y velocity. Vehicle gameplay uses the architecture's permitted bounded planar contact model: oriented rectangular footprint, convex SAT separation, two movement substeps, bounded pair impulses, fixed translation plane and yaw. Static broad-phase bounds are cached. This keeps prediction restoration free of solver warm-start/contact history, and prevents rollovers or unbounded impact impulses.

This proves the selected Rapier module works headlessly and supports the chosen queries. It does not establish browser-WASM parity, dynamic Rapier versus bounded-controller equivalence, acceptable network contact divergence, or human driving quality. Those require the integrated browser/network gates. The arcade controller is shared in all modes and configurable through `GameplayConfig`; shipped collision dimensions are deliberately fixed to 1.9 m × 4.3 m and unsupported dimension changes fail early.

## Implemented rules

- Forward acceleration, deliberate brake/reverse transition, steering response, speed-sensitive yaw, handbrake grip, ordered dirt/grass surface overlays, static walls and bounded car contacts.
- Forward projectiles at 5 Hz, 70 m/s, 10 damage, 0.65 s life, Rapier wall blocking, relative-translation moving-target sweeps, owner immunity, single-hit removal, stable command/shot IDs and bounded entity/event pools.
- 100 health, three-second wreck respawn, clear authored spawns with blocked-spawn retry, two-second protection ending on fire, credit within five seconds, wreck statistics and recovery denial during recent damage/cooldown.
- Eight players, sixteen traffic cars, authored directed routes with jam relocation, lobby/countdown/five-minute round/results/rematch, creator reassignment and late joins. Equal scores remain tied; no tiebreaker is introduced.
- Practice has unarmed traffic targets and a persistent suspect. Remaining within eight metres at low relative speed for three seconds arrests the suspect and awards three points. Wrecked suspects can be arrested or respawn and resume pursuit; no permanent entity removal softlocks the challenge. Restarting practice creates a fresh challenge.

Traffic uses a small lane follower and bounded recovery; it is not general-purpose city navigation. Projectile rotation uses the target's start-of-tick footprint with relative translation; full rotating continuous shape collision is not implemented. Vehicle collisions do not cause health damage.

## Reproduce validation

From the repository root:

```powershell
node node_modules/vitest/vitest.mjs run packages/sim/src/core/simulation.test.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/tsx/dist/cli.mjs packages/sim/bench.ts
```

The suite contains 23 tests covering real Rapier, handling, replay equality, shared prediction, thin walls, surfaces, invalid maps/tuning, shot cadence and uniqueness, protection/wreck/respawn, simultaneous lethal hits, blocked spawns and admission, recovery, contacts, input edges, eight-player late join/reconnect, creator/round transitions, pursuit/respawn and disposal. These are automated headless checks, not claims of completed human, controller or browser acceptance. The separate real-network automated harness is documented in `tests/integration/README.md`.

Benchmark recorded 2026-10-22, Windows x64, Intel Core i7-1355U, Node v25.8.1: 18,600 ticks, eight scripted players, sixteen traffic cars, 12,227 gameplay events, final phase results. After 600 warm-up ticks, mean step 0.230 ms, p95 0.450 ms, p99 0.680 ms, maximum 2.628 ms. The benchmark drains events every tick and steps gameplay without rendering/transport/serialization. It measures one room on this development machine, not many-room capacity or reference-browser performance. Scripts issue deterministic steering/throttle/fire; they are not skilled aiming agents. Concurrent development tasks were active on the host. Cached broad-phase rejection removed a measured previous static-collision allocation bottleneck (the preceding implementation averaged 3.400 ms on the same scenario).
