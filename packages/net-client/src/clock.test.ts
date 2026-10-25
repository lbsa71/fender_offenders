import { afterEach, expect, it, vi } from 'vitest';
import { packSnapshot, unpackSnapshot, neutralActions, type VehicleState, type WireSnapshot, type WorldSnapshot } from '@fender/contracts';
import { createOnlineSession } from './index.js';
import type { CollisionMap } from '@fender/contracts';

const wire = vi.hoisted(() => ({ handlers: new Map<string, (message: unknown) => void>(), initial: null as unknown, deferBaseline: false, sent: [] as string[] }));
vi.mock('@colyseus/sdk', () => ({ Client: class {
  http={post:async()=>({data:{}})};
  async consumeSeatReservation() { return {
    roomId: 'clock-fixture', sessionId: 'local', reconnection: { enqueuedMessages: [] },
    connection: { isOpen: true, reconnect() {}, close() {} },
    onMessage(type: string, handler: (value: unknown) => void) { wire.handlers.set(type, handler); },
    onDrop() {}, onReconnect() {}, onLeave() {}, onError() {},
    send(type: string) { wire.sent.push(type);if (type === 'resync') wire.handlers.get('snapshot')!({ ...(wire.initial as WireSnapshot), reset: wire.deferBaseline ? 'join' : 'resync' }); },
    async leave() { return 4000; },
    removeAllListeners() { wire.handlers.clear(); },
  }; }
} }));

const map: CollisionMap = { id: 'clock-fixture', revision: 'clock-fixture', bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, colliders: [], surfaces: [], spawns: [], laneNodes: [], laneEdges: [] };
function snapshot(tick: number, options: { direction?: number; epoch?: string; matchId?: string; discontinuity?: number } = {}): WireSnapshot {
  const direction = options.direction ?? 1;
  const car = (id: string, z: number): VehicleState => ({ entityId: id, playerId: id, bodyAssetId: 'patrol', pose: { x: id === 'local' ? 100 : 0, z, yaw: 0 }, velocity: { x: 0, z: id === 'local' ? 0 : direction * 10, yawRate: 0 }, health: 100, status: 'active', protectedUntilTick: 0, respawnAtTick: null, sirenOn: false, discontinuityId: id === 'local' ? options.discontinuity ?? 0 : 0 });
  const local = car('local', 100);
  const state: WorldSnapshot = { protocolVersion: 1, mapRevision: map.revision, gameplayRevision: 'arcade-v1', sessionEpoch: options.epoch ?? 'clock-epoch', serverTick: tick, matchId: options.matchId ?? 'clock-fixture', phase: 'playing', phaseEndsAtTick: null, vehicles: [local, car('remote', direction * tick / 6)], projectiles: [], scores: [], local: { vehicle: local, driver: { resolvedSteering: 0, reverseHoldTicks: 0, nextFireTick: 0, shotOrdinal: 0, nextRecoveryTick: 0, lastDamageTick: null }, lastConsumedSequence: -1 } };
  return packSnapshot(state);
}
afterEach(() => { vi.useRealTimers(); wire.handlers.clear(); wire.deferBaseline = false; });

it('retains sequenced room notices across snapshots so slow or hidden views cannot miss them',async()=>{
  wire.initial=snapshot(100);const session=createOnlineSession('ws://clock-fixture',map),statuses:unknown[]=[];session.onStatus(status=>statuses.push(status));
  try{
    await session.connect({roomId:crypto.randomUUID(),nickname:'Returning view'});
    wire.handlers.get('room-notice')?.({message:'Backup joined. The dispatch is live.'});
    expect(statuses.at(-1)).toMatchObject({notice:{id:1,message:'Backup joined. The dispatch is live.'}});
    wire.handlers.get('snapshot')!(snapshot(101));expect(statuses.at(-1)).toMatchObject({notice:{id:1}});
    wire.handlers.get('room-notice')?.({message:'Backup joined. The dispatch is live.'});expect(statuses.at(-1)).toMatchObject({notice:{id:2}});
  }finally{await session.dispose();}
});

it('reports idle warnings and intentional timeout without announcing an expired reconnect',async()=>{
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  wire.initial=snapshot(100);const session=createOnlineSession('ws://clock-fixture',map),statuses:unknown[]=[];session.onStatus(status=>statuses.push(status));
  try{
    await session.connect({roomId: crypto.randomUUID(),nickname:'Idle officer'});
    wire.handlers.get('idle-warning')?.({remainingMs:60000});expect(statuses.at(-1)).toMatchObject({idleRemainingMs:60000});
    wire.handlers.get('idle-warning')?.({remainingMs:null});expect(statuses.at(-1)).toMatchObject({idleRemainingMs:undefined});
    wire.handlers.get('session-ended')?.({reason:'idle-timeout'});expect(statuses.at(-1)).toMatchObject({state:'disconnected',reason:'idle-timeout'});
    wire.sent=[];vi.advanceTimersByTime(5000);expect(wire.sent).toEqual([]);
  }finally{await session.dispose();}
});

it('freezes all presentation clocks and drops gameplay commands while authority is paused', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100));
  Object.assign(source, { paused: true });
  source.projectiles = [{ entityId:'paused-shot',ownerEntityId:'local',pose:{x:100,z:103,yaw:0},velocity:{x:0,z:70,yawRate:0},bornTick:99,expiresTick:139,sourceCommandSequence:0,sourceShotOrdinal:1 }];
  wire.initial = packSnapshot(source); const session = createOnlineSession('ws://clock-fixture',map);
  try {
    await session.connect({ roomId: crypto.randomUUID(),nickname:'Paused officer' });
    const first = session.sampleFrame()!;
    session.submit({sessionEpoch:source.sessionEpoch,sequence:0,clientTick:0,actions:{...neutralActions(),fire:true,throttle:1}});
    expect(session.getStats().pendingInputs).toBe(0);
    vi.advanceTimersByTime(5000); const after=session.sampleFrame()!;
    expect(after.serverTick).toBe(100);expect(after.vehicles).toEqual(first.vehicles);expect(after.projectiles).toEqual(first.projectiles);
  } finally { await session.dispose(); }
});

it('waits for the requested initial resync before accepting a joined session and its first input', async () => {
  wire.initial = snapshot(100); wire.deferBaseline = true;
  const session = createOnlineSession('ws://clock-fixture', map); let settled = false;
  const joining = session.connect({ roomId: crypto.randomUUID(), nickname: 'Join baseline race' }).then(result => { settled = true; return result; });
  try {
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    expect(wire.handlers.has('snapshot')).toBe(true);
    expect(settled, 'A queued join snapshot must not finish the resync handshake').toBe(false);
    wire.handlers.get('snapshot')!({ ...(wire.initial as WireSnapshot), reset: 'resync', propsPatch: true });
    for (let turn = 0; turn < 4; turn++) await Promise.resolve();
    expect(settled, 'A clock-only correction must not finish the requested baseline handshake').toBe(false);
    wire.handlers.get('snapshot')!({ ...(wire.initial as WireSnapshot), reset: 'resync' });
    await joining;
    session.submit({ sessionEpoch: session.getSnapshot()!.sessionEpoch, sequence: 0, clientTick: 0, actions: { ...neutralActions(), throttle: 1 } });
    expect(session.getStats().pendingInputs).toBe(1);
  } finally { await session.dispose(); }
});

it('passes authoritative suspect identity and progress to rendering and removes the marker after dispatch completion', async () => {
  wire.initial = snapshot(100);
  const source = unpackSnapshot(wire.initial as WireSnapshot);
  source.pursuit = { suspectId: 'remote', state: 'arresting', elapsedTicks: 100, progress: .5, arrestingPlayerId: 'local', winnerPlayerId: null, contenders: [{ playerId: 'local', progress: .5 }] };
  wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Pursuit marker' });
    expect(session.sampleFrame()!.pursuit).toEqual(source.pursuit);
    const finished = { ...source, serverTick: 101, phase: 'results' as const, pursuit: { ...source.pursuit, state: 'complete' as const, progress: 1, winnerPlayerId: 'local' } };
    wire.handlers.get('snapshot')!(packSnapshot(finished));
    expect(session.sampleFrame()!.pursuit).toBeUndefined();
    wire.handlers.get('snapshot')!(packSnapshot({ ...source, serverTick: 102, pursuit: undefined }));
    expect(session.sampleFrame()!.pursuit).toBeUndefined();
  } finally { await session.dispose(); }
});

it('advances both confirmed local barrels alongside the predicted car and retires impact events immediately', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.local!.vehicle.velocity.z = 28;
  source.projectiles = [0, 1].map(barrel => ({ entityId: `local-shot-${barrel}`, ownerEntityId: 'local', pose: { x: 100 + (barrel ? .63 : -.63), z: 103.617, yaw: 0 }, velocity: { x: 0, z: 70, yawRate: 0 }, bornTick: 100, expiresTick: 220, sourceCommandSequence: 0, sourceShotOrdinal: 1, barrelIndex: barrel as 0 | 1, volleyId: 'volley-1', damage: 5 }));
  wire.initial = packSnapshot(source); const expectedAuthority = { ...unpackSnapshot(wire.initial as WireSnapshot), resetReason: 'resync' }, session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Moving twin barrels' });
    for (let tick = 0; tick < 6; tick++) session.submit({ sessionEpoch: source.sessionEpoch, sequence: tick, clientTick: tick, actions: { ...neutralActions(), throttle: 1 } });
    vi.advanceTimersByTime(100); const frame = session.sampleFrame()!, car = frame.vehicles.find(vehicle => vehicle.entityId === 'local')!;
    expect(frame.projectiles).toHaveLength(2);
    for (const projectile of frame.projectiles) { expect(projectile.pose.z).toBeCloseTo(110.617, 3); expect(projectile.pose.z).toBeGreaterThan(car.pose.z + 2.45); expect(projectile.velocity.z).toBe(70); }
    expect(session.getSnapshot()).toEqual(expectedAuthority);
    wire.handlers.get('events')!([{ eventId: 'impact-1', matchId: source.matchId, serverTick: 101, kind: 'projectile-impact', payload: { projectileId: 'local-shot-0', ownerEntityId: 'local', position: { x: 100, z: 105, yaw: 0 } } }]);
    expect(session.sampleFrame()!.projectiles.map(projectile => projectile.entityId)).toEqual(['local-shot-1']);
  } finally { await session.dispose(); }
});

it('uses the buffered remote clock for projectile birth and first-seen travel', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] }); wire.initial = snapshot(100);
  const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Remote volley clock' });
    const after = unpackSnapshot(snapshot(106)); after.projectiles = [{ entityId: 'remote-shot', ownerEntityId: 'remote', pose: { x: 0, z: 30, yaw: 0 }, velocity: { x: 0, z: 70, yawRate: 0 }, bornTick: 103, expiresTick: 223, sourceCommandSequence: 0, sourceShotOrdinal: 1 }];
    vi.advanceTimersByTime(100); wire.handlers.get('snapshot')!(packSnapshot(after));
    expect(session.sampleFrame()!.projectiles).toEqual([]);
    vi.advanceTimersByTime(50); expect(session.sampleFrame()!.projectiles[0]!.pose.z).toBeCloseTo(26.5, 3);
  } finally { await session.dispose(); }
});

it('presents physical props on the shared interpolation clock with normalized rotation, then freezes on lost snapshots', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const fixture = (tick: number, discontinuityId = 0) => packSnapshot({ ...unpackSnapshot(snapshot(tick)), props: [{ entityId: 'barrel', kind: 'barrel' as const, scale: 1, position: { x: tick, y: 1, z: 0 }, rotation: tick === 100 ? { x: 0, y: 0, z: 0, w: 1 } : { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }, mode: 'dynamic' as const, sleeping: false, discontinuityId }] });
  wire.initial = fixture(100); const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Prop observer' });
    expect(session.sampleFrame()!.props?.[0]?.position.x).toBe(100);
    vi.advanceTimersByTime(100); wire.handlers.get('snapshot')!(fixture(106)); vi.advanceTimersByTime(50);
    const middle = session.sampleFrame()!.props![0]!;
    expect(middle.position.x).toBeCloseTo(103, 3); expect(middle.rotation.y).toBeCloseTo(Math.sin(Math.PI / 8), 3);
    expect(Math.hypot(...Object.values(middle.rotation))).toBeCloseTo(1, 6);
    vi.advanceTimersByTime(1000); expect(session.sampleFrame()!.props![0]!.position.x).toBe(106);
    wire.handlers.get('snapshot')!(fixture(112, 1)); expect(session.sampleFrame()!.props![0]!.position.x).toBe(112);
  } finally { await session.dispose(); }
});

it('retains quiet props and merges one changed prop without clearing the rest of the street', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const props = ['lamp', 'barrel'].map((kind, index) => ({ entityId: kind, kind: kind as 'lamp' | 'barrel', scale: 1, position: { x: index, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, mode: 'dynamic' as const, sleeping: true, discontinuityId: 0 }));
  wire.initial = packSnapshot({ ...unpackSnapshot(snapshot(100)), props }); const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Quiet street' });
    const quiet = snapshot(106); delete quiet.props; wire.handlers.get('snapshot')!({ ...quiet, propsPatch: true });
    vi.advanceTimersByTime(300); expect(session.sampleFrame()!.props).toHaveLength(2);
    const changed = packSnapshot({ ...unpackSnapshot(snapshot(112)), props: [{ ...props[1]!, position: { x: 10, y: 1, z: 0 }, sleeping: false }] });
    wire.handlers.get('snapshot')!({ ...changed, propsPatch: true }); vi.advanceTimersByTime(300);
    expect(session.sampleFrame()!.props!.map(prop => [prop.entityId, prop.position.x])).toEqual([['lamp', 0], ['barrel', 10]]);
    const reset = packSnapshot({ ...unpackSnapshot(snapshot(118)), props: [] }); wire.handlers.get('snapshot')!(reset);
    vi.advanceTimersByTime(300); expect(session.sampleFrame()!.props).toEqual([]);
  } finally { await session.dispose(); }
});

it('does not move a steadily advancing remote car backward when a snapshot arrives late', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  wire.initial = snapshot(100);
  const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Clock test' });
    for (const tick of [103, 106, 109]) { vi.advanceTimersByTime(50); wire.handlers.get('snapshot')!(snapshot(tick)); }
    vi.advanceTimersByTime(70);
    const before = session.sampleFrame()!.vehicles.find(v => v.entityId === 'remote')!.pose.z;
    wire.handlers.get('snapshot')!(snapshot(112));
    const after = session.sampleFrame()!.vehicles.find(v => v.entityId === 'remote')!.pose.z;
    expect(after, 'A 20ms arrival delay must not rewind the 100ms interpolation playback clock').toBeGreaterThanOrEqual(before - 0.000001);
  } finally { await session.dispose(); }
});

it('still presents a remote car physically driving in reverse', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] }); wire.initial = snapshot(100, { direction: -1 });
  const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Reverse test' });
    for (const tick of [103, 106, 109]) { vi.advanceTimersByTime(50); wire.handlers.get('snapshot')!(snapshot(tick, { direction: -1 })); }
    const before = session.sampleFrame()!.vehicles.find(v => v.entityId === 'remote')!.pose.z;
    vi.advanceTimersByTime(50); wire.handlers.get('snapshot')!(snapshot(112, { direction: -1 }));
    expect(session.sampleFrame()!.vehicles.find(v => v.entityId === 'remote')!.pose.z).toBeLessThan(before);
  } finally { await session.dispose(); }
});

it.each(['epoch', 'match', 'discontinuity'] as const)('resets the playback clock and interpolation history across a new %s', async reset => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] }); wire.initial = snapshot(100);
  const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Reset test' });
    for (const tick of [103, 106, 109]) { vi.advanceTimersByTime(50); wire.handlers.get('snapshot')!(snapshot(tick)); }
    vi.advanceTimersByTime(200); session.sampleFrame();
    const next = reset === 'epoch' ? snapshot(10, { epoch: 'new-epoch' }) : reset === 'match' ? snapshot(10, { matchId: 'new-match' }) : snapshot(112, { discontinuity: 1 });
    wire.handlers.get('snapshot')!(next);
    expect(session.sampleFrame()!.vehicles.find(v => v.entityId === 'remote')!.pose.z).toBeCloseTo(next.cars.find(v => v[0] === 'remote')![4], 3);
  } finally { await session.dispose(); }
});

it('bounds remote extrapolation at 100ms after snapshots stop', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] }); wire.initial = snapshot(100);
  const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Extrapolation test' });
    vi.advanceTimersByTime(500); const first = session.sampleFrame()!.vehicles.find(v => v.entityId === 'remote')!.pose.z;
    vi.advanceTimersByTime(500); expect(session.sampleFrame()!.vehicles.find(v => v.entityId === 'remote')!.pose.z).toBe(first);
    expect(first).toBeCloseTo(100 / 6 + 1, 3);
  } finally { await session.dispose(); }
});
