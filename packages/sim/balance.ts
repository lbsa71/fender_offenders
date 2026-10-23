import { GAMEPLAY_REVISION, VEHICLE_BODIES, getVehicleProfile, neutralActions, type CollisionMap, type DriverActions, type VehicleBodyId } from '@fender/contracts';
import { createSimulation, initPhysics, type Simulation } from './src/index.js';

const arena: CollisionMap = { id: 'balance-arena', revision: 'balance-arena-1', bounds: { minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 }, colliders: [], surfaces: [], spawns: [{ id: 'south', pose: { x: 0, z: -1000, yaw: 0 }, clearanceRadius: 5 }, { id: 'north', pose: { x: 0, z: 1000, yaw: Math.PI }, clearanceRadius: 5 }], laneNodes: [], laneEdges: [] };
function input(sim: Simulation, id: string, sequence: number, actions: Partial<DriverActions> = {}) {
  sim.step(new Map([[id, { actions: { ...neutralActions(), ...actions }, sessionEpoch: 'balance', sourceCommandSequence: sequence }]]));
}
function measure(body: VehicleBodyId) {
  const profile = getVehicleProfile(body), sim = createSimulation(arena, { trafficCount: 0 });
  try {
    const car = sim.addPlayer({ playerId: body, nickname: profile.name, bodyAssetId: body });
    let speedAfterOneSecond = 0, distanceAfterTwoSeconds = 0, timeToTwentyMetresPerSecond: number | null = null, timeToTravelTwentyMetres: number | null = null;
    for (let tick = 0; tick < 600; tick++) {
      input(sim, car.entityId, tick, { throttle: 1 }); const state = sim.authority(body)!.vehicle;
      if (tick === 59) speedAfterOneSecond = state.velocity.z;
      if (tick === 119) distanceAfterTwoSeconds = state.pose.z - car.pose.z;
      if (timeToTwentyMetresPerSecond === null && state.velocity.z >= 20 - 1e-6) timeToTwentyMetresPerSecond = (tick + 1) / 60;
      if (timeToTravelTwentyMetres === null && state.pose.z - car.pose.z >= 20) timeToTravelTwentyMetres = (tick + 1) / 60;
    }
    const actualTopSpeed = sim.authority(body)!.vehicle.velocity.z;
    const turning = sim.checkpoint(); turning.state.records[0]!.vehicle.pose = { x: 0, z: 0, yaw: 0 }; turning.state.records[0]!.vehicle.velocity = { x: 0, z: 12, yawRate: 0 }; sim.restore(turning);
    for (let tick = 0; tick < 30; tick++) input(sim, car.entityId, tick, { steer: 1 });
    const turnDegrees = sim.authority(body)!.vehicle.pose.yaw * 180 / Math.PI;
    let pathLength = 0, yawTravel = 0;
    for (let tick = 0; tick < 600; tick++) {
      const previous = sim.authority(body)!.vehicle; input(sim, car.entityId, tick, { throttle: 1, steer: 1 }); const current = sim.authority(body)!.vehicle;
      if (tick >= 480) { pathLength += Math.hypot(current.pose.x - previous.pose.x, current.pose.z - previous.pose.z); yawTravel += Math.abs(Math.atan2(Math.sin(current.pose.yaw - previous.pose.yaw), Math.cos(current.pose.yaw - previous.pose.yaw))); }
    }
    const steadyTurnRadius = pathLength / yawTravel;
    const impact = sim.checkpoint(); impact.state.records[0]!.vehicle.pose = { x: 0, z: 0, yaw: 0 }; impact.state.records[0]!.vehicle.velocity = { x: 6, z: 12, yawRate: 0 }; impact.state.records[0]!.driver.resolvedSteering = 0; sim.restore(impact);
    for (let tick = 0; tick < 12; tick++) input(sim, car.entityId, tick);
    const residualSideSpeed = sim.authority(body)!.vehicle.velocity.x;
    return { actualTopSpeed, speedAfterOneSecond, distanceAfterTwoSeconds, timeToTwentyMetresPerSecond, timeToTravelTwentyMetres, turnDegrees, steadyTurnRadius, residualSideSpeed };
  } finally { sim.dispose(); }
}
function combat(body: VehicleBodyId) {
  const sim = createSimulation(arena, { trafficCount: 0 });
  try {
    const shooter = sim.addPlayer({ playerId: 'shooter', nickname: 'Shooter', bodyAssetId: 'patrol' });
    sim.addPlayer({ playerId: 'target', nickname: 'Target', bodyAssetId: body });
    const fixture = sim.checkpoint();
    fixture.state.records[0]!.vehicle.pose = { x: 0, z: -10, yaw: 0 }; fixture.state.records[1]!.vehicle.pose = { x: 0, z: 10, yaw: 0 };
    for (const record of fixture.state.records) record.vehicle.protectedUntilTick = 0;
    sim.restore(fixture);
    const hits: {tick:number;projectileId:string;damage:number}[] = [], volleys=new Map<string,string>();
    for (let tick = 0; tick < 240 && sim.authority('target')!.vehicle.status === 'active'; tick++) {
      input(sim, shooter.entityId, tick, { fire: true });
      for (const event of sim.drainEvents()) {
        if(event.kind==='shot')for(const id of event.payload.projectileIds??[event.payload.projectileId])volleys.set(id,event.payload.volleyId??event.eventId);
        if(event.kind==='hit')hits.push({tick:event.serverTick,projectileId:event.payload.projectileId,damage:event.payload.damage});
      }
    }
    return { hitsToWreck: hits.length, volleysToWreck:new Set(hits.map(hit=>volleys.get(hit.projectileId))).size,totalDamage:hits.reduce((sum,hit)=>sum+hit.damage,0),firstHitToWreckSeconds: (hits.at(-1)!.tick - hits[0]!.tick) / 60, wreckAtTick: sim.snapshot().serverTick };
  } finally { sim.dispose(); }
}
await initPhysics();
const baseline = getVehicleProfile('patrol');
const rows = VEHICLE_BODIES.map(body => {
  const profile = getVehicleProfile(body), actualCombat = combat(body);
  const budget = 0.35 * actualCombat.volleysToWreck * 10 / baseline.maxHealth + 0.25 * profile.topSpeed / baseline.topSpeed + 0.2 * profile.acceleration / baseline.acceleration + 0.1 * profile.steeringRate / baseline.steeringRate + 0.1 * profile.grip / baseline.grip;
  return { body, maxHealth: profile.maxHealth, ...measure(body), ...actualCombat, weightedBudget: budget };
});
console.log(JSON.stringify({ gameplayRevision: GAMEPLAY_REVISION, tickRate: 60, weaponDamagePerVolley: 10,damagePerProjectile:5,barrels:2,shotCadenceTicks: 12, rows }, null, 2));
