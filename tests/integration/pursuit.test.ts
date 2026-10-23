import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../../apps/server/src/index';
import { districtMap } from '@fender/content';
import { CAMPAIGN_DISPATCHES, getCampaignTarget, GAMEPLAY_REVISION, PROTOCOL_VERSION, unpackSnapshot, type GameEvent, type WireSnapshot, type WorldSnapshot } from '@fender/contracts';
import type { Simulation } from '@fender/sim';

let server: Awaited<ReturnType<typeof createGameServer>>;
const rooms: Room[] = [];
async function until(test: () => boolean, message: string) { const end = performance.now() + 7000; while (!test()) { if (performance.now() > end) throw new Error(message); await new Promise(resolve => setTimeout(resolve, 15)); } }
async function peer(roomId?: string) {
  const sdk = new Client('http://127.0.0.1:2718'), options = { nickname: `Officer ${rooms.length + 1}`, vehicleBodyId: 'patrol', protocolVersion: PROTOCOL_VERSION, mapRevision: districtMap.revision, gameplayRevision: GAMEPLAY_REVISION };
  const room = roomId ? await sdk.joinById(roomId, options) : await sdk.create('district', options); rooms.push(room); room.reconnection.enabled = false;
  const states: WorldSnapshot[] = [], events: GameEvent[] = [];
  room.onMessage('snapshot', (wire: WireSnapshot) => states.push(unpackSnapshot(wire, wire.m === states.at(-1)?.matchId ? states.at(-1)?.props : undefined)));
  room.onMessage('events', (batch: GameEvent[]) => events.push(...batch));
  room.onMessage('latency-probe', ({ nonce }: { nonce: string }) => room.send('latency-pong', { nonce }));
  room.send('resync'); await until(() => states.length > 0, 'Initial pursuit snapshot');
  return { room, states, events, get state() { return states.at(-1)!; } };
}
beforeAll(async () => { server = await createGameServer(2718); });
afterEach(async () => { await Promise.all(rooms.splice(0).map(room => room.connection.isOpen ? room.leave(true) : Promise.resolve())); });
afterAll(async () => { await server?.gracefullyShutdown(false); });

it('assigns one shared wanted suspect to a real multiplayer room and its late joiner', async () => {
  const a = await peer(), b = await peer(a.room.roomId);
  expect(a.state.pursuit, 'Online dispatch must have an apprehension objective').toBeDefined();
  expect(a.state.pursuit!.suspectId).toBe(b.state.pursuit!.suspectId);
  expect(a.state.vehicles.find(car => car.entityId === a.state.pursuit!.suspectId)!.bodyAssetId).toBe(getCampaignTarget(CAMPAIGN_DISPATCHES[0]!.targetId).vehicleBodyId);
  expect(b.state.vehicles.some(car => car.entityId === a.state.pursuit!.suspectId)).toBe(true);
  expect(GAMEPLAY_REVISION).toBe('arcade-v7');
});

it('broadcasts the apprehending winner and dispatch completion to both peers even when another driver has more combat points', async () => {
  const a = await peer(), b = await peer(a.room.roomId);
  const sim = (matchMaker.getLocalRoomById(a.room.roomId) as unknown as { sim: Simulation }).sim;
  const checkpoint = sim.checkpoint(), target = checkpoint.state.records.find(record => record.traffic)!;
  checkpoint.state.phase = 'playing'; checkpoint.state.phaseEnd = checkpoint.tick + 900;
  checkpoint.state.records = checkpoint.state.records.filter(record => record.vehicle.playerId !== null || record === target);
  target.traffic = undefined; target.vehicle.bodyAssetId = 'suspect'; target.vehicle.pose = { x: 0, z: 0, yaw: 0 }; target.vehicle.velocity = { x: 0, z: 0, yawRate: 0 };
  checkpoint.state.pursuit = { state: 'chasing', suspectId: target.vehicle.entityId, progress: 0, elapsedTicks: 0, winnerPlayerId: null, arrestingPlayerId: null, contenders: [] };
  checkpoint.state.arrestTicks = 0;
  for (const record of checkpoint.state.records.filter(record => record.vehicle.playerId !== null)) {
    record.vehicle.pose = { x: record.vehicle.playerId === b.room.sessionId ? 5 : 35, z: 0, yaw: 0 };
    record.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; record.vehicle.protectedUntilTick = 0;
  }
  checkpoint.state.scores.find(score => score.playerId === a.room.sessionId)!.score = 10;
  sim.restore(checkpoint);
  await until(() => a.state.phase === 'results' && b.state.phase === 'results', 'First completed arrest must finish the shared dispatch');
  for (const observer of [a, b]) {
    expect(observer.state.pursuit).toMatchObject({ suspectId: target.vehicle.entityId, state: 'complete', winnerPlayerId: b.room.sessionId, progress: 1 });
    expect(observer.state.scores.find(score => score.playerId === b.room.sessionId)!.score).toBe(3);
    expect(observer.state.scores.find(score => score.playerId === a.room.sessionId)!.score).toBe(10);
    expect(observer.events.filter(event => event.kind === 'pursuit-complete')).toHaveLength(1);
    expect(observer.events.filter(event => event.kind === 'round-ended')).toHaveLength(1);
  }
  expect(a.events.find(event => event.kind === 'pursuit-complete')).toEqual(b.events.find(event => event.kind === 'pursuit-complete'));
  const late = await peer(a.room.roomId);
  expect(late.state.phase).toBe('results');
  expect(late.state.pursuit!.winnerPlayerId).toBe(b.room.sessionId);
  a.room.send('rematch'); await until(() => a.state.phase === 'lobby' && b.state.phase === 'lobby', 'Creator can dispatch a fresh pursuit');
  expect(a.state.pursuit).toMatchObject({ state: 'chasing', progress: 0, winnerPlayerId: null });
});

it('reports an escaped suspect without awarding the combat leader a pursuit win on timeout', async () => {
  const a = await peer();
  const sim = (matchMaker.getLocalRoomById(a.room.roomId) as unknown as { sim: Simulation }).sim;
  const checkpoint = sim.checkpoint(); checkpoint.state.phase = 'playing'; checkpoint.state.phaseEnd = checkpoint.tick + 1;
  checkpoint.state.scores[0]!.score = 8; sim.restore(checkpoint);
  await until(() => a.state.phase === 'results', 'Dispatch timeout');
  expect(a.state.pursuit?.winnerPlayerId).toBeNull();
  expect(a.state.pursuit?.state).not.toBe('complete');
  expect(a.events.find(event => event.kind === 'round-ended')?.payload).toMatchObject({ winnerPlayerId: null, reason: 'timeout' });
  expect(a.events.some(event => event.kind === 'pursuit-complete')).toBe(false);
});
