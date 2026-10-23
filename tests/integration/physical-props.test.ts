import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../../apps/server/src/index';
import { districtMap } from '@fender/content';
import { GAMEPLAY_REVISION, PROTOCOL_VERSION, unpackSnapshot, type WorldSnapshot, type WireSnapshot } from '@fender/contracts';
import type { Simulation } from '@fender/sim';

const endpoint = 'http://127.0.0.1:2711';
let server: Awaited<ReturnType<typeof createGameServer>>;
const peers: Room[] = [];
async function until(predicate: () => boolean) { const end = performance.now() + 5000; while (!predicate()) { if (performance.now() > end) throw new Error('Physical prop snapshot timed out'); await new Promise(resolve => setTimeout(resolve, 10)); } }
async function peer(roomId?: string) {
  const client = new Client(endpoint), options = { nickname: 'Prop test', vehicleBodyId: 'patrol', protocolVersion: PROTOCOL_VERSION, mapRevision: districtMap.revision, gameplayRevision: GAMEPLAY_REVISION };
  const room = roomId ? await client.joinById(roomId, options) : await client.create('district', options); peers.push(room); room.reconnection.enabled = false;
  const history: WorldSnapshot[] = [];
  room.onMessage('snapshot', (wire: WireSnapshot) => history.push(unpackSnapshot(wire, wire.m === history.at(-1)?.matchId ? history.at(-1)?.props : undefined))); room.onMessage('events', () => {}); room.onMessage('latency-probe', () => {}); room.send('resync'); await until(() => history.length > 0);
  return { room, history, get state() { return history.at(-1)!; } };
}
beforeAll(async () => { server = await createGameServer(2711); });
afterEach(async () => { await Promise.all(peers.splice(0).map(room => room.connection.isOpen ? room.leave(true) : Promise.resolve())); });
afterAll(async () => { await server?.gracefullyShutdown(false); });

it('publishes all authored physical furniture to both clients, including late join', async () => {
  const a = await peer(), b = await peer(a.room.roomId);
  expect(a.state.props!.length).toBeGreaterThan(100);
  expect(new Set(a.state.props!.map(prop => prop.kind))).toEqual(new Set(['barrel', 'crate', 'bin', 'lamp', 'sign', 'tree', 'bench']));
  await until(() => a.history.some(s => b.history.some(other => other.serverTick === s.serverTick)));
  const same = a.history.find(s => b.history.some(other => other.serverTick === s.serverTick))!;
  expect(b.history.find(s => s.serverTick === same.serverTick)!.props).toEqual(same.props);
});

it('broadcasts the same thrown barrel after an authoritative car collision', async () => {
  const a = await peer(), b = await peer(a.room.roomId);
  const barrel = a.state.props!.find(prop => prop.kind === 'barrel')!; expect(barrel).toBeDefined();
  const simulation = (matchMaker.getLocalRoomById(a.room.roomId) as unknown as { sim: Simulation }).sim;
  const checkpoint = simulation.checkpoint(); checkpoint.state.phase = 'playing'; checkpoint.state.phaseEnd = checkpoint.tick + 600;
  const driver = checkpoint.state.records.find(record => record.vehicle.playerId === a.room.sessionId)!;
  driver.vehicle.pose = { x: barrel.position.x, z: barrel.position.z - 4, yaw: 0 }; driver.vehicle.velocity = { x: 0, z: 20, yawRate: 0 }; driver.vehicle.discontinuityId++;
  simulation.restore(checkpoint);
  await until(() => a.history.some(s => { const prop = s.props?.find(p => p.entityId === barrel.entityId); return !!prop && Math.hypot(prop.position.x - barrel.position.x, prop.position.z - barrel.position.z) > 1; }));
  await until(() => a.history.some(s => { const prop = s.props?.find(p => p.entityId === barrel.entityId); return !!prop && Math.hypot(prop.position.x - barrel.position.x, prop.position.z - barrel.position.z) > 1 && b.history.some(other => other.serverTick === s.serverTick); }));
  const changed = a.history.find(s => { const prop = s.props?.find(p => p.entityId === barrel.entityId); return !!prop && Math.hypot(prop.position.x - barrel.position.x, prop.position.z - barrel.position.z) > 1 && b.history.some(other => other.serverTick === s.serverTick); })!;
  expect(b.history.find(s => s.serverTick === changed.serverTick)!.props).toEqual(changed.props);
  expect(a.state.local!.vehicle.health).toBe(100);
}, 12000);
