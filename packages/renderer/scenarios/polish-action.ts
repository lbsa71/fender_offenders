import { EngineStore } from '@babylonjs/core/Engines/engineStore';
import { EngineInstrumentation } from '@babylonjs/core/Instrumentation/engineInstrumentation';
import '@babylonjs/core/Engines/Extensions/engine.query';
import '@babylonjs/core/Engines/AbstractEngine/abstractEngine.timeQuery';
import { districtMap, districtProps } from '@fender/content';
import { VEHICLE_BODIES, type VehicleState, type RenderFrame, type GameEvent } from '@fender/contracts';
import { createGameRenderer } from '../src/index';

const parameters = new URLSearchParams(location.search);
const quality = parameters.get('quality') === 'low' ? 'low' : 'medium';
const renderer = createGameRenderer(document.querySelector('canvas')!, districtMap, { quality, muted: true });
const scene = EngineStore.LastCreatedScene!, instrumentation = new EngineInstrumentation(scene.getEngine()); instrumentation.captureGPUFrameTime = true;
// Cost ablation only: keep the same scene, pools, source halos and quality, but exclude
// headlight cones from receiver shaders. Never used by the production app.
if (parameters.get('headlights') === 'off') for (const light of scene.lights) if (light.name.startsWith('car-headlight-')) light.excludeWithLayerMask = 0xffffffff;
const players: VehicleState[] = Array.from({ length: 8 }, (_, i) => ({ entityId: `officer-${i}`, playerId: `officer-${i}`, bodyAssetId: VEHICLE_BODIES[i % VEHICLE_BODIES.length]!, pose: { x: i % 2 ? -4 : 4, z: -60 + i * 7, yaw: 0 }, velocity: { x: 0, z: 8, yawRate: 0 }, health: 100, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: true, discontinuityId: 0 }));
const traffic: VehicleState[] = Array.from({ length: 8 }, (_, i) => ({ ...players[i]!, entityId: `traffic-${i}`, playerId: null, bodyAssetId: 'traffic-sedan', pose: { x: i % 2 ? -76 : 76, z: -65 + i * 17, yaw: 0 }, sirenOn: false }));
const frame: RenderFrame = { sampleTimeSeconds: 0, serverTick: 0, vehicles: [...players, ...traffic], projectiles: [], grenades: [], props: districtProps.map(p => ({ ...p, scale: p.scale ?? 1, rotation: { x: 0, y: Math.sin((p.yaw ?? 0) / 2), z: 0, w: Math.cos((p.yaw ?? 0) / 2) }, mode: 'fixed', sleeping: true, discontinuityId: 0 })), localEntityId: players[0]!.entityId, cameraTarget: players[0]!.pose };
let previous = performance.now(), start = previous, measuring = false, duration = 300, volley = -1, grenadeOrdinal = -1, wreckWave = -1, eventId = 0, generation = 0;
let samples: Array<{ interval: number; cpu: number; gpu: number | null; draws: number; theme: string }> = [];
let maxima = { wreckBodies: 0, projectiles: 0, grenadeWarnings: 0, grenadeBlasts: 0, headlights: 0, glints: 0, splashDrops: 0, helicopters: 0 };
function present(kind: GameEvent['kind'], payload: unknown, tick: number) { renderer.present([{ kind, payload, eventId: `action-${++eventId}`, matchId: `polish-action-${generation}`, serverTick: tick } as GameEvent]); }
function step(now: number) {
  const interval = now - previous, dt = Math.max(0, Math.min(.1, interval / 1000)); previous = now;
  const time = (now - start) / 1000, tick = Math.floor(time * 60), phase = Math.min(2, Math.floor(time / Math.max(1, duration / 3)));
  renderer.setDispatch(['loose-change', 'express-distress', 'green-light'][phase]!);
  const center = -35 + Math.sin(time / 18) * 30;
  for (let i = 0; i < players.length; i++) players[i]!.pose.z = center + (i - 3) * 6;
  for (let i = 0; i < traffic.length; i++) traffic[i]!.pose.z = -100 + (time * 9 + i * 24) % 200;
  frame.cameraTarget = { x: 4, z: center, yaw: 0 }; frame.sampleTimeSeconds = time; frame.serverTick = tick;
  const wave = Math.floor(time / 12), age = time % 12;
  frame.helicopter = {entityId:`trace-chopper-${wave}`,dispatchIndex:4,phase:'attack',health:60,from:{x:4,z:center-8},to:{x:4,z:center-8},yaw:Math.PI/2,startedAtTick:tick,endsAtTick:tick+150};
  if (wave !== wreckWave) {
    wreckWave = wave;
    for (const v of players) { v.status = 'active'; v.health = 100; v.discontinuityId++; }
  }
  if (age > 5 && age < 7.6 && players[0]!.status === 'active') {
    // Warm one sampled pose before presenting complete authoritative-style wreck metadata.
    renderer.render(frame, 0);
    for (const v of players) { present('wreck', { vehicleId: v.entityId, creditedPlayerId: null, position: { ...v.pose }, bodyAssetId: v.bodyAssetId, discontinuityId: v.discontinuityId }, tick); v.status = 'wrecked'; v.health = 0; }
  }
  if (age >= 7.6 && age < 8) for (const v of players) v.status = 'respawning';
  if (age >= 8 && players[0]!.status !== 'active') for (const v of players) { v.status = 'active'; v.health = 100; v.discontinuityId++; present('respawn', { vehicleId: v.entityId, discontinuityId: v.discontinuityId }, tick); }
  const shot = Math.floor(time * 5);
  if (shot !== volley) {
    volley = shot;
    for (const v of players.filter(v => v.status === 'active')) {
      const origins = [-.63, .63].map(side => ({ x: v.pose.x + side, z: v.pose.z + 2.45, yaw: 0 }));
      const ids = origins.map((_, barrel) => `${v.entityId}-${shot}-${barrel}`);
      present('shot', { shooterId: v.entityId, projectileId: ids[0], projectileIds: ids, origin: origins[0], origins, volleyId: `${v.entityId}-${shot}`, sessionEpoch: 'trace', sourceCommandSequence: shot, sourceShotOrdinal: shot }, tick);
    }
  }
  frame.projectiles = players.filter(v => v.status === 'active').flatMap(v => [-.63, .63].map((side, barrel) => ({ entityId: `${v.entityId}-${shot}-${barrel}`, ownerEntityId: v.entityId, pose: { x: v.pose.x + side, z: v.pose.z + 2.45 + (time % .2) * 70, yaw: 0 }, velocity: { x: 0, z: 70, yawRate: 0 }, bornTick: Math.floor(time * 5) * 12, expiresTick: tick + 40, sourceCommandSequence: shot, sourceShotOrdinal: shot, presentationAgeSeconds: time % .2, barrelIndex: barrel as 0 | 1 })));
  const ordinal = Math.floor(time / 3), grenadeAge = time % 3;
  frame.grenades = grenadeAge < 2.5 ? [{ entityId: `grenade-${ordinal}`, ownerEntityId: 'officer-7', origin: { x: -4, z: center + 12, yaw: 0 }, target: { x: 4, z: center + 7, yaw: 0 }, bornTick: ordinal * 180, landsAtTick: ordinal * 180 + 60, detonatesAtTick: ordinal * 180 + 150, blastRadius: 6, damage: 30 }] : [];
  if (grenadeAge >= 2.5 && ordinal !== grenadeOrdinal) { grenadeOrdinal = ordinal; present('grenade-exploded', { grenadeId: `grenade-${ordinal}`, ownerEntityId: 'officer-7', position: { x: 4, z: center + 7, yaw: 0 }, blastRadius: 6 }, tick); }
  renderer.render(frame, dt);
  const stats = renderer.getStats();
  if (measuring) {
    const gpu = instrumentation.gpuFrameTimeCounter.current / 1e6;
    samples.push({ interval, cpu: stats.frameCpuMs, gpu: gpu > 0 ? gpu : null, draws: stats.drawCalls, theme: stats.environmentTheme });
    maxima.wreckBodies = Math.max(maxima.wreckBodies, stats.wreckBodies); maxima.projectiles = Math.max(maxima.projectiles, frame.projectiles.length);
    maxima.grenadeWarnings = Math.max(maxima.grenadeWarnings, stats.grenadeWarnings); maxima.grenadeBlasts = Math.max(maxima.grenadeBlasts, stats.grenadeBlasts);
    maxima.headlights = Math.max(maxima.headlights, stats.headlightLights); maxima.glints = Math.max(maxima.glints, stats.sourceGlints);
    maxima.splashDrops = Math.max(maxima.splashDrops, stats.waterSplashDrops);
    maxima.helicopters = Math.max(maxima.helicopters, Number(stats.helicopterVisible));
  }
  document.querySelector('#status')!.textContent = `8 officers / 8 traffic · ${stats.environmentTheme} · ${stats.wreckBodies} physical components · ${quality}`;
  requestAnimationFrame(step);
}
requestAnimationFrame(step);
Object.assign(window, { polishAction: {
  renderer, scene, frame,
  start(seconds: number) { duration = seconds; generation++; measuring = true; samples = []; start = previous = performance.now(); volley = grenadeOrdinal = wreckWave = -1; },
  stop() { measuring = false; return { samples, maxima, stats: renderer.getStats() }; },
} });
