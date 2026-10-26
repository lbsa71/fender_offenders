export { getDispatchFeatures, DEFAULT_DRIVING_CONTEXT } from './dispatch-features';
export type { DispatchFeatures, DispatchDrivingContext } from './dispatch-features';
export const PROTOCOL_VERSION = 3;
export { packSnapshot, unpackSnapshot } from './wire';
export type { WireSnapshot } from './wire';
export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;
export const GAMEPLAY_REVISION = 'arcade-v12';
export type { CampaignState, CampaignOutcome, DispatchOutcome, CampaignTarget, CampaignDispatch } from './campaign-types';
export { CAMPAIGN_ID, CAMPAIGN_TITLE, CAMPAIGN_TARGETS, CAMPAIGN_BOSSES, CAMPAIGN_DISPATCHES, getCampaignTarget } from './campaign';
export { getCampaignMugshot } from './campaign-mugshots';
export { randomCallsign } from './callsigns';
export { BOSS_TACTICS, getBossTactics } from './boss-tactics';
export type { BossTactics } from './boss-tactics';
import type { CampaignState, CampaignOutcome } from './campaign-types';
export { VEHICLE_BODIES, VEHICLE_PROFILES, getVehicleProfile, isVehicleBodyId } from './vehicle-profiles';
export type { VehicleBodyId, VehicleProfile } from './vehicle-profiles';
export type DeviceKind = 'keyboard' | 'gamepad' | 'touch';
export type ControlScheme = 'auto' | DeviceKind;
/** Held touch controls; the input adapter owns siren edges and recovery timing. */
export interface TouchControls {
  steer: number; throttle: number; brakeReverse: number;
  handbrake: boolean; fire: boolean; siren: boolean; recover: boolean;
}
export interface DriverActions {
  steer: number; throttle: number; brakeReverse: number;
  handbrake: boolean; fire: boolean; sirenToggle: boolean; recover: boolean;
}
export const neutralActions = (): DriverActions => ({ steer: 0, throttle: 0, brakeReverse: 0, handbrake: false, fire: false, sirenToggle: false, recover: false });
export interface InputCommand { sessionEpoch: string; sequence: number; clientTick: number; actions: DriverActions }
export interface InputBatch { kind: 'input'; commands: InputCommand[] }
export interface AppliedDriverInput { actions: DriverActions; sessionEpoch: string; sourceCommandSequence: number | null }
export interface InputSource { sample(): DriverActions; activeDevice(): DeviceKind; resetHeldState(): void; dispose(): void }
export interface PlanarPose { x: number; z: number; yaw: number }
export interface PlanarVelocity { x: number; z: number; yawRate: number }
export type PropKind = 'barrel' | 'crate' | 'bin' | 'lamp' | 'sign' | 'tree' | 'bench';
export interface Vector3State { x: number; y: number; z: number }
export interface QuaternionState { x: number; y: number; z: number; w: number }
export interface PropDefinition { entityId: string; kind: PropKind; position: Vector3State; yaw?: number; scale?: number; anchored?: boolean }
export interface PropState { entityId: string; kind: PropKind; scale: number; position: Vector3State; rotation: QuaternionState; mode: 'fixed' | 'dynamic'; sleeping: boolean; discontinuityId: number }
export interface VehicleState {
  entityId: string; playerId: string | null; bodyAssetId: string;
  pose: PlanarPose; velocity: PlanarVelocity; health: number; maxHealth?: number;
  status: 'active' | 'wrecked' | 'respawning'; protectedUntilTick: number;
  respawnAtTick: number | null; sirenOn: boolean; discontinuityId: number;
}
export interface DriverRuntimeState {
  resolvedSteering: number; reverseHoldTicks: number; nextFireTick: number;
  shotOrdinal: number; nextRecoveryTick: number; lastDamageTick: number | null;
  /** Accepted-volley handling load and prediction clock. Omitted legacy values default to zero. */
  recoilStrength?: number; simulatedTick?: number;
}
export interface LocalAuthorityState { vehicle: VehicleState; driver: DriverRuntimeState; lastConsumedSequence: number }
export interface ProjectileState {
  entityId: string; ownerEntityId: string; pose: PlanarPose; velocity: PlanarVelocity;
  bornTick: number; expiresTick: number; sourceCommandSequence: number; sourceShotOrdinal: number;
  volleyId?: string; barrelIndex?: 0 | 1; damage?: number;
}
export type RenderProjectileState = ProjectileState & { presentationAgeSeconds?: number };
/** Authority chooses a fixed landing point; clients draw the lob and fuse warning. */
export interface GrenadeState {
  entityId: string; ownerEntityId: string; origin: PlanarPose; target: PlanarPose;
  bornTick: number; landsAtTick: number; detonatesAtTick: number;
  blastRadius: number; damage: number;
}
export interface PlayerScore {
  playerId: string; nickname: string; score: number; wrecks: number;
  connection: 'connected' | 'reconnecting';
  /** Server-measured round-trip milliseconds; absent/unknown/stale values are unavailable. */
  pingMs?: number | null;
}
export interface LatencyProbe { nonce: string }
/** Legacy and current URL-safe room IDs; never assume the generator's exact length. */
export const isInviteCode = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);
export type ArrestGuidance = 'get-closer' | 'match-speed' | 'clear-obstruction' | 'hold-steady' | 'unavailable';
export interface PursuitState {
  state: 'chasing' | 'arresting' | 'complete'; suspectId: string; progress: number; elapsedTicks: number;
  arrestingPlayerId?: string | null; winnerPlayerId?: string | null;
  contenders?: Array<{ playerId: string; progress: number; guidance?: ArrestGuidance }>;
}
/** Canvas-relative position; angle is clockwise from up. Presentation only. */
export interface TargetIndicator { x: number; y: number; angle: number; offscreen: boolean; distanceMeters: number }
export interface WorldSnapshot {
  protocolVersion: number; mapRevision: string; gameplayRevision: string;
  sessionEpoch: string; serverTick: number; matchId: string;
  phase: 'lobby' | 'countdown' | 'playing' | 'results'; phaseEndsAtTick: number | null;
  vehicles: VehicleState[]; projectiles: ProjectileState[]; scores: PlayerScore[];
  props?: PropState[];
  grenades?: GrenadeState[];
  local: LocalAuthorityState | null;
  resetReason?: 'join' | 'reconnect' | 'input-backlog' | 'resync';
  pursuit?: PursuitState;
  campaign?: CampaignState;
  /** Server-owned simulation pause; transport and wall-clock cleanup remain live. */
  paused?: boolean;
}
export interface EventEnvelope<K extends string, P> { eventId: string; matchId: string; serverTick: number; kind: K; payload: P }
export type GameEvent =
  | EventEnvelope<'crash', { vehicleId: string; position: PlanarPose; normal: { x: number; z: number }; speed: number; discontinuityId: number }>
  | EventEnvelope<'projectile-impact', { projectileId: string; ownerEntityId: string; position: PlanarPose }>
  | EventEnvelope<'grenade-thrown', { grenade: GrenadeState }>
  | EventEnvelope<'grenade-exploded', { grenadeId: string; ownerEntityId: string; position: PlanarPose; blastRadius: number }>
  | EventEnvelope<'shot', { shooterId: string; projectileId: string; sessionEpoch: string; sourceCommandSequence: number; sourceShotOrdinal: number; origin: PlanarPose; projectileIds?: string[]; origins?: PlanarPose[]; volleyId?: string }>
  | EventEnvelope<'hit', { projectileId: string; targetId: string; damage: number; position: PlanarPose }>
  | EventEnvelope<'wreck', { vehicleId: string; creditedPlayerId: string | null; position?: PlanarPose; bodyAssetId?: string; discontinuityId?: number }>
  | EventEnvelope<'respawn', { vehicleId: string; discontinuityId: number }>
  | EventEnvelope<'round-ended', { scores: PlayerScore[]; winnerPlayerId?: string | null; reason?: 'apprehended' | 'wrecked' | 'timeout' }>
  | EventEnvelope<'pursuit-complete', { elapsedTicks: number; bonus: number; playerId?: string; suspectId?: string; outcome?: CampaignOutcome }>;
export interface GameplayConfig {
  revision: string;
  vehicle: { acceleration: number; reverseAcceleration: number; braking: number; topSpeed: number; reverseSpeed: number; drag: number; grip: number; handbrakeGrip: number; steeringRate: number; halfWidth: number; halfLength: number };
  weapon: { damage: number; shotsPerSecond: number; speed: number; lifetimeSeconds: number };
  roundSeconds: number; countdownSeconds: number; respawnSeconds: number;
  spawnProtectionSeconds: number; recoveryCooldownSeconds: number; maxHealth: number; trafficCount: number;
}
export interface CollisionMap {
  id: string; revision: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  colliders: Array<{ id: string; shape: 'box' | 'convex'; pose: PlanarPose; halfExtents?: { x: number; y: number; z: number }; vertices?: number[]; layer: 'world-solid' | 'vehicle' | 'sensor'; surface: 'asphalt' | 'dirt' | 'grass' }>;
  surfaces: Array<{ id: string; polygonXZ: number[]; surface: 'asphalt' | 'dirt' | 'grass' }>;
  wetSurfaces?: Array<{ id: string; polygonXZ: number[] }>;
  spawns: Array<{ id: string; pose: PlanarPose; clearanceRadius: number }>;
  laneNodes: Array<{ id: string; x: number; z: number }>;
  laneEdges: Array<{ from: string; to: string; speedLimit: number }>;
}
export interface SceneManifest {
  mapRevision: string; assetCatalogRevision: string;
  environment: { skyColor: string; fogColor: string; sunDirection: [number, number, number] };
  visualInstances: Array<{ assetId: string; pose: PlanarPose; scale?: [number, number, number] }>;
  qualityVariants: string[];
}
export interface RenderFrame {
  sampleTimeSeconds: number; localEntityId: string | null;
  vehicles: VehicleState[]; projectiles: RenderProjectileState[]; cameraTarget: PlanarPose | null;
  props?: PropState[];
  grenades?: GrenadeState[];
  /** Presentation clock in authority ticks, buffered online and exact in practice. */
  serverTick?: number;
  pursuit?: PursuitState;
}
export interface SessionRequest {
  nickname: string; roomId: string;
  protocolVersion?: number; mapRevision?: string; gameplayRevision?: string;
  vehicleBodyId?: import('./vehicle-profiles').VehicleBodyId;
}
export interface JoinResult {
  playerId: string; roomId: string; sessionEpoch: string;
  protocolVersion: number; mapRevision: string; gameplayRevision: string;
  firstState: WorldSnapshot; localEntityId: string | null;
}
export type SessionError = 'room-full' | 'room-missing' | 'server-capacity' | 'version-mismatch' | 'invalid-name' | 'invalid-vehicle' | 'server-shutdown' | 'network-error' | 'reconnect-expired' | 'idle-timeout';
export interface SessionStatus {
  state: 'idle' | 'connecting' | 'lobby' | 'playing' | 'reconnecting' | 'disconnected' | 'error';
  reason?: SessionError; message?: string; retryDelay?: number;
  idleRemainingMs?: number;
  notice?: { id: number; message: string };
}
export interface GameSession {
  connect(request: SessionRequest): Promise<JoinResult>;
  /** localTickTimeMs is a browser-only logical input time; it is never sent. */
  submit(command: InputCommand, localTickTimeMs?: number): void; neutralize(): void;
  request(action: 'start-round' | 'rematch' | 'leave'): void;
  selectVehicle(bodyId: import('./vehicle-profiles').VehicleBodyId): void;
  setPresence(menuOpen: boolean, hidden: boolean): void;
  activity(): void;
  onSnapshot(callback: (snapshot: WorldSnapshot) => void): () => void;
  onEvents(callback: (events: GameEvent[]) => void): () => void;
  onStatus(callback: (status: SessionStatus) => void): () => void;
  dispose(): Promise<void>;
}
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function isDriverActions(value: unknown): value is DriverActions {
  if (!isRecord(value)) return false;
  const bounded = (key: string, lo: number, hi: number) => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= lo && value[key] <= hi;
  return bounded('steer', -1, 1) && bounded('throttle', 0, 1) && bounded('brakeReverse', 0, 1) && ['handbrake', 'fire', 'sirenToggle', 'recover'].every(k => typeof value[k] === 'boolean');
}
export function isInputCommand(value: unknown): value is InputCommand {
  return isRecord(value) && typeof value.sessionEpoch === 'string' && value.sessionEpoch.length <= 100 && Number.isSafeInteger(value.sequence) && (value.sequence as number) >= 0 && Number.isSafeInteger(value.clientTick) && (value.clientTick as number) >= 0 && isDriverActions(value.actions);
}
export function sanitizeNickname(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Nickname must be text');
  const name = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 20);
  if (!name) throw new Error('Enter a nickname');
  return name;
}
export function validateMap(map: CollisionMap): string[] {
  const errors: string[] = [];
  if (!map.spawns.length) errors.push('Map has no spawns');
  const ids = new Set<string>();
  for (const item of map.colliders) {
    if (ids.has(item.id)) errors.push(`Duplicate collider ${item.id}`); ids.add(item.id);
    if (![item.pose.x, item.pose.z, item.pose.yaw].every(Number.isFinite)) errors.push(`Invalid pose ${item.id}`);
    if (item.shape === 'box' && (!item.halfExtents || !Object.values(item.halfExtents).every(n => Number.isFinite(n) && n > 0))) errors.push(`Invalid box ${item.id}`);
  }
  const nodes = new Set(map.laneNodes.map(n => n.id));
  for (const edge of map.laneEdges) if (!nodes.has(edge.from) || !nodes.has(edge.to)) errors.push('Broken lane edge');
  return errors;
}
