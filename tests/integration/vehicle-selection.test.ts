import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { createGameServer } from '../../apps/server/src/index.js';
import { createOnlineSession } from '@fender/net-client';
import { districtMap } from '@fender/content';
import { GAMEPLAY_REVISION, PROTOCOL_VERSION, unpackSnapshot, type WireSnapshot, type WorldSnapshot } from '@fender/contracts';

vi.mock('node:crypto', async original => ({ ...await original<typeof import('node:crypto')>(), randomInt: vi.fn(() => 0) }));
const endpoint = 'http://127.0.0.1:2710';
const options = { nickname: 'Garage test', protocolVersion: PROTOCOL_VERSION, mapRevision: districtMap.revision, gameplayRevision: GAMEPLAY_REVISION };
let server: Awaited<ReturnType<typeof createGameServer>>;
const peers: Room[] = [];
const sessions: ReturnType<typeof createOnlineSession>[] = [];
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(test: () => boolean, why: string) { const end = performance.now() + 4000; while (!test()) { if (performance.now() > end) throw new Error(why); await pause(10); } }
async function peer(body: unknown, roomId?: string) {
  const sdk = new Client(endpoint);
  const room = roomId ? await sdk.joinById(roomId, { ...options, vehicleBodyId: body }) : await sdk.create('district', { ...options, vehicleBodyId: body, maxHealth: 99999, topSpeed: 999 });
  peers.push(room); room.reconnection.enabled = false;
  let state: WorldSnapshot | null = null;
  room.onMessage('snapshot', (wire: WireSnapshot) => { state = unpackSnapshot(wire); }); room.onMessage('events', () => {}); room.onMessage('latency-probe', () => {}); room.send('resync');
  await until(() => !!state, 'initial snapshot');
  return { room, get state() { return state!; } };
}
beforeAll(async () => { server = await createGameServer(2710); });
afterEach(async () => {
  await Promise.all(sessions.splice(0).map(session => session.dispose()));
  await Promise.all(peers.splice(0).map(room => room.connection.isOpen ? room.leave(true) : Promise.resolve()));
});
afterAll(async () => { await server?.gracefullyShutdown(false); });

it('dispatches the saved garage body through the real prediction facade', async () => {
  const session = createOnlineSession(endpoint, districtMap); sessions.push(session);
  const joined = await session.connect({ mode: 'create', nickname: 'Army driver', vehicleBodyId: 'army' });
  expect(joined.firstState.local!.vehicle.bodyAssetId).toBe('army');
  expect(joined.firstState.local!.vehicle.health).toBe(130);
});
it('allows lobby selection, publishes it to every player, and locks it at countdown', async () => {
  const a = await peer('army'), b = await peer('patrol', a.room.roomId);
  a.room.send('select-vehicle', { vehicleBodyId: 'roadster' });
  await until(() => a.state.local!.vehicle.bodyAssetId === 'roadster', 'lobby reassignment');
  await until(() => b.state.vehicles.some(car => car.playerId === a.room.sessionId && car.bodyAssetId === 'roadster'), 'remote sees reassignment');
  expect(a.state.local!.vehicle.health).toBe(80); expect(a.state.local!.vehicle.maxHealth).toBe(80);
  a.room.send('start-round'); await until(() => a.state.phase === 'countdown', 'round countdown');
  a.room.send('select-vehicle', { vehicleBodyId: 'army' }); await pause(100);
  expect(a.state.local!.vehicle.bodyAssetId).toBe('roadster'); expect(a.state.local!.vehicle.health).toBe(80);
});
it('rejects unknown body IDs and never accepts client-supplied stat values', async () => {
  await expect(peer('invincible-tank')).rejects.toThrow('invalid-vehicle');
  const a = await peer('army'); expect(a.state.local!.vehicle.maxHealth).toBe(130);
  expect(a.state.local!.vehicle.health).toBe(130);
  a.room.send('select-vehicle', { vehicleBodyId: 'army', maxHealth: 99999 }); await pause(80);
  expect(a.state.local!.vehicle.health).toBe(130);
});
