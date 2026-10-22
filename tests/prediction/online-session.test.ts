import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { matchMaker, type Server } from '@colyseus/core';
import { createGameServer } from '../../apps/server/src/index.js';
import { createOnlineSession } from '@fender/net-client';
import { districtMap } from '@fender/content';
import { neutralActions, type SessionStatus } from '@fender/contracts';
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
afterEach(async () => { await Promise.allSettled(sessions.splice(0).map(s => s.dispose())); await until(() => serverMetrics.rooms === 0, 'prediction rooms disposed', 12000); }, 15000);
afterAll(async () => { await server?.gracefullyShutdown(false); });

describe('real online prediction facade baseline', () => {
  it('moves the local render frame synchronously before any authoritative acknowledgement', async () => {
    const value = session(), statuses: SessionStatus[] = []; value.onStatus(s => statuses.push(s));
    const join = await value.connect({ mode: 'create', nickname: 'Predictor' });
    const snapshot = value.getSnapshot()!, confirmed = structuredClone(snapshot.local!.vehicle.pose), tick = snapshot.serverTick;
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
    const value = session(); await value.connect({ mode: 'create', nickname: 'Backlog' });
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
    const join = await value.connect({ mode: 'create', nickname: 'Reconnect' });
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

  it('reports incompatible content through the status error channel', async () => {
    const value = session({ ...districtMap, revision: 'incompatible-test-map' }), statuses: SessionStatus[] = []; value.onStatus(s => statuses.push(s));
    await expect(value.connect({ mode: 'create', nickname: 'Wrong map' })).rejects.toThrow('version-mismatch');
    expect(statuses.at(-1)).toMatchObject({ state: 'error', reason: 'version-mismatch' });
  });

  it('reports a missing room through the status error channel', async () => {
    const value = session(), statuses: SessionStatus[] = []; value.onStatus(s => statuses.push(s));
    await expect(value.connect({ mode: 'join', roomId: 'missing-prediction-room', nickname: 'Lost' })).rejects.toThrow();
    expect(statuses.at(-1)).toMatchObject({ state: 'error', reason: 'room-missing' });
  });

  it('reports an unavailable endpoint through the status error channel', async () => {
    const value = session(districtMap, 'ws://127.0.0.1:0'), statuses: SessionStatus[] = []; value.onStatus(s => statuses.push(s));
    await expect(value.connect({ mode: 'create', nickname: 'Offline' })).rejects.toThrow();
    expect(statuses.at(-1)).toMatchObject({ state: 'error', reason: 'network-error' });
  });

  it('reports an invalid nickname through the status error channel', async () => {
    const value = session(), statuses: SessionStatus[] = []; value.onStatus(s => statuses.push(s));
    await expect(value.connect({ mode: 'create', nickname: '' })).rejects.toThrow('invalid-name');
    expect(statuses.at(-1)).toMatchObject({ state: 'error', reason: 'invalid-name' });
  });
});
