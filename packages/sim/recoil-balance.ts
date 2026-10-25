import { GAMEPLAY_REVISION, VEHICLE_BODIES, neutralActions, type CollisionMap, type DriverActions } from '@fender/contracts';
import { createSimulation, initPhysics } from './src/index';

const map: CollisionMap = { id: 'recoil-report', revision: 'recoil-report-1', bounds: { minX: -10000, maxX: 10000, minZ: -10000, maxZ: 10000 }, colliders: [], surfaces: [], spawns: [{ id: 'a', pose: { x: 0, z: 0, yaw: 0 }, clearanceRadius: 5 }], laneNodes: [], laneEdges: [] };
await initPhysics();
const profiles = VEHICLE_BODIES.map(body => {
  const cruise = (fire: boolean) => {
    const sim = createSimulation(map, { trafficCount: 0 });
    try {
      const car = sim.addPlayer({ playerId: 'report', nickname: 'Recoil report', bodyAssetId: body }); let sum = 0;
      for (let i = 0; i < 600; i++) {
        sim.step(new Map([[car.entityId, { actions: { ...neutralActions(), throttle: 1, fire: fire && i >= 180 }, sessionEpoch: 'report', sourceCommandSequence: i }]]));
        if (i >= 480) sum += sim.authority('report')!.vehicle.velocity.z;
      }
      return sum / 120;
    } finally { sim.dispose(); }
  };
  const clean = cruise(false), firing = cruise(true);
  return { body, cleanMetersPerSecond: clean, firingMetersPerSecond: firing, lossPercent: (1 - firing / clean) * 100 };
});
const turning = (fire: boolean) => {
  const sim = createSimulation(map, { trafficCount: 0 });
  try {
    const car = sim.addPlayer({ playerId: 'report', nickname: 'Turn report', bodyAssetId: 'patrol' }); let sequence = 0;
    const step = (actions: Partial<DriverActions>) => sim.step(new Map([[car.entityId, { actions: { ...neutralActions(), ...actions }, sessionEpoch: 'report', sourceCommandSequence: sequence++ }]]));
    for (let i = 0; i < 120; i++) step({ fire });
    const saved = sim.checkpoint(), r = saved.state.records[0]!; r.vehicle.pose = { x: 0, z: 0, yaw: 0 }; r.vehicle.velocity = { x: 0, z: 12, yawRate: 0 }; r.driver.resolvedSteering = 0; sim.restore(saved);
    for (let i = 0; i < 18; i++) step({ steer: .5 }); return sim.authority('report')!.vehicle.pose.yaw * 180 / Math.PI;
  } finally { sim.dispose(); }
};
console.log(JSON.stringify({ gameplayRevision: GAMEPLAY_REVISION, tickRate: 60, scope: 'Empty asphalt; 3 seconds throttle warmup then 7 seconds held fire; mean speed over final 2 seconds. Patrol steering compares 0.3 seconds at the same initial 12 m/s after 2 seconds firing or resting.', profiles, patrolTurnDegrees: { clean: turning(false), hot: turning(true) }, handlingRecoverySecondsFromFull: 1.25 }, null, 2));
