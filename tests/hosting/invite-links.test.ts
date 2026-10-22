import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker, type Server } from '@colyseus/core';
import { createGameServer } from '../../apps/server/src/index.js';
import { districtMap } from '@fender/content';
import { GAMEPLAY_REVISION, PROTOCOL_VERSION } from '@fender/contracts';
import { serverMetrics } from '@fender/net-server';

const endpoint = 'http://127.0.0.1:2696';
const options = { nickname: 'Persistent invite', protocolVersion: PROTOCOL_VERSION, mapRevision: districtMap.revision, gameplayRevision: GAMEPLAY_REVISION };
const rooms: Room[] = [];
let server: Server;
const priorLimit = process.env.MAX_ROOMS;
async function until(predicate: () => boolean) {
  const deadline = performance.now() + 5000;
  while (!predicate()) { if (performance.now() > deadline) throw new Error('Room cleanup did not complete'); await new Promise(resolve => setTimeout(resolve, 10)); }
}
beforeAll(async () => { server = await createGameServer(2696); });
afterEach(async () => {
  await Promise.all(rooms.splice(0).map(room => { room.reconnection.enabled = false; return room.connection.isOpen ? room.leave(true) : Promise.resolve(); }));
  await until(() => serverMetrics.rooms === 0);
  if (priorLimit === undefined) delete process.env.MAX_ROOMS; else process.env.MAX_ROOMS = priorLimit;
});
afterAll(async () => { await server?.gracefullyShutdown(false); });
async function dispatch(code: string, body: object = options) {
  const response = await fetch(`${endpoint}/dispatch/${code}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close' }, body: JSON.stringify(body) });
  return { response, body: await response.json().catch(() => null) };
}
async function consume(body: Parameters<Client['consumeSeatReservation']>[0]) {
  const room = await new Client(endpoint).consumeSeatReservation(body); rooms.push(room);
  room.onMessage('snapshot', () => {}); room.onMessage('events', () => {}); room.onMessage('latency-probe', () => {});
  return room;
}
it('opens a fresh room from an old invite and preserves that exact invite ID', async () => {
  const result = await dispatch('Bi4bIat17');
  expect(result.response.status).toBe(200);
  const room = await consume(result.body);
  expect(room.roomId).toBe('Bi4bIat17');
});
it('puts simultaneous visitors to one stale invite in one room even with a one-room cap', async () => {
  process.env.MAX_ROOMS = '1';
  const results = await Promise.all(Array.from({ length: 3 }, () => dispatch('Together1')));
  expect(results.map(result => result.response.status)).toEqual([200, 200, 200]);
  const joined = await Promise.all(results.map(result => consume(result.body)));
  expect(joined.map(room => room.roomId)).toEqual(['Together1', 'Together1', 'Together1']);
  expect(serverMetrics.rooms).toBe(1);
  expect(matchMaker.getLocalRoomById('Together1').clients.length).toBe(3);
});
it('reuses the same link after the server and its in-memory rooms restart', async () => {
  const first = await consume((await dispatch('Restart01')).body);
  await first.leave(true); await until(() => serverMetrics.rooms === 0);
  await server.gracefullyShutdown(false); server = await createGameServer(2696);
  const second = await dispatch('Restart01');
  expect(second.response.status).toBe(200);
  expect((await consume(second.body)).roomId).toBe('Restart01');
});
it('rejects malformed invite IDs without allocating a room', async () => {
  const result = await dispatch('too-long-to-be-a-room-id');
  expect(result.response.status).toBe(400); expect(serverMetrics.rooms).toBe(0);
});
it('preserves genuine capacity errors and allows retrying that invite after a slot opens', async () => {
  process.env.MAX_ROOMS = '1';
  const first = await consume((await dispatch('Occupied1')).body);
  const denied = await dispatch('WaitHere1');
  expect(denied.response.status).toBe(503); expect(denied.body).toEqual({ code: 503, error: 'Dispatch capacity reached' });
  await first.leave(true); await until(() => serverMetrics.rooms === 0);
  const retried = await dispatch('WaitHere1');
  expect(retried.response.status).toBe(200); expect((await consume(retried.body)).roomId).toBe('WaitHere1');
});
it('rejects an unrelated browser origin before allocating a room', async () => {
  const response = await fetch(`${endpoint}/dispatch/BadOrigin`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example', Connection: 'close' }, body: JSON.stringify(options),
  });
  expect(response.status).toBe(403); expect(serverMetrics.rooms).toBe(0);
});
