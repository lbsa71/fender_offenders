import { performance } from 'node:perf_hooks';
import { districtMap } from '@fender/content';
import { neutralActions, type AppliedDriverInput } from '@fender/contracts';
import { createSimulation, initPhysics } from './src/index.js';

await initPhysics();
const sim = createSimulation(districtMap, { mode: 'multiplayer', trafficCount: 16, matchId: 'benchmark', seed: 42 });
const inputs = new Map<string, AppliedDriverInput>();
for (let i = 0; i < 8; i++) {
  const vehicle = sim.addPlayer({ playerId: `bot-${i}`, nickname: `Bot ${i}`, sessionEpoch: 'bench' });
  inputs.set(vehicle.entityId, { sessionEpoch: 'bench', sourceCommandSequence: 0, actions: { ...neutralActions(), throttle: 1, steer: (i % 2 ? 1 : -1) * 0.22, fire: true } });
}
sim.startRound('bot-0');
const samples: number[] = [];
let eventCount = 0;
for (let tick = 0; tick < 18600; tick++) {
  for (const input of inputs.values()) input.sourceCommandSequence = tick;
  const start = performance.now(); sim.step(inputs); const elapsed = performance.now() - start;
  if (tick > 600) samples.push(elapsed);
  eventCount += sim.drainEvents().length;
}
samples.sort((a, b) => a - b);
const state = sim.snapshot();
console.log(JSON.stringify({ ticks: 18600, players: state.scores.length, vehicles: state.vehicles.length, finalPhase: state.phase, events: eventCount, meanMs: samples.reduce((a, b) => a + b, 0) / samples.length, p95Ms: samples[Math.floor(samples.length * 0.95)], p99Ms: samples[Math.floor(samples.length * 0.99)], maxMs: samples.at(-1), runtime: process.version, platform: process.platform, architecture: process.arch }, null, 2));
sim.dispose();
