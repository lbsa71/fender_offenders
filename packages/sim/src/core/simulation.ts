import { CAMPAIGN_DISPATCHES, CAMPAIGN_ID, getBossTactics, getCampaignTarget, getDispatchFeatures, DEFAULT_DRIVING_CONTEXT, PROTOCOL_VERSION, isDriverActions, isVehicleBodyId, sanitizeNickname, validateMap } from '@fender/contracts';
import type { AppliedDriverInput, VehicleContactDelta, ArrestGuidance, DispatchDrivingContext, BossTactics, CollisionMap, DriverActions, DriverRuntimeState, GameEvent, GameplayConfig, GrenadeState, LocalAuthorityState, PlanarPose, PlayerScore, ProjectileState, PropDefinition, VehicleState, WorldSnapshot } from '@fender/contracts';
import { DEFAULT_GAMEPLAY_CONFIG, FIXED_DELTA, normalizeGameplay, type SimulationConfig } from './config.js';
import { box, colliderPolygon, isPoseClear, overlap, segmentPolygon, type Point } from '../physics/geometry.js';
import { driveVehicle, neutralActions, newDriver, resolveStatic, resolveVehicleContacts, type ContactImpact } from '../vehicles/controller.js';
import { trafficInput, type TrafficRuntime } from '../traffic/traffic.js';
import { createStaticQueries, type StaticQueries } from '../physics/rapier.js';
import { maxHealthForVehicle } from '../vehicles/profiles.js';
import { selectAssistedYaw } from '../combat/aim-assist.js';
import { getVolleyOrigins } from '../combat/volleys.js';
import { applyVolleyRecoil } from '../combat/recoil.js';
import { createPropPhysics, type PropPhysicsCheckpoint } from '../physics/props.js';
import { newBossAi, stepBossAi, type BossAiRuntime } from '../missions/boss-ai.js';

interface VehicleRecord {
  vehicle: VehicleState; driver: DriverRuntimeState; epoch: string; sequence: number;
  lastEdgeSequence: number; lastAttacker: string | null; attackerTick: number;
  nextCrashTick?: number;
  traffic?: TrafficRuntime;
  bossAi?: BossAiRuntime;
}
export interface SimulationOptions {
  mode?: 'practice' | 'multiplayer'; seed?: number; matchId?: string;
  trafficCount?: number; config?: GameplayConfig; pursuit?: boolean; campaign?: boolean;
  props?: readonly PropDefinition[];
}
export interface PlayerOptions { playerId: string; nickname: string; sessionEpoch?: string; bodyAssetId?: string }
export interface SimulationCheckpoint {
  version: 1; mapRevision: string; gameplayRevision: string; tick: number; matchId: string;
  state: { records: VehicleRecord[]; projectiles: ProjectileState[]; grenades?: GrenadeState[]; scores: PlayerScore[]; phase: WorldSnapshot['phase']; phaseEnd: number | null; counter: number; eventCounter: number; rng: number; creator: string | null; pursuit: WorldSnapshot['pursuit']; arrestTicks: number; contenderTicks?: [string, number][]; campaign?: WorldSnapshot['campaign']; physicsProps?: PropPhysicsCheckpoint };
}
export interface Simulation {
  addPlayer(options: PlayerOptions): VehicleState;
  removePlayer(playerId: string): void;
  setConnection(playerId: string, connection: PlayerScore['connection']): void;
  setPlayerVehicle(playerId: string, bodyId: string): boolean;
  correctLocalMotion(playerId: string): boolean;
  startRound(requesterId?: string): boolean;
  rematch(requesterId?: string): boolean;
  step(inputs: ReadonlyMap<string, AppliedDriverInput>): readonly VehicleContactDelta[];
  snapshot(forPlayerId?: string): WorldSnapshot;
  authority(playerId: string): LocalAuthorityState | null;
  restoreAuthority(local: LocalAuthorityState, tick: number, proxies?: VehicleState[]): void;
  drainEvents(): GameEvent[];
  checkpoint(): SimulationCheckpoint;
  restore(checkpoint: SimulationCheckpoint): void;
  dispose(): void;
}
const clone = <T>(value: T): T => structuredClone(value);

export function createSimulation(mapInput: CollisionMap, options: SimulationOptions = {}): Simulation {
  const map = clone(mapInput), problems = validateMap(map);
  if (!Object.values(map.bounds).every(Number.isFinite) || map.bounds.minX >= map.bounds.maxX || map.bounds.minZ >= map.bounds.maxZ) problems.push('Invalid map bounds');
  for (const collider of map.colliders) if (collider.shape === 'convex' && (!collider.vertices || collider.vertices.length < 9 || collider.vertices.length % 3 !== 0 || !collider.vertices.every(Number.isFinite))) problems.push(`Invalid convex ${collider.id}`);
  for (const surface of map.surfaces) if (surface.polygonXZ.length < 6 || surface.polygonXZ.length % 2 || !surface.polygonXZ.every(Number.isFinite)) problems.push(`Invalid surface ${surface.id}`);
  for (const node of map.laneNodes) if (![node.x, node.z].every(Number.isFinite)) problems.push(`Invalid lane ${node.id}`);
  for (const edge of map.laneEdges) if (!Number.isFinite(edge.speedLimit) || edge.speedLimit <= 0) problems.push('Invalid lane speed');
  if (problems.length) throw new Error(problems.join('; '));
  if (options.campaign && options.pursuit !== true) throw new Error('Campaign requires pursuit: true');
  if (options.campaign && !map.laneEdges.length) throw new Error('Campaign requires authored lanes');
  const solids = map.colliders.filter(c => c.layer === 'world-solid').map(colliderPolygon);
  for (const spawn of map.spawns) if (![spawn.pose.x, spawn.pose.z, spawn.pose.yaw, spawn.clearanceRadius].every(Number.isFinite) || !isPoseClear(map, solids, spawn.pose)) throw new Error(`Blocked or invalid spawn ${spawn.id}`);
  const config = normalizeGameplay(options.config), mode = options.mode ?? 'practice';
  const queries: StaticQueries = createStaticQueries(map);
  const matchId = options.matchId ?? 'local-match';
  let records = new Map<string, VehicleRecord>(), scores = new Map<string, PlayerScore>(), projectiles = new Map<string, ProjectileState>();
  let grenades = new Map<string, GrenadeState>();
  // Every launch sweep is consumed after all cars have acted in this same synchronous fixed step.
  const launchStarts = new Map<string, PlanarPose>();
  let tick = 0, counter = 0, eventCounter = 0, rng = options.seed ?? 12345, disposed = false;
  let phase: WorldSnapshot['phase'] = mode === 'practice' && !options.campaign ? 'playing' : 'lobby';
  let phaseEnd: number | null = null, creator: string | null = null, events: GameEvent[] = [];
  let pursuit: WorldSnapshot['pursuit'], arrestTicks = 0;
  let contenderTicks = new Map<string, number>();
  let campaign: WorldSnapshot['campaign'] = options.campaign ? { campaignId: CAMPAIGN_ID, dispatchIndex: 0, status: 'active', outcomes: [] } : undefined;
  const check = () => { if (disposed) throw new Error('Simulation disposed'); };
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const emit = (event: { [K in GameEvent['kind']]: { kind: K; payload: Extract<GameEvent, { kind: K }>['payload'] } }[GameEvent['kind']]) => {
    events.push({ ...event, eventId: `${matchId}:event:${++eventCounter}`, matchId, serverTick: tick } as GameEvent);
    if (events.length > 1024) events.splice(0, events.length - 1024);
  };
  const allVehicles = () => [...records.values()].map(r => r.vehicle);
  const recordForPlayer = (id: string) => [...records.values()].find(r => r.vehicle.playerId === id);
  const clearPose = (pose: PlanarPose, excluding?: string, clearance = 0) => isPoseClear(map, solids, pose) && [...records.values()].every(r => r.vehicle.entityId === excluding || r.vehicle.status !== 'active' || (!overlap(box(pose), box(r.vehicle.pose)) && Math.hypot(pose.x - r.vehicle.pose.x, pose.z - r.vehicle.pose.z) >= clearance));
  const spawnPose = (excluding?: string): PlanarPose | null => {
    const candidates = map.spawns.filter(s => clearPose(s.pose, excluding, s.clearanceRadius));
    if (!candidates.length) return null;
    if (!records.size) return clone(candidates[0]!.pose);
    candidates.sort((a, b) => {
      const distance = (p: PlanarPose) => Math.min(...[...records.values()].filter(r => r.vehicle.entityId !== excluding && r.vehicle.status === 'active').map(r => Math.hypot(p.x - r.vehicle.pose.x, p.z - r.vehicle.pose.z)), 1000);
      return distance(b.pose) - distance(a.pose);
    });
    return clone(candidates[0]!.pose);
  };
  const makeVehicle = (pose: PlanarPose, playerId: string | null, bodyAssetId: string): VehicleRecord => {
    const maxHealth = maxHealthForVehicle(config, { playerId, bodyAssetId });
    const vehicle: VehicleState = { entityId: `${matchId}:vehicle:${++counter}`, playerId, bodyAssetId, pose: clone(pose), velocity: { x: 0, z: 0, yawRate: 0 }, health: maxHealth, maxHealth, status: 'active', protectedUntilTick: tick + config.rules.protectionTicks, respawnAtTick: null, sirenOn: false, discontinuityId: 0 };
    const record: VehicleRecord = { vehicle, driver: newDriver(), epoch: 'ai', sequence: -1, lastEdgeSequence: -1, lastAttacker: null, attackerTick: -Infinity };
    records.set(vehicle.entityId, record); return record;
  };
  const addTraffic = (count: number) => {
    if (!map.laneEdges.length) return;
    for (let i = 0; i < count; i++) {
      const edgeIndex = i % map.laneEdges.length, edge = map.laneEdges[edgeIndex]!;
      const a = map.laneNodes.find(n => n.id === edge.from)!, b = map.laneNodes.find(n => n.id === edge.to)!;
      const fraction = 0.2 + Math.floor(i / map.laneEdges.length) * 0.45;
      const pose = { x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
      if (!clearPose(pose, undefined, 6)) continue;
      const suspect = pursuitEnabled && !pursuit;
      const record = makeVehicle(pose, null, suspect ? 'suspect' : ['traffic-sedan', 'traffic-van', 'traffic-taxi'][i % 3]!);
      record.vehicle.protectedUntilTick = 0;
      record.traffic = { edgeIndex, jamTicks: 0, suspect };
      if (suspect) pursuit = { state: 'chasing', suspectId: record.vehicle.entityId, progress: 0, elapsedTicks: 0, arrestingPlayerId: null, winnerPlayerId: null, contenders: [] };
    }
  };
  const trafficCount = options.trafficCount ?? options.config?.trafficCount ?? DEFAULT_GAMEPLAY_CONFIG.trafficCount;
  if (!Number.isInteger(trafficCount) || trafficCount < 0 || trafficCount > config.rules.maxTraffic) { queries.dispose(); throw new Error('Traffic count must be 0–16'); }
  const pursuitEnabled = options.pursuit === true || mode === 'practice' && options.pursuit !== false && trafficCount > 0;
  addTraffic(Math.max(trafficCount, pursuitEnabled ? 1 : 0));
  // An obstructed authored lane must not silently remove the dispatch objective.
  if (pursuitEnabled && map.laneEdges.length && !pursuit) {
    const record = makeVehicle(spawnPose() ?? map.spawns[0]!.pose, null, 'suspect');
    record.vehicle.protectedUntilTick = 0;
    record.traffic = { edgeIndex: 0, jamTicks: 0, suspect: true };
    pursuit = { state: 'chasing', suspectId: record.vehicle.entityId, progress: 0, elapsedTicks: 0, arrestingPlayerId: null, winnerPlayerId: null, contenders: [] };
  }
  const initialSuspect = pursuit ? clone(records.get(pursuit.suspectId)!) : null;
  const applyCampaignTarget = () => {
    if (!campaign || !pursuit) return;
    const record = records.get(pursuit.suspectId);
    if (!record) return;
    record.vehicle.bodyAssetId = getCampaignTarget(CAMPAIGN_DISPATCHES[campaign.dispatchIndex]!.targetId).vehicleBodyId;
    record.vehicle.maxHealth = maxHealthForVehicle(config, { playerId: 'campaign-target', bodyAssetId: record.vehicle.bodyAssetId });
    record.vehicle.health = record.vehicle.maxHealth;
  };
  applyCampaignTarget();
  let propPhysics: ReturnType<typeof createPropPhysics> | null = null;
  try { if (options.props?.length) propPhysics = createPropPhysics(map, options.props); } catch (error) { queries.dispose(); throw error; }

  const authority = (playerId: string): LocalAuthorityState | null => {
    const r = recordForPlayer(playerId); return r ? clone({ vehicle: r.vehicle, driver: r.driver, lastConsumedSequence: r.sequence }) : null;
  };
  const completePursuit = (winner: string, outcome: 'arrested' | 'wrecked', elapsedTicks = pursuit?.elapsedTicks ?? 0) => {
    if (!pursuit || pursuit.state === 'complete' || phase !== 'playing') return;
    if (campaign && outcome === 'wrecked' && getDispatchFeatures(campaign.dispatchIndex).arrestOnly) return;
    if (campaign) {
      if (campaign.outcomes.some(result => result.dispatchIndex === campaign!.dispatchIndex)) return;
      campaign.outcomes.push({ dispatchIndex: campaign.dispatchIndex, outcome, playerId: winner, callsign: scores.get(winner)!.nickname, elapsedTicks });
      if (campaign.outcomes.length === CAMPAIGN_DISPATCHES.length) campaign.status = 'complete';
    }
    pursuit.state = 'complete'; pursuit.winnerPlayerId = winner; pursuit.elapsedTicks = elapsedTicks;
    pursuit.arrestingPlayerId = outcome === 'arrested' ? winner : null;
    if (outcome === 'arrested') { pursuit.progress = 1; scores.get(winner)!.score += 3; }
    phase = 'results'; phaseEnd = null; projectiles.clear(); launchStarts.clear(); grenades.clear();
    emit({ kind: 'pursuit-complete', payload: { elapsedTicks, bonus: outcome === 'arrested' ? 3 : 1, playerId: winner, suspectId: pursuit.suspectId, ...(campaign ? { outcome } : {}) } });
    emit({ kind: 'round-ended', payload: { scores: clone([...scores.values()]), winnerPlayerId: winner, reason: outcome === 'arrested' ? 'apprehended' : 'wrecked' } });
  };
  const wreck = (r: VehicleRecord) => {
    if (r.vehicle.status !== 'active') return;
    r.vehicle.status = 'wrecked'; r.vehicle.health = 0; r.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; r.vehicle.respawnAtTick = tick + config.rules.respawnTicks;
    const credited = r.lastAttacker && tick - r.attackerTick <= config.rules.creditTicks && r.lastAttacker !== r.vehicle.playerId ? r.lastAttacker : null;
    if (credited && scores.has(credited)) scores.get(credited)!.score++;
    if (r.vehicle.playerId) scores.get(r.vehicle.playerId)!.wrecks++;
    emit({ kind: 'wreck', payload: { vehicleId: r.vehicle.entityId, creditedPlayerId: credited, position: clone(r.vehicle.pose), bodyAssetId: r.vehicle.bodyAssetId, discontinuityId: r.vehicle.discontinuityId } });
    if (campaign && pursuit?.suspectId === r.vehicle.entityId && credited && scores.has(credited)) completePursuit(credited, 'wrecked', pursuit.elapsedTicks + 1);
  };
  const respawn = (r: VehicleRecord) => {
    const pose = spawnPose(r.vehicle.entityId);
    if (!pose) { r.vehicle.status = 'respawning'; r.vehicle.respawnAtTick = tick + 30; return; }
    r.vehicle.pose = pose; r.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; r.vehicle.maxHealth = maxHealthForVehicle(config, campaign && pursuit?.suspectId === r.vehicle.entityId ? { playerId: 'campaign-target', bodyAssetId: r.vehicle.bodyAssetId } : r.vehicle); r.vehicle.health = r.vehicle.maxHealth;
    r.vehicle.status = 'active'; r.vehicle.respawnAtTick = null; r.vehicle.discontinuityId++;
    r.vehicle.protectedUntilTick = tick + config.rules.protectionTicks; r.driver = newDriver(); r.lastAttacker = null;
    r.bossAi = undefined;
    emit({ kind: 'respawn', payload: { vehicleId: r.vehicle.entityId, discontinuityId: r.vehicle.discontinuityId } });
  };
  const recovery = (r: VehicleRecord) => {
    if (tick < r.driver.nextRecoveryTick || r.driver.lastDamageTick !== null && tick - r.driver.lastDamageTick < config.rules.recoveryDamageDelayTicks) return;
    const candidates: PlanarPose[] = [clone(r.vehicle.pose)];
    for (const radius of [4, 8, 12]) for (let a = 0; a < 8; a++) candidates.push({ x: r.vehicle.pose.x + Math.sin(a * Math.PI / 4) * radius, z: r.vehicle.pose.z + Math.cos(a * Math.PI / 4) * radius, yaw: r.vehicle.pose.yaw });
    const pose = candidates.find(p => clearPose(p, r.vehicle.entityId, 5));
    if (!pose) return;
    r.vehicle.pose = pose; r.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; r.vehicle.discontinuityId++;
    r.driver.nextRecoveryTick = tick + config.rules.recoveryCooldownTicks; r.driver.resolvedSteering = 0;
  };
  const fire = (r: VehicleRecord, tactics?: BossTactics) => {
    if (tick < r.driver.nextFireTick || projectiles.size > 254) return;
    applyVolleyRecoil(r.vehicle, r.driver, tick, config, tactics?.burstIntervalTicks);
    const volleyId=`${matchId}:volley:${counter+1}`;
    const origins=getVolleyOrigins(r.vehicle.pose).map(pose=>({...pose,yaw:tactics?pose.yaw:selectAssistedYaw({...r.vehicle,pose},allVehicles(),tick,(start,end)=>queries.segmentHit(start,end)!==null,pursuit?.suspectId)}));
    const rounds=origins.map((pose,barrelIndex):ProjectileState=>({entityId:`${matchId}:projectile:${++counter}`,ownerEntityId:r.vehicle.entityId,pose,velocity:{x:Math.sin(pose.yaw)*config.weapon.projectileSpeed,z:Math.cos(pose.yaw)*config.weapon.projectileSpeed,yawRate:0},bornTick:tick,expiresTick:tick+config.weapon.lifetimeTicks,sourceCommandSequence:r.sequence,sourceShotOrdinal:r.driver.shotOrdinal,volleyId,barrelIndex:barrelIndex as 0|1,damage:(tactics?.bulletDamage??config.weapon.damage)/2}));
    for(const p of rounds){projectiles.set(p.entityId,p);launchStarts.set(p.entityId,clone(r.vehicle.pose));}
    emit({kind:'shot',payload:{shooterId:r.vehicle.entityId,projectileId:rounds[0]!.entityId,sessionEpoch:r.epoch,sourceCommandSequence:r.sequence,sourceShotOrdinal:r.driver.shotOrdinal,origin:clone(origins[0]!),projectileIds:rounds.map(p=>p.entityId),origins:clone(origins),volleyId}});
  };
  const collideProjectile = (p:ProjectileState,start:PlanarPose,end:Point,previous?:Map<string,PlanarPose>):boolean => {
      let fraction = queries.segmentHit(start, end) ?? Infinity, target: VehicleRecord | null = null;
      for (const r of records.values()) {
        if (r.vehicle.entityId === p.ownerEntityId || r.vehicle.status !== 'active') continue;
        const old = previous?.get(r.vehicle.entityId) ?? r.vehicle.pose;
        const relativeEnd = { x: end.x - (r.vehicle.pose.x - old.x), z: end.z - (r.vehicle.pose.z - old.z) };
        const hit = segmentPolygon(start, relativeEnd, box(old));
        if (hit !== null && hit < fraction) { fraction = hit; target = r; }
      }
      if (fraction !== Infinity) {
        projectiles.delete(p.entityId);
        if (!target) emit({ kind: 'projectile-impact', payload: { projectileId: p.entityId, ownerEntityId: p.ownerEntityId, position: { x: start.x + (end.x - start.x) * fraction, z: start.z + (end.z - start.z) * fraction, yaw: p.pose.yaw } } });
        if (target && target.vehicle.protectedUntilTick <= tick) {
          const shooter = records.get(p.ownerEntityId);
          if (!shooter || shooter.vehicle.protectedUntilTick > tick) return true;
          const hostile = campaign && pursuit?.suspectId === shooter.vehicle.entityId && shooter.traffic?.suspect;
          if (shooter.vehicle.playerId === null && (!hostile || shooter.vehicle.status !== 'active' || target.vehicle.playerId === null || scores.get(target.vehicle.playerId)?.connection !== 'connected')) return true;
          const damage=p.damage??config.weapon.damage;
          target.vehicle.health = Math.max(0, target.vehicle.health - damage); target.driver.lastDamageTick = tick;
          target.lastAttacker = shooter.vehicle.playerId; target.attackerTick = tick;
          emit({ kind: 'hit', payload: { projectileId: p.entityId, targetId: target.vehicle.entityId, damage, position: { x: start.x + (end.x - start.x) * fraction, z: start.z + (end.z - start.z) * fraction, yaw: p.pose.yaw } } });
          if (target.vehicle.health <= 0) wreck(target);
        }
        return true;
      }
      return false;
  };
  const stepProjectiles = (previous: Map<string, PlanarPose>) => {
    for (const p of projectiles.values()) {
      const launch=launchStarts.get(p.entityId);launchStarts.delete(p.entityId);
      if (tick >= p.expiresTick) { projectiles.delete(p.entityId); continue; }
      if(launch&&collideProjectile(p,launch,p.pose))continue;
      const start=clone(p.pose),end={x:start.x+p.velocity.x*FIXED_DELTA,z:start.z+p.velocity.z*FIXED_DELTA};
      if(!collideProjectile(p,start,end,previous)){p.pose.x=end.x;p.pose.z=end.z;}
    }
  };
  const throwGrenade = (r: VehicleRecord, target: PlanarPose, tactics: BossTactics) => {
    if (grenades.size >= 8 || r.vehicle.protectedUntilTick > tick) return;
    const origin = { x: r.vehicle.pose.x + Math.sin(r.vehicle.pose.yaw), z: r.vehicle.pose.z + Math.cos(r.vehicle.pose.yaw), yaw: r.vehicle.pose.yaw };
    if (queries.segmentHit(r.vehicle.pose, origin) !== null || queries.segmentHit(origin, target) !== null) return;
    const grenade: GrenadeState = { entityId: `${matchId}:grenade:${++counter}`, ownerEntityId: r.vehicle.entityId, origin, target: clone(target), bornTick: tick, landsAtTick: tick + tactics.grenadeFlightTicks, detonatesAtTick: tick + tactics.grenadeFuseTicks, blastRadius: tactics.grenadeRadius, damage: tactics.grenadeDamage };
    grenades.set(grenade.entityId, grenade); emit({ kind: 'grenade-thrown', payload: { grenade: clone(grenade) } });
  };
  const stepGrenades = () => {
    for (const grenade of grenades.values()) {
      if (tick < grenade.detonatesAtTick) continue;
      grenades.delete(grenade.entityId);
      emit({ kind: 'grenade-exploded', payload: { grenadeId: grenade.entityId, ownerEntityId: grenade.ownerEntityId, position: clone(grenade.target), blastRadius: grenade.blastRadius } });
      const owner = records.get(grenade.ownerEntityId);
      if (!owner || owner.vehicle.status !== 'active' || owner.vehicle.protectedUntilTick > tick) continue;
      for (const r of records.values()) {
        const v = r.vehicle;
        if (v.entityId === grenade.ownerEntityId || v.playerId === null || scores.get(v.playerId)?.connection !== 'connected' || v.status !== 'active' || v.protectedUntilTick > tick) continue;
        const distance = Math.hypot(v.pose.x - grenade.target.x, v.pose.z - grenade.target.z);
        if (distance >= grenade.blastRadius || queries.segmentHit(grenade.target, v.pose) !== null) continue;
        const damage = Math.round(grenade.damage * (1 - distance / grenade.blastRadius)); if (damage <= 0) continue;
        v.health = Math.max(0, v.health - damage); r.driver.lastDamageTick = tick; r.lastAttacker = null; r.attackerTick = tick;
        emit({ kind: 'hit', payload: { projectileId: grenade.entityId, targetId: v.entityId, damage, position: clone(v.pose) } });
        if (!v.health) wreck(r);
      }
    }
  };
  const resetPursuit = () => {
    contenderTicks.clear(); arrestTicks = 0;
    if (!pursuit || !initialSuspect) return;
    const record = records.get(pursuit.suspectId);
    if (record) {
      const discontinuity = record.vehicle.discontinuityId + 1;
      Object.assign(record, clone(initialSuspect));
      record.bossAi = undefined;
      record.vehicle.discontinuityId = discontinuity;
      const pose = clearPose(record.vehicle.pose, record.vehicle.entityId) ? record.vehicle.pose : spawnPose(record.vehicle.entityId);
      if (pose) record.vehicle.pose = clone(pose);
      else { record.vehicle.status = 'respawning'; record.vehicle.respawnAtTick = tick + 30; }
    }
    pursuit = { state: 'chasing', suspectId: pursuit.suspectId, progress: 0, elapsedTicks: 0, arrestingPlayerId: null, winnerPlayerId: null, contenders: [...scores.keys()].sort().map(playerId => ({ playerId, progress: 0 })) };
    applyCampaignTarget();
  };
  const updatePursuit = () => {
    if (!pursuit || pursuit.state === 'complete' || phase !== 'playing') return;
    pursuit.elapsedTicks++;
    const suspect = records.get(pursuit.suspectId)?.vehicle;
    if (!suspect) return;
    const eligible = new Set<string>();
    const guidance = new Map<string, ArrestGuidance>();
    for (const r of records.values()) {
      const id = r.vehicle.playerId;
      if (!id) continue;
      const reason: ArrestGuidance = scores.get(id)?.connection !== 'connected' || r.vehicle.status !== 'active' || suspect.status === 'respawning' ? 'unavailable'
        : Math.hypot(r.vehicle.pose.x - suspect.pose.x, r.vehicle.pose.z - suspect.pose.z) >= 8 ? 'get-closer'
        : Math.hypot(r.vehicle.velocity.x - suspect.velocity.x, r.vehicle.velocity.z - suspect.velocity.z) >= 5 ? 'match-speed'
        : queries.segmentHit(r.vehicle.pose, suspect.pose) !== null ? 'clear-obstruction' : 'hold-steady';
      guidance.set(id, reason); if (reason === 'hold-steady') eligible.add(id);
    }
    for (const id of new Set([...scores.keys(), ...contenderTicks.keys()])) {
      const progress = eligible.has(id) ? (contenderTicks.get(id) ?? 0) + 1 : Math.max(0, (contenderTicks.get(id) ?? 0) - 2);
      if (scores.has(id) || progress) contenderTicks.set(id, progress); else contenderTicks.delete(id);
    }
    const contenders = [...scores.keys()].sort().map(playerId => ({ playerId, progress: Math.min(1, (contenderTicks.get(playerId) ?? 0) / config.rules.arrestTicks), guidance: guidance.get(playerId) ?? 'unavailable' }));
    const leaders = contenders.filter(c => eligible.has(c.playerId)).sort((a, b) => b.progress - a.progress || (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0));
    arrestTicks = Math.max(0, ...contenderTicks.values());
    pursuit.contenders = contenders;
    pursuit.progress = Math.min(1, arrestTicks / config.rules.arrestTicks);
    pursuit.arrestingPlayerId = leaders[0]?.playerId ?? null;
    pursuit.winnerPlayerId = null;
    pursuit.state = leaders.length ? 'arresting' : 'chasing';
    const winner = contenders.find(c => eligible.has(c.playerId) && c.progress >= 1)?.playerId;
    if (winner) completePursuit(winner, 'arrested');
  };

  return {
    addPlayer(player) {
      check();
      if (recordForPlayer(player.playerId)) throw new Error('Player already exists');
      if (scores.size >= config.rules.maxPlayers) throw new Error('Room full');
      const nickname = sanitizeNickname(player.nickname), pose = spawnPose();
      const r = makeVehicle(pose ?? map.spawns[0]!.pose, player.playerId, player.bodyAssetId ?? 'patrol'); r.epoch = player.sessionEpoch ?? `epoch-${player.playerId}`;
      // Transient traffic occupancy must not consume an otherwise available room slot.
      // A waiting car has no dynamic collisions or weapon until a clear spawn exists.
      if (!pose) { r.vehicle.status = 'respawning'; r.vehicle.respawnAtTick = tick + 30; }
      scores.set(player.playerId, { playerId: player.playerId, nickname, score: 0, wrecks: 0, connection: 'connected' });
      creator ??= player.playerId;
      return clone(r.vehicle);
    },
    removePlayer(playerId) {
      check(); const r = recordForPlayer(playerId); if (r) { records.delete(r.vehicle.entityId); for (const p of projectiles.values()) if (p.ownerEntityId === r.vehicle.entityId) projectiles.delete(p.entityId); }
      scores.delete(playerId); if (creator === playerId) creator = scores.keys().next().value ?? null;
      if (!campaign && phase === 'countdown' && scores.size < 2) { phase = 'lobby'; phaseEnd = null; }
    },
    setConnection(playerId, connection) { check(); const score = scores.get(playerId); if (score) score.connection = connection; },
    correctLocalMotion(playerId) {
      check(); const record = recordForPlayer(playerId);
      if (!record || record.vehicle.status !== 'active') return false;
      record.vehicle.discontinuityId++; return true;
    },
    setPlayerVehicle(playerId, bodyId) {
      check();
      if (!isVehicleBodyId(bodyId) || (mode === 'multiplayer' || campaign) && phase !== 'lobby') return false;
      const record = recordForPlayer(playerId);
      if (!record || mode === 'practice' && record.vehicle.status !== 'active') return false;
      record.vehicle.bodyAssetId = bodyId;
      record.vehicle.maxHealth = maxHealthForVehicle(config, record.vehicle); record.vehicle.health = record.vehicle.maxHealth;
      record.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; record.vehicle.discontinuityId++;
      record.driver = newDriver(); record.lastAttacker = null; record.attackerTick = -Infinity;
      return true;
    },
    startRound(requesterId) {
      check();
      const connected = [...scores.values()].filter(score => score.connection === 'connected').length;
      if (phase !== 'lobby' || mode !== 'multiplayer' && !campaign || (campaign ? connected < 1 || !requesterId || scores.get(requesterId)?.connection !== 'connected' : scores.size < 2 || requesterId !== undefined && requesterId !== creator)) return false;
      phase = 'countdown'; phaseEnd = tick + config.rules.countdownTicks;
      propPhysics?.reset();
      if (!campaign) for (const score of scores.values()) { score.score = 0; score.wrecks = 0; }
      projectiles.clear(); grenades.clear(); for (const r of records.values()) if (r.vehicle.playerId) respawn(r);
      resetPursuit();
      return true;
    },
    rematch(requesterId) {
      check(); if (mode !== 'multiplayer' && !campaign || phase !== 'results' || (campaign ? !requesterId || scores.get(requesterId)?.connection !== 'connected' : requesterId !== undefined && requesterId !== creator)) return false;
      if (campaign) {
        if (campaign.status === 'complete') {
          campaign = { campaignId: CAMPAIGN_ID, dispatchIndex: 0, status: 'active', outcomes: [] };
          for (const score of scores.values()) { score.score = 0; score.wrecks = 0; }
        } else if (campaign.outcomes.some(outcome => outcome.dispatchIndex === campaign!.dispatchIndex)) campaign.dispatchIndex++;
      }
      phase = 'lobby'; phaseEnd = null; projectiles.clear(); grenades.clear(); propPhysics?.reset(); resetPursuit(); return true;
    },
    step(inputs) {
      check(); tick++;
      if (phaseEnd !== null && tick >= phaseEnd) {
        if (phase === 'countdown') { phase = 'playing'; phaseEnd = tick + config.rules.roundTicks; for (const r of records.values()) r.vehicle.protectedUntilTick = tick + config.rules.protectionTicks; }
        else if (phase === 'playing') { phase = 'results'; phaseEnd = null; projectiles.clear(); grenades.clear(); emit({ kind: 'round-ended', payload: { scores: clone([...scores.values()]), winnerPlayerId: null, reason: 'timeout' } }); }
      }
      if (campaign && phase !== 'playing') return [];
      const context = campaign ? getDispatchFeatures(campaign.dispatchIndex) : DEFAULT_DRIVING_CONTEXT;
      const previous = new Map([...records.values()].map(r => [r.vehicle.entityId, clone(r.vehicle.pose)]));
      const impacts = new Map<string, ContactImpact>();
      const localDriving = new Map<string, { pose: PlanarPose; velocity: VehicleState['velocity']; discontinuityId: number }>();
      const observeImpact = (impact: ContactImpact) => { if (impact.speed > (impacts.get(impact.vehicleId)?.speed ?? 0)) impacts.set(impact.vehicleId, impact); };
      for (const r of records.values()) {
        if (r.vehicle.status !== 'active') { if (r.vehicle.respawnAtTick !== null && tick >= r.vehicle.respawnAtTick) { respawn(r); previous.set(r.vehicle.entityId, clone(r.vehicle.pose)); } continue; }
        let actions: DriverActions = neutralActions();
        let aiTactics: BossTactics | undefined, grenadeTarget: PlanarPose | null = null;
        if (r.traffic) {
          actions = pursuit?.state === 'complete' && r.traffic.suspect ? { ...neutralActions(), handbrake: true } : trafficInput(r.vehicle, r.traffic, map);
          if (r.traffic.jamTicks > 300) {
            const edge = map.laneEdges[r.traffic.edgeIndex]!, a = map.laneNodes.find(n => n.id === edge.from)!, b = map.laneNodes.find(n => n.id === edge.to)!;
            const fraction = 0.2 + random() * 0.6, pose = { x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
            if (clearPose(pose, r.vehicle.entityId, 8)) { r.vehicle.pose = pose; r.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; r.vehicle.discontinuityId++; r.traffic.jamTicks = 0; previous.set(r.vehicle.entityId, clone(pose)); }
          }
          if (campaign && pursuit?.suspectId === r.vehicle.entityId && r.traffic.suspect && phase === 'playing') {
            aiTactics = getBossTactics(campaign.dispatchIndex); r.bossAi ??= newBossAi(tick);
            const officers = allVehicles().filter(v => v.playerId !== null && scores.get(v.playerId)?.connection === 'connected');
            const decision = stepBossAi(r.vehicle, actions, officers, r.bossAi, aiTactics, tick, map.laneEdges[r.traffic.edgeIndex]?.speedLimit ?? aiTactics.cruiseSpeed, (start, end) => queries.segmentHit(start, end) !== null);
            actions = decision.actions; actions.fire = decision.fire; grenadeTarget = decision.grenadeTarget;
          }
        } else {
          const input = inputs.get(r.vehicle.entityId);
          if (input && isDriverActions(input.actions)) {
            actions = clone(input.actions);
            if (input.sessionEpoch !== r.epoch) { r.epoch = input.sessionEpoch; r.sequence = -1; r.lastEdgeSequence = -1; }
            const sequence = input.sourceCommandSequence;
            if (sequence !== null && sequence >= r.sequence) {
              r.sequence = sequence;
              if (sequence <= r.lastEdgeSequence) { actions.sirenToggle = false; actions.recover = false; }
              else r.lastEdgeSequence = sequence;
            } else { actions.sirenToggle = false; actions.recover = false; }
          }
        }
        if (phase === 'results' || phase === 'countdown') actions = { ...neutralActions(), handbrake: true };
        if (actions.sirenToggle) r.vehicle.sirenOn = !r.vehicle.sirenOn;
        if (actions.recover) recovery(r);
        r.driver.simulatedTick = tick;
        const localInput = r.vehicle.playerId ? inputs.get(r.vehicle.entityId) : undefined;
        const direct = localInput?.localDriving && (phase === 'playing' || phase === 'lobby');
        if (direct) {
          const motion = localInput.motion;
          if (motion && motion.discontinuityId === r.vehicle.discontinuityId) {
            const priorVelocity = clone(r.vehicle.velocity);
            r.vehicle.pose = clone(motion.pose); r.vehicle.velocity = clone(motion.velocity);
            // Local physics can deliver the already separated, stopped car.
            // Confirm actual map contact within the solver's millimetre gap,
            // using the room's incoming velocity; never trust a client crash.
            const speed = Math.hypot(priorVelocity.x, priorVelocity.z);
            if (speed >= 3) {
              const probe = clone(r.vehicle); probe.velocity = priorVelocity;
              probe.pose.x += priorVelocity.x / speed * .005; probe.pose.z += priorVelocity.z / speed * .005;
              resolveStatic(probe, map, solids, observeImpact);
            }
          }
          localDriving.set(r.vehicle.entityId, { pose: clone(r.vehicle.pose), velocity: clone(r.vehicle.velocity), discontinuityId: r.vehicle.discontinuityId });
          r.driver.recoilStrength = Math.max(0, (r.driver.recoilStrength ?? 0) - config.weapon.recoilRecovery * FIXED_DELTA);
          resolveStatic(r.vehicle, map, solids, observeImpact);
        } else driveVehicle(r.vehicle, r.driver, actions, map, solids, config, observeImpact, context);
        if (!context.gunsEnabled) actions.fire = false;
        if (actions.fire && phase === 'playing' && (r.vehicle.playerId || aiTactics)) {
          const velocity = direct ? clone(r.vehicle.velocity) : null;
          fire(r, aiTactics);
          // Driver motion already includes its locally simulated recoil. Keep
          // server volley cadence/damage without applying the same kick twice.
          if (velocity) r.vehicle.velocity = velocity;
        }
        if (grenadeTarget && aiTactics && phase === 'playing') throwGrenade(r, grenadeTarget, aiTactics);
      }
      resolveVehicleContacts(allVehicles(), map, solids, observeImpact);
      const contactDeltas: VehicleContactDelta[] = [];
      for (const [id, before] of localDriving) {
        const vehicle = records.get(id)!.vehicle;
        if (vehicle.discontinuityId !== before.discontinuityId) continue;
        const pose = {x:vehicle.pose.x-before.pose.x,z:vehicle.pose.z-before.pose.z,yaw:vehicle.pose.yaw-before.pose.yaw};
        const velocity = {x:vehicle.velocity.x-before.velocity.x,z:vehicle.velocity.z-before.velocity.z,yawRate:vehicle.velocity.yawRate-before.velocity.yawRate};
        if (Math.hypot(pose.x,pose.z,velocity.x,velocity.z)> .00001) contactDeltas.push({entityId:id,pose,velocity});
      }
      propPhysics?.step(allVehicles());
      if (phase === 'playing') for (const impact of impacts.values()) {
        const r = records.get(impact.vehicleId);
        if (!r || impact.speed < 3 || tick < (r.nextCrashTick ?? 0)) continue;
        r.nextCrashTick = tick + 30;
        emit({ kind: 'crash', payload: { vehicleId: r.vehicle.entityId, position: clone(r.vehicle.pose), normal: impact.normal, speed: Math.min(60, impact.speed), discontinuityId: r.vehicle.discontinuityId } });
      }
      if (phase === 'playing') { stepProjectiles(previous); if (phase === 'playing') stepGrenades(); updatePursuit(); }
      return contactDeltas;
    },
    snapshot(forPlayerId) {
      check(); return clone({ protocolVersion: PROTOCOL_VERSION, mapRevision: map.revision, gameplayRevision: config.revision, sessionEpoch: forPlayerId ? recordForPlayer(forPlayerId)?.epoch ?? '' : '', serverTick: tick, matchId, phase, phaseEndsAtTick: phaseEnd, vehicles: allVehicles(), projectiles: [...projectiles.values()], grenades: [...grenades.values()], scores: [...scores.values()], props: propPhysics?.snapshot() ?? [], local: forPlayerId ? authority(forPlayerId) : null, ...(pursuit ? { pursuit } : {}), ...(campaign ? { campaign } : {}) });
    },
    authority,
    restoreAuthority(local, serverTick, proxies = []) {
      check(); tick = serverTick;
      const r = records.get(local.vehicle.entityId) ?? { vehicle: clone(local.vehicle), driver: clone(local.driver), epoch: 'prediction', sequence: -1, lastEdgeSequence: -1, lastAttacker: null, attackerTick: -Infinity };
      r.vehicle = clone(local.vehicle); r.driver = clone(local.driver); r.sequence = local.lastConsumedSequence; r.lastEdgeSequence = local.lastConsumedSequence;
      records = new Map([[r.vehicle.entityId, r]]);
      for (const v of proxies) if (v.entityId !== r.vehicle.entityId) records.set(v.entityId, { vehicle: clone(v), driver: newDriver(), epoch: 'proxy', sequence: -1, lastEdgeSequence: -1, lastAttacker: null, attackerTick: -Infinity });
      projectiles.clear(); grenades.clear(); events = [];
    },
    drainEvents() { check(); const output = events; events = []; return output; },
    checkpoint() {
      check(); return clone({ version: 1, mapRevision: map.revision, gameplayRevision: config.revision, tick, matchId, state: { records: [...records.values()], projectiles: [...projectiles.values()], grenades: [...grenades.values()], scores: [...scores.values()], phase, phaseEnd, counter, eventCounter, rng, creator, pursuit, arrestTicks, contenderTicks: [...contenderTicks], ...(campaign ? { campaign } : {}), ...(propPhysics ? {physicsProps:propPhysics.checkpoint()} : {}) } });
    },
    restore(checkpoint) {
      check(); if (checkpoint.version !== 1 || checkpoint.mapRevision !== map.revision || checkpoint.gameplayRevision !== config.revision || checkpoint.matchId !== matchId) throw new Error('Incompatible simulation checkpoint');
      if ((checkpoint.state.physicsProps?.signature ?? null) !== (propPhysics?.signature ?? null)) throw new Error('Incompatible physics prop checkpoint');
      const c = clone(checkpoint); tick = c.tick; records = new Map(c.state.records.map(r => [r.vehicle.entityId, r])); projectiles = new Map(c.state.projectiles.map(p => [p.entityId, p])); scores = new Map(c.state.scores.map(s => [s.playerId, s]));
      ({ phase, phaseEnd, counter, eventCounter, rng, creator, pursuit, arrestTicks } = c.state); events = [];
      contenderTicks = new Map(c.state.contenderTicks ?? []);
      campaign = c.state.campaign;
      grenades = new Map((c.state.grenades ?? []).map(grenade => [grenade.entityId, grenade]));
      if (propPhysics) { if(c.state.physicsProps) propPhysics.restore(c.state.physicsProps); else propPhysics.reset(); }
    },
    dispose() { if (disposed) return; disposed = true; records.clear(); projectiles.clear(); grenades.clear(); scores.clear(); events = []; queries.dispose(); propPhysics?.dispose(); },
  };
}

export function predictVehicle(map: CollisionMap, vehicle: VehicleState, driver: DriverRuntimeState, actions: DriverActions, proxies: VehicleState[] = [], config?: GameplayConfig, serverTick?: number, context: DispatchDrivingContext = DEFAULT_DRIVING_CONTEXT): { vehicle: VehicleState; driver: DriverRuntimeState } {
  const predicted = clone(vehicle), runtime = clone(driver), solids = map.colliders.filter(c => c.layer === 'world-solid').map(colliderPolygon);
  const tuning = normalizeGameplay(config), tick = serverTick ?? (runtime.simulatedTick ?? 0) + 1;
  runtime.simulatedTick = tick;
  driveVehicle(predicted, runtime, actions, map, solids, tuning, undefined, context);
  if (predicted.status === 'active' && context.gunsEnabled && actions.fire && tick >= runtime.nextFireTick) applyVolleyRecoil(predicted, runtime, tick, tuning);
  // Proxies are samples at the replay tick. Contact separation moves only the predicted car.
  for (const proxy of proxies) if (proxy.entityId !== predicted.entityId && proxy.status === 'active') {
    const push = overlap(box(predicted.pose), box(proxy.pose));
    if (push) { predicted.pose.x += push.x; predicted.pose.z += push.z; const length = Math.hypot(push.x, push.z), inward = (predicted.velocity.x * push.x + predicted.velocity.z * push.z) / length; if (inward < 0) { predicted.velocity.x -= inward * push.x / length; predicted.velocity.z -= inward * push.z / length; } }
  }
  resolveStatic(predicted, map, solids);
  return { vehicle: predicted, driver: runtime };
}
