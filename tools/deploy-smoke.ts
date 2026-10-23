import assert from 'node:assert/strict';
import { Client, type Room, type SeatReservation } from '@colyseus/sdk';
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
const hasAllPlayerPings = (state: WorldSnapshot | undefined) => !!state && rooms.every(player => state.scores.some(score => score.playerId === player.sessionId && typeof score.pingMs === 'number' && Number.isFinite(score.pingMs) && score.pingMs >= 0));
try {
  for (let i = 0; i < 2; i++) {
    const options = { nickname: `Deploy check ${i + 1}`, protocolVersion: PROTOCOL_VERSION, gameplayRevision: GAMEPLAY_REVISION, mapRevision: districtMap.revision };
    const room = i === 0 ? await client.create('district', options) : await client.consumeSeatReservation((await client.http.post(`dispatch/${rooms[0]!.roomId}`, { body: options })).data as SeatReservation);
    rooms.push(room);
    room.onMessage('snapshot', (wire: WireSnapshot) => { const previous = states.get(room.sessionId); states.set(room.sessionId, unpackSnapshot(wire, wire.m === previous?.matchId ? previous?.props : undefined)); });
    room.onMessage('events', () => {});
    room.onMessage('latency-probe', ({ nonce }: { nonce: string }) => room.send('latency-pong', { nonce }));
    room.send('resync');
  }
  rooms[0]!.send('start-round');
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline && !rooms.every(room => states.get(room.sessionId)?.phase === 'playing' && hasAllPlayerPings(states.get(room.sessionId)))) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  for (const room of rooms) {
    const state = states.get(room.sessionId);
    assert.ok(hasAllPlayerPings(state), `observer ${room.sessionId} must receive both players' finite nonnegative pingMs`);
    assert.equal(state?.phase, 'playing', 'two real WebSocket clients must reach a live round');
    assert.equal(state.scores.length, 2);
    assert.ok(state.local?.vehicle, 'each player needs an authoritative car');
  }
} finally {
  for (const room of rooms) room.reconnection.enabled = false;
  await Promise.all(rooms.map(room => room.leave(true)));
}
console.log(`Production smoke passed: HTML, readiness, two WebSocket players, round start and per-player ping at ${endpoint}`);
