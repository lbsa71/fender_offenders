import assert from 'node:assert/strict';
import { Client, type Room } from '@colyseus/sdk';
import { PROTOCOL_VERSION, GAMEPLAY_REVISION, unpackSnapshot, type WireSnapshot, type WorldSnapshot } from '@fender/contracts';
import { districtMap } from '@fender/content';

const endpoint = process.env.TEST_SERVER_URL || 'http://127.0.0.1:2567';
const origin = process.env.TEST_ORIGIN || new URL(endpoint).origin;
const timeout = AbortSignal.timeout(120_000);
// Free hosting may take a minute to wake. Check HTML as well as process health.
for (const route of ['/ready', '/']) {
  const response = await fetch(new URL(route, endpoint), { signal: timeout, headers: { Origin: origin } });
  assert.equal(response.status, 200, `${route} must be reachable at the production origin`);
  if (route === '/') assert.match(await response.text(), /Fender Offenders/, 'production client must be served');
}
const client = new Client(endpoint);
const rooms: Room[] = [];
const states = new Map<string, WorldSnapshot>();
try {
  for (let i = 0; i < 2; i++) {
    const options = { nickname: `Deploy check ${i + 1}`, protocolVersion: PROTOCOL_VERSION, gameplayRevision: GAMEPLAY_REVISION, mapRevision: districtMap.revision };
    const room = i === 0 ? await client.create('district', options) : await client.joinById(rooms[0]!.roomId, options);
    rooms.push(room);
    room.onMessage('snapshot', (wire: WireSnapshot) => states.set(room.sessionId, unpackSnapshot(wire)));
    room.onMessage('events', () => {});
    room.send('resync');
  }
  rooms[0]!.send('start-round');
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline && !rooms.every(room => states.get(room.sessionId)?.phase === 'playing')) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  for (const room of rooms) {
    const state = states.get(room.sessionId);
    assert.equal(state?.phase, 'playing', 'two real WebSocket clients must reach a live round');
    assert.equal(state.scores.length, 2);
    assert.ok(state.local?.vehicle, 'each player needs an authoritative car');
  }
  console.log(`Production smoke passed: HTML, readiness, two WebSocket players and round start at ${endpoint}`);
} finally {
  await Promise.all(rooms.map(room => room.leave(true)));
}
