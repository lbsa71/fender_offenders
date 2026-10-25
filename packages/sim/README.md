# Shared simulation

Reviewed: 2026-10-25 for `arcade-v10` / protocol 2. *Sixty ticks per second, with no allowance for creative accounting.*

`await initPhysics()` once before calling `createSimulation(map, options)` in either browser or server. This initializes the pinned Rapier 0.21.0 WASM module. The simulation has no DOM, rendering, transport, wall-clock, or audio dependency.

The implementation delegates WASM startup to `@fender/physics`, whose single promise is also used by the renderer's cosmetic debris adapter. Each world remains separately owned; debris initialization/disposal cannot invalidate authority scenery. `tests/integration/physics-startup.test.ts` checks this boundary with real native worlds. The public simulation initialization API is unchanged.

```ts
await initPhysics();
const sim = createSimulation(map, { mode: 'practice', trafficCount: 8, seed: 42, pursuit: true, campaign: true });
const car = sim.addPlayer({ playerId: 'local', nickname: 'Officer', sessionEpoch: 'local-1' });
sim.startRound('local'); // begins the three-second countdown; map needs authored lanes
sim.step(new Map([[car.entityId, {
  actions,
  sessionEpoch: 'local-1',
  sourceCommandSequence: 0,
}]]));
const confirmed = sim.snapshot('local');
const effects = sim.drainEvents();
sim.dispose();
```

`step` always advances exactly 1/60 second. Scheduling belongs to the app/server. The app's `planFrame` permits up to fifteen menu-preview/fixture ticks for a slow frame, four network input ticks, and no accumulated time while paused; the server's catch-up remains independently capped at four ticks. Inputs are keyed by vehicle entity ID and already admitted by the session adapter. Invalid action values and unknown vehicle IDs are ignored defensively. Epoch changes are trusted adapter operations: this API is not an untrusted transport boundary. The network adapter rejects spoofed membership/epochs, rate-limits input, and avoids old commands. Repeated admitted commands preserve held analog/fire state; siren/recovery edges execute once per command identity.

The factory exposes `addPlayer`, `removePlayer`, `setConnection`, `setPlayerVehicle`, `startRound`, `rematch`, `authority`, `restoreAuthority`, `checkpoint`, `restore`, `drainEvents`, and `dispose`. `addPlayer` returns a copy of the spawned vehicle. `snapshot(playerId)` supplies that player's epoch, complete controller state and consumed-sequence boundary. All public snapshots/checkpoints are copied; mutating them does not mutate the live world. Checkpoints contain counters, RNG, timers, entities, creator, traffic routes and pursuit progress, and are rejected across map/config/match versions. Restoring clears pending presentation events. Replayed effects retain stable event IDs; replay callers suppress presentation until reconciliation completes.

Player bodies share six profiles in `@fender/contracts`: maximum health, forward speed, acceleration, steering and grip scale room overrides relative to patrol. Civilian traffic keeps baseline values; campaign targets receive their assigned profile armor and authored tactics. `setPlayerVehicle(playerId, bodyId)` accepts known bodies only in campaign/multiplayer briefings, resets velocity/controller/health and increments discontinuity without adding protection. Legacy noncampaign practice allows changes while active, but a wreck cannot select its way back to life. See [BALANCE.md](BALANCE.md) for dated measurements and automated guardrail limits.

`predictVehicle(map, vehicle, driver, actions, proxies?, gameplayConfig?, serverTick?)` advances one tick, returns fresh vehicle/controller state, and never emits combat or presentation events. Supply remote proxies from the matching replay tick. The optional tick defaults to the driver's last simulated tick plus one; the online facade supplies the snapshot/replay clock explicitly. Shared accepted-volley recoil updates speed, recoverable steering/grip load, firing cooldown and shot ordinal. Phase gating and shot acceptance remain authoritative; the facade disables predicted firing outside play and reconciles rejected predictions. Its bounded kinematic contact response deliberately differs from a two-body authoritative contact. `restoreAuthority` is a convenience rebuild for a simulation-backed predictor; the pure helper is preferable for local movement prediction.

## Physics decision and measured scope

Rapier runs immutable map collision queries for projectile sweeps. A real WASM fixture verifies planar rigid-body locks under impulse/torque, body/static contact, ray queries and full snapshot restoration. Directly assigning velocity on a locked axis can bypass the intended planar constraint; the fixture therefore tests force/torque locking rather than assigning invalid Y velocity. Vehicle gameplay uses the architecture's permitted bounded planar contact model: oriented rectangular footprint, convex SAT separation, two movement substeps, bounded pair impulses, fixed translation plane and yaw. Static broad-phase bounds are cached. This keeps prediction restoration free of solver warm-start/contact history, and prevents rollovers or unbounded impact impulses.

This proves the selected Rapier module works headlessly and supports the chosen queries. It does not establish browser-WASM parity, dynamic Rapier versus bounded-controller equivalence, acceptable network contact divergence, or human driving quality. Those require the integrated browser/network gates. The arcade controller is shared in all modes and configurable through `GameplayConfig`; shipped collision dimensions are deliberately fixed to 1.9 m × 4.3 m and unsupported dimension changes fail early.

## Implemented rules

- Forward acceleration, deliberate brake/reverse, speed-sensitive steering lock, front/rear tyre forces and stick-controlled drifting; dirt/grass overlays, static walls and bounded car contacts. Current patrol defaults are 28 m/s top speed and acceleration 26.
- Twin-barrel volleys at 5 Hz: two independent 5-damage projectiles, 70 m/s, 0.65 s life, physical muzzle origins, narrow per-barrel aim assist, Rapier wall blocking, relative-translation moving-target sweeps, owner immunity, single-hit removal and bounded pools. A blocked barrel does not grant the other barrel its damage.
- Profile health (patrol and traffic baseline 100), three-second wreck respawn, clear authored spawns with blocked-spawn retry, two-second protection ending on fire, credit within five seconds, wreck statistics and recovery denial during recent damage/cooldown.
- Eight players, sixteen traffic cars, authored directed routes with jam relocation, lobby/countdown/five-minute round/results/rematch, creator reassignment and late joins. Combat scores remain independent of the dispatch winner.
- Practice defaults to one suspect when traffic is enabled; `pursuit: false` disables it. `pursuit: true` also enables one suspect in multiplayer or with zero civilian traffic. The suspect occupies one of the traffic slots, requires authored lanes, and has a stable entity ID across rounds.
- Each connected, active officer accumulates personal arrest progress while strictly within eight metres, below five metres/second relative speed, and with clear world-solid line of sight. Apprehension requires 180 qualifying ticks; ineligible progress decays by two ticks per step. Leaving, disconnecting or wrecking cannot transfer progress to another officer. Simultaneous arrests use ascending stable player ID (JavaScript code-unit order).
- Production explicitly enables `campaign: true, pursuit: true`: ten stages, assigned target body/armor, authored armed tactics, cumulative outcomes and scores, earned-only clues, timeout retry and finale reset. Arrest gives three points/green check; credited target destruction gives one wreck point/amber mark. Either ends the dispatch, independent of combat standings. Projectiles resolve before arrest progress on each tick.
- Campaign briefings/countdowns/results freeze world gameplay. Campaign `startRound`/`rematch` require any connected member, including a sole officer. Phase guards reject duplicates and removing players does not cancel campaign countdowns. The room scheduler pauses an empty world; simulation itself has no wall-clock policy. Noncampaign fixtures retain arrest-only pursuit and earlier round behavior. Checkpoints include campaign outcomes, every officer's arrest timer, AI runtime and active grenades.
- Armed targets use forward bursts and fixed-landing grenades with bounded windup/recovery, a 90-tick fuse, falloff/cover/protection checks and exactly-once authoritative damage. Ordinary traffic stays unarmed; AI cannot earn player credit or resolve its own dispatch.
- Optional `props` enable a separate Rapier world with one-way vehicle pushes and trusted native checkpoints. Cosmetic wreck debris and pedestrian avoidance remain entirely outside simulation authority.

Traffic uses a small lane follower and bounded recovery; it is not general-purpose city navigation. Projectile rotation uses the target's start-of-tick footprint with relative translation; full rotating continuous shape collision is not implemented. Vehicle collisions do not cause health damage.

## Reproduce validation

From the repository root:

```powershell
node node_modules/vitest/vitest.mjs run packages/sim
node node_modules/typescript/bin/tsc --noEmit
node node_modules/tsx/dist/cli.mjs packages/sim/bench.ts
```

The suite covers real Rapier, handling, replay equality, shared prediction, thin walls, surfaces, invalid maps/tuning, shot cadence and uniqueness, protection/wreck/respawn, simultaneous lethal hits, blocked spawns and admission, recovery, contacts, input edges, eight-player late join/reconnect, creator/round transitions, independent pursuit progress/winner/reset/checkpoint behavior, disposal and all six vehicle profiles. These are automated headless checks, not claims of completed human, controller or browser acceptance. The separate real-network automated harness is documented in `tests/integration/README.md`.

Current coverage also includes the full campaign lifecycle, boss attacks/grenades and one-way physical scenery. App pacing is covered separately by `pnpm exec vitest run tests/client/pacing.test.ts`. [Execution status](../../spec/EXECUTION_STATUS.md) records the current aggregate; [the acceptance queue](../../IMPLEMENTATION_PLAN.md#next-acceptance-work) owns human driving, contact-correction and sustained performance evidence. The benchmark below predates those extensions and was not regenerated for this documentation update.

Benchmark recorded 2026-10-22, Windows x64, Intel Core i7-1355U, Node v25.8.1: 18,600 ticks, eight scripted players, sixteen traffic cars, 12,227 gameplay events, final phase results. After 600 warm-up ticks, mean step 0.230 ms, p95 0.450 ms, p99 0.680 ms, maximum 2.628 ms. The benchmark drains events every tick and steps gameplay without rendering/transport/serialization. It measures one room on this development machine, not many-room capacity or reference-browser performance. Scripts issue deterministic steering/throttle/fire; they are not skilled aiming agents. Concurrent development tasks were active on the host. Cached broad-phase rejection removed a measured previous static-collision allocation bottleneck (the preceding implementation averaged 3.400 ms on the same scenario).
