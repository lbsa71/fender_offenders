import { Client, type Room } from '@colyseus/sdk';
import { PROTOCOL_VERSION, GAMEPLAY_REVISION, neutralActions, unpackSnapshot, type WorldSnapshot, type WireSnapshot } from '@fender/contracts';
import { districtMap } from '@fender/content';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
const endpoint = process.env.TEST_SERVER_URL || 'http://127.0.0.1:2567';
const duration = Math.max(5, Number(process.env.LOAD_SECONDS || 30));
const sdk = new Client(endpoint);
const rooms: Room[] = [], latest: (WorldSnapshot | null)[] = [], bytes: number[] = [], counts: number[] = [], sequence: number[] = [];
const latencies: number[] = []; let events = 0, timer: ReturnType<typeof setInterval> | undefined;
try {
  for (let i = 0; i < 8; i++) {
    const options = { nickname: `Load Unit ${i + 1}`, protocolVersion: PROTOCOL_VERSION, mapRevision: districtMap.revision, gameplayRevision: GAMEPLAY_REVISION };
    const room = i === 0 ? await sdk.create('district', options) : await sdk.joinById(rooms[0]!.roomId, options);
    rooms.push(room); latest.push(null); bytes.push(0); counts.push(0); sequence.push(0);
    room.onMessage('snapshot', (wire: WireSnapshot) => { latest[i] = unpackSnapshot(wire, wire.m === latest[i]?.matchId ? latest[i]?.props : undefined); bytes[i]! += JSON.stringify(wire).length; counts[i]!++; });
    room.onMessage('events', (data: unknown[]) => { if (i === 0) events += data.length; });
    room.onMessage('pong', (data: { sent: number }) => latencies.push(performance.now() - data.sent));
  }
  await new Promise(resolve => setTimeout(resolve, 500));
  rooms[0]!.send('start-round'); const started = performance.now();
  let batch = 0;
  timer = setInterval(() => {
    batch++;
    rooms.forEach((room, i) => {
      const state = latest[i]; if (!state) return;
      const actions = { ...neutralActions(), throttle: .8, steer: Math.sin(batch / 90 + i) * .35, fire: true, recover: batch % 600 === 0 };
      room.send('input', { commands: [0, 1].map(() => ({ sessionEpoch: state.sessionEpoch, sequence: sequence[i]!++, clientTick: batch * 2, actions })) });
      if (batch % 30 === 0) room.send('ping', performance.now());
    });
  }, 1000 / 30);
  await new Promise(resolve => setTimeout(resolve, duration * 1000));
  const elapsed = (performance.now() - started) / 1000;
  const report = {
    date: new Date().toISOString(), endpoint, seconds: elapsed, players: 8,
    counts, estimatedJsonBytesPerSecondPerClient: bytes.map(b => Math.round(b / elapsed)),
    events, latestTicks: latest.map(s => s?.serverTick), phase: latest[0]?.phase,
    connectedPlayers: latest.map(s => s?.scores.filter(p => p.connection === 'connected').length),
    pingMs: { mean: latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length), max: Math.max(0, ...latencies) },
    note: 'Live Colyseus WebSocket clients on localhost. JSON byte estimates are conservative payload estimates, not captured wire/TCP bandwidth. This is not impaired-network or remote-internet proof.',
  };
  mkdirSync('reports', { recursive: true }); writeFileSync('reports/load-latest.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
  if (report.connectedPlayers.some(n => n !== 8) || counts.some(n => n < duration * 12)) throw new Error('Room lost clients or failed expected publication floor');
} finally { if (timer) clearInterval(timer); await Promise.all(rooms.map(room => room.leave(true))); }
