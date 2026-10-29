import { afterEach, beforeAll, expect, it } from 'vitest';
import type { CollisionMap, PlanarPose } from '@fender/contracts';
import { createSimulation, type Simulation } from '../core/simulation';
import { initPhysics } from '../physics/rapier';
import { driveVehicle, newDriver, neutralActions } from '../vehicles/controller';

type Gadget = { entityId: string; ownerEntityId: string; kind: 'oil' | 'blades'; pose: PlanarPose; bornTick: number; activeAtTick: number; expiresTick: number };
const arena: CollisionMap = { id: 'gadget-arena', revision: 'gadgets', bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, colliders: [], surfaces: [], spawns: [{ id: 'a', pose: { x: -40, z: -30, yaw: 0 }, clearanceRadius: 5 }], laneNodes: [{ id: 's', x: 0, z: -100 }, { id: 'n', x: 0, z: 100 }], laneEdges: [{ from: 's', to: 'n', speedLimit: .01 }, { from: 'n', to: 's', speedLimit: .01 }] };
const sims: Simulation[] = [];
function fixture(stage = 5, map = arena) {
  const sim = createSimulation(map, { mode: 'practice', trafficCount: 0, pursuit: true, campaign: true }); sims.push(sim);
  sim.addPlayer({ playerId: 'officer', nickname: 'Gadget inspector', bodyAssetId: 'patrol' });
  const checkpoint = sim.checkpoint(), boss = checkpoint.state.records.find(record => record.traffic?.suspect)!, officer = checkpoint.state.records.find(record => record.vehicle.playerId === 'officer')!;
  checkpoint.state.phase = 'playing'; checkpoint.state.phaseEnd = 10000; checkpoint.state.campaign!.dispatchIndex = stage;
  boss.vehicle.pose = { x: 0, z: 0, yaw: 0 }; boss.vehicle.velocity = { x: 0, z: 3, yawRate: 0 }; boss.vehicle.protectedUntilTick = 0;
  officer.vehicle.pose = { x: 0, z: -14, yaw: 0 }; officer.vehicle.velocity = { x: 0, z: 9, yawRate: 0 }; officer.vehicle.protectedUntilTick = 0;
  sim.restore(checkpoint); return { sim, bossId: boss.vehicle.entityId, officerId: officer.vehicle.entityId };
}
const gadgets = (sim: Simulation) => (Reflect.get(sim.snapshot(), 'gadgets') ?? []) as Gadget[];
const ticks = (sim: Simulation, count: number) => { for (let n = 0; n < count; n++) sim.step(new Map()); };
beforeAll(initPhysics); afterEach(() => sims.splice(0).forEach(sim => sim.dispose()));

it('warns before a closing rear pursuit receives smog, then records one bounded exposure with deterministic replay',()=>{
 const {sim,bossId,officerId}=fixture(7);ticks(sim,1);
 const cloud=sim.snapshot().gadgets?.find(g=>String(g.kind)==='smog') as any;
 expect(cloud,'dispatch 8 should publish a warned smog cloud behind the suspect').toBeDefined();
 expect(cloud.ownerEntityId).toBe(bossId);expect(cloud.activeAtTick-cloud.bornTick).toBe(60);
 expect(cloud.exposures).toEqual([]);expect(cloud.pose.z).toBeLessThan(-3);
 const c=sim.checkpoint(),officer=c.state.records.find(r=>r.vehicle.entityId===officerId)!,boss=c.state.records.find(r=>r.vehicle.entityId===bossId)!;
 c.tick=cloud.activeAtTick-1;officer.vehicle.pose={...cloud.pose};officer.vehicle.velocity={x:0,z:0,yawRate:0};boss.vehicle.pose.z=30;boss.traffic=undefined;
 sim.restore(c);ticks(sim,1);
 const exposed=sim.snapshot().gadgets!.find(g=>g.entityId===cloud.entityId) as any;
 expect(exposed.exposures).toEqual([{vehicleId:officerId,bornTick:cloud.activeAtTick,expiresTick:cloud.activeAtTick+210}]);
 expect(sim.snapshot('officer').local!.vehicle.health).toBe(officer.vehicle.health);
 const stacked=sim.checkpoint();stacked.state.gadgets!.push({gadget:{...cloud,entityId:'overlapping-smog',bornTick:stacked.tick,activeAtTick:stacked.tick,exposures:[]},hitVehicleIds:[]});
 sim.restore(stacked);ticks(sim,1);expect(sim.snapshot().gadgets!.find(g=>g.entityId==='overlapping-smog')!.exposures).toEqual([]);
 const saved=sim.checkpoint();ticks(sim,90);const later=sim.snapshot();sim.restore(saved);ticks(sim,90);expect(sim.snapshot()).toEqual(later);
 expect((sim.snapshot().gadgets!.find(g=>g.entityId===cloud.entityId) as any).exposures).toEqual(exposed.exposures);
 expect(sim.checkpoint().state.records.find(r=>r.vehicle.entityId===bossId)!.bossAi!.nextGadgetTick).toBeGreaterThanOrEqual(cloud.bornTick+1080);
});

it.each(['ahead','not-closing','protected','disconnected'] as const)('does not start smog for an officer who is %s',situation=>{
 const {sim,officerId}=fixture(7),c=sim.checkpoint(),officer=c.state.records.find(r=>r.vehicle.entityId===officerId)!;
 if(situation==='ahead')officer.vehicle.pose.z=14;
 if(situation==='not-closing')officer.vehicle.velocity.z=0;
 if(situation==='protected')officer.vehicle.protectedUntilTick=999;
 if(situation==='disconnected')c.state.scores[0]!.connection='reconnecting';
 sim.restore(c);ticks(sim,1);expect(sim.snapshot().gadgets?.some(g=>String(g.kind)==='smog')).toBe(false);
});
it('releases the warned exhaust wake where a road-speed pursuit reaches it, then leaves the armed cloud fixed',()=>{
 const fastMap={...arena,laneEdges:arena.laneEdges.map(e=>({...e,speedLimit:26}))};
 const {sim,officerId,bossId}=fixture(7,fastMap),c=sim.checkpoint(),officer=c.state.records.find(r=>r.vehicle.entityId===officerId)!,boss=c.state.records.find(r=>r.vehicle.entityId===bossId)!;
 boss.vehicle.velocity.z=18;officer.vehicle.velocity.z=22;sim.restore(c);
 for(let i=0;i<90;i++){
  const state=sim.snapshot(),target=state.vehicles.find(v=>v.entityId===bossId)!,unit=state.vehicles.find(v=>v.entityId===officerId)!;
  const difference=Math.atan2(target.pose.x-unit.pose.x,target.pose.z-unit.pose.z)-unit.pose.yaw,angle=Math.atan2(Math.sin(difference),Math.cos(difference));
  sim.step(new Map([[officerId,{actions:{...neutralActions(),throttle:1,steer:Math.max(-1,Math.min(1,angle*2.1))},sessionEpoch:officer.epoch,sourceCommandSequence:i}]]));
 }
 const cloud=sim.snapshot().gadgets!.find(g=>g.kind==='smog')!;
 expect(cloud.exposures?.some(e=>e.vehicleId===officerId),'following the exhaust at urban pursuit speed must reach the released smog '+JSON.stringify({cloud,officer:sim.snapshot().vehicles.find(v=>v.entityId===officerId),boss:sim.snapshot().vehicles.find(v=>v.entityId===bossId)})).toBe(true);
 const released=structuredClone(cloud.pose);ticks(sim,10);expect(sim.snapshot().gadgets!.find(g=>g.entityId===cloud.entityId)!.pose).toEqual(released);
});

it('lets Otis drop one fixed oil patch behind a closing pursuit, with a warning and long cooldown', () => {
  const { sim, bossId } = fixture(); ticks(sim, 1);
  const patch = gadgets(sim)[0]; expect(patch, 'Otis must publish the rear oil warning').toBeDefined();
  expect(patch).toMatchObject({ kind: 'oil', ownerEntityId: bossId, bornTick: 1, activeAtTick: 46, expiresTick: 346 });
  expect(patch!.pose.z).toBeLessThan(-3); const fixed = structuredClone(patch!.pose);
  ticks(sim, 30); expect(gadgets(sim)).toHaveLength(1); expect(gadgets(sim)[0]!.pose).toEqual(fixed);
  const saved = sim.checkpoint(); ticks(sim, 10); const replay = sim.snapshot(); sim.restore(saved); ticks(sim, 10); expect(sim.snapshot()).toEqual(replay);
  ticks(sim, 305); expect(gadgets(sim)).toEqual([]);
});

it.each([0, 1, 2, 3, 4])('keeps dispatch %s free of new gadgets so the opening lessons remain gentle', stage => {
  const { sim } = fixture(stage); ticks(sim, 90); expect(gadgets(sim)).toEqual([]);
});

it.each(['ahead', 'receding', 'protected', 'disconnected', 'occluded'] as const)('does not deploy oil against an officer who is %s', situation => {
  const { sim, officerId } = fixture(), c = sim.checkpoint(), officer = c.state.records.find(record => record.vehicle.entityId === officerId)!;
  if (situation === 'ahead') officer.vehicle.pose.z = 14;
  if (situation === 'receding') officer.vehicle.velocity.z = 0;
  if (situation === 'protected') officer.vehicle.protectedUntilTick = 999;
  if (situation === 'disconnected') c.state.scores[0]!.connection = 'reconnecting';
  // An obstructed map uses a separate real query world.
  if (situation === 'occluded') {
    const blocked = createSimulation({ ...arena, colliders: [{ id: 'cover', shape: 'box', pose: { x: 0, z: -7, yaw: 0 }, halfExtents: { x: 10, y: 4, z: 1 }, layer: 'world-solid', surface: 'asphalt' }] }, { mode: 'practice', trafficCount: 0, pursuit: true, campaign: true });
    sims.push(blocked); blocked.restore(c); ticks(blocked, 1); expect(gadgets(blocked)).toEqual([]); return;
  }
  sim.restore(c); ticks(sim, 1); expect(gadgets(sim)).toEqual([]);
});

it('reduces lateral grip only inside armed oil and restores normal steering after leaving it', () => {
  const { sim, officerId } = fixture(), source = sim.snapshot().vehicles.find(vehicle => vehicle.entityId === officerId)!;
  const run = (oiled: boolean, protectedCar = false) => {
    const vehicle = structuredClone(source), driver = newDriver(); vehicle.pose = { x: 0, z: 0, yaw: 0 }; vehicle.velocity = { x: 4, z: 12, yawRate: 0 }; vehicle.protectedUntilTick = protectedCar ? 999 : 0;
    const context = { gunsEnabled: true, wetRoads: false, oilSlicks: oiled ? [{ ownerEntityId: 'boss', pose: { x: 0, z: 0, yaw: 0 }, radius: 2.75 }] : [] };
    for (let n = 0; n < 10; n++) driveVehicle(vehicle, driver, neutralActions(), arena, [], undefined, undefined, context);
    return vehicle;
  };
  const dry = run(false), oil = run(true); expect(oil.velocity.x).toBeGreaterThan(dry.velocity.x + .25);
  expect(run(true, true).velocity).toEqual(dry.velocity);
  const escaped = structuredClone(oil), control = structuredClone(oil); escaped.pose.z = control.pose.z = 20;
  const oilContext = { gunsEnabled: true, wetRoads: false, oilSlicks: [{ ownerEntityId: 'boss', pose: { x: 0, z: 0, yaw: 0 }, radius: 2.75 }] };
  driveVehicle(escaped, newDriver(), neutralActions(), arena, [], undefined, undefined, oilContext); driveVehicle(control, newDriver(), neutralActions(), arena, []);
  expect(escaped).toEqual(control); expect(sim.snapshot().vehicles.find(vehicle => vehicle.entityId === officerId)!.health).toBe(100);
});

it('warns before Tess extends her wheel blades and applies one modest side hit per deployment, including checkpoint replay', () => {
  const { sim, officerId } = fixture(6), c = sim.checkpoint(), officer = c.state.records.find(record => record.vehicle.entityId === officerId)!;
  officer.vehicle.pose = { x: 3.5, z: -3, yaw: 0 }; sim.restore(c); ticks(sim, 1);
  const blade = gadgets(sim)[0]; expect(blade, 'Tess must show the hubcap windup').toBeDefined();
  expect(blade).toMatchObject({ kind: 'blades', bornTick: 1, activeAtTick: 61, expiresTick: 151 });
  const next = sim.checkpoint(); for (const record of next.state.records) { record.vehicle.pose = { x: record.vehicle.playerId ? 2.35 : 0, z: 0, yaw: 0 }; record.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; }
  sim.restore(next); ticks(sim, 59); expect(sim.snapshot().vehicles.find(vehicle => vehicle.entityId === officerId)!.health).toBe(100);
  ticks(sim, 1); expect(sim.snapshot().vehicles.find(vehicle => vehicle.entityId === officerId)!.health).toBe(92);
  const afterHit = sim.checkpoint(); ticks(sim, 30); const replay = sim.snapshot(); expect(replay.vehicles.find(vehicle => vehicle.entityId === officerId)!.health).toBe(92);
  sim.restore(afterHit); ticks(sim, 30); expect(sim.snapshot()).toEqual(replay);
});

it('clears gadgets on target lifecycle changes and dispatch timeout', () => {
  const { sim, bossId } = fixture(); ticks(sim, 1); expect(gadgets(sim)).toHaveLength(1);
  const c = sim.checkpoint(); c.state.records.find(record => record.vehicle.entityId === bossId)!.vehicle.status = 'wrecked'; sim.restore(c); ticks(sim, 1); expect(gadgets(sim)).toEqual([]);
  sim.restore(c); c.state.phaseEnd = c.tick + 1; sim.restore(c); ticks(sim, 1); expect(sim.snapshot().phase).toBe('results'); expect(gadgets(sim)).toEqual([]);
});

it('keeps the twelve-second gadget cooldown and front-cutoff arrest counterplay', () => {
  const { sim, officerId } = fixture(6), initial = sim.checkpoint();
  const officer = initial.state.records.find(record => record.vehicle.entityId === officerId)!;
  officer.vehicle.pose = { x: 3.5, z: -3, yaw: 0 }; sim.restore(initial); ticks(sim, 1);
  const born = gadgets(sim)[0]!; expect(born).toBeDefined();
  const c = sim.checkpoint(), boss = c.state.records.find(record => record.traffic?.suspect)!;
  expect(boss.bossAi!.nextGadgetTick).toBe(born.bornTick + 720);
  c.tick = born.activeAtTick; c.state.contenderTicks = [['officer', 179]];
  boss.vehicle.pose = { x: 0, z: 0, yaw: 0 }; boss.vehicle.velocity = { x: 0, z: 9, yawRate: 0 };
  const ahead = c.state.records.find(record => record.vehicle.entityId === officerId)!; ahead.vehicle.pose = { x: 0, z: 5, yaw: 0 }; ahead.vehicle.velocity = { x: 0, z: 9, yawRate: 0 };
  sim.restore(c); ticks(sim, 1); expect(sim.snapshot()).toMatchObject({ phase: 'results', pursuit: { state: 'complete', winnerPlayerId: 'officer' } }); expect(gadgets(sim)).toEqual([]);
});

it.each([7, 20])('defers an oil drop at x=%s until the entire marked footprint fits visible asphalt', x => {
  const map: CollisionMap = { ...arena, surfaces: [
    { id: 'grass', polygonXZ: [-200,-200,200,-200,200,200,-200,200], surface: 'grass' },
    { id: 'avenue', polygonXZ: [-8,-200,8,-200,8,200,-8,200], surface: 'asphalt' },
  ] };
  const { sim, bossId, officerId } = fixture(5, map), c = sim.checkpoint();
  c.state.records.find(record => record.vehicle.entityId === bossId)!.vehicle.pose.x = x;
  c.state.records.find(record => record.vehicle.entityId === officerId)!.vehicle.pose.x = x;
  sim.restore(c); ticks(sim, 1); expect(gadgets(sim)).toEqual([]);
});
