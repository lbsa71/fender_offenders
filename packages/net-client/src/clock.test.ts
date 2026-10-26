import { afterEach, expect, it, vi } from 'vitest';
import { packSnapshot, unpackSnapshot, neutralActions, type VehicleState, type WireSnapshot, type WorldSnapshot } from '@fender/contracts';
import { createOnlineSession } from './index.js';
import { predictVehicle } from '@fender/sim';
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
    vi.advanceTimersByTime(150); expect(session.sampleFrame()!.projectiles[0]!.pose.z).toBeCloseTo(26.5, 3);
  } finally { await session.dispose(); }
});

it('presents physical props on the shared interpolation clock with normalized rotation, then freezes on lost snapshots', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const fixture = (tick: number, discontinuityId = 0) => packSnapshot({ ...unpackSnapshot(snapshot(tick)), props: [{ entityId: 'barrel', kind: 'barrel' as const, scale: 1, position: { x: tick, y: 1, z: 0 }, rotation: tick === 100 ? { x: 0, y: 0, z: 0, w: 1 } : { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }, mode: 'dynamic' as const, sleeping: false, discontinuityId }] });
  wire.initial = fixture(100); const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Prop observer' });
    expect(session.sampleFrame()!.props?.[0]?.position.x).toBe(100);
    vi.advanceTimersByTime(100); wire.handlers.get('snapshot')!(fixture(106)); vi.advanceTimersByTime(150);
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
    for (const tick of [103, 106, 109, 112, 115]) { vi.advanceTimersByTime(50); wire.handlers.get('snapshot')!(snapshot(tick, { direction: -1 })); }
    const before = session.sampleFrame()!.vehicles.find(v => v.entityId === 'remote')!.pose.z;
    vi.advanceTimersByTime(50); wire.handlers.get('snapshot')!(snapshot(118, { direction: -1 }));
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

it('bounds remote extrapolation at 300ms after snapshots stop', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] }); wire.initial = snapshot(100);
  const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Extrapolation test' });
    vi.advanceTimersByTime(500); const first = session.sampleFrame()!.vehicles.find(v => v.entityId === 'remote')!.pose.z;
    vi.advanceTimersByTime(500); expect(session.sampleFrame()!.vehicles.find(v => v.entityId === 'remote')!.pose.z).toBe(first);
    expect(first).toBeCloseTo(100 / 6 + 3, 3);
  } finally { await session.dispose(); }
});

it('keeps local motion immediate for 300ms of snapshot silence, then holds and clears stale input on a full resync', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.local!.vehicle.velocity.z = 20;
  wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map);
  const lead = () => session.sampleFrame()!.vehicles.find(vehicle => vehicle.entityId === 'local')!.pose.z - source.local!.vehicle.pose.z;
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Bounded local clock' });
    for (let sequence = 0; sequence < 18; sequence++) {
      session.submit({ sessionEpoch: source.sessionEpoch, sequence, clientTick: sequence, actions: { ...neutralActions(), throttle: 1 } });
      vi.advanceTimersByTime(17); lead();
    }
    const held = lead(); expect(held).toBeGreaterThan(6); expect(held).toBeLessThan(8);
    for (let sequence = 18; sequence < 54; sequence++) {
      session.submit({ sessionEpoch: source.sessionEpoch, sequence, clientTick: sequence, actions: { ...neutralActions(), throttle: 1 } });
      vi.advanceTimersByTime(17); lead();
    }
    expect(lead(), 'Fresh controls must not keep moving an unconfirmed car through an actual outage').toBeCloseTo(held, 5);
    const next = structuredClone(source); next.serverTick++; next.local!.lastConsumedSequence = 17;
    wire.handlers.get('snapshot')!({ ...packSnapshot(next), reset: 'resync' });
    expect(lead()).toBeCloseTo(0, 5);
    expect(session.getStats().pendingInputs).toBe(0);
  } finally { await session.dispose(); }
});

it.each(['input-backlog', 'clock-resync'] as const)('reconciles %s without teleporting a continuous local car or discarding fresh input', async reason => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.local!.vehicle.velocity.z = 20;
  wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map);
  const position = () => session.sampleFrame()!.vehicles.find(vehicle => vehicle.entityId === 'local')!.pose.z;
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Continuous recovery' });
    for (let sequence = 0; sequence < 6; sequence++) session.submit({ sessionEpoch: source.sessionEpoch, sequence, clientTick: sequence, actions: { ...neutralActions(), throttle: 1 } });
    // Compare correction decay after the render projection has reached its
    // short horizon, rather than mixing it with newly projected forward motion.
    vi.advanceTimersByTime(50);
    const before = position(), next = structuredClone(source);
    next.serverTick++; next.local!.vehicle.pose.z += .35; next.local!.lastConsumedSequence = 3;
    const update = packSnapshot(next); update.reset = reason === 'input-backlog' ? reason : 'resync'; update.propsPatch = true;
    wire.handlers.get('snapshot')!(update);
    expect(position(), 'Clock/input recovery must preserve the displayed position while reconciling').toBeCloseTo(before, 5);
    expect(session.getStats().pendingInputs, 'Only acknowledged samples are retired').toBe(2);
    vi.advanceTimersByTime(200); expect(position()).toBeLessThan(before);
  } finally { await session.dispose(); }
});

it('keeps local input responsive between delayed acknowledgements and moves between fixed input steps', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.local!.vehicle.velocity.z = 20;
  wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map);
  const position = () => session.sampleFrame()!.vehicles.find(vehicle => vehicle.entityId === 'local')!.pose.z;
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Local means local' });
    let previous = position();
    const inputTravel: number[] = [], betweenSteps: number[] = [];
    for (let sequence = 0; sequence < 12; sequence++) {
      session.submit({ sessionEpoch: source.sessionEpoch, sequence, clientTick: sequence, actions: { ...neutralActions(), throttle: 1 } });
      const afterInput = position();
      vi.advanceTimersByTime(8);
      const between = position(); betweenSteps.push(between - afterInput);
      vi.advanceTimersByTime(9);
      const afterStep = position(); inputTravel.push(afterStep - previous); previous = afterStep;
    }
    expect(Math.min(...inputTravel), 'Your input must still move your car after six unacknowledged steps').toBeGreaterThan(.02);
    expect(Math.min(...betweenSteps), 'A 120 Hz renderer must not repeat the same 60 Hz car pose').toBeGreaterThan(.08);
    expect(session.getSnapshot()!.local!.lastConsumedSequence).toBe(-1);
    expect(session.getStats().pendingInputs).toBe(12);
    expect(session.getSnapshot()!.local!.vehicle.pose).toEqual(source.local!.vehicle.pose);
  } finally { await session.dispose(); }
});

it('smooths routine position and steering corrections without delaying fresh local steering', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.local!.vehicle.velocity.z = 20;
  wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map);
  const local = () => session.sampleFrame()!.vehicles.find(vehicle => vehicle.entityId === 'local')!;
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Smooth steering' });
    const before = local(), next = structuredClone(source);
    next.serverTick += 3; next.local!.vehicle.pose.x += 1; next.local!.vehicle.pose.yaw += .2;
    wire.handlers.get('snapshot')!(packSnapshot(next));
    expect(local().pose.yaw, 'Routine authority corrections must not snap steering').toBeCloseTo(before.pose.yaw, 6);
    vi.advanceTimersByTime(50);
    const middle = local();
    expect(middle.pose.x - before.pose.x, 'Spread a routine correction over more than one packet interval').toBeLessThan(.35);
    expect(middle.pose.yaw).toBeGreaterThan(before.pose.yaw);
    const steeringBefore = middle.pose.yaw;
    session.submit({ sessionEpoch: source.sessionEpoch, sequence: 0, clientTick: 0, actions: { ...neutralActions(), steer: 1, throttle: 1 } });
    expect(local().pose.yaw, 'New local steering must apply without a snapshot round trip').toBeGreaterThan(steeringBefore);
    expect(session.getSnapshot()!.local!.vehicle.pose.yaw).toBeCloseTo(.2, 3);
  } finally { await session.dispose(); }
});

it('bridges a remote snapshot gap for 300ms, including turn rate, then holds instead of drifting forever', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.vehicles.find(car => car.entityId === 'remote')!.velocity.yawRate = 1;
  wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map);
  const remote = () => session.sampleFrame()!.vehicles.find(car => car.entityId === 'remote')!;
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Generous remote buffer' });
    session.sampleFrame(); vi.advanceTimersByTime(250); const before = remote();
    vi.advanceTimersByTime(50); const after = remote();
    expect(after.pose.z - before.pose.z, 'A routine delivery gap must not freeze remote movement at the old 100ms cap').toBeGreaterThan(.35);
    vi.advanceTimersByTime(1000); const held = remote();
    expect(held.pose.z).toBeCloseTo(source.vehicles[1]!.pose.z + 3, 3);
    expect(held.pose.yaw).toBeCloseTo(.3, 3);
    vi.advanceTimersByTime(1000); expect(remote().pose).toEqual(held.pose);
  } finally { await session.dispose(); }
});

it('slows a remote playback clock gently after a late arrival instead of freezing it until the estimate catches up', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  wire.initial = snapshot(100);
  const session = createOnlineSession('ws://clock-fixture', map);
  const position = () => session.sampleFrame()!.vehicles.find(car => car.entityId === 'remote')!.pose.z;
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Continuous remote clock' });
    position();
    for (let tick = 103; tick <= 160; tick += 3) {
      vi.advanceTimersByTime(50); wire.handlers.get('snapshot')!(snapshot(tick)); position();
    }
    vi.advanceTimersByTime(100); let previous = position();
    wire.handlers.get('snapshot')!(snapshot(163));
    const steps: number[] = [];
    for (let frame = 0; frame < 10; frame++) {
      vi.advanceTimersByTime(10); const current = position(); steps.push(current - previous); previous = current;
    }
    expect(Math.min(...steps), 'A late update must not pause an otherwise moving car').toBeGreaterThan(.05);
    expect(Math.max(...steps), 'Clock correction must not speed the car up in a catch-up jump').toBeLessThan(.13);
  } finally { await session.dispose(); }
});

it('does not accumulate a render offset when authoritative motion agrees with local prediction between input ticks', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.local!.vehicle.velocity.z = 20;
  source.local!.driver.simulatedTick = source.serverTick;
  wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map);
  const actions = { ...neutralActions(), throttle: 1 };
  const position = () => session.sampleFrame()!.vehicles.find(car => car.entityId === 'local')!.pose.z;
  let authority = source.local!;
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Same road, same clock' });
    for (let sequence = 0; sequence < 24; sequence++) {
      session.submit({ sessionEpoch: source.sessionEpoch, sequence, clientTick: sequence, actions });
      const result = predictVehicle(map, authority.vehicle, authority.driver, actions, [], undefined, 101 + sequence);
      authority = { ...result, lastConsumedSequence: sequence };
      vi.advanceTimersByTime(8);
      const expected = authority.vehicle.pose.z + authority.vehicle.velocity.z * .008;
      expect(position()).toBeCloseTo(expected, 2);
      const update = { ...source, serverTick: 101 + sequence, local: authority, vehicles: [authority.vehicle, source.vehicles[1]!] };
      wire.handlers.get('snapshot')!(packSnapshot(update));
      expect(position(), 'A matching packet must not restart the fractional render tick or create a new correction').toBeCloseTo(expected, 2);
      vi.advanceTimersByTime(9);
    }
  } finally { await session.dispose(); }
});

it.each([{ latency: 350, steps: 24 }, { latency: 900, steps: 60 }])('applies fresh local steering immediately at $latency ms latency before its inputs are acknowledged', async ({ latency, steps }) => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.local!.vehicle.velocity.z = 20;
  wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'My steering wheel' });
    vi.advanceTimersByTime(latency); wire.handlers.get('pong')!({ sent: 0 });
    wire.handlers.get('snapshot')!(packSnapshot(source));
    for (let sequence = 0; sequence < steps; sequence++) {
      if (sequence % 12 === 0) wire.handlers.get('snapshot')!(packSnapshot(source));
      session.submit({ sessionEpoch: source.sessionEpoch, sequence, clientTick: sequence, actions: { ...neutralActions(), throttle: 1, steer: sequence === steps - 1 ? 1 : 0 } });
      vi.advanceTimersByTime(17);
    }
    const local = session.sampleFrame()!.vehicles.find(car => car.entityId === 'local')!;
    expect(local.velocity.yawRate, 'A healthy connection must not hold my steering behind an acknowledgement gate').toBeGreaterThan(.01);
    expect(session.getSnapshot()!.local!.lastConsumedSequence).toBe(-1);
    expect(session.getStats().pendingInputs).toBe(steps);
  } finally { await session.dispose(); }
});

it('recovers a fast local car from a 300ms authority stall without snapping or pulling it backwards', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100));
  source.local!.vehicle.bodyAssetId = 'roadster'; source.local!.vehicle.velocity.z = 33;
  source.local!.driver.simulatedTick = 100;
  wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map);
  const position = () => session.sampleFrame()!.vehicles.find(car => car.entityId === 'local')!.pose.z;
  const actions = { ...neutralActions(), throttle: 1 };
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'No elastic tow rope' });
    for (let sequence = 0; sequence < 18; sequence++) {
      session.submit({ sessionEpoch: source.sessionEpoch, sequence, clientTick: sequence, actions });
      vi.advanceTimersByTime(17); position();
    }
    const before = position(), next = structuredClone(source);
    next.serverTick++; next.local!.lastConsumedSequence = 17; next.local!.driver.simulatedTick = next.serverTick;
    next.local!.vehicle.pose.z += .55;
    wire.handlers.get('snapshot')!(packSnapshot(next));
    expect(position(), 'A continuous update beyond the old 8m correction threshold must still preserve the displayed pose').toBeCloseTo(before, 5);
    let authority = next.local!, tick = next.serverTick, previous = position();
    const steps: number[] = [];
    for (let sequence = 18; sequence < 54; sequence++) {
      session.submit({ sessionEpoch: source.sessionEpoch, sequence, clientTick: sequence, actions });
      authority = { ...predictVehicle(map, authority.vehicle, authority.driver, actions, [], undefined, ++tick), lastConsumedSequence: sequence };
      vi.advanceTimersByTime(17);
      if (sequence % 3 === 2) wire.handlers.get('snapshot')!(packSnapshot({ ...next, serverTick: tick, local: authority, vehicles: [authority.vehicle, next.vehicles[1]!] }));
      const current = position(); steps.push(current - previous); previous = current;
    }
    expect(Math.min(...steps), 'Correcting accumulated lead must not drag a forward-driving car backwards').toBeGreaterThan(.02);
    expect(previous).toBeGreaterThan(before + 8);
  } finally { await session.dispose(); }
});

it('blends remote extrapolation back to a changed trajectory but snaps an explicit remote teleport', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  wire.initial = snapshot(100);
  const session = createOnlineSession('ws://clock-fixture', map);
  const remote = () => session.sampleFrame()!.vehicles.find(car => car.entityId === 'remote')!;
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Smooth backup' });
    remote(); vi.advanceTimersByTime(400); const before = remote();
    const next = unpackSnapshot(snapshot(106)); next.vehicles[1]!.velocity.z = 5;
    wire.handlers.get('snapshot')!(packSnapshot(next));
    expect(remote().pose.z, 'A late braking snapshot must not jump an extrapolated car backwards').toBeCloseTo(before.pose.z, 5);
    vi.advanceTimersByTime(16);
    expect(remote().pose.z).toBeGreaterThan(before.pose.z);
    const teleported = structuredClone(next); teleported.serverTick++;
    teleported.vehicles[1]!.discontinuityId++; teleported.vehicles[1]!.pose.z = 0; teleported.vehicles[1]!.velocity.z = 0;
    wire.handlers.get('snapshot')!(packSnapshot(teleported));
    expect(remote().pose.z, 'A real teleport must discard extrapolation and its visual offset').toBe(0);
  } finally { await session.dispose(); }
});

it.each([1, 2, 3])('does not pull a local car backwards while correcting lead at %i m/s', async speed => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.local!.vehicle.velocity.z = speed;
  wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map);
  const position = () => session.sampleFrame()!.vehicles.find(car => car.entityId === 'local')!.pose.z;
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Gentle crawl' });
    let previous = position(); const next = structuredClone(source);
    next.serverTick++; next.local!.vehicle.pose.z -= 1;
    wire.handlers.get('snapshot')!(packSnapshot(next));
    const steps: number[] = [];
    for (let sequence = 0; sequence < 16; sequence++) {
      session.submit({ sessionEpoch: source.sessionEpoch, sequence, clientTick: sequence, actions: neutralActions() });
      vi.advanceTimersByTime(17);
      const current = position(); steps.push(current - previous); previous = current;
    }
    expect(Math.min(...steps), 'Catch-up must remain slower than a moving car even at parking speed').toBeGreaterThan(.001);
  } finally { await session.dispose(); }
});

it('converges a stationary local correction instead of retaining a permanent offset', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Parked paperwork' });
    const next = structuredClone(source); next.serverTick++; next.local!.vehicle.pose.z -= 1;
    wire.handlers.get('snapshot')!(packSnapshot(next));
    for (let frame = 0; frame < 15; frame++) { vi.advanceTimersByTime(100); session.sampleFrame(); }
    expect(session.sampleFrame()!.vehicles.find(car => car.entityId === 'local')!.pose.z).toBeCloseTo(next.local!.vehicle.pose.z, 2);
  } finally { await session.dispose(); }
});

it('returns remote playback to the current buffer after a long network blackout instead of spending tens of seconds catching up', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  wire.initial = snapshot(100);
  const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Back from the tunnel' });
    session.sampleFrame(); vi.advanceTimersByTime(5000); session.sampleFrame();
    const current = unpackSnapshot(snapshot(400)); wire.handlers.get('snapshot')!(packSnapshot(current));
    const remote = session.sampleFrame()!.vehicles.find(car => car.entityId === 'remote')!;
    expect(current.vehicles[1]!.pose.z - remote.pose.z, 'Old extrapolation is stale after a multi-second blackout; restore the normal buffered timeline').toBeLessThan(3);
    expect(current.vehicles[1]!.pose.z - remote.pose.z).toBeGreaterThan(1);
  } finally { await session.dispose(); }
});

it('keeps local rendering on logical input times when a late timer delivers several fixed steps together', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.local!.vehicle.velocity.z = 20;
  wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map);
  const actions = { ...neutralActions(), throttle: 1 };
  const position = () => session.sampleFrame()!.vehicles.find(car => car.entityId === 'local')!.pose.z;
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Evenly spaced tyres' });
    session.submit({ sessionEpoch: source.sessionEpoch, sequence: 0, clientTick: 0, actions }, 0);
    let expected = predictVehicle(map, source.local!.vehicle, source.local!.driver, actions, [], undefined, 101);
    vi.advanceTimersByTime(25);
    expect.soft(position(), 'A short timer delay must not freeze the car after one projected step').toBeCloseTo(expected.vehicle.pose.z + expected.vehicle.velocity.z * .025, 4);
    vi.advanceTimersByTime(17);
    for (let sequence = 1; sequence <= 2; sequence++) {
      session.submit({ sessionEpoch: source.sessionEpoch, sequence, clientTick: sequence, actions }, sequence * 1000 / 60);
      expected = predictVehicle(map, expected.vehicle, expected.driver, actions, [], undefined, 101 + sequence);
    }
    const fraction = (42 - 2000 / 60) / 1000;
    expect.soft(position(), 'A batch must retain its logical tick phase instead of restarting at callback time').toBeCloseTo(expected.vehicle.pose.z + expected.vehicle.velocity.z * fraction, 4);
    expect(session.getSnapshot()!.local!.lastConsumedSequence).toBe(-1);
  } finally { await session.dispose(); }
});

it('does not rewind an already projected local car when a late caller supplies only one new input tick', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.local!.vehicle.velocity.z = 20;
  wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map);
  const local = () => session.sampleFrame()!.vehicles.find(car => car.entityId === 'local')!;
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'No callback tow rope' });
    session.submit({ sessionEpoch: source.sessionEpoch, sequence: 0, clientTick: 0, actions: { ...neutralActions(), throttle: 1 } });
    vi.advanceTimersByTime(42); const before = local();
    session.submit({ sessionEpoch: source.sessionEpoch, sequence: 1, clientTick: 1, actions: { ...neutralActions(), throttle: 1, steer: 1 } });
    expect(local().pose.z, 'A late one-tick caller must not discard motion already shown during its delay').toBeGreaterThanOrEqual(before.pose.z - .00001);
    expect(local().velocity.yawRate, 'Fresh steering still applies immediately').toBeGreaterThan(.01);
  } finally { await session.dispose(); }
});

it('does not manufacture lead from a late input callback when no frame displayed the projection', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.local!.vehicle.velocity.z = 20;
  wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map), actions = { ...neutralActions(), throttle: 1 };
  let expected = { vehicle: source.local!.vehicle, driver: source.local!.driver };
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Only shown miles count' });
    for (let sequence = 0; sequence < 10; sequence++) {
      vi.advanceTimersByTime(25);
      session.submit({ sessionEpoch: source.sessionEpoch, sequence, clientTick: sequence, actions });
      expected = predictVehicle(map, expected.vehicle, expected.driver, actions, [], undefined, 101 + sequence);
      expect(session.sampleFrame()!.vehicles.find(car => car.entityId === 'local')!.pose.z, 'Undisplayed projection must not become a persistent correction offset').toBeCloseTo(expected.vehicle.pose.z, 5);
    }
  } finally { await session.dispose(); }
});
