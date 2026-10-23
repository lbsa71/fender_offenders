import type { WorldSnapshot, VehicleState, DriverRuntimeState, ProjectileState, PropState } from './index';
import { getVehicleProfile } from './vehicle-profiles';
type VehicleWire = [string, string | null, string, number, number, number, number, number, number, number, VehicleState['status'], number, number | null, boolean, number, number?];
type PropWire = [string, PropState['kind'], number, number, number, number, number, number, number, number, 0 | 1, boolean, number];
const q = (n: number) => Math.round(n * 1000) / 1000;
const packCar = (v: VehicleState): VehicleWire => [v.entityId, v.playerId, v.bodyAssetId, q(v.pose.x), q(v.pose.z), q(v.pose.yaw), q(v.velocity.x), q(v.velocity.z), q(v.velocity.yawRate), v.health, v.status, v.protectedUntilTick, v.respawnAtTick, v.sirenOn, v.discontinuityId, v.maxHealth ?? getVehicleProfile(v.bodyAssetId).maxHealth];
const unpackCar = (v: VehicleWire): VehicleState => ({ entityId: v[0], playerId: v[1], bodyAssetId: v[2], pose: { x: v[3], z: v[4], yaw: v[5] }, velocity: { x: v[6], z: v[7], yawRate: v[8] }, health: v[9], status: v[10], protectedUntilTick: v[11], respawnAtTick: v[12], sirenOn: v[13], discontinuityId: v[14], maxHealth: v[15] ?? 100 });
export interface WireSnapshot {
  v: [number, string, string]; e: string; t: number; m: string;
  p: WorldSnapshot['phase']; end: number | null;
  cars: VehicleWire[]; shots: [string, string, number, number, number, number, number, number, number, number, number][];
  scores: WorldSnapshot['scores']; local: [string, DriverRuntimeState, number] | null;
  reset?: WorldSnapshot['resetReason']; pursuit?: WorldSnapshot['pursuit'];
  props?: PropWire[];
  /** True: merge changed tuples with the previous prop roster; omitted props then means no change. */
  propsPatch?: boolean;
}
export function packSnapshot(s: WorldSnapshot): WireSnapshot {
  return { v: [s.protocolVersion, s.mapRevision, s.gameplayRevision], e: s.sessionEpoch, t: s.serverTick, m: s.matchId, p: s.phase, end: s.phaseEndsAtTick,
    cars: s.vehicles.map(packCar), shots: s.projectiles.map(p => [p.entityId, p.ownerEntityId, q(p.pose.x), q(p.pose.z), q(p.pose.yaw), q(p.velocity.x), q(p.velocity.z), p.bornTick, p.expiresTick, p.sourceCommandSequence, p.sourceShotOrdinal]),
    scores: s.scores.map(score => ({ ...score, pingMs: score.pingMs ?? null })), local: s.local ? [s.local.vehicle.entityId, s.local.driver, s.local.lastConsumedSequence] : null, reset: s.resetReason, pursuit: s.pursuit,
    ...(s.props?.length ? { props: s.props.map(p => [p.entityId,p.kind,q(p.scale),q(p.position.x),q(p.position.y),q(p.position.z),q(p.rotation.x),q(p.rotation.y),q(p.rotation.z),q(p.rotation.w),p.mode==='fixed'?0:1,p.sleeping,p.discontinuityId] as PropWire) } : {}) };
}
export function unpackSnapshot(s: WireSnapshot, previousProps: readonly PropState[] = []): WorldSnapshot {
  const vehicles = s.cars.map(unpackCar);
  const projectiles: ProjectileState[] = s.shots.map(p => ({ entityId: p[0], ownerEntityId: p[1], pose: { x: p[2], z: p[3], yaw: p[4] }, velocity: { x: p[5], z: p[6], yawRate: 0 }, bornTick: p[7], expiresTick: p[8], sourceCommandSequence: p[9], sourceShotOrdinal: p[10] }));
  const car = s.local ? vehicles.find(v => v.entityId === s.local![0]) : null;
  const decodedProps:PropState[]=(s.props??[]).map(p=>({entityId:p[0],kind:p[1],scale:p[2],position:{x:p[3],y:p[4],z:p[5]},rotation:{x:p[6],y:p[7],z:p[8],w:p[9]},mode:p[10]===0?'fixed':'dynamic',sleeping:p[11],discontinuityId:p[12]}));
  let props=decodedProps;
  if(s.propsPatch){const merged=new Map(previousProps.map(p=>[p.entityId,{...p,position:{...p.position},rotation:{...p.rotation}}]));for(const prop of decodedProps)merged.set(prop.entityId,prop);props=[...merged.values()];}
  return { protocolVersion: s.v[0], mapRevision: s.v[1], gameplayRevision: s.v[2], sessionEpoch: s.e, serverTick: s.t, matchId: s.m, phase: s.p, phaseEndsAtTick: s.end, vehicles, projectiles, scores: s.scores.map(score => ({ ...score, pingMs: score.pingMs ?? null })),
    local: s.local && car ? { vehicle: car, driver: s.local[1], lastConsumedSequence: s.local[2] } : null, resetReason: s.reset, pursuit: s.pursuit,
    props };
}
