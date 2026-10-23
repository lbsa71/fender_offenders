import { PROTOCOL_VERSION, isDriverActions, isVehicleBodyId, sanitizeNickname, validateMap } from '@fender/contracts';
import type { AppliedDriverInput, CollisionMap, DriverActions, DriverRuntimeState, GameEvent, GameplayConfig, LocalAuthorityState, PlanarPose, PlayerScore, ProjectileState, VehicleState, WorldSnapshot } from '@fender/contracts';
import { DEFAULT_GAMEPLAY_CONFIG, FIXED_DELTA, normalizeGameplay, type SimulationConfig } from './config.js';
import { box, colliderPolygon, isPoseClear, overlap, segmentPolygon, type Point } from '../physics/geometry.js';
import { driveVehicle, neutralActions, newDriver, resolveStatic, resolveVehicleContacts } from '../vehicles/controller.js';
import { trafficInput, type TrafficRuntime } from '../traffic/traffic.js';
import { createStaticQueries, type StaticQueries } from '../physics/rapier.js';
import { maxHealthForVehicle } from '../vehicles/profiles.js';

interface VehicleRecord {
  vehicle: VehicleState; driver: DriverRuntimeState; epoch: string; sequence: number;
  lastEdgeSequence: number; lastAttacker: string | null; attackerTick: number;
  traffic?: TrafficRuntime;
}
export interface SimulationOptions {
  mode?: 'practice' | 'multiplayer'; seed?: number; matchId?: string;
  trafficCount?: number; config?: GameplayConfig; pursuit?: boolean;
}
export interface PlayerOptions { playerId: string; nickname: string; sessionEpoch?: string; bodyAssetId?: string }
export interface SimulationCheckpoint {
  version: 1; mapRevision: string; gameplayRevision: string; tick: number; matchId: string;
  state: { records: VehicleRecord[]; projectiles: ProjectileState[]; scores: PlayerScore[]; phase: WorldSnapshot['phase']; phaseEnd: number | null; counter: number; eventCounter: number; rng: number; creator: string | null; pursuit: WorldSnapshot['pursuit']; arrestTicks: number };
}
export interface Simulation {
  addPlayer(options: PlayerOptions): VehicleState;
  removePlayer(playerId: string): void;
  setConnection(playerId: string, connection: PlayerScore['connection']): void;
  setPlayerVehicle(playerId: string, bodyId: string): boolean;
  startRound(requesterId?: string): boolean;
  rematch(requesterId?: string): boolean;
  step(inputs: ReadonlyMap<string, AppliedDriverInput>): void;
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
  const solids = map.colliders.filter(c => c.layer === 'world-solid').map(colliderPolygon);
  for (const spawn of map.spawns) if (![spawn.pose.x, spawn.pose.z, spawn.pose.yaw, spawn.clearanceRadius].every(Number.isFinite) || !isPoseClear(map, solids, spawn.pose)) throw new Error(`Blocked or invalid spawn ${spawn.id}`);
  const config = normalizeGameplay(options.config), mode = options.mode ?? 'practice';
  const queries: StaticQueries = createStaticQueries(map);
  const matchId = options.matchId ?? 'local-match';
  let records = new Map<string, VehicleRecord>(), scores = new Map<string, PlayerScore>(), projectiles = new Map<string, ProjectileState>();
  let tick = 0, counter = 0, eventCounter = 0, rng = options.seed ?? 12345, disposed = false;
  let phase: WorldSnapshot['phase'] = mode === 'practice' ? 'playing' : 'lobby';
  let phaseEnd: number | null = null, creator: string | null = null, events: GameEvent[] = [];
  let pursuit: WorldSnapshot['pursuit'], arrestTicks = 0;
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
      const suspect = mode === 'practice' && options.pursuit !== false && !pursuit;
      const record = makeVehicle(pose, null, suspect ? 'suspect' : ['traffic-sedan', 'traffic-van', 'traffic-taxi'][i % 3]!);
      record.vehicle.protectedUntilTick = 0;
      record.traffic = { edgeIndex, jamTicks: 0, suspect };
      if (suspect) pursuit = { state: 'chasing', suspectId: record.vehicle.entityId, progress: 0, elapsedTicks: 0 };
    }
  };
  const trafficCount = options.trafficCount ?? options.config?.trafficCount ?? DEFAULT_GAMEPLAY_CONFIG.trafficCount;
  if (!Number.isInteger(trafficCount) || trafficCount < 0 || trafficCount > config.rules.maxTraffic) { queries.dispose(); throw new Error('Traffic count must be 0–16'); }
  addTraffic(trafficCount);

  const authority = (playerId: string): LocalAuthorityState | null => {
    const r = recordForPlayer(playerId); return r ? clone({ vehicle: r.vehicle, driver: r.driver, lastConsumedSequence: r.sequence }) : null;
  };
  const wreck = (r: VehicleRecord) => {
    if (r.vehicle.status !== 'active') return;
    r.vehicle.status = 'wrecked'; r.vehicle.health = 0; r.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; r.vehicle.respawnAtTick = tick + config.rules.respawnTicks;
    const credited = r.lastAttacker && tick - r.attackerTick <= config.rules.creditTicks && r.lastAttacker !== r.vehicle.playerId ? r.lastAttacker : null;
    if (credited && scores.has(credited)) scores.get(credited)!.score++;
    if (r.vehicle.playerId) scores.get(r.vehicle.playerId)!.wrecks++;
    emit({ kind: 'wreck', payload: { vehicleId: r.vehicle.entityId, creditedPlayerId: credited } });
  };
  const respawn = (r: VehicleRecord) => {
    const pose = spawnPose(r.vehicle.entityId);
    if (!pose) { r.vehicle.status = 'respawning'; r.vehicle.respawnAtTick = tick + 30; return; }
    r.vehicle.pose = pose; r.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; r.vehicle.maxHealth = maxHealthForVehicle(config, r.vehicle); r.vehicle.health = r.vehicle.maxHealth;
    r.vehicle.status = 'active'; r.vehicle.respawnAtTick = null; r.vehicle.discontinuityId++;
    r.vehicle.protectedUntilTick = tick + config.rules.protectionTicks; r.driver = newDriver(); r.lastAttacker = null;
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
  const fire = (r: VehicleRecord) => {
    if (tick < r.driver.nextFireTick || projectiles.size >= 256) return;
    r.vehicle.protectedUntilTick = tick;
    r.driver.nextFireTick = tick + config.weapon.cooldownTicks; r.driver.shotOrdinal++;
    const fx = Math.sin(r.vehicle.pose.yaw), fz = Math.cos(r.vehicle.pose.yaw);
    // Start at center: sweeping to the muzzle prevents shooting through a close wall.
    const pose = clone(r.vehicle.pose);
    const projectile: ProjectileState = { entityId: `${matchId}:projectile:${++counter}`, ownerEntityId: r.vehicle.entityId, pose, velocity: { x: fx * config.weapon.projectileSpeed, z: fz * config.weapon.projectileSpeed, yawRate: 0 }, bornTick: tick, expiresTick: tick + config.weapon.lifetimeTicks, sourceCommandSequence: r.sequence, sourceShotOrdinal: r.driver.shotOrdinal };
    projectiles.set(projectile.entityId, projectile);
    emit({ kind: 'shot', payload: { shooterId: r.vehicle.entityId, projectileId: projectile.entityId, sessionEpoch: r.epoch, sourceCommandSequence: r.sequence, sourceShotOrdinal: r.driver.shotOrdinal, origin: { ...pose, x: pose.x + fx * 2.3, z: pose.z + fz * 2.3 } } });
  };
  const stepProjectiles = (previous: Map<string, PlanarPose>) => {
    for (const p of projectiles.values()) {
      if (tick >= p.expiresTick) { projectiles.delete(p.entityId); continue; }
      const start = clone(p.pose), end = { x: start.x + p.velocity.x * FIXED_DELTA, z: start.z + p.velocity.z * FIXED_DELTA };
      let fraction = queries.segmentHit(start, end) ?? Infinity, target: VehicleRecord | null = null;
      for (const r of records.values()) {
        if (r.vehicle.entityId === p.ownerEntityId || r.vehicle.status !== 'active') continue;
        const old = previous.get(r.vehicle.entityId) ?? r.vehicle.pose;
        const relativeEnd = { x: end.x - (r.vehicle.pose.x - old.x), z: end.z - (r.vehicle.pose.z - old.z) };
        const hit = segmentPolygon(start, relativeEnd, box(old));
        if (hit !== null && hit < fraction) { fraction = hit; target = r; }
      }
      if (fraction !== Infinity) {
        projectiles.delete(p.entityId);
        if (target && target.vehicle.protectedUntilTick <= tick) {
          const shooter = records.get(p.ownerEntityId);
          if (!shooter || shooter.vehicle.protectedUntilTick > tick) continue;
          target.vehicle.health = Math.max(0, target.vehicle.health - config.weapon.damage); target.driver.lastDamageTick = tick;
          target.lastAttacker = shooter.vehicle.playerId; target.attackerTick = tick;
          emit({ kind: 'hit', payload: { projectileId: p.entityId, targetId: target.vehicle.entityId, damage: config.weapon.damage, position: { x: start.x + (end.x - start.x) * fraction, z: start.z + (end.z - start.z) * fraction, yaw: p.pose.yaw } } });
          if (target.vehicle.health <= 0) wreck(target);
        }
      } else { p.pose.x = end.x; p.pose.z = end.z; }
    }
  };
  const updatePursuit = () => {
    if (!pursuit || pursuit.state === 'complete') return;
    pursuit.elapsedTicks++;
    const suspect = records.get(pursuit.suspectId)?.vehicle;
    if (!suspect) return;
    let officer: VehicleRecord | undefined;
    for (const r of records.values()) if (r.vehicle.playerId && r.vehicle.status === 'active' && Math.hypot(r.vehicle.pose.x - suspect.pose.x, r.vehicle.pose.z - suspect.pose.z) < 8 && (suspect.status !== 'active' || Math.hypot(r.vehicle.velocity.x - suspect.velocity.x, r.vehicle.velocity.z - suspect.velocity.z) < 5)) { officer = r; break; }
    arrestTicks = officer ? arrestTicks + 1 : Math.max(0, arrestTicks - 2);
    pursuit.progress = Math.min(1, arrestTicks / config.rules.arrestTicks); pursuit.state = arrestTicks ? 'arresting' : 'chasing';
    if (arrestTicks >= config.rules.arrestTicks) {
      pursuit.state = 'complete';
      if (officer?.vehicle.playerId) scores.get(officer.vehicle.playerId)!.score += 3;
      emit({ kind: 'pursuit-complete', payload: { elapsedTicks: pursuit.elapsedTicks, bonus: 3 } });
    }
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
      if (phase === 'countdown' && scores.size < 2) { phase = 'lobby'; phaseEnd = null; }
    },
    setConnection(playerId, connection) { check(); const score = scores.get(playerId); if (score) score.connection = connection; },
    setPlayerVehicle(playerId, bodyId) {
      check();
      if (!isVehicleBodyId(bodyId) || mode === 'multiplayer' && phase !== 'lobby') return false;
      const record = recordForPlayer(playerId);
      if (!record || mode === 'practice' && record.vehicle.status !== 'active') return false;
      record.vehicle.bodyAssetId = bodyId;
      record.vehicle.maxHealth = maxHealthForVehicle(config, record.vehicle); record.vehicle.health = record.vehicle.maxHealth;
      record.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; record.vehicle.discontinuityId++;
      record.driver = newDriver(); record.lastAttacker = null; record.attackerTick = -Infinity;
      return true;
    },
    startRound(requesterId) {
      check(); if (mode !== 'multiplayer' || phase !== 'lobby' || scores.size < 2 || requesterId !== undefined && requesterId !== creator) return false;
      phase = 'countdown'; phaseEnd = tick + config.rules.countdownTicks;
      for (const score of scores.values()) { score.score = 0; score.wrecks = 0; }
      projectiles.clear(); for (const r of records.values()) if (r.vehicle.playerId) respawn(r);
      return true;
    },
    rematch(requesterId) {
      check(); if (phase !== 'results' || requesterId !== undefined && requesterId !== creator) return false;
      phase = 'lobby'; phaseEnd = null; projectiles.clear(); return true;
    },
    step(inputs) {
      check(); tick++;
      if (phaseEnd !== null && tick >= phaseEnd) {
        if (phase === 'countdown') { phase = 'playing'; phaseEnd = tick + config.rules.roundTicks; for (const r of records.values()) r.vehicle.protectedUntilTick = tick + config.rules.protectionTicks; }
        else if (phase === 'playing') { phase = 'results'; phaseEnd = null; projectiles.clear(); emit({ kind: 'round-ended', payload: { scores: clone([...scores.values()]) } }); }
      }
      const previous = new Map([...records.values()].map(r => [r.vehicle.entityId, clone(r.vehicle.pose)]));
      for (const r of records.values()) {
        if (r.vehicle.status !== 'active') { if (r.vehicle.respawnAtTick !== null && tick >= r.vehicle.respawnAtTick) { respawn(r); previous.set(r.vehicle.entityId, clone(r.vehicle.pose)); } continue; }
        let actions: DriverActions = neutralActions();
        if (r.traffic) {
          actions = pursuit?.state === 'complete' && r.traffic.suspect ? { ...neutralActions(), handbrake: true } : trafficInput(r.vehicle, r.traffic, map);
          if (r.traffic.jamTicks > 300) {
            const edge = map.laneEdges[r.traffic.edgeIndex]!, a = map.laneNodes.find(n => n.id === edge.from)!, b = map.laneNodes.find(n => n.id === edge.to)!;
            const fraction = 0.2 + random() * 0.6, pose = { x: a.x + (b.x - a.x) * fraction, z: a.z + (b.z - a.z) * fraction, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
            if (clearPose(pose, r.vehicle.entityId, 8)) { r.vehicle.pose = pose; r.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; r.vehicle.discontinuityId++; r.traffic.jamTicks = 0; previous.set(r.vehicle.entityId, clone(pose)); }
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
        driveVehicle(r.vehicle, r.driver, actions, map, solids, config);
        if (actions.fire && phase === 'playing' && r.vehicle.playerId) fire(r);
      }
      resolveVehicleContacts(allVehicles(), map, solids);
      if (phase === 'playing') { stepProjectiles(previous); if (mode === 'practice') updatePursuit(); }
    },
    snapshot(forPlayerId) {
      check(); return clone({ protocolVersion: PROTOCOL_VERSION, mapRevision: map.revision, gameplayRevision: config.revision, sessionEpoch: forPlayerId ? recordForPlayer(forPlayerId)?.epoch ?? '' : '', serverTick: tick, matchId, phase, phaseEndsAtTick: phaseEnd, vehicles: allVehicles(), projectiles: [...projectiles.values()], scores: [...scores.values()], local: forPlayerId ? authority(forPlayerId) : null, ...(pursuit ? { pursuit } : {}) });
    },
    authority,
    restoreAuthority(local, serverTick, proxies = []) {
      check(); tick = serverTick;
      const r = records.get(local.vehicle.entityId) ?? { vehicle: clone(local.vehicle), driver: clone(local.driver), epoch: 'prediction', sequence: -1, lastEdgeSequence: -1, lastAttacker: null, attackerTick: -Infinity };
      r.vehicle = clone(local.vehicle); r.driver = clone(local.driver); r.sequence = local.lastConsumedSequence; r.lastEdgeSequence = local.lastConsumedSequence;
      records = new Map([[r.vehicle.entityId, r]]);
      for (const v of proxies) if (v.entityId !== r.vehicle.entityId) records.set(v.entityId, { vehicle: clone(v), driver: newDriver(), epoch: 'proxy', sequence: -1, lastEdgeSequence: -1, lastAttacker: null, attackerTick: -Infinity });
      projectiles.clear(); events = [];
    },
    drainEvents() { check(); const output = events; events = []; return output; },
    checkpoint() {
      check(); return clone({ version: 1, mapRevision: map.revision, gameplayRevision: config.revision, tick, matchId, state: { records: [...records.values()], projectiles: [...projectiles.values()], scores: [...scores.values()], phase, phaseEnd, counter, eventCounter, rng, creator, pursuit, arrestTicks } });
    },
    restore(checkpoint) {
      check(); if (checkpoint.version !== 1 || checkpoint.mapRevision !== map.revision || checkpoint.gameplayRevision !== config.revision || checkpoint.matchId !== matchId) throw new Error('Incompatible simulation checkpoint');
      const c = clone(checkpoint); tick = c.tick; records = new Map(c.state.records.map(r => [r.vehicle.entityId, r])); projectiles = new Map(c.state.projectiles.map(p => [p.entityId, p])); scores = new Map(c.state.scores.map(s => [s.playerId, s]));
      ({ phase, phaseEnd, counter, eventCounter, rng, creator, pursuit, arrestTicks } = c.state); events = [];
    },
    dispose() { if (disposed) return; disposed = true; records.clear(); projectiles.clear(); scores.clear(); events = []; queries.dispose(); },
  };
}

export function predictVehicle(map: CollisionMap, vehicle: VehicleState, driver: DriverRuntimeState, actions: DriverActions, proxies: VehicleState[] = [], config?: GameplayConfig): { vehicle: VehicleState; driver: DriverRuntimeState } {
  const predicted = clone(vehicle), runtime = clone(driver), solids = map.colliders.filter(c => c.layer === 'world-solid').map(colliderPolygon);
  driveVehicle(predicted, runtime, actions, map, solids, normalizeGameplay(config));
  // Proxies are samples at the replay tick. Contact separation moves only the predicted car.
  for (const proxy of proxies) if (proxy.entityId !== predicted.entityId && proxy.status === 'active') {
    const push = overlap(box(predicted.pose), box(proxy.pose));
    if (push) { predicted.pose.x += push.x; predicted.pose.z += push.z; const length = Math.hypot(push.x, push.z), inward = (predicted.velocity.x * push.x + predicted.velocity.z * push.z) / length; if (inward < 0) { predicted.velocity.x -= inward * push.x / length; predicted.velocity.z -= inward * push.z / length; } }
  }
  resolveStatic(predicted, map, solids);
  return { vehicle: predicted, driver: runtime };
}
