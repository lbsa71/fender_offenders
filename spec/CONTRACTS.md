# Shared contracts

Status: semantic contract reference for the implemented alpha (`arcade-v8` gameplay, protocol 1, map `sunset-borough-1`). Updated: 2026-10-24. Executable DTOs and compact wire adapters live in [packages/contracts](../packages/contracts/src/index.ts); validation/fixture completion is tracked under F01/F02 in [execution status](EXECUTION_STATUS.md).

*The contracts are the traffic lights. Please resist interpreting red as an optional decoration.*

This document defines cross-lane semantics and remaining acceptance expectations. Examples describe semantic TypeScript types, not the compact snapshot wire encoding or installed SDK API. Consumers use the package's public exports; additional validators and the complete proposed fixture catalog remain unfinished rather than implied by these examples.

## Campaign extension

The armed-target extension exposes `getBossTactics(dispatchIndex)`, ten immutable `BOSS_TACTICS` profiles and `randomCallsign(random?)`. `WorldSnapshot.grenades?: GrenadeState[]` carries bounded authoritative hazards. Each grenade contains entity/owner IDs, immutable origin/target poses, born/landing/detonation ticks, blast radius and damage. Wire decoding defaults missing legacy grenade fields to an empty roster. `RenderFrame.grenades` and `serverTick` provide presentation data; online sampling advances the hazard clock monotonically and keeps nonplaying campaign phases frozen.

`grenade-thrown` events carry `{ grenade }`; `grenade-exploded` events carry `{ grenadeId, ownerEntityId, position, blastRadius }`. These events drive effects, not client-owned damage. Current snapshots reconstruct warnings for late joins; original throw events are not required. See [boss combat](BOSS_COMBAT.md).

`WorldSnapshot.campaign?: CampaignState` carries `{ campaignId, dispatchIndex, status: 'active' | 'complete', outcomes }`. Indices are zero-based and bounded to the ten authored dispatches. Each ordered outcome is `{ dispatchIndex, outcome: 'arrested' | 'wrecked', playerId, elapsedTicks }`. Only successful dispatches add entries; a timeout leaves the index/outcomes unchanged. A completed tenth stage retains index 9 and sets status complete until the creator requests a new campaign.

`CAMPAIGN_DISPATCHES`, `CAMPAIGN_TARGETS`, `CAMPAIGN_BOSSES`, `getCampaignTarget` and `getCampaignMugshot` expose original static story/portrait content. Each dispatch references a target ID; that target specifies its `VehicleBodyId`. The UI gates `reveal` text by successful outcomes. Shared snapshot encoding roundtrips the full bounded casefile for late join/reconnect; it does not publish portrait or cosmetic transforms. `pursuit-complete.payload.outcome` optionally distinguishes arrest/wreck; `round-ended.payload.reason` additionally accepts `wrecked`. Snapshots remain the durable UI authority.

Production uses explicit campaign mode and retains existing lobby/countdown/playing/results phases. `start-round` and `rematch` retain their transport messages; campaign rematch means next briefing, timeout retry, or final reset. See [campaign semantics](CAMPAIGN.md). Old clients are rejected by the gameplay revision.

## 1. Conventions and invariants

- Distances: meters. Time: integer server ticks at 60 Hz; seconds only for configuration/display.
- World: right-handed, X right, Y up, Z forward at yaw zero. Configure Babylon's right-handed mode and verify import orientation with an asymmetric fixture.
- Current Babylon adapters reflect shared X once at the presentation boundary; use the existing conversion consistently for cars, scenery, pedestrians and target projection.
- Yaw: radians, positive rotates forward toward +X. Steering +1 means right. At yaw zero, front is +Z. Establish this with tests rather than relying on default model orientation.
- World road plane: X/Z; physical vehicle center Y remains fixed for the initial model.
- Physics and rendering conversion happens at adapter edges. Shared types contain numeric values, not engine classes.
- IDs are opaque strings allocated by the authority; do not reuse an entity ID within a match.
- All network numeric inputs must be finite and range-checked. Limit string length and collection counts before allocating.
- `protocolVersion` is an integer; `mapRevision` and `gameplayRevision` identify immutable content.
- Command sequence is a monotonic safe integer within a `sessionEpoch`. Reset sequence only with a new epoch.
- Fire is a held state with authoritative cadence. Siren toggle and recovery are edge/hold actions deduplicated by command identity.

## 2. Device input and commands

```ts
type DeviceKind = "keyboard" | "gamepad";

interface DriverActions {
  steer: number;             // [-1, 1], vehicle-relative
  throttle: number;          // [0, 1]
  brakeReverse: number;      // [0, 1], sim resolves braking vs reverse
  handbrake: boolean;
  fire: boolean;
  sirenToggle: boolean;      // one-tick edge
  recover: boolean;          // one-tick request after local hold threshold
}

interface InputCommand {
  sessionEpoch: string;
  sequence: number;
  clientTick: number;        // diagnostic/order hint, never authority over elapsed time
  actions: DriverActions;
}

interface InputBatch {
  kind: "input";
  commands: InputCommand[];  // ordinarily 2, hard maximum 4
}

interface InputSource {
  sample(): DriverActions;
  activeDevice(): DeviceKind;
  resetHeldState(): void;
  dispose(): void;
}
```

`sample()` is called once per local sim tick. It consumes one-shot edges once, even when a render frame runs multiple simulation steps. Menu actions use a separate UI event stream and must not accidentally become driving/fire actions.

Focus loss/device disconnect generates a session control `neutralize` request immediately and clears held state locally. The server still enforces stale-input neutralization if that request never arrives. A client cannot use neutralize/recover to stop authoritative momentum instantly.

## 3. State, configuration, and checkpoints

```ts
interface PlanarPose { x: number; z: number; yaw: number }
interface PlanarVelocity { x: number; z: number; yawRate: number }

interface VehicleState {
  entityId: string;
  playerId: string | null;   // null for traffic
  bodyAssetId: string;
  pose: PlanarPose;
  velocity: PlanarVelocity;
  health: number;
  maxHealth?: number;        // authority-provided maximum; HUD renders a percentage
  status: "active" | "wrecked" | "respawning";
  protectedUntilTick: number;
  respawnAtTick: number | null;
  sirenOn: boolean;
  discontinuityId: number;   // increments on respawn/teleport, invalidates interpolation
}

interface DriverRuntimeState {
  resolvedSteering: number;
  reverseHoldTicks: number;
  nextFireTick: number;
  shotOrdinal: number;       // restored with controller state for replay-safe effects
  nextRecoveryTick: number;
  lastDamageTick: number | null;
}

interface LocalAuthorityState {
  vehicle: VehicleState;
  driver: DriverRuntimeState;
  lastConsumedSequence: number;
  // All commands <= boundary were applied or explicitly discarded; never replay them.
  // A queue-reset reason identifies discarded rather than applied input.
}

interface ProjectileState {
  entityId: string;
  ownerEntityId: string;
  pose: PlanarPose;
  velocity: PlanarVelocity;
  bornTick: number;
  expiresTick: number;
  sourceCommandSequence: number;
  sourceShotOrdinal: number;
  volleyId?: string;
  barrelIndex?: 0 | 1;
  damage?: number;
}

interface PlayerScore {
  playerId: string;
  nickname: string;
  score: number;
  wrecks: number;
  connection: "connected" | "reconnecting";
  pingMs?: number | null; // server-measured RTT; null/absent means unavailable
}

interface WorldSnapshot {
  protocolVersion: number;
  mapRevision: string;
  gameplayRevision: string;
  sessionEpoch: string;      // receiver's current epoch
  serverTick: number;
  matchId: string;
  phase: "lobby" | "countdown" | "playing" | "results";
  phaseEndsAtTick: number | null;
  vehicles: VehicleState[];
  projectiles: ProjectileState[];
  scores: PlayerScore[];
  props?: PropState[];
  grenades?: GrenadeState[];
  local: LocalAuthorityState | null;
  resetReason?: "join" | "reconnect" | "input-backlog" | "resync";
  pursuit?: PursuitState;
  campaign?: CampaignState;
}
```

These DTOs are the logical projection of authoritative state. The current adapter uses compact snapshots plus sparse prop patches, rather than a parallel equivalent schema stream. A reconstruction layer delivers coherent snapshots with a single tick identity; do not expose half-applied patches to prediction/rendering.

`SimulationCheckpoint` is an opaque simulation-owned object containing physics state, controller state, RNG state, counters, and active gameplay entities. It must not be confused with a bandwidth-reduced `WorldSnapshot`. M0 defines checkpoint versioning and confirms that restore+replay reproduces the scenario. Prediction restore may need reconstruction of the small local prediction world.

Gameplay configuration has `revision`, vehicle tuning, weapon tuning, round duration, spawn/recovery rules, traffic caps, and collision filters. Rendering quality and input sensitivity are separate client configurations and must not change authoritative handling parameters.

`VEHICLE_BODIES`, `VehicleBodyId`, `VEHICLE_PROFILES`, `isVehicleBodyId` and `getVehicleProfile` are public contracts. Player body IDs select the shared profile; untrusted requests must validate IDs before accessing profiles. Profile lookup falls back to patrol for presentation compatibility. The compact vehicle tuple appends optional `maxHealth` at slot 15; a legacy tuple without it decodes to 100. Current authority includes the configured maximum so HUD and health bars can render percentages correctly.

## 4. Events and replay-safe presentation

```ts
interface EventEnvelope<TKind extends string, TPayload> {
  eventId: string;           // unique per match, stable when retransmitted
  matchId: string;
  serverTick: number;
  kind: TKind;
  payload: TPayload;
}

type GameEvent =
  | EventEnvelope<"grenade-thrown", { grenade: GrenadeState }>
  | EventEnvelope<"grenade-exploded", {
      grenadeId: string; ownerEntityId: string; position: PlanarPose; blastRadius: number;
    }>
  | EventEnvelope<"crash", {
      vehicleId: string; position: PlanarPose; normal: { x: number; z: number };
      speed: number; discontinuityId: number;
    }>
  | EventEnvelope<"projectile-impact", {
      projectileId: string; ownerEntityId: string; position: PlanarPose;
    }>
  | EventEnvelope<"shot", {
      shooterId: string; projectileId: string;
      sessionEpoch: string; sourceCommandSequence: number;
      sourceShotOrdinal: number; origin: PlanarPose;
      volleyId?: string; projectileIds?: string[]; origins?: PlanarPose[];
    }>
  | EventEnvelope<"hit", {
      projectileId: string; targetId: string; damage: number; position: PlanarPose;
    }>
  | EventEnvelope<"wreck", { vehicleId: string; creditedPlayerId: string | null; position?: PlanarPose; bodyAssetId?: string; discontinuityId?: number }>
  | EventEnvelope<"respawn", { vehicleId: string; discontinuityId: number }>
  | EventEnvelope<"round-ended", {
      scores: PlayerScore[]; winnerPlayerId?: string | null;
      reason?: "apprehended" | "wrecked" | "timeout";
    }>
  | EventEnvelope<"pursuit-complete", {
      elapsedTicks: number; bonus: number; playerId?: string; suspectId?: string;
      outcome?: CampaignOutcome;
    }>;
```

Maintain a bounded per-match event deduplication cache. Predictive effects use `(sessionEpoch, sourceCommandSequence, sourceShotOrdinal, effectKind)` so confirmation can match and suppress a second flash/sound, including when the server briefly holds a previous command during jitter. Shot ordinals are part of restored driver state. Reject or expire unmatched speculative effects; a key is not a promise that a shot will be accepted. Replayed simulation never directly plays audio or creates persistent particles.

Health and scores live in state; an absent cosmetic event cannot corrupt them. Late join does not replay all historical shots/wrecks. State restores the present; events describe new transitions.

`crash` reports a confirmed contact's outward world-space normal and closing speed in m/s (3–60), at most once per vehicle per 30 ticks. The renderer rejects a crash whose discontinuity no longer matches the car and deduplicates event IDs. `projectile-impact` reports a static obstruction hit; `hit` remains confirmed vehicle damage. Neither event permits client damage or collision claims. Shot origin yaw includes the bounded server aim correction; the vehicle's own pose is unchanged.

`arcade-v5` spawns two independent rounds per volley at the physical gun tips (forward 2.45 m, lateral ±0.63 m), each dealing 5 damage. The 12-tick cadence and total 10 damage remain unchanged. Each muzzle has its own assist query and a sweep from the car center to prevent point-blank obstruction bypass. The legacy `projectileId` and `origin` identify the first barrel; optional plural fields describe both. `volleyId` deduplicates the single sound/recoil even across distinct event envelopes. Compact projectile tuples append volley ID, barrel index and damage at slots 11–13; legacy tuples still decode. Client/server gameplay revisions must match.

Wreck authority always supplies its final `position`, `bodyAssetId` and `discontinuityId`; optional fields preserve older event fixtures. Presentation accepts complete metadata before the wrecked snapshot, rejects older lives and cancels debris/audio on respawn. Legacy metadata-free events require an already wrecked snapshot. Flying wreck parts are bounded local effects and have no network state.

The current renderer uses those unchanged wreck fields to select the car's exact authored components. Each fragment has local rigid-body physics, with no authority handle, damage, checkpoint or transform payload. The client-only body cap is 464 across eight sequences. `traffic-*` body IDs select unarmed civilian geometry; player/target bodies keep guns even when pursuit guidance is absent. `@fender/physics` coordinates WASM initialization only and introduces no gameplay DTO or protocol revision.

`WorldSnapshot.props` and `RenderFrame.props` are optional arrays of `PropState`: `{ entityId, kind, scale, position: {x,y,z}, rotation: {x,y,z,w}, mode: 'fixed'|'dynamic', sleeping, discontinuityId }`. Kinds are barrel/crate/bin/bench/lamp/sign/tree. The server owns every physical transform. Full baselines replace the set; wire `propsPatch: true` merges only changed tuples using `unpackSnapshot(wire, previousProps)`. Omitted props on a patch preserve the baseline, and callers must scope that baseline to the same match. Join, reconnect and explicit resync force full baselines. Clock/input-backlog recovery preserves the sparse prop cache. Fixed/resting objects are silent, with meaningful position/rotation thresholds measured against the last sent state. See [world reactions](WORLD_REACTIONS.md).

## 5. Adapter interfaces

```ts
interface AppliedDriverInput {
  actions: DriverActions;
  sessionEpoch: string;
  sourceCommandSequence: number | null; // null for AI or server-generated neutral input
}

interface Simulation {
  step(inputs: ReadonlyMap<string, AppliedDriverInput>): void;
  snapshot(forPlayerId?: string): WorldSnapshot;
  drainEvents(): GameEvent[];
  checkpoint(): SimulationCheckpoint;
  restore(checkpoint: SimulationCheckpoint): void;
  dispose(): void;
}

interface GameSession {
  connect(request: SessionRequest): Promise<JoinResult>;
  submit(command: InputCommand): void;
  neutralize(): void;
  request(action: "start-round" | "rematch" | "leave"): void;
  selectVehicle(bodyId: VehicleBodyId): void;
  onSnapshot(callback: (snapshot: WorldSnapshot) => void): () => void;
  onEvents(callback: (events: GameEvent[]) => void): () => void;
  onStatus(callback: (status: SessionStatus) => void): () => void;
  dispose(): Promise<void>;
}

interface RenderFrame {
  sampleTimeSeconds: number;
  localEntityId: string | null;
  vehicles: VehicleState[];     // already predicted/interpolated presentation poses
  projectiles: Array<ProjectileState & { presentationAgeSeconds?: number }>;
  cameraTarget: PlanarPose | null;
  props?: PropState[];
  grenades?: GrenadeState[];
  serverTick?: number;         // authority presentation clock, not browser wall time
  pursuit?: PursuitState;
}

interface GameRenderer {
  loadScene(scene: SceneManifest): Promise<void>;
  render(frame: RenderFrame, frameDeltaSeconds: number): void;
  present(events: GameEvent[]): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}
```

`step()` keys inputs by vehicle entity ID. Input admission belongs to the server/session adapter, which attaches trusted command identity before simulation. Armed campaign AI is already implemented inside simulation-owned target runtime: its projectile owner is the target entity, with no player score identity. AI/server-generated actions cannot masquerade as an admitted player command. Replay retains the original player identities and checkpointed AI runtime.

Types referenced but not expanded here are concrete exports: `SessionRequest`, `JoinResult`, `SessionStatus` and `SceneManifest` in contracts; `Simulation`/`SimulationCheckpoint` in sim; the renderer facade in renderer. Complete validator/fixture coverage remains F01/F02 work. Import actual public types rather than copying these excerpts into a second local interface.

- `SessionRequest`: mode `practice | create | join`, bounded nickname, room ID when joining, optional validated `vehicleBodyId` and protocol/content versions. Reconnect credentials stay inside the SDK adapter, not this public request shape. Omission of a vehicle retains server random assignment for legacy/tool callers; clients cannot supply profile tuning values.
- `JoinResult`: player ID, room ID, current session epoch, accepted content versions, first state, local entity ID if spawned.
- `SessionStatus`: `idle | connecting | lobby | playing | reconnecting | disconnected | error`, with typed reason and optional retry delay.
- Join error reasons: `room-full`, `room-missing`, `version-mismatch`, `invalid-name`, `invalid-vehicle`, `server-shutdown`, `server-capacity`, `network-error`, `reconnect-expired`.
- `SimulationCheckpoint`: opaque versioned local data, including tick and source scenario identity; never accepted from an untrusted client.
- `SceneManifest`: map revision, asset catalog revision, environment settings, visual instances, quality variants, and references to shared collision data.

Do not put prediction into `GameRenderer`. `net-client` owns online prediction and render sampling. The app currently composes practice directly from local `Simulation` snapshots/events and supplies exact tick/age fields; there is no shipped practice `GameSession` wrapper. Mode selection belongs to app composition, not checks spread across every package.

Projectile presentation uses the predicted local car clock (at most six ticks ahead) and buffered remote car clock. It never rewinds an already shown round; confirmed impacts or absence from the latest authoritative state retire it. Presentation clips against world geometry and cannot cause damage. `presentationAgeSeconds` is render-only, never serialized, and bounds fresh tracer length from simulation age. `sampleTimeSeconds` remains a browser clock and must not be used as projectile age. New match/session epoch/life boundaries clear the relevant presentation history.

`PursuitState` contains `state: 'chasing'|'arresting'|'complete'`, `suspectId`, leading `progress` and `elapsedTicks`, plus optional `arrestingPlayerId`, `winnerPlayerId` (nullable) and `contenders: Array<{playerId,progress}>`. Every contender owns independent progress; clients show the local contender's progress. The first qualifying arrest ends the dispatch, with stable player-ID tie resolution. Campaign mode additionally resolves credited target destruction; projectile resolution precedes arrest progress on the same tick. `pursuit-complete` carries optional player/suspect/outcome fields; `round-ended.reason` accepts `apprehended`, `wrecked` or `timeout`. State carries the result for late join/reconnect. Combat standings cannot override the resolving officer. See [the original decision](adr/001-competitive-pursuit.md) and [current campaign lifecycle](CAMPAIGN.md).

`RenderFrame.pursuit` is included only while a dispatch is playing and its objective is incomplete. `TargetIndicator` is a render-only `{x,y,angle,offscreen,distanceMeters}` value: normalized canvas-relative X/Y, clockwise-from-up radians and planar distance to the local car. `renderer.getTargetIndicator()` uses the actual camera and sampled suspect pose; `ui.setTargetIndicator()` updates the existing badge each frame and gates its visibility by menu/session lifecycle. Neither value is serialized or accepted as gameplay authority.

Badge positioning applies directly, without retargeting a CSS position transition on every frame. `tests/e2e/target-badge-performance.spec.ts` guards bounded Chromium style cost. App pacing remains separate: up to fifteen local simulation ticks or four online input ticks per frame, covered by `tests/client/pacing.test.ts`. Neither presentation rule changes 60 Hz authority or input admission limits.

`selectVehicle` sends a semantic lobby request. The authority accepts only known IDs during the lobby, neutralizes pending input, applies profile health/tuning and publishes a discontinuity to all observers. Countdown and live-round requests cannot change the car or heal it. The browser persists its garage choice independently of a room; it supplies that choice on the next dispatch.

`isInviteCode` is the common client/server predicate for URL-safe room IDs of 8–64 characters (`A–Z`, `a–z`, digits, `_`, `-`). Supported IDs always use the lazy `POST /dispatch/:invite` flow; generator-specific exact lengths must not select a join-only path. New rooms preserve the supplied ID. Vanished-room and expired-seat retries are bounded to three attempts and never substitute another invite. Full/locked, authentication and hosting-capacity errors remain failures. An HTTP transport status may differ from the protocol error code in its JSON body; preserve that code for retry decisions.

UI consumes a derived `HudModel` (speed, health, scores, timer, connection, prompts) and emits semantic actions. UI cannot write `WorldSnapshot`. Owner F defines the mapping; UI lane owns its presentation.

Online standings and results display each score's `pingMs` in milliseconds; unavailable values use “—”. Practice omits the ping column. The server's `latency-probe` and client's `latency-pong` both carry `{ nonce: string }`; clients cannot submit a claimed latency value. Compact snapshots normalize omitted latency to `null` for compatibility with older snapshots. Connection status remains visible independently of the ping column.

## 6. Map and asset schemas

### Shared map

```ts
interface CollisionMap {
  id: string;
  revision: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  colliders: Array<{
    id: string;
    shape: "box" | "convex";
    pose: PlanarPose;
    halfExtents?: { x: number; y: number; z: number };
    vertices?: number[];
    layer: "world-solid" | "vehicle" | "sensor";
    surface: "asphalt" | "dirt" | "grass";
  }>;
  surfaces: Array<{
    id: string; polygonXZ: number[]; surface: "asphalt" | "dirt" | "grass";
  }>;
  spawns: Array<{ id: string; pose: PlanarPose; clearanceRadius: number }>;
  laneNodes: Array<{ id: string; x: number; z: number }>;
  laneEdges: Array<{ from: string; to: string; speedLimit: number }>;
}
```

Surface polygons affect grip/effects through shared rules; they are not automatically solid colliders. Current `validateMap` checks spawn presence, duplicate collider IDs, finite collider poses, box extents and lane-edge references. Simulation construction adds geometry/config checks; `assets:check` separately checks authored building alignment, spawn clearance, shortcut samples and lane connectivity. Complete schema/collection validation and required-route reachability remain F01/F02/A02 work. Fixtures must include asphalt-to-dirt transitions and an asymmetric turn.

### Asset record

Current original assets use the source inventory and GPL-3.0-or-later notice in [the runtime asset record](../packages/content/manifests/licenses/ORIGINAL_ASSETS.md). A complete per-asset catalog remains acceptance work. The fields below apply to a future expanded catalog; external archive fields are inapplicable to source-generated geometry and must not be fabricated.

Every runtime asset record includes:

- Stable ID, category, runtime URL, content hash, byte size, format/version.
- Source URL, creator, download date, source archive hash, exact license ID/text location, required attribution, and modifications.
- Dimensions, orientation/pivot convention, collision asset reference if relevant, LOD/material counts, texture sizes, and optional estimated GPU cost.
- Source status: `candidate | verified | shipping | rejected`.

Do not mark a candidate `verified` based only on a search result. Store evidence from the supplied archive/page and record any discrepancy.

## 7. Fixtures that unlock parallel lanes

This named/versioned catalog is planned. Current executable scenarios live under package `dev/`/`scenarios/` directories and `tests/`; no `packages/test-support` package is shipped. Some native capture scripts still require Edge and contain original-machine paths, so fixture portability is part of F02/Q01 acceptance.

| Fixture | Must contain | Consumers |
| --- | --- | --- |
| `map-intersection-v1` | Turn, curb/wall, two spawns, dirt zone, lane graph | Sim, art, rendering, networking |
| `input-slalom-v1` | Accel/turn/brake/reverse/fire with explicit ticks | Sim, input, replay, network |
| `frames-city-v1` | Two cars, traffic, damage, teleport/respawn | Renderer, UI |
| `events-combat-v1` | Shot/hit/wreck/respawn plus duplicate event IDs | Renderer/audio, gameplay, net |
| `room-lifecycle-v1` | Lobby/countdown/play/results/reconnect/error | UI, net, integration |
| `asset-catalog-v1` | One car, road, house, dirt surface with real/placeholder provenance flags | Art pipeline, renderer, tooling |

Fixture creators must publish expected outcomes, not just input files. Placeholder art must remain visibly identified in manifests so it cannot accidentally pass the asset release gate.

## 8. Contract evolution and compatibility

The foundation/integration lane owns contracts. Proposals include affected consumers, migration, fixture changes, and compatibility tests. Wire-breaking changes increment `protocolVersion`; collision/handling changes update their content revision. Client/server mismatches are rejected clearly.

For additive internal fields, publish defaults and fixtures first, migrate consumers next, then remove deprecated behavior. No lane may silently fork an interface locally to avoid coordination. Stable APIs and small compatibility adapters are the main mechanism for parallel progress.
