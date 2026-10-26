import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { districtMap } from '@fender/content';
import { GAMEPLAY_REVISION, PROTOCOL_VERSION, neutralActions, unpackSnapshot, type InputCommand, type LocalVehicleMotion, type WorldSnapshot } from '@fender/contracts';
import type { Simulation } from '@fender/sim';
import { createGameServer } from '../../apps/server/src/index';
import { disposeTestRooms } from '../support/rooms';

const endpoint = 'http://127.0.0.1:2763', sockets: Room[] = [];
const snapshots = new Map<string, WorldSnapshot>();
let server: Awaited<ReturnType<typeof createGameServer>>, fenceSequence = 0;
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean) { const end = Date.now() + 5000; while (!check()) { if (Date.now() > end) throw Error('Local motion fixture timed out'); await pause(5); } }
beforeAll(async () => { server = await createGameServer(2763); });
afterEach(async () => { await Promise.all(sockets.splice(0).map(socket => socket.leave())); await disposeTestRooms(); snapshots.clear(); });
afterAll(async () => { await server.gracefullyShutdown(false); });
async function fence(socket: Room) {
  const sent = ++fenceSequence; let received = false;
  const remove = socket.onMessage('pong', (message: { sent: number }) => { if (message.sent === sent) received = true; });
  socket.send('ping', sent); await until(() => received); remove();
}
async function fixture(players = 1) {
  const sdk = new Client(endpoint), options = { nickname: 'Local driver', vehicleBodyId: 'patrol', protocolVersion: PROTOCOL_VERSION, gameplayRevision: GAMEPLAY_REVISION, mapRevision: districtMap.revision };
  const host = await sdk.create('district', options), peers = [host]; sockets.push(host);
  for (let i = 1; i < players; i++) { const peer = await sdk.joinById(host.roomId, { ...options, nickname: `Observer ${i}` }); peers.push(peer); sockets.push(peer); }
  for (const peer of peers) {
    peer.onMessage('snapshot', wire => snapshots.set(peer.sessionId, unpackSnapshot(wire, snapshots.get(peer.sessionId)?.props)));
    peer.onMessage('events', () => undefined);
    peer.send('resync'); await until(() => snapshots.has(peer.sessionId));
  }
  const room = matchMaker.getLocalRoomById(host.roomId);
  // Keep the SDK clock alive while the test explicitly advances world ticks.
  room.setSimulationInterval(() => undefined, 10);
  const controlled = room as unknown as { sim: Simulation; step(): void; publish(client: unknown, full?: boolean): void };
  const checkpoint = controlled.sim.checkpoint(); checkpoint.state.phase = 'playing'; checkpoint.state.phaseEnd = checkpoint.tick + 18000;
  checkpoint.state.campaign = undefined; checkpoint.state.pursuit = undefined;
  checkpoint.state.records = checkpoint.state.records.filter(record => record.vehicle.playerId !== null);
  checkpoint.state.records.forEach((record, index) => { record.vehicle.pose = { x: index * 80, z: -76, yaw: 0 }; record.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; record.vehicle.protectedUntilTick = 0; record.vehicle.discontinuityId++; });
  controlled.sim.restore(checkpoint);
  const publish = async () => { for (const client of room.clients) controlled.publish(client, true); await Promise.all(peers.map(fence)); };
  await publish();
  const command = (sequence: number, actions = neutralActions()): InputCommand => ({ sessionEpoch: snapshots.get(host.sessionId)!.sessionEpoch, sequence, clientTick: sequence, actions });
  const motion = (sequence: number, overrides: Partial<LocalVehicleMotion> = {}): LocalVehicleMotion => ({ sequence, discontinuityId: controlled.sim.authority(host.sessionId)!.vehicle.discontinuityId, pose: { x: 0, z: -75.8, yaw: .15 }, velocity: { x: 2, z: 8, yawRate: .4 }, ...overrides });
  const send = async (commands: InputCommand[], report?: unknown) => { host.send('input', { commands, ...(report === undefined ? {} : { motion: report }) }); await fence(host); };
  return { host, peers, controlled, publish, command, motion, send, authority: () => controlled.sim.authority(host.sessionId)! };
}

it('replicates validated driver motion without steering it a second time or trusting client health and identity', async () => {
  const f = await fixture(2), report = f.motion(0), observerBefore = structuredClone(f.controlled.sim.authority(f.peers[1]!.sessionId)!.vehicle.pose);
  await f.send([f.command(0, { ...neutralActions(), throttle: 1, steer: 1 })], { ...report, health: 9999, bodyAssetId: 'roadster', score: 9999 });
  f.controlled.step();
  expect(f.authority().vehicle.pose).toEqual(report.pose);
  // Exercise the fresh held step before waiting for observer publication;
  // real socket fences may legitimately consume the 100 ms safety window.
  f.controlled.step(); await f.publish();
  expect(f.authority().vehicle.pose).toEqual(report.pose);
  expect(f.authority().vehicle.velocity).toEqual(report.velocity);
  expect(f.authority().vehicle).toMatchObject({ health: 100, bodyAssetId: 'patrol', playerId: f.host.sessionId });
  expect(f.controlled.sim.authority(f.peers[1]!.sessionId)!.vehicle.pose).toEqual(observerBefore);
  expect(snapshots.get(f.peers[1]!.sessionId)!.vehicles.find(vehicle => vehicle.playerId === f.host.sessionId)!.pose).toEqual(report.pose);
  expect(snapshots.get(f.host.sessionId)!.local!.lastConsumedSequence).toBe(0);
  expect(f.authority().vehicle.pose).toEqual(report.pose);
});

it('rejects malformed, wrong-sequence, stale-life, out-of-map and excessive local reports', async () => {
  const f = await fixture(), start = structuredClone(f.authority().vehicle.pose);
  const reports = [
    () => ({ ...f.motion(0), pose: { x: NaN, z: -75.8, yaw: 0 } }),
    () => f.motion(20),
    () => f.motion(2, { discontinuityId: f.authority().vehicle.discontinuityId - 1 }),
    () => f.motion(3, { pose: { x: 0, z: 10000, yaw: 0 } }),
    () => f.motion(4, { pose: { x: 0, z: -40, yaw: 0 } }),
    () => f.motion(5, { velocity: { x: 0, z: 500, yawRate: 0 } }),
  ];
  for (let sequence = 0; sequence < reports.length; sequence++) { await f.send([f.command(sequence)], reports[sequence]!()); f.controlled.step(); expect(f.authority().vehicle.pose).toEqual(start); }
});

it('retains safe braking after motion stops and clears queued movement when a menu pauses the solo room', async () => {
  const f = await fixture(), report = f.motion(0, { pose: { x: 0, z: -75.8, yaw: 0 }, velocity: { x: 0, z: 8, yawRate: 0 } });
  await f.send([f.command(0)], report); f.controlled.step();
  expect(f.authority().vehicle.velocity.z).toBe(8);
  await pause(120); f.controlled.step(); expect(f.authority().vehicle.velocity.z).toBeLessThan(8);
  const next = f.motion(1, { pose: { x: 0, z: f.authority().vehicle.pose.z + .1, yaw: 0 }, velocity: { x: 0, z: 4, yawRate: 0 } });
  await f.send([f.command(1)], next);
  f.host.send('presence', { menuOpen: true, hidden: false }); await fence(f.host);
  f.host.send('presence', { menuOpen: false, hidden: false }); await fence(f.host);
  const before = f.authority().vehicle.velocity.z; f.controlled.step(); expect(f.authority().vehicle.velocity.z).toBeLessThan(before); expect(f.authority().vehicle.velocity.z).toBeGreaterThan(4);
});

it('marks an authoritative contact as one new life correction and rejects pre-contact local reports', async () => {
  const f = await fixture(2), checkpoint = f.controlled.sim.checkpoint();
  checkpoint.state.records.find(record => record.vehicle.playerId === f.peers[1]!.sessionId)!.vehicle.pose = { x: 1.5, z: -76, yaw: 0 };
  f.controlled.sim.restore(checkpoint);
  const life = f.authority().vehicle.discontinuityId, report = f.motion(0, { pose: { x: .1, z: -76, yaw: 0 }, velocity: { x: 0, z: 0, yawRate: 0 } });
  await f.send([f.command(0)], report); f.controlled.step();
  expect(f.authority().vehicle.discontinuityId).toBe(life + 1);
  const corrected = structuredClone(f.authority().vehicle.pose);
  await f.send([f.command(1)], { ...report, sequence: 1 }); f.controlled.step();
  expect(f.authority().vehicle.pose.x).toBeCloseTo(corrected.x, 5);
  expect(f.authority().vehicle.discontinuityId).toBe(life + 1);
});

it('explicitly corrects a rejected new movement once without a duplicate or stale-life reset loop', async () => {
  const f = await fixture(), report = f.motion(0);
  await f.send([f.command(0)], report); f.controlled.step();
  const life = f.authority().vehicle.discontinuityId, pose = structuredClone(f.authority().vehicle.pose);
  const invalid = f.motion(1, { pose: { x: 0, z: 80, yaw: 0 } });
  await f.send([f.command(1)], invalid);
  expect(f.authority().vehicle.discontinuityId, 'An owner ignores routine positions, so rejection must signal an explicit correction').toBe(life + 1);
  expect(f.authority().vehicle.pose).toEqual(pose);
  expect(snapshots.get(f.host.sessionId)!.local!.vehicle.discontinuityId).toBe(life + 1);
  await f.send([f.command(1)], invalid);
  await f.send([f.command(2)], { ...invalid, sequence: 2 });
  expect(f.authority().vehicle.discontinuityId).toBe(life + 1);
});

it('owns shots and damage without applying recoil twice to an already simulated local velocity', async () => {
  const f = await fixture(2), checkpoint = f.controlled.sim.checkpoint();
  checkpoint.state.records.find(record => record.vehicle.playerId === f.peers[1]!.sessionId)!.vehicle.pose = { x: 0, z: -65, yaw: 0 };
  f.controlled.sim.restore(checkpoint);
  const report = f.motion(0, { pose: { x: 0, z: -75.8, yaw: 0 }, velocity: { x: 0, z: 20, yawRate: 0 } });
  await f.send([f.command(0, { ...neutralActions(), fire: true })], report); f.controlled.step();
  expect(f.authority().vehicle.velocity, 'The reported velocity already includes the local gun kick').toEqual(report.velocity);
  expect(f.authority().driver.shotOrdinal).toBe(1);
  expect(f.controlled.sim.snapshot().projectiles).toHaveLength(2);
  await f.send([f.command(1)], { ...report, sequence: 1 });
  for (let step = 0; step < 8; step++) f.controlled.step();
  expect(f.controlled.sim.authority(f.peers[1]!.sessionId)!.vehicle.health).toBeLessThan(100);
  expect(f.authority().vehicle.health).toBe(100);
});

it('accepts consecutive burst reports before the next world tick and consumes their siren edges once', async () => {
  const f = await fixture(), actions = { ...neutralActions(), sirenToggle: true };
  await f.send([f.command(0, actions), f.command(1, actions)], f.motion(1, { pose: { x: 0, z: -75.2, yaw: .1 } }));
  const report = f.motion(3, { pose: { x: 0, z: -74.4, yaw: .2 } });
  await f.send([f.command(2), f.command(3, actions)], report);
  f.controlled.step(); await f.publish();
  expect(f.authority().vehicle.pose).toEqual(report.pose);
  expect(snapshots.get(f.host.sessionId)!.local!.lastConsumedSequence).toBe(3);
  expect(f.authority().vehicle.sirenOn).toBe(true);
  f.controlled.step(); expect(f.authority().vehicle.sirenOn).toBe(true);
});

it('does not let repeated movement reports purchase unlimited travel without server elapsed time',async()=>{
  const f=await fixture(),life=f.authority().vehicle.discontinuityId,start=f.authority().vehicle.pose.z,now=performance.now();
  const clock=vi.spyOn(performance,'now').mockReturnValue(now);
  try{
    for(let sequence=0;sequence<45;sequence++){
      const commandSequence=sequence*4+3;
      await f.send([f.command(commandSequence)],f.motion(commandSequence,{discontinuityId:life,pose:{x:0,z:start+sequence+1,yaw:0},velocity:{x:0,z:18,yawRate:0}}));
      f.controlled.step();
      // Measure the admitted movement at rejection, before later safety-brake
      // physics ticks can legitimately carry the corrected car farther.
      if(f.authority().vehicle.discontinuityId!==life)break;
    }
    expect(f.authority().vehicle.discontinuityId,'The room must explicitly reject excess travel rather than trusting packet cadence').toBe(life+1);
    expect(f.authority().vehicle.pose.z-start,'Only the one-second bounded burst allowance can precede elapsed server time').toBeLessThan(29);
  }finally{clock.mockRestore();}
});

it('admits an ordered 650ms movement burst after a transport stall without correcting a legitimate local driver',async()=>{
  const f=await fixture(),life=f.authority().vehicle.discontinuityId,start=f.authority().vehicle.pose.z;
  let now=performance.now();const clock=vi.spyOn(performance,'now').mockImplementation(()=>now);
  try{
    await f.send([f.command(0),f.command(1)],f.motion(1,{pose:{x:0,z:start+.8,yaw:0}}));f.controlled.step();
    now+=650;
    for(let batch=1;batch<=20;batch++){
      const sequence=batch*2+1;
      await f.send([f.command(sequence-1),f.command(sequence)],f.motion(sequence,{discontinuityId:life,pose:{x:0,z:start+.8*(batch+1),yaw:0}}));
      f.controlled.step();
    }
    expect(f.authority().vehicle.discontinuityId,'Valid ordered movement must not become a teleport correction after ordinary TCP stalls').toBe(life);
    expect(f.authority().vehicle.pose.z).toBeCloseTo(start+16.8,6);
  }finally{clock.mockRestore();}
});
