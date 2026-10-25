import { disposeTestRooms } from '../support/rooms';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker, type Server } from '@colyseus/core';
import { createGameServer } from '../../apps/server/src/index.js';
import { districtMap } from '@fender/content';
import { GAMEPLAY_REVISION, PROTOCOL_VERSION, neutralActions, unpackSnapshot, type DriverActions, type GameEvent, type InputCommand, type WireSnapshot, type WorldSnapshot } from '@fender/contracts';
import { serverMetrics } from '@fender/net-server';
import type { Simulation } from '@fender/sim';
import { createTcpProxy } from './tcp-proxy.js';

const endpoint = 'ws://127.0.0.1:2677';
// These authority/combat fixtures use the baseline patrol; profile differences have their own suite.
const options = { nickname: 'Officer', protocolVersion: PROTOCOL_VERSION, mapRevision: districtMap.revision, gameplayRevision: GAMEPLAY_REVISION, vehicleBodyId: 'patrol' };
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean, message: string, timeout = 5000): Promise<void> {
  const end = performance.now() + timeout;
  while (!predicate()) { if (performance.now() > end) throw new Error(`Timed out: ${message}`); await pause(15); }
}
interface Peer { room: Room; state: WorldSnapshot | null; history: WorldSnapshot[]; events: GameEvent[]; sequence: number }
const peers: Peer[] = [];
async function peer(roomId?: string, address = endpoint): Promise<Peer> {
  const sdk = new Client(address);
  const room = roomId ? await sdk.joinById(roomId, options) : await sdk.create('district', options);
  room.reconnection.minUptime = 0; room.reconnection.minDelay = 200; room.reconnection.maxDelay = 300; room.reconnection.maxEnqueuedMessages = 0;
  if(!roomId){const sim=(matchMaker.getLocalRoomById(room.roomId) as unknown as {sim:Simulation}).sim;const fixture=sim.checkpoint();fixture.state.campaign!.dispatchIndex=1;sim.restore(fixture);}
  const p: Peer = { room, state: null, history: [], events: [], sequence: 0 };
  room.onMessage('snapshot', (wire: WireSnapshot) => { p.state = unpackSnapshot(wire, wire.m === p.state?.matchId ? p.state?.props : undefined); p.history.push(p.state); });
  room.onMessage('events', (events: GameEvent[]) => p.events.push(...events));
  room.onMessage('pong', () => {});
  peers.push(p); room.send('resync'); await until(() => p.state !== null, 'initial authoritative world'); return p;
}
function command(p: Peer, actions: Partial<DriverActions> = {}, sequence = p.sequence++): InputCommand {
  return { sessionEpoch: p.state!.sessionEpoch, sequence, clientTick: sequence, actions: { ...neutralActions(), ...actions } };
}
function send(p: Peer, actions: Partial<DriverActions> = {}) { p.room.send('input', { commands: [command(p, actions)] }); }
function localSimulation(p: Peer): Simulation {
  // Trusted server fixture only. Tests never submit client positions/hits/damage as authority.
  return (matchMaker.getLocalRoomById(p.room.roomId) as unknown as { sim: Simulation }).sim;
}
function combatFixture(a: Peer, b: Peer) {
  const sim = localSimulation(a), c = sim.checkpoint();
  c.state.phase = 'playing'; c.state.phaseEnd = c.tick + 900; c.state.projectiles = [];
  c.state.records = c.state.records.filter(r => r.vehicle.playerId !== null);
  for (const r of c.state.records) {
    r.vehicle.pose = r.vehicle.playerId === a.room.sessionId ? { x: 4, z: -15, yaw: 0 } : { x: 4, z: 10, yaw: 0 };
    r.vehicle.velocity = { x: 0, z: 0, yawRate: 0 }; r.vehicle.protectedUntilTick = 0; r.vehicle.health = 100;
  }
  sim.restore(c);
}

let server: Server;
beforeAll(async () => { server = await createGameServer(2677, '127.0.0.1'); }, 15000);
afterEach(async () => { await disposeTestRooms();
  await Promise.allSettled(peers.splice(0).map(p => p.room.connection.isOpen ? p.room.leave(true) : Promise.resolve()));
  await until(() => serverMetrics.rooms === 0, 'all rooms disposed', 12000);
}, 15000);
afterAll(async () => { await server?.gracefullyShutdown(false); });

describe('real Colyseus authority over local WebSockets', () => {
  it('creates and joins eight clients with coherent unique local state, and rejects a ninth', async () => {
    const creator = await peer();
    for (let i = 0; i < 7; i++) await peer(creator.room.roomId);
    await until(() => peers.every(p => p.state!.scores.length === 8), 'eight coherent participants');
    expect(new Set(peers.map(p => p.state!.local!.vehicle.entityId)).size).toBe(8);
    expect(new Set(peers.map(p => p.state!.sessionEpoch)).size).toBe(8);
    for (const p of peers) { expect(p.state!.mapRevision).toBe(districtMap.revision); expect(p.state!.local!.vehicle.playerId).toBe(p.room.sessionId); }
    await expect(new Client(endpoint).joinById(creator.room.roomId, options)).rejects.toThrow();
  });

  it('rejects incompatible protocol/content versions and invalid nicknames', async () => {
    const creator = await peer(); const sdk = new Client(endpoint);
    await expect(sdk.joinById(creator.room.roomId, { ...options, protocolVersion: 999 })).rejects.toThrow('version-mismatch');
    await expect(sdk.joinById(creator.room.roomId, { ...options, mapRevision: 'wrong-map' })).rejects.toThrow('version-mismatch');
    await expect(sdk.joinById(creator.room.roomId, { ...options, gameplayRevision: 'wrong-rules' })).rejects.toThrow('version-mismatch');
    await expect(sdk.joinById(creator.room.roomId, { ...options, nickname: '' })).rejects.toThrow('invalid-name');
    expect(creator.state!.scores).toHaveLength(1);
  });

  it('requires the armed campaign build instead of accepting deployed arcade-v7 clients', async () => {
    const creator=await peer();let legacy:Room|undefined;
    try{
      await expect(new Client(endpoint).joinById(creator.room.roomId,{...options,gameplayRevision:'arcade-v7'}).then(room=>{legacy=room;return 'accepted-legacy-client';})).rejects.toThrow('version-mismatch');
    }finally{if(legacy){legacy.reconnection.enabled=false;await legacy.leave(true);}}
  });

  it('rejects invalid, duplicate, stale, spoofed and excess input without trusting client state', async () => {
    const a = await peer(), b = await peer(a.room.roomId);
    // Exercise valid siren actions during gameplay; lobby commands are acknowledged but frozen.
    const sim=localSimulation(a),playing=sim.checkpoint();playing.state.phase='playing';playing.state.phaseEnd=playing.tick+900;sim.restore(playing);
    const rejectedBefore = serverMetrics.rejectedInputs;
    const valid = command(a, { sirenToggle: true });
    a.room.send('input', { commands: [valid] });
    await until(() => a.state!.local!.lastConsumedSequence === 0, 'valid command acknowledged');
    expect(a.state!.local!.vehicle.sirenOn).toBe(true);
    a.room.send('input', { commands: [valid] });
    a.room.send('input', { commands: [{ ...command(a), sessionEpoch: b.state!.sessionEpoch }] });
    a.room.send('input', { commands: [{ ...command(a), actions: { ...neutralActions(), throttle: 1000 } }] });
    a.room.send('input', { commands: [{ ...command(a), actions: { ...neutralActions(), throttle: Number.NaN } }] });
    a.room.send('input', { commands: Array.from({ length: 5 }, () => command(a, { fire: true })) });
    a.room.send('input', { commands: [{ ...command(a), sequence: 1000000 }] });
    a.room.send('input', { commands: [{ entityId: b.state!.local!.vehicle.entityId, health: 0, damage: 1000, x: 500, sequence: 1 }] });
    await until(() => serverMetrics.rejectedInputs >= rejectedBefore + 7, 'server rejects adversarial input');
    await pause(100);
    expect(a.state!.local!.lastConsumedSequence).toBe(0); expect(a.state!.local!.vehicle.sirenOn).toBe(true);
    expect(a.state!.local!.vehicle.health).toBe(100); expect(b.state!.local!.vehicle.health).toBe(100);
    expect(a.state!.local!.vehicle.pose).toEqual(a.history.find(s => s.local!.lastConsumedSequence === 0)!.local!.vehicle.pose);
  });

  it('bounds command backlog, acknowledges discarded commands and stops held fire after a stall', async () => {
    const a = await peer(); const before = serverMetrics.queueResets;
    for (let i = 0; i < 8; i++) a.room.send('input', { commands: Array.from({ length: 4 }, () => command(a, { throttle: 1 })) });
    await until(() => serverMetrics.queueResets > before, 'queue backlog reset');
    await until(() => a.history.some(s => s.resetReason === 'input-backlog'), 'backlog reset snapshot');
    await until(() => a.state!.local!.lastConsumedSequence >= 30, 'discard boundary and remaining commands acknowledged');
    expect(Math.hypot(a.state!.local!.vehicle.velocity.x, a.state!.local!.vehicle.velocity.z)).toBeLessThan(5);
    const sim = localSimulation(a), c = sim.checkpoint(); c.state.phase = 'playing'; c.state.phaseEnd = c.tick + 600; sim.restore(c);
    send(a, { fire: true }); await pause(350);
    const shots = a.events.filter(e => e.kind === 'shot' && e.payload.shooterId === a.state!.local!.vehicle.entityId);
    expect(shots.length).toBeGreaterThanOrEqual(1); expect(shots.length).toBeLessThanOrEqual(2);
    const count = shots.length; await pause(300);
    expect(a.events.filter(e => e.kind === 'shot' && e.payload.shooterId === a.state!.local!.vehicle.entityId)).toHaveLength(count);
  });

  it.each(['stale', 'neutralize', 'disconnect'] as const)('safely brakes %s controls without reversing or continuing fire', async safety => {
    const a = await peer(), observer = await peer(a.room.roomId); combatFixture(a, observer);
    const sim = localSimulation(a), moving = sim.checkpoint();
    // The accepted setup volley now removes 3.4 m/s, then safety braking can
    // advance before the first publication. Start fast enough to retain the
    // original >8 m/s precondition without weakening any stopping assertion.
    moving.state.records.find(r => r.vehicle.playerId === a.room.sessionId)!.vehicle.velocity.z = 16;
    sim.restore(moving);
    send(a, { fire: true });
    await until(() => a.state!.local!.lastConsumedSequence === 0, 'fresh fire command consumed before safety condition');
    const entityId = a.state!.local!.vehicle.entityId, safetyTick = a.state!.serverTick;
    expect(a.state!.local!.vehicle.velocity.z).toBeGreaterThan(8);
    if (safety === 'neutralize') a.room.send('neutralize');
    if (safety === 'disconnect') {
      // Keep the socket disconnected throughout the stopping observation; reconnect remains automatic.
      a.room.reconnection.minDelay = 2000; a.room.reconnection.maxDelay = 2000;
      const serverClient = matchMaker.getLocalRoomById(a.room.roomId).clients.find(c => c.sessionId === a.room.sessionId)!;
      (serverClient.ref as unknown as { terminate(): void }).terminate();
      await until(() => observer.state!.scores.find(s => s.playerId === a.room.sessionId)!.connection === 'reconnecting', 'disconnected car retains its room reservation');
    }
    await until(() => observer.state!.serverTick >= safetyTick + 75, '75 authoritative safety ticks');
    const samples = observer.history.filter(s => s.serverTick >= safetyTick).map(s => s.vehicles.find(v => v.entityId === entityId)!);
    // Finish reconnection before assertions so even a stopping regression cleans up an open client.
    if (safety === 'disconnect') await until(() => a.state!.sessionEpoch !== moving.state.records.find(r => r.vehicle.playerId === a.room.sessionId)!.epoch, 'test client reconnects for clean teardown');
    expect(samples.length).toBeGreaterThan(10);
    for (const vehicle of samples) expect(vehicle.velocity.z).toBeGreaterThanOrEqual(-0.001);
    const stopped = samples.at(-1)!;
    expect(Math.hypot(stopped.velocity.x, stopped.velocity.z)).toBeLessThan(3);
    expect(observer.events.filter(e => e.kind === 'shot' && e.payload.shooterId === entityId && e.serverTick > safetyTick + 8)).toHaveLength(0);
  });

  it('limits cadence, applies each hit once, credits a wreck, and respawns over real sockets', async () => {
    const a = await peer(), b = await peer(a.room.roomId); combatFixture(a, b);
    const sender = setInterval(() => a.room.send('input', { commands: [command(a, { fire: true }), command(a, { fire: true })] }), 34);
    try {
      await until(() => b.state!.local!.vehicle.status === 'wrecked', 'ten twin-barrel volleys wreck target', 6000);
    } finally { clearInterval(sender); a.room.send('neutralize'); }
    const shots = a.events.filter(e => e.kind === 'shot' && e.payload.shooterId === a.state!.local!.vehicle.entityId);
    for (let i = 1; i < shots.length; i++) expect(shots[i]!.serverTick - shots[i - 1]!.serverTick).toBeGreaterThanOrEqual(12);
    const hits = a.events.filter((e): e is Extract<GameEvent, { kind: 'hit' }> => e.kind === 'hit' && e.payload.targetId === b.state!.local!.vehicle.entityId);
    expect(hits).toHaveLength(20); expect(new Set(hits.map(e => e.payload.projectileId)).size).toBe(20);
    expect(hits.every(hit=>hit.payload.damage===5)).toBe(true);expect(hits.reduce((total,hit)=>total+hit.payload.damage,0)).toBe(100);
    expect(shots.every(shot=>shot.kind==='shot'&&shot.payload.projectileIds?.length===2&&shot.payload.origins?.length===2)).toBe(true);
    expect(a.state!.scores.find(s => s.playerId === a.room.sessionId)!.score).toBe(1);
    expect(b.state!.local!.vehicle.health).toBe(0); expect(b.state!.scores.find(s => s.playerId === b.room.sessionId)!.wrecks).toBe(1);
    const oldDiscontinuity = b.state!.local!.vehicle.discontinuityId;
    await until(() => b.state!.local!.vehicle.status === 'active', 'three-second authoritative respawn', 4500);
    expect(b.state!.local!.vehicle.discontinuityId).toBe(oldDiscontinuity + 1); expect(b.state!.local!.vehicle.health).toBe(100); expect(b.state!.local!.vehicle.protectedUntilTick).toBeGreaterThan(b.state!.serverTick);
  }, 12000);

  it('broadcasts the same assisted shot and authoritative crash to both real peers', async () => {
    const a = await peer(), b = await peer(a.room.roomId); combatFixture(a, b);
    const sim = localSimulation(a), nearMiss = sim.checkpoint();
    const shooterId = a.state!.local!.vehicle.entityId;
    // Both actual muzzles remain inside the original4-degree/2.5m assist limits.
    nearMiss.state.records.find(record => record.vehicle.playerId === b.room.sessionId)!.vehicle.pose = { x: 5.5, z: 20, yaw: 0 };
    sim.restore(nearMiss); send(a, { fire: true });
    await until(() => b.state!.local!.vehicle.health === 90 && [a, b].every(p => p.events.some(event => event.kind === 'shot' && event.payload.shooterId === shooterId)), 'both peers observe a corrected shot and real damage');
    const shot = a.events.find((event): event is Extract<GameEvent, { kind: 'shot' }> => event.kind === 'shot' && event.payload.shooterId === shooterId)!;
    expect(shot.payload.origins).toHaveLength(2);expect(new Set(shot.payload.projectileIds).size).toBe(2);
    expect(shot.payload.origins![0]!.yaw).toBeCloseTo(Math.atan2(2.13,32.55),10);
    expect(shot.payload.origins![1]!.yaw).toBeCloseTo(Math.atan2(.87,32.55),10);
    expect(shot.payload.origin).toEqual(shot.payload.origins![0]);
    for(const peer of [a,b])expect(peer.history.some(state=>state.projectiles.filter(projectile=>shot.payload.projectileIds!.includes(projectile.entityId)).length===2)).toBe(true);
    expect(b.events.find(event => event.eventId === shot.eventId)).toEqual(shot);

    const wall = sim.checkpoint(), record = wall.state.records.find(record => record.vehicle.entityId === shooterId)!;
    // Drive nose-first into the wall; a purely sideways launch is damped by tyre grip.
    record.vehicle.pose = { x: districtMap.bounds.maxX - 3, z: 0, yaw: Math.PI/2 };
    record.vehicle.velocity = { x: 18, z: 0, yawRate: 0 }; record.vehicle.discontinuityId++;
    const discontinuityId = record.vehicle.discontinuityId; sim.restore(wall);
    await until(() => [a, b].every(p => p.events.some(event => event.kind === 'crash' && event.payload.vehicleId === shooterId && event.payload.discontinuityId === discontinuityId)), 'both peers observe the same wall crash');
    const crash = a.events.find((event): event is Extract<GameEvent, { kind: 'crash' }> => event.kind === 'crash' && event.payload.vehicleId === shooterId && event.payload.discontinuityId === discontinuityId)!;
    expect(crash.payload.normal).toEqual({ x: -1, z: 0 }); expect(crash.payload.speed).toBeGreaterThan(10);
    expect(b.events.find(event => event.eventId === crash.eventId)).toEqual(crash);
    await until(() => a.state!.local!.vehicle.discontinuityId === discontinuityId, 'post-crash authority snapshot');
    expect(a.state!.local!.vehicle.health).toBe(100); expect(b.state!.local!.vehicle.health).toBe(90);
  });

  it('reconnects a dropped socket with stable identity, new epoch and no queued fire', async () => {
    const a = await peer(), observer = await peer(a.room.roomId);
    const oldEpoch = a.state!.sessionEpoch, entity = a.state!.local!.vehicle.entityId, session = a.room.sessionId;
    const serverRoom = matchMaker.getLocalRoomById(a.room.roomId);
    const serverClient = serverRoom.clients.find(c => c.sessionId === session)!;
    (serverClient.ref as unknown as { terminate(): void }).terminate();
    await until(() => observer.history.some(s => s.scores.find(p => p.playerId === session)?.connection === 'reconnecting'), 'reservation visible to another client');
    await until(() => a.state!.sessionEpoch !== oldEpoch, 'reconnect epoch refreshed', 6000);
    expect(a.room.sessionId).toBe(session); expect(a.state!.local!.vehicle.entityId).toBe(entity);
    expect(a.state!.scores.find(s => s.playerId === session)!.connection).toBe('connected'); expect(a.state!.local!.lastConsumedSequence).toBe(-1);
    a.room.send('input', { commands: [{ ...command(a, { fire: true }), sessionEpoch: oldEpoch }] });
    await pause(120); expect(a.state!.local!.lastConsumedSequence).toBe(-1);
    a.sequence = 0; send(a, { sirenToggle: true }); await until(() => a.state!.local!.lastConsumedSequence === 0, 'new epoch starts at sequence zero');
  }, 10000);

  it('keeps shared authority through countdown, late join, departure, results and rematch', async () => {
    const a = await peer(), b = await peer(a.room.roomId);
    b.room.send('start-round'); await until(() => b.state!.phase === 'countdown', 'Any connected officer starts');
    a.room.send('start-round'); await until(() => a.state!.phase === 'countdown', 'creator starts countdown');
    const sim = localSimulation(a), countdown = sim.checkpoint(); countdown.state.phaseEnd = countdown.tick + 3; sim.restore(countdown);
    await until(() => a.state!.phase === 'playing', 'authoritative countdown transition');
    const late = await peer(a.room.roomId); expect(late.state!.phase).toBe('playing'); expect(late.state!.local!.vehicle.protectedUntilTick).toBeGreaterThan(late.state!.serverTick);
    await a.room.leave(true); await until(() => b.state!.scores.length === 2, 'creator departure preserves live match');
    const ending = sim.checkpoint(); ending.state.phaseEnd = ending.tick + 3; sim.restore(ending);
    await until(() => b.state!.phase === 'results' && late.state!.phase === 'results', 'both peers see round results');
    expect(b.state!.scores.map(s => s.score)).toEqual([0, 0]); expect(b.events.filter(e => e.kind === 'round-ended')).toHaveLength(1);
    late.room.send('rematch'); await until(() => b.state!.phase === 'lobby', 'Late joiner advances');
    b.room.send('rematch'); await until(() => b.state!.phase === 'lobby', 'oldest remaining participant controls rematch');
    b.room.send('start-round'); await until(() => late.state!.phase === 'countdown', 'same room starts rematch');
  });

  it('retains ordered authority and bounded fire through latency, jitter and a TCP byte-stream stall', async () => {
    const proxy = await createTcpProxy(2678, 2677, { oneWayLatencyMs: 45, jitterMs: 15, stallAtMs: 1300, stallDurationMs: 550 });
    let sender: ReturnType<typeof setInterval> | undefined;
    let a: Peer | undefined;
    try {
      a = await peer(undefined, proxy.endpoint);
      const sim = localSimulation(a), c = sim.checkpoint(); c.state.phase = 'playing'; c.state.phaseEnd = c.tick + 600; sim.restore(c);
      sender = setInterval(() => a!.room.send('input', { commands: [command(a!, { throttle: 1, fire: true }), command(a!, { throttle: 1, fire: true })] }), 34);
      await pause(2400); clearInterval(sender); sender = undefined;
      a.room.send('neutralize'); await pause(400);
      expect(a.state!.local!.lastConsumedSequence).toBeGreaterThan(50);
      for (let i = 1; i < a.history.length; i++) expect(a.history[i]!.serverTick).toBeGreaterThanOrEqual(a.history[i - 1]!.serverTick);
      const shots = a.events.filter(e => e.kind === 'shot'); expect(shots.length).toBeGreaterThan(3);
      for (let i = 1; i < shots.length; i++) expect(shots[i]!.serverTick - shots[i - 1]!.serverTick).toBeGreaterThanOrEqual(12);
      expect(Math.hypot(a.state!.local!.vehicle.velocity.x, a.state!.local!.vehicle.velocity.z)).toBeLessThanOrEqual(24.001);
      const finalCount = shots.length; await pause(300); expect(a.events.filter(e => e.kind === 'shot')).toHaveLength(finalCount);
    } finally {
      if (sender) clearInterval(sender);
      if (a?.room.connection.isOpen) await a.room.leave(true);
      await proxy.dispose();
    }
  }, 12000);
});
