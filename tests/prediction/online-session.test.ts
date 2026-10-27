import {controlledCadence} from '../support/controlled-cadence';
import { disposeTestRooms } from '../support/rooms';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { matchMaker, type Server } from '@colyseus/core';
import { createGameServer } from '../../apps/server/src/index.js';
import { createOnlineSession } from '@fender/net-client';
import { districtMap } from '@fender/content';
import { neutralActions, type SessionStatus } from '@fender/contracts';
import type { Simulation } from '@fender/sim';
import { serverMetrics } from '@fender/net-server';

const endpoint = 'ws://127.0.0.1:2691';
type OnlineSession = ReturnType<typeof createOnlineSession>;
const sessions: OnlineSession[] = [];
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean, message: string, timeout = 5000) {
  const end = performance.now() + timeout;
  while (!predicate()) { if (performance.now() > end) throw new Error(`Timed out: ${message}`); await pause(10); }
}
function session(map = districtMap, address = endpoint) {
  const value = createOnlineSession(address, map); sessions.push(value); return value;
}
function submit(value: OnlineSession, sequence: number) {
  value.submit({ sessionEpoch: value.getSnapshot()!.sessionEpoch, sequence, clientTick: sequence, actions: { ...neutralActions(), throttle: 1 } });
}
let server: Server;
beforeAll(async () => { server = await createGameServer(2691, '127.0.0.1'); }, 15000);
afterEach(async () => { await disposeTestRooms(); await Promise.allSettled(sessions.splice(0).map(s => s.dispose())); await until(() => serverMetrics.rooms === 0, 'prediction rooms disposed', 12000); }, 15000);
afterAll(async () => { await server?.gracefullyShutdown(false); });

describe('real online prediction facade baseline', () => {
  it.each([20, 60])('keeps a healthy solo input stream responsive and bounded at %i authority ticks per second', async tickRate => {
    const value = session(), joined = await value.connect({ roomId: crypto.randomUUID(), nickname: 'Slow authority', vehicleBodyId: 'patrol' });
    const room = matchMaker.getLocalRoomById(joined.roomId);
    // Drive the actual room's real step at a controlled cadence. Network,
    // packet flushing, prediction and physics remain the production adapters.
    room.setSimulationInterval(undefined);
    const controlled = room as unknown as { sim: Simulation; step(): void; publish(client: unknown, full?: boolean): void };
    const checkpoint = controlled.sim.checkpoint();
    checkpoint.state.phase = 'playing'; checkpoint.state.phaseEnd = checkpoint.tick + 18000;
    checkpoint.state.campaign = undefined; checkpoint.state.pursuit = undefined;
    checkpoint.state.records = checkpoint.state.records.filter(record => record.vehicle.playerId === joined.playerId);
    const officer = checkpoint.state.records[0]!;
    officer.vehicle.pose = { x: 0, z: -76, yaw: 0 }; officer.vehicle.velocity = { x: 0, z: 20, yawRate: 0 };
    officer.vehicle.protectedUntilTick = 0; officer.vehicle.discontinuityId++;
    controlled.sim.restore(checkpoint);
    controlled.publish(room.clients.find(client => client.sessionId === joined.playerId), true);
    await until(() => value.getSnapshot()!.phase === 'playing', 'controlled solo authority baseline');
    const resetBefore = serverMetrics.queueResets;
    const resets: string[] = [], leads: number[] = [], reverseSteps: number[] = [];
    const trace: { at: number; lead: number; pending: number; authorityZ: number; snapshotZ: number; speed: number; ack: number; sequence: number }[] = [];
    const started = performance.now(); let sequence = 0, previousZ: number | null = null, snapshots = 0;
    value.onSnapshot(snapshot => { snapshots++; if (snapshot.resetReason === 'input-backlog') resets.push(snapshot.resetReason); });
    let authoritySteps = 0;
    // Use the room scheduler so its wall clock keeps connection health and
    // message-rate windows alive while physics runs at the chosen cadence.
    // Count elapsed time: Windows can deliver a requested 16.7 ms timer every 31 ms.
    room.setSimulationInterval(controlledCadence(tickRate,() => { controlled.step(); authoritySteps++; }), 1000 / tickRate);
    const inputTimer = setInterval(() => {
      submit(value, sequence++);
      const frame = value.sampleFrame()!, local = frame.vehicles.find(vehicle => vehicle.entityId === joined.localEntityId)!;
      if (performance.now() - started >= 1000) {
        leads.push(local.pose.z - controlled.sim.authority(joined.playerId)!.vehicle.pose.z);
        trace.push({ at: performance.now() - started, lead: leads.at(-1)!, pending: value.getStats().pendingInputs!, authorityZ: controlled.sim.authority(joined.playerId)!.vehicle.pose.z, snapshotZ: value.getSnapshot()!.local!.vehicle.pose.z, speed: local.velocity.z, ack: value.getSnapshot()!.local!.lastConsumedSequence, sequence });
        if (previousZ !== null) reverseSteps.push(Math.max(0, previousZ - local.pose.z));
      }
      previousZ = local.pose.z;
    }, 1000 / 60);
    try {
      await until(() => authoritySteps >= tickRate * 6, 'six seconds of controlled authority', 10000);
      expect(snapshots, 'The fixture must maintain its connection throughout the full drive').toBeGreaterThan(tickRate * 5 / 3);
      expect(controlled.sim.authority(joined.playerId)!.vehicle.pose.z).toBeGreaterThan(-56);
      expect(resets, 'A healthy steady input stream must not repeatedly invoke the flood-reset path').toEqual([]);
      expect(serverMetrics.queueResets - resetBefore).toBe(0);
      // The user prioritizes continuous local input over the previous 100ms
      // ACK gate. This artificial 20Hz world permits 300ms at patrol top speed,
      // while keeping the original queue-reset and backwards-motion guards.
      const maxLead = Math.max(...leads), peak = leads.indexOf(maxLead);
      expect(maxLead, `Normal rooms retain the tighter bound; overloaded rooms permit the requested extra prediction: ${JSON.stringify({ aroundPeak: trace.slice(Math.max(0, peak - 3), peak + 4), settled: trace.filter((_, index) => index % 30 === 0) })}`).toBeLessThan(tickRate === 20 ? 28 * .3 : 3);
      const middle = leads.slice(Math.floor(leads.length / 3), Math.floor(leads.length * 2 / 3));
      const final = leads.slice(Math.floor(leads.length * 2 / 3));
      expect(Math.max(...final) - Math.max(...middle), 'Temporary lead must settle rather than grow every second').toBeLessThan(1);
      expect(Math.max(...reverseSteps), 'A clear straight solo drive must not snap backward after warm-up').toBeLessThan(.5);
    } finally { room.setSimulationInterval(undefined); clearInterval(inputTimer); }
  });

  it('moves the local render frame synchronously before any authoritative acknowledgement', async () => {
    const value = session(), statuses: SessionStatus[] = []; value.onStatus(s => statuses.push(s));
    const join = await value.connect({ roomId: crypto.randomUUID(), nickname: 'Predictor' });
    // The genuine countdown is an ordered barrier after initial resync. Only
    // fast-forward time; preserve the real publisher's pause/reset fields.
    value.request('start-round');
    await until(() => value.getSnapshot()!.phase === 'countdown', 'real dispatch countdown');
    // Campaign briefings freeze movement. Exercise prediction only after authority starts play.
    const room = matchMaker.getLocalRoomById(join.roomId), sim = (room as unknown as { sim: Simulation }).sim;
    const playing = sim.checkpoint(); playing.state.phase = 'playing'; playing.state.phaseEnd = playing.tick + 18000; sim.restore(playing);
    (room as unknown as { publish(client: unknown, full?: boolean): void }).publish(room.clients.find(client => client.sessionId === join.playerId), true);
    await until(() => value.getSnapshot()!.phase === 'playing', 'authoritative campaign play begins');
    const snapshot = value.getSnapshot()!, confirmed = structuredClone(snapshot.local!.vehicle.pose), tick = snapshot.serverTick;
    expect(snapshot.paused, 'The fixture must retain the room pause state to avoid a synthetic reset on the next normal snapshot').toBe(false);
    submit(value, 0);
    const frame = value.sampleFrame()!, predicted = frame.vehicles.find(v => v.entityId === frame.localEntityId)!;
    expect(Math.hypot(predicted.pose.x - confirmed.x, predicted.pose.z - confirmed.z)).toBeGreaterThan(0.001);
    expect(value.getSnapshot()!.serverTick).toBe(tick); expect(value.getSnapshot()!.local!.lastConsumedSequence).toBe(-1);
    expect(value.getSnapshot()!.local!.vehicle.pose).toEqual(confirmed); expect(value.getStats().pendingInputs).toBe(1);
    expect(frame.localEntityId).toBe(join.localEntityId); expect(value.getIdentity()).toEqual({ playerId: join.playerId, roomId: join.roomId });
    expect(statuses[0]!.state).toBe('connecting'); expect(statuses.some(s => s.state === 'lobby')).toBe(true);
    await until(() => value.getSnapshot()!.local!.lastConsumedSequence === 0, 'prediction command acknowledged');
    expect(value.getStats().pendingInputs).toBe(0);
  });

  it('bounds queued prediction and clears pending commands after a full server resync', async () => {
    const value = session(); await value.connect({ roomId: crypto.randomUUID(), nickname: 'Backlog' });
    let resets = 0; value.onSnapshot(s => { if (s.resetReason === 'resync') resets++; });
    for (let sequence = 0; sequence < 13; sequence++) submit(value, sequence);
    expect(value.getStats().pendingInputs).toBe(0);
    await until(() => resets > 0, 'backlog requests and receives full resync');
    expect(value.getStats().pendingInputs).toBe(0); expect(value.getSnapshot()!.local!.lastConsumedSequence).toBe(-1);
    const frame = value.sampleFrame()!, local = frame.vehicles.find(v => v.entityId === frame.localEntityId)!;
    expect(local.pose).toEqual(value.getSnapshot()!.local!.vehicle.pose);
  });

  it('clears pending commands during an actual reconnect and resumes with the new epoch', async () => {
    const value = session(), statuses: SessionStatus[] = []; value.onStatus(s => statuses.push(s));
    const join = await value.connect({ roomId: crypto.randomUUID(), nickname: 'Reconnect' });
    for (let i = 0; i < 8; i++) submit(value, i);
    expect(value.getStats().pendingInputs).toBe(8);
    const room = matchMaker.getLocalRoomById(join.roomId), client = room.clients.find(c => c.sessionId === join.playerId)!;
    (client.ref as unknown as { terminate(): void }).terminate();
    await until(() => statuses.some(s => s.state === 'reconnecting'), 'facade signals reconnect');
    expect(value.getStats().pendingInputs).toBe(0);
    submit(value, 20); expect(value.getStats().pendingInputs).toBe(0);
    await until(() => value.getSnapshot()!.sessionEpoch !== join.sessionEpoch, 'new authoritative epoch received');
    expect(value.getIdentity().playerId).toBe(join.playerId); expect(value.getSnapshot()!.local!.vehicle.entityId).toBe(join.localEntityId);
    expect(value.getStats().pendingInputs).toBe(0);
    submit(value, 0); await until(() => value.getSnapshot()!.local!.lastConsumedSequence === 0, 'new epoch command acknowledged');
    expect(statuses.at(-1)!.state).toBe('lobby');
  });

  it('intentionally disposes without retrying or announcing reconnection when a proxy reports Going Away', async () => {
    const value = session(), statuses: SessionStatus[] = []; value.onStatus(s => statuses.push(s));
    const join = await value.connect({ roomId: crypto.randomUUID(), nickname: 'Intentional leave' });
    const room = matchMaker.getLocalRoomById(join.roomId), client = room.clients.find(c => c.sessionId === join.playerId)!;
    const socket = client.ref as unknown as { close(code?: number, reason?: string): void };
    const close = socket.close.bind(socket);
    socket.close = (code, reason) => close(code === 4000 ? 1001 : code, reason);
    let reconnectAttempts = 0;
    const upgraded = () => { reconnectAttempts++; };
    server.transport.server!.on('upgrade', upgraded);
    try {
      const completed = await Promise.race([value.dispose().then(() => true), pause(2000).then(() => false)]);
      expect(completed, 'An intentional session disposal must complete promptly').toBe(true);
      await pause(450);
      expect(reconnectAttempts, 'Leaving must not open a replacement WebSocket').toBe(0);
      expect(statuses.some(s => s.state === 'reconnecting')).toBe(false);
      expect(statuses.at(-1)!.state).toBe('disconnected');
      expect(value.getStats().pendingInputs).toBe(0);
    } finally { server.transport.server!.off('upgrade', upgraded); }
  });

  it('finishes disposal promptly when the socket is already reconnecting', async () => {
    const value = session(), statuses: SessionStatus[] = []; value.onStatus(s => statuses.push(s));
    const join = await value.connect({ roomId: crypto.randomUUID(), nickname: 'Leave broken link' });
    const room = matchMaker.getLocalRoomById(join.roomId), client = room.clients.find(c => c.sessionId === join.playerId)!;
    const allowReconnection = room.allowReconnection.bind(room);
    // Keep the real reservation/expiry path, with a short fixture duration for prompt teardown.
    room.allowReconnection = previous => allowReconnection(previous, 1);
    let retryUpgrades = 0;
    const upgraded = () => { retryUpgrades++; };
    server.transport.server!.on('upgrade', upgraded);
    (client.ref as unknown as { terminate(): void }).terminate();
    await until(() => statuses.some(s => s.state === 'reconnecting'), 'socket enters reconnect before leaving');
    let outcome = 'pending';
    const disposing = value.dispose().then(() => { outcome = 'completed'; }, () => { outcome = 'rejected'; });
    try {
      await pause(500);
      expect(outcome, 'Returning to dispatch must not wait for a broken socket to reconnect').toBe('completed');
      expect(retryUpgrades, 'A queued SDK retry must not recreate a disposed transport').toBe(0);
      expect(statuses.at(-1)!.state).toBe('disconnected');
    } finally {
      server.transport.server!.off('upgrade', upgraded);
      await Promise.race([disposing, pause(1000)]);
    }
  });

  it('bounds disposal when the server never answers an intentional leave handshake', async () => {
    const value = session(), join = await value.connect({ roomId: crypto.randomUUID(), nickname: 'Unanswered leave' });
    const room = matchMaker.getLocalRoomById(join.roomId), client = room.clients.find(c => c.sessionId === join.playerId)!;
    const socket = client.ref as unknown as { close(code?: number, reason?: string): void; terminate(): void };
    const close = socket.close.bind(socket);
    socket.close = (code, reason) => { if (code !== 4000) close(code, reason); };
    const disposing = value.dispose();
    try {
      const completed = await Promise.race([disposing.then(() => true), pause(1500).then(() => false)]);
      expect(completed, 'Leaving dispatch needs a deadline when the close acknowledgement never arrives').toBe(true);
    } finally {
      socket.close = close; socket.terminate();
      await Promise.race([disposing, pause(1000)]);
    }
  });

  it('reports incompatible content through the status error channel', async () => {
    const value = session({ ...districtMap, revision: 'incompatible-test-map' }), statuses: SessionStatus[] = []; value.onStatus(s => statuses.push(s));
    await expect(value.connect({ roomId: crypto.randomUUID(), nickname: 'Wrong map' })).rejects.toThrow('version-mismatch');
    expect(statuses.at(-1)).toMatchObject({ state: 'error', reason: 'version-mismatch' });
  });

  it('immediately echoes the server latency nonce so every participant can see measured ping', async () => {
    const value = session(), join = await value.connect({ roomId: crypto.randomUUID(), nickname: 'Latency probe' });
    const room = matchMaker.getLocalRoomById(join.roomId), nonce = 'facade-latency-regression';
    const response = new Promise<unknown>(resolve => room.onMessage('latency-pong', (_client, message: unknown) => {
      if (typeof message === 'object' && message !== null && 'nonce' in message && message.nonce === nonce) resolve(message);
    }));
    room.broadcast('latency-probe', { nonce });
    expect(await Promise.race([response, pause(750).then(() => null)])).toEqual({ nonce });
  });

  it('reports a malformed invite through the status error channel', async () => {
    const value = session(), statuses: SessionStatus[] = []; value.onStatus(s => statuses.push(s));
    await expect(value.connect({ roomId: 'invalid!prediction', nickname: 'Lost' })).rejects.toThrow();
    expect(statuses.at(-1)).toMatchObject({ state: 'error', reason: 'room-missing' });
  });

  it('reports an unavailable endpoint through the status error channel', async () => {
    const value = session(districtMap, 'ws://127.0.0.1:0'), statuses: SessionStatus[] = []; value.onStatus(s => statuses.push(s));
    await expect(value.connect({ roomId: crypto.randomUUID(), nickname: 'Offline' })).rejects.toThrow();
    expect(statuses.at(-1)).toMatchObject({ state: 'error', reason: 'network-error' });
  });

  it('reports an invalid nickname through the status error channel', async () => {
    const value = session(), statuses: SessionStatus[] = []; value.onStatus(s => statuses.push(s));
    await expect(value.connect({ roomId: crypto.randomUUID(), nickname: '' })).rejects.toThrow('invalid-name');
    expect(statuses.at(-1)).toMatchObject({ state: 'error', reason: 'invalid-name' });
  });

  it('distinguishes server room capacity from a full eight-player room', async () => {
    const previousLimit = process.env.MAX_ROOMS; process.env.MAX_ROOMS = '1';
    try {
      await session().connect({ roomId: crypto.randomUUID(), nickname: 'Occupied dispatch' });
      const blocked = session(), statuses: SessionStatus[] = []; blocked.onStatus(value => statuses.push(value));
      await expect(blocked.connect({ roomId: crypto.randomUUID(), nickname: 'Waiting dispatch' })).rejects.toMatchObject({ code: 503, message: 'Dispatch capacity reached' });
      expect(statuses.at(-1)).toMatchObject({ state: 'error', reason: 'server-capacity' });
    } finally {
      if (previousLimit === undefined) delete process.env.MAX_ROOMS; else process.env.MAX_ROOMS = previousLimit;
    }
  });
});
