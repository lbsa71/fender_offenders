# Shared contracts

`arcade-v19` adds five room-owned ten-dispatch storylines through the existing `CampaignState.campaignId`. Wire shape, protocol 5 and map `sunset-borough-3` are unchanged; matching gameplay revisions remain mandatory. The server chooses initial and subsequent case IDs; production join requests still contain only room ID, callsign and vehicle. `createGameServer(..., {campaignId})` is a server-owned fixture configuration, never a client-supplied selection. `CampaignDispatch.theme` supplies shared presentation metadata. Fifty authored dispatch IDs resolve to their case, local stage and lighting; no portrait or story payload is added to snapshots.

Status: semantic contract reference for the integrated alpha (`arcade-v20` gameplay, protocol 5, map `sunset-borough-3`). Updated: 2026-10-27. Executable DTOs and compact wire adapters live in [packages/contracts](../packages/contracts/src/index.ts); validation/fixture completion is tracked under F01/F02 in [execution status](EXECUTION_STATUS.md).

*The contracts are the traffic lights. Please resist interpreting red as an optional decoration.*

This document defines cross-lane semantics and remaining acceptance expectations. Examples describe semantic TypeScript types, not the compact snapshot wire encoding or installed SDK API. Consumers use the package's public exports; additional validators and the complete proposed fixture catalog remain unfinished rather than implied by these examples.

## Campaign extension

The local `arcade-v20` follow-up combines winter handling with the integrated five-case `arcade-v19` baseline. `WorldSnapshot.brokenSnowbanks?` and `RenderFrame.brokenSnowbanks?` carry the bounded IDs of destroyed shared curb piles. The optional wire field contains the same copied ID list; absence remains valid. `SnowbankDefinition` describes static shared geometry. Only authority detects car/bullet/blast contact; destruction adds no car impulse, health damage or score. Checkpoints retain broken IDs, while a retry or new dispatch restores the banks. Matching gameplay builds are required; protocol 5/map `sunset-borough-3` remain. Ninth-stage theme metadata now says `snow` in all five cases.

Production and development URLs accept `debugDispatch=1..10` and optional `debugCase=<case-id>`. The client assigns a fresh UUID before entry and sends these optional `SessionRequest` creation fields through ordinary matchmaking. The authority validates bounds/case identity when creating the room, chooses its case, and starts the requested stage when the first officer joins. Existing rooms ignore launch options; they cannot be reset through joining. Debug launches award no skipped outcomes or points. The client consumes the query after successful entry, so reloads and backup invites retain the chosen chase. No input/world wire changes or gameplay revision change are required; `arcade-v20` / protocol 5 remain.

Development-only in-room resets retain the explicitly enabled HTTP endpoint and local console. A reset validates stage/case, returns all participants to that briefing and clears outcomes/scores/hazards. The production shortcut does not enable that endpoint or expose the console.


`arcade-v18` makes enemy bombs faster and velocity-led, and adds one shootable black helicopter helper in dispatches 5, 9 and 10. `WorldSnapshot.helicopter?` and `RenderFrame.helicopter?` contain its entity/dispatch IDs, phase, health, planar route endpoints/yaw and start/end ticks. An optional eleven-field compact tuple carries that state; absence remains valid. `helicopterPoseAt` evaluates the same clamped route on authority and presentation clocks. Trusted checkpoints also retain next-drop time and target identity. Downed state is terminal for that dispatch attempt, including reconnect/late join/checkpoint restore; retry or a new dispatch starts fresh. The helper does not count as the suspect objective.

`GrenadeState.originHeight?` appends an optional height to the grenade tuple; ordinary ground throws omit it. `RenderProjectileState.tracerHeight?` / `tracerSlope?` are presentation-only values for upward anti-air tracers. Player bullets use the helper's marked 2D footprint with the usual swept-hit, protection and nearer obstruction rules. No client supplies a route, health, target or damage result. Protocol 5 and map `sunset-borough-3` remain; gameplay-version checks require paired `arcade-v18` client/server builds.

`arcade-v18` adds optional `DispatchDrivingContext.winterRoads`, derived from campaign index 8 by `getDispatchFeatures`. Omitted values preserve dry/wet legacy handling. The shared controller applies `WINTER_ROAD_RULES` to every car, including protection periods: snow/frozen-water grip 0.16/0.035, braking 0.20/0.06 and acceleration 0.65/0.28. Existing wet polygons select the extra-slick ice; oil cannot raise grip. Authority, client prediction and checkpoints use the same rules. No wire, input or map shape changes are needed; protocol 5/map `sunset-borough-3` remain. Matching gameplay clients are required, and `arcade-v17` is rejected. Rendering derives snow/frozen water from the same dispatch catalog and never claims physical authority.

`arcade-v17` adds `DriverActions.deploy?: 'bomb' | 'oil' | 'blades'`, the same optional touch deployment intent, and `DriverRuntimeState.nextDeployTick?` for the shared manual cooldown. Invalid deployment enum values are rejected. Room-derived feature flags unlock police guns/bombs/oil/blades in dispatches 3/5/8/9, after their suspect introductions in 2/3/6/7. No client supplies damage, landing coordinates, cooldown or outcomes. The authority derives placement, validates phase/protection/obstruction/cooldown and publishes existing grenade/gadget states for peers and late joins. Protocol 5 and map `sunset-borough-3` remain; matching gameplay builds are required.

`arcade-v16` adds bounded suspect road gadgets and the 400 m `sunset-borough-3` map, retaining protocol 5 and continuous local movement ownership. `WorldSnapshot.gadgets?` and `RenderFrame.gadgets?` contain at most eight `RoadGadgetState` values: entity/owner IDs, kind `oil` or `blades`, planar pose, born/active/expiry ticks. Nine-field compact tuples carry those values; missing lists decode to empty. Oil stays fixed, blade poses follow their owner, and current snapshots reconstruct warnings for peers/late joins. Cooldowns and per-deployment blade hit IDs remain in trusted checkpoints. `withRoadGadgets` derives armed oil footprints for the shared controller; normal server-owned damage and explicit interventions remain unchanged. Older gameplay/map clients are rejected. See [gadget timing and counterplay](BOSS_COMBAT.md#road-gadgets).

`arcade-v15` / protocol 5 separates contact from vehicle life changes. `LocalAuthorityState.contact?: ContactAdjustment` contains a cumulative `{revision,pose,velocity}` adjustment within one life; the local wire tuple appends it at slot 3 without quantizing the totals. `LocalVehicleMotion.contactRevision` acknowledges the last applied revision (zero by default for explicit fixtures). The room retains 256 revision baselines, translates in-flight reports by the unapplied adjustment and validates that corrected movement. Unknown or expired acknowledgments require a full baseline. Clients apply cumulative differences once to current motion, preserving steering, input queues and interpolation history. `Simulation.step()` returns `VehicleContactDelta[]`; ordinary contact does not increment `discontinuityId`. Matching client/server builds are required; the contact-only baseline used map `sunset-borough-2`, expanded to `sunset-borough-3` by `arcade-v16`.

`arcade-v14` / protocol 4 adds `InputBatch.motion?: LocalVehicleMotion`: completed local `sequence`, `discontinuityId`, planar `pose` and `velocity`. Matching client/server versions are mandatory. The room validates the owning session, current life, accepted batch sequence, finite values, map bounds, speed/yaw-rate and bounded displacement. Health, body, identity and outcomes are never accepted from this payload. Ordinary snapshots retire acknowledged samples and merge shared metadata without restoring local driving. Server intervention uses an explicit discontinuity/full baseline. The map revision remains `sunset-borough-2`.

`arcade-v13` adds a short full-throttle breakaway after the closing-pursuit brake check, with a six-second cooldown and unchanged speed/arrest rules. Brake-check, breakaway and cooldown deadlines live in the existing trusted boss checkpoint; no new wire fields are required. Matching-build checks reject `arcade-v12` and earlier clients. Protocol 3 and map `sunset-borough-2` remain unchanged. See [boss driving rules](BOSS_COMBAT.md#difficulty-and-authority).

`arcade-v12` makes suspect evasive steering and stronger brake checks conditional on a nearby officer closing the gap, integrated with the `arcade-v11` tutorial/touch/solo baseline. The authority checkpoints the evasion target and maneuver start tick with the existing boss runtime. Gameplay version checks reject `arcade-v11` and earlier clients; the baseline's protocol 3 and all wire tuple shapes remain unchanged. See [boss driving rules](BOSS_COMBAT.md#difficulty-and-authority).

The armed-target extension exposes `getBossTactics(dispatchIndex)`, ten immutable `BOSS_TACTICS` profiles and `randomCallsign(random?)`. `WorldSnapshot.grenades?: GrenadeState[]` carries bounded authoritative hazards. Each grenade contains entity/owner IDs, immutable origin/target poses, born/landing/detonation ticks, blast radius and damage. Wire decoding defaults missing legacy grenade fields to an empty roster. `RenderFrame.grenades` and `serverTick` provide presentation data; online sampling advances the hazard clock monotonically and keeps nonplaying campaign phases frozen.

`grenade-thrown` events carry `{ grenade }`; `grenade-exploded` events carry `{ grenadeId, ownerEntityId, position, blastRadius }`. These events drive effects, not client-owned damage. Current snapshots reconstruct warnings for late joins; original throw events are not required. See [boss combat](BOSS_COMBAT.md).

`WorldSnapshot.campaign?: CampaignState` carries `{ campaignId, dispatchIndex, status: 'active' | 'complete', outcomes }`. Indices are zero-based and bounded to the selected storyline’s ten authored dispatches. Each ordered outcome is `{ dispatchIndex, outcome: 'arrested' | 'wrecked', playerId, callsign, elapsedTicks }`. Credited callsigns survive participant departure. Only successful dispatches add entries; a timeout leaves the index/outcomes unchanged. A completed tenth stage retains index 9 and sets status complete until a connected member requests a new campaign.

`STORYLINES` exposes five immutable `CampaignStoryline` records (ID, title, ten dispatches and ten targets). `ALL_CAMPAIGN_DISPATCHES` and `ALL_CAMPAIGN_TARGETS` expose all fifty. `getStoryline`, `getCampaignDispatch` and `findCampaignDispatch` resolve the room-selected case and local stage; `getCampaignTarget` and `getCampaignMugshot` resolve all fifty suspects. The original `CAMPAIGN_*` aliases remain the Green Light case. Each dispatch references a target ID; that target specifies its `VehicleBodyId`. The UI gates `reveal` text by successful outcomes. Main screens project only the current story/result; complete outcomes, scores, credited callsigns and latency still roundtrip for authority and reconnect, without requiring a visible statistics table or campaign tracker. Shared snapshot encoding roundtrips the full bounded casefile for late join/reconnect; it does not publish portrait or cosmetic transforms. `pursuit-complete.payload.outcome` optionally distinguishes arrest/wreck; `round-ended.payload.reason` additionally accepts `wrecked`. Snapshots remain the durable UI authority.

`getCampaignMugshot(id, variant?: CampaignMugshotVariant)` returns cached original SVG. The presentation-only variants are `briefing` (default), `arrested` (bars), `wrecked` (bandages), and `escaped` (gloating). All variants reuse the same suspect identity/accessory geometry and palette. Unknown IDs retain the requested variant on the authored fallback; unknown runtime variants use `briefing`. The UI derives this choice from the current dispatch's shared recorded resolution, with escape used only for unresolved results. It introduces no wire fields or simulation rules. See [outcome portrait semantics](CAMPAIGN.md#outcome-portraits).

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
type DeviceKind = "keyboard" | "gamepad" | "touch";
type ControlScheme = "auto" | DeviceKind;

interface TouchControls {
  steer: number; throttle: number; brakeReverse: number;
  handbrake: boolean; fire: boolean; siren: boolean; recover: boolean;
}

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

`ControlScheme` is a persisted local setting. `auto` begins with touch when `navigator.maxTouchPoints > 0`, otherwise keyboard, then follows actual device use. Explicit schemes admit only that device's driving input. Touch sends held semantic controls from UI to input; `siren` becomes a one-tick toggle and `recover` becomes a single request after a one-second hold. Raw pointer IDs and geometry remain in UI. Touch cancellation, lost capture and viewport resize reset held input and immediately neutralize the session. UI resets its pointer ownership whenever input resets, so old pointer moves cannot reapply held controls. These additions change no wire DTO, simulation rule or protocol revision.

Focus loss/device disconnect generates a session control `neutralize` request immediately and clears held state locally. The server still enforces stale-input neutralization if that request never arrives. A client cannot use neutralize/recover to stop authoritative momentum instantly.

The production browser runs the shared fixed-step controller locally and includes the last command's completed physics movement with each batch. Presentation projection is never sent. Each local command applies once; routine snapshots cannot rewind/replay local steering, velocity or controller runtime. Server movement admission is bounded and does not accept arbitrary teleportation. A one-second plus 0.25 m distance allowance absorbs bursts; only elapsed server time replenishes it, so extra sequence IDs, neutralize or resync do not buy travel. Raw SDK/development inputs without movement retain the legacy server-driven controller, bounded queue and held-state coalescing. Both paths retain siren parity, recovery deduplication, the 12-sample flood guard and 100 ms stale-input braking.

An `input-backlog` snapshot or `resync` prop patch retires acknowledgments without changing the continuous local car. A full `resync`, pause transition, match/epoch change, vehicle status or discontinuity replaces local state and clears obsolete commands. Rejected current-life movement produces a full intervention; ordinary contact uses acknowledged displacement/impulse updates; stale previous-life packets cannot create a reset loop. The server owns fire cadence, projectiles, damage, arrests and campaign outcomes. Locally predicted recoil is not applied a second time to accepted movement.

`submit(command, localTickTimeMs?)` accepts an optional browser-only fixed-tick time, never serialized. Rendering projects at most 50 ms beyond the latest local step, clipping that presentation against visible active cars so extrapolation cannot enter a bumper and jump out on the next physics step. This does not change the completed physics pose, velocity or outgoing motion report. Snapshot arrival does not gate fresh local input or add position/yaw correction offsets. Actual disconnect/reconnect and authoritative pause still block input. External cars use a 200 ms buffer, up to 300 ms position/yaw extrapolation and gradual playback-clock correction; a blackout over one second can rebase their obsolete timeline. Local collision prediction samples the external cars' visible trajectory, including recovery offsets, so unseen future colliders cannot shove a parked officer. Room validation uses its own authoritative geometry and the completed movement report; it receives neither those proxy poses nor local presentation projection.

The app calls `sampleFrame()` on the session's current monotonic clock, shared with input and snapshot handling. An older animation timestamp must not move the sample behind an already delivered input tick.

After the four-step online input budget is exhausted, pacing discards remaining whole ticks and retains only the fractional tick phase. A later ordinary callback must not repay that dropped time as an extra movement burst. Local practice retains its separate fifteen-step catch-up policy.

For callers that omit logical input times, a late one-tick callback must preserve already displayed forward travel after render correction is applied. It may restore only that last delivered position, never unshown extrapolation. Fresh yaw and velocity remain predicted immediately; explicit resync/pause/life resets clear the guard.

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
  recoilStrength?: number;   // accepted-volley handling load, clamped to 0–1
  simulatedTick?: number;    // last predicted/authoritative movement tick
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
  paused?: boolean; // authoritative pause; transport and cleanup continue
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

`arcade-v10` adds physical gun recoil: one accepted paired volley reduces forward speed and increases a temporary steering/grip load. It does not add damage, change cadence or consume a second kick per barrel. Rejected volleys do not apply authoritative recoil. `DriverRuntimeState.recoilStrength` and `simulatedTick` travel in the existing local-controller object and are checkpointed. Legacy omitted values default to zero; online prediction uses the snapshot tick as its clock baseline. Prediction runs the same accepted-volley math and cooldown without creating projectile/damage authority, then reconciles rejected predictions. Non-playing phases cannot predict a gun kick. Version checks reject the old gameplay build even though the additive local fields leave protocol 1 and existing projectile tuples unchanged.

Health and scores live in state; an absent cosmetic event cannot corrupt them. Late join does not replay all historical shots/wrecks. State restores the present; events describe new transitions.

`crash` reports a confirmed contact's outward world-space normal and closing speed in m/s (3–60), at most once per vehicle per 30 ticks. The renderer rejects a crash whose discontinuity no longer matches the car and deduplicates event IDs. `projectile-impact` reports a static obstruction hit; `hit` remains confirmed vehicle damage. Neither event permits client damage or collision claims. Shot origin yaw includes the bounded server aim correction; the vehicle's own pose is unchanged.

`arcade-v5` spawns two independent rounds per volley at the physical gun tips (forward 2.45 m, lateral ±0.63 m), each dealing 5 damage. The 12-tick cadence and total 10 damage remain unchanged. Each muzzle has its own assist query and a sweep from the car center to prevent point-blank obstruction bypass. The legacy `projectileId` and `origin` identify the first barrel; optional plural fields describe both. `volleyId` deduplicates the single sound/recoil even across distinct event envelopes. Compact projectile tuples append volley ID, barrel index and damage at slots 11–13; legacy tuples still decode. Client/server gameplay revisions must match.

Wreck authority always supplies its final `position`, `bodyAssetId` and `discontinuityId`; optional fields preserve older event fixtures. Presentation accepts complete metadata before the wrecked snapshot, rejects older lives and cancels debris/audio on respawn. Legacy metadata-free events require an already wrecked snapshot. Flying wreck parts are bounded local effects and have no network state.

The current renderer uses those unchanged wreck fields to select the car's exact authored components. Each fragment has local rigid-body physics, with no authority handle, damage, checkpoint or transform payload. The client-only body cap is 464 across eight sequences. Four rubber tires per car use round axle-aligned colliders, independently seeded 7–13 m/s outward launches, individual spin and rubber rebound; panels retain their existing launch profile. Local contact prediction and bounded CCD prevent fast tire contacts from clipping road/buildings. All pieces expire within 2.6 seconds and are suppressed by reduced motion. No authority body, damage rule or wire field is added. `traffic-*` body IDs select unarmed civilian geometry; equipped player/target bodies keep their authored body independently of the gun-fitting flag. Campaign dispatch 1 has no barrels; grenade-only suspects also omit gun barrels. `@fender/physics` coordinates WASM initialization only and introduces no gameplay DTO or protocol revision.

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
  setPresence(menuOpen: boolean, hidden: boolean): void;
  activity(): void;
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
  setDispatch(dispatchId: string | null): void;
  render(frame: RenderFrame, frameDeltaSeconds: number, driverInput?: Pick<DriverActions, 'throttle' | 'brakeReverse'>): void;
  setAudioActive(active: boolean): void;
  present(events: GameEvent[]): void;
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}
```

`step()` keys inputs by vehicle entity ID. Input admission belongs to the server/session adapter, which attaches trusted command identity before simulation. Armed campaign AI is already implemented inside simulation-owned target runtime: its projectile owner is the target entity, with no player score identity. AI/server-generated actions cannot masquerade as an admitted player command. Replay retains the original player identities and checkpointed AI runtime.

Types referenced but not expanded here are concrete exports: `SessionRequest`, `JoinResult`, `SessionStatus` and `SceneManifest` in contracts; `Simulation`/`SimulationCheckpoint` in sim; the renderer facade in renderer. Complete validator/fixture coverage remains F01/F02 work. Import actual public types rather than copying these excerpts into a second local interface.

The optional renderer input supplies only the already sampled local throttle/reverse values for [engine sound](AUDIO.md). It is not stored in `RenderFrame` or transmitted. Callers without it retain a bounded render-velocity acceleration estimate. `setAudioActive` silences gameplay sound during menus/pauses; document visibility gates it independently. Neither function changes input or simulation authority.

Body identity selects local engine tuning. Oil/blade audio derives from existing gadget IDs/timing and rendered positions: play once within six presentation ticks of oil birth or blade activation, suppress late reconstruction and distant cues, and clear the bounded history on match/garage reset. No sound messages or gameplay fields are added to the wire contract.

- `SessionRequest`: required room ID and bounded nickname, optional validated `vehicleBodyId` and protocol/content versions. Reconnect credentials stay inside the SDK adapter, not this public request shape. Omission of a vehicle retains server random assignment for legacy/tool callers; clients cannot supply profile tuning values.
- `JoinResult`: player ID, room ID, current session epoch, accepted content versions, first state, local entity ID if spawned.
- `SessionStatus`: `idle | connecting | lobby | playing | reconnecting | disconnected | error`, with typed reason, optional retry delay, `idleRemainingMs` for a warning, and `notice: { id, message }` for a retained room notification. The client adapter sequences notices and preserves them across snapshots so delayed or hidden UI updates can consume each once.
- Join/session error reasons: `room-full`, `room-missing`, `version-mismatch`, `invalid-name`, `invalid-vehicle`, `server-shutdown`, `server-capacity`, `network-error`, `reconnect-expired`, `idle-timeout`.
- `SimulationCheckpoint`: opaque versioned local data, including tick and source scenario identity; never accepted from an untrusted client.
- `SceneManifest`: map revision, asset catalog revision, environment settings, visual instances, quality variants, and references to shared collision data.

Do not put prediction into `GameRenderer`. `net-client` owns prediction and render sampling for every playable room, including one officer. Local simulations remain for the menu preview and isolated fixtures. `WorldSnapshot.paused` passes through compact snapshots and freezes prediction, interpolation, projectiles and hazard clocks. `presence` reports boolean menu/hidden state; rate-limited `activity` reports deliberate interaction. `idle-warning` sets or clears warning state, and `session-ended` with `idle-timeout` prevents automatic reconnect. See [room sessions](ROOM_SESSIONS.md) for retention, admission and wall-clock policy.

Projectile presentation uses the estimated local authority clock (at most six ticks ahead) and buffered remote car clock. The local projectile cap is separate from immediate car prediction. It never rewinds an already shown round; confirmed impacts or absence from the latest authoritative state retire it. Presentation clips against world geometry and cannot cause damage. `presentationAgeSeconds` is render-only, never serialized, and bounds fresh tracer length from simulation age. `sampleTimeSeconds` remains a browser clock and must not be used as projectile age. New match/session epoch/life boundaries clear the relevant presentation history.

`PursuitState` contains `state: 'chasing'|'arresting'|'complete'`, `suspectId`, leading `progress` and `elapsedTicks`, plus optional `arrestingPlayerId`, `winnerPlayerId` (nullable) and `contenders: Array<{playerId,progress,guidance?}>`. Every contender owns independent progress; clients show the local contender's progress. The first qualifying arrest ends the dispatch, with stable player-ID tie resolution. Campaign mode additionally resolves credited target destruction; projectile resolution precedes arrest progress on the same tick. `pursuit-complete` carries optional player/suspect/outcome fields; `round-ended.reason` accepts `apprehended`, `wrecked` or `timeout`. State carries the result for late join/reconnect. Combat standings cannot override the resolving officer. See [the original decision](adr/001-competitive-pursuit.md) and [current campaign lifecycle](CAMPAIGN.md).

`RenderFrame.pursuit` is included only while a dispatch is playing and its objective is incomplete. `TargetIndicator` is a render-only `{x,y,angle,offscreen,distanceMeters}` value: normalized canvas-relative X/Y, clockwise-from-up radians and planar distance to the local car. `renderer.getTargetIndicator()` uses the actual camera and sampled suspect pose; `ui.setTargetIndicator()` updates the existing badge each frame and gates its visibility by menu/session lifecycle. Neither value is serialized or accepted as gameplay authority.

`renderer.setDispatch(id | null)` selects cosmetic noon/dusk/night atmosphere from the existing campaign catalog ID. App composition derives it from `snapshot.campaign.dispatchIndex` in both modes, including briefing/results, and supplies null outside a campaign. This adds no snapshot, checkpoint, protocol or gameplay-revision field. Every upright lamp within the prop adapter's 192-state population contributes to a shared cached diffuse field using its reflected head pose/scale. Dusk/night lamps stay illuminated on all quality presets regardless of camera distance; fallen/removed props lose their contribution. `environmentLights` counts contributing lamps rather than Babylon light objects. No extra shadow lights are created. [Graphics polish](GRAPHICS_POLISH.md) defines the authored schedule and subsequent visual work.

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

## Tutorial contracts (`arcade-v11` / protocol 3)

`getDispatchFeatures(index)` supplies `gunsEnabled`, `wetRoads`, `arrestOnly`, `lessonTitle` and `lesson` from the room campaign. `BossTactics.weapon` additionally accepts `none`. `DispatchDrivingContext` carries the two simulation/prediction capability flags; legacy noncampaign fixtures default to guns enabled and wet roads disabled. `predictVehicle` takes this as its final optional argument, after the authority tick. No separate unlock save or client campaign command is accepted.

`PursuitState.contenders[].guidance` carries `ArrestGuidance`: `get-closer`, `match-speed`, `clear-obstruction`, `hold-steady` or `unavailable`. Authority computes it using the checks that increment progress. Snapshot/wire/checkpoint paths preserve it; older fixtures may omit it. UI derives lesson copy and displays the local officer's progress only.

`CollisionMap.wetSurfaces?: Array<{id,polygonXZ}>` contains the exact content-authored road-puddle footprints. Dispatch 4 onward enables a 0.75 lateral-grip multiplier inside them in authority and prediction. Decorative water adds no collider. Renderer `getControlAnchor()` returns a presentation-only projected local-car point; `ui.setControlAnchor()` positions its cached-size controls without per-frame layout reads. The existing `setDispatch()` selects equipment/water presentation as well as atmosphere. Garage rendering receives the selected and suspect body and independent gun-fitting flags; these are derived presentation data rather than additional wire fields.
