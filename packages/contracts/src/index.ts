export const PROTOCOL_VERSION = 1;
export { packSnapshot, unpackSnapshot } from './wire';
export type { WireSnapshot } from './wire';
export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;
export const GAMEPLAY_REVISION = 'arcade-v1';
export type DeviceKind = 'keyboard' | 'gamepad';
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
export interface VehicleState {
  entityId: string; playerId: string | null; bodyAssetId: string;
  pose: PlanarPose; velocity: PlanarVelocity; health: number;
  status: 'active' | 'wrecked' | 'respawning'; protectedUntilTick: number;
  respawnAtTick: number | null; sirenOn: boolean; discontinuityId: number;
}
export interface DriverRuntimeState {
  resolvedSteering: number; reverseHoldTicks: number; nextFireTick: number;
  shotOrdinal: number; nextRecoveryTick: number; lastDamageTick: number | null;
}
export interface LocalAuthorityState { vehicle: VehicleState; driver: DriverRuntimeState; lastConsumedSequence: number }
export interface ProjectileState {
  entityId: string; ownerEntityId: string; pose: PlanarPose; velocity: PlanarVelocity;
  bornTick: number; expiresTick: number; sourceCommandSequence: number; sourceShotOrdinal: number;
}
export interface PlayerScore {
  playerId: string; nickname: string; score: number; wrecks: number;
  connection: 'connected' | 'reconnecting';
}
export interface WorldSnapshot {
  protocolVersion: number; mapRevision: string; gameplayRevision: string;
  sessionEpoch: string; serverTick: number; matchId: string;
  phase: 'lobby' | 'countdown' | 'playing' | 'results'; phaseEndsAtTick: number | null;
  vehicles: VehicleState[]; projectiles: ProjectileState[]; scores: PlayerScore[];
  local: LocalAuthorityState | null;
  resetReason?: 'join' | 'reconnect' | 'input-backlog' | 'resync';
  pursuit?: { state: 'chasing' | 'arresting' | 'complete'; suspectId: string; progress: number; elapsedTicks: number };
}
export interface EventEnvelope<K extends string, P> { eventId: string; matchId: string; serverTick: number; kind: K; payload: P }
export type GameEvent =
  | EventEnvelope<'shot', { shooterId: string; projectileId: string; sessionEpoch: string; sourceCommandSequence: number; sourceShotOrdinal: number; origin: PlanarPose }>
  | EventEnvelope<'hit', { projectileId: string; targetId: string; damage: number; position: PlanarPose }>
  | EventEnvelope<'wreck', { vehicleId: string; creditedPlayerId: string | null }>
  | EventEnvelope<'respawn', { vehicleId: string; discontinuityId: number }>
  | EventEnvelope<'round-ended', { scores: PlayerScore[] }>
  | EventEnvelope<'pursuit-complete', { elapsedTicks: number; bonus: number }>;
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
  vehicles: VehicleState[]; projectiles: ProjectileState[]; cameraTarget: PlanarPose | null;
}
export interface SessionRequest {
  mode: 'practice' | 'create' | 'join'; nickname: string; roomId?: string;
  protocolVersion?: number; mapRevision?: string; gameplayRevision?: string;
}
export interface JoinResult {
  playerId: string; roomId: string; sessionEpoch: string;
  protocolVersion: number; mapRevision: string; gameplayRevision: string;
  firstState: WorldSnapshot; localEntityId: string | null;
}
export type SessionError = 'room-full' | 'room-missing' | 'version-mismatch' | 'invalid-name' | 'server-shutdown' | 'network-error' | 'reconnect-expired';
export interface SessionStatus {
  state: 'idle' | 'connecting' | 'lobby' | 'playing' | 'reconnecting' | 'disconnected' | 'error';
  reason?: SessionError; message?: string; retryDelay?: number;
}
export interface GameSession {
  connect(request: SessionRequest): Promise<JoinResult>;
  submit(command: InputCommand): void; neutralize(): void;
  request(action: 'start-round' | 'rematch' | 'leave'): void;
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
