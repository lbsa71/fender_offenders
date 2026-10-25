import { disposeTestRooms } from '../support/rooms';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../../apps/server/src/index';
import { districtMap } from '@fender/content';
import { CAMPAIGN_DISPATCHES, GAMEPLAY_REVISION, PROTOCOL_VERSION, getCampaignTarget, neutralActions, unpackSnapshot, type WireSnapshot, type WorldSnapshot } from '@fender/contracts';
import type { Simulation } from '@fender/sim';

let server: Awaited<ReturnType<typeof createGameServer>>;
const rooms: Room[] = [];
async function until(check: () => boolean, message: string) {
  const end = performance.now() + 7500;
  while (!check()) { if (performance.now() > end) throw new Error(message); await new Promise(resolve => setTimeout(resolve, 20)); }
}
async function peer(roomId?: string) {
  const sdk = new Client('http://127.0.0.1:2721');
  const options = { nickname: `Campaign officer ${rooms.length + 1}`, vehicleBodyId: 'patrol', protocolVersion: PROTOCOL_VERSION, mapRevision: districtMap.revision, gameplayRevision: GAMEPLAY_REVISION };
  const room = roomId ? await sdk.joinById(roomId, options) : await sdk.create('district', options);
  rooms.push(room); room.reconnection.enabled = false;
  const states: WorldSnapshot[] = [];
  room.onMessage('snapshot', (wire: WireSnapshot) => states.push(unpackSnapshot(wire, states.at(-1)?.props)));
  room.onMessage('events', () => {});
  room.onMessage('latency-probe', ({ nonce }: { nonce: string }) => room.send('latency-pong', { nonce }));
  room.send('resync'); await until(() => states.length > 0, 'Campaign join baseline');
  return { room, get state() { return states.at(-1)!; } };
}
function authority(roomId: string) { return (matchMaker.getLocalRoomById(roomId) as unknown as { sim: Simulation }).sim; }
function stageArrest(sim: Simulation, winner: string) {
  const checkpoint = sim.checkpoint(), target = checkpoint.state.records.find(record => record.vehicle.entityId === checkpoint.state.pursuit!.suspectId)!;
  checkpoint.state.phase = 'playing'; checkpoint.state.phaseEnd = checkpoint.tick + 2000;
  checkpoint.state.records = checkpoint.state.records.filter(record => record.vehicle.playerId !== null || record === target);
  target.traffic = undefined; target.vehicle.pose = { x: 0, z: 0, yaw: 0 }; target.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; target.vehicle.protectedUntilTick = 0;
  for (const record of checkpoint.state.records.filter(record => record.vehicle.playerId !== null)) {
    record.vehicle.pose = { x: record.vehicle.playerId === winner ? 5 : 35, z: 0, yaw: 0 }; record.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; record.vehicle.protectedUntilTick = 0;
  }
  sim.restore(checkpoint);
}
beforeAll(async () => { server = await createGameServer(2721); });
afterEach(async () => { await disposeTestRooms(); await Promise.all(rooms.splice(0).map(room => room.connection.isOpen ? room.leave(true) : Promise.resolve())); });
afterAll(async () => { await server?.gracefullyShutdown(false); });

it('starts real rooms with the same campaign briefing and the assigned target car', async () => {
  const host = await peer(), guest = await peer(host.room.roomId);
  expect(host.state.campaign, 'Production rooms need a ten-dispatch campaign').toMatchObject({ dispatchIndex: 0, status: 'active', outcomes: [] });
  expect(host.state.phase).toBe('lobby'); expect(guest.state.campaign).toEqual(host.state.campaign);
  expect(host.state.vehicles.find(vehicle => vehicle.entityId === host.state.pursuit!.suspectId)!.bodyAssetId).toBe(getCampaignTarget(CAMPAIGN_DISPATCHES[0]!.targetId).vehicleBodyId);
});

it('retains a real solo resolution through an empty room and lets returning officers advance with backup', async () => {
  const solo=await peer(),id=solo.room.roomId;
  stageArrest(authority(id),solo.room.sessionId);
  await until(()=>solo.state.phase==='results','Solo officer resolves the dispatch');
  const earned=structuredClone(solo.state.campaign);
  expect(earned!.outcomes).toMatchObject([{dispatchIndex:0,outcome:'arrested',callsign:'Campaign officer 1'}]);
  await solo.room.leave(true);
  const returning=await peer(id);
  expect(returning.state.campaign).toEqual(earned);expect(returning.state.phase).toBe('results');
  returning.room.send('rematch');
  await until(()=>returning.state.campaign!.dispatchIndex===1,'Returning officer advances retained campaign');
  const backup=await peer(id);
  expect(backup.state.campaign).toEqual(returning.state.campaign);
  expect(backup.state.campaign!.outcomes[0]!.callsign).toBe('Campaign officer 1');
});

it('adds backup to an ongoing solo dispatch after earned progress without replacing the patrol', async () => {
  const solo = await peer(), id = solo.room.roomId;
  stageArrest(authority(id), solo.room.sessionId);
  await until(() => solo.state.phase === 'results', 'Solo officer earns the first lead');
  solo.room.send('rematch');
  await until(() => solo.state.phase === 'lobby' && solo.state.campaign!.dispatchIndex === 1, 'Solo officer opens the second briefing');
  solo.room.send('start-round');
  await until(() => solo.state.phase === 'playing', 'Second dispatch starts alone');
  const ongoing = structuredClone(solo.state), backup = await peer(id);
  await until(() => solo.state.scores.length === 2, 'Backup joins the active patrol');
  for (const state of [solo.state, backup.state]) {
    expect(state.matchId).toBe(ongoing.matchId); expect(state.phase).toBe('playing');
    expect(state.phaseEndsAtTick).toBe(ongoing.phaseEndsAtTick);
    expect(state.campaign).toEqual(ongoing.campaign);
    expect(state.scores.find(score => score.playerId === solo.room.sessionId)!.score).toBe(3);
  }
  expect(solo.state.local!.vehicle.entityId).toBe(ongoing.local!.vehicle.entityId);
  expect(backup.state.local!.vehicle.entityId).not.toBe(ongoing.local!.vehicle.entityId);
});

it('shares an arrest, allows any connected officer to progress, preserves scores and garage choices, and restores the casefile for a late joiner', async () => {
  const host = await peer(), guest = await peer(host.room.roomId), sim = authority(host.room.roomId);
  expect(host.state.campaign).toBeDefined(); stageArrest(sim, guest.room.sessionId);
  await until(() => host.state.phase === 'results' && guest.state.phase === 'results', 'Shared campaign arrest');
  expect(host.state.campaign!.outcomes).toMatchObject([{ dispatchIndex: 0, outcome: 'arrested', playerId: guest.room.sessionId }]);
  expect(guest.state.campaign).toEqual(host.state.campaign);
  guest.room.send('rematch'); await until(() => host.state.phase === 'lobby', 'Guest advances the shared case');
  host.room.send('rematch'); await until(() => host.state.phase === 'lobby' && host.state.campaign!.dispatchIndex === 1, 'Next campaign briefing');
  const late = await peer(host.room.roomId);
  expect(late.state.campaign).toEqual(host.state.campaign); expect(late.state.scores.find(score => score.playerId === guest.room.sessionId)!.score).toBe(3);
  host.room.send('select-vehicle', { vehicleBodyId: 'army' });
  await until(() => host.state.local?.vehicle.bodyAssetId === 'army', 'Between-dispatch garage selection');
  expect(host.state.local!.vehicle.maxHealth).toBe(130);
  expect(host.state.vehicles.find(vehicle => vehicle.entityId === host.state.pursuit!.suspectId)!.bodyAssetId).toBe(getCampaignTarget(CAMPAIGN_DISPATCHES[1]!.targetId).vehicleBodyId);
  host.room.send('start-round'); await until(() => host.state.phase === 'playing', 'Next dispatch start');
  expect(host.state.campaign!.outcomes).toHaveLength(1); expect(host.state.scores.find(score => score.playerId === guest.room.sessionId)!.score).toBe(3);
  expect(host.state.local!.vehicle.bodyAssetId).toBe('army');
  host.room.send('campaign', { dispatchIndex: 9, status: 'complete', outcomes: [] });
  await new Promise(resolve => setTimeout(resolve, 100)); expect(host.state.campaign!.dispatchIndex).toBe(1);
});

it('a real client shooting the target advances without recording an arrest', async () => {
  const host = await peer(), guest = await peer(host.room.roomId), sim = authority(host.room.roomId);
  expect(host.state.campaign).toBeDefined();
  const checkpoint = sim.checkpoint(), target = checkpoint.state.records.find(record => record.vehicle.entityId === checkpoint.state.pursuit!.suspectId)!;
  checkpoint.state.phase = 'playing'; checkpoint.state.phaseEnd = checkpoint.tick + 2000;
  checkpoint.state.records = checkpoint.state.records.filter(record => record.vehicle.playerId !== null || record === target);
  target.traffic = undefined; target.vehicle.pose = { x: 0, z: 0, yaw: 0 }; target.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; target.vehicle.health = 5; target.vehicle.protectedUntilTick = 0;
  for (const record of checkpoint.state.records.filter(record => record.vehicle.playerId !== null)) {
    record.vehicle.pose = { x: record.vehicle.playerId === host.room.sessionId ? 0 : 35, z: -15, yaw: 0 }; record.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; record.vehicle.protectedUntilTick = 0;
  }
  sim.restore(checkpoint); host.room.send('resync'); await until(() => host.state.phase === 'playing', 'Prepared live shooting encounter');
  host.room.send('input', { kind: 'input', commands: [{ sessionEpoch: host.state.sessionEpoch, sequence: 0, clientTick: 0, actions: { ...neutralActions(), fire: true } }] });
  await until(() => host.state.phase === 'results' && guest.state.phase === 'results', 'Target shot down');
  expect(host.state.campaign!.outcomes).toMatchObject([{ dispatchIndex: 0, outcome: 'wrecked', playerId: host.room.sessionId }]);
  expect(guest.state.campaign).toEqual(host.state.campaign); expect(host.state.pursuit!.winnerPlayerId).toBe(host.room.sessionId);
  expect(host.state.scores.find(score => score.playerId === host.room.sessionId)!.score).toBe(1);
  host.room.send('rematch'); await until(() => host.state.campaign!.dispatchIndex === 1, 'Wreck resolution advances');
});
