import { afterEach, expect, it, vi } from 'vitest';
import { packSnapshot, unpackSnapshot, type VehicleState, type WireSnapshot, type WorldSnapshot } from '@fender/contracts';
import { createOnlineSession } from './index.js';
import type { CollisionMap } from '@fender/contracts';

const wire = vi.hoisted(() => ({ handlers: new Map<string, (message: unknown) => void>(), initial: null as unknown }));
vi.mock('@colyseus/sdk', () => ({ Client: class {
  async create() { return {
    roomId: 'clock-fixture', sessionId: 'local', reconnection: { enqueuedMessages: [] },
    connection: { isOpen: true, reconnect() {}, close() {} },
    onMessage(type: string, handler: (value: unknown) => void) { wire.handlers.set(type, handler); },
    onDrop() {}, onReconnect() {}, onLeave() {}, onError() {},
    send(type: string) { if (type === 'resync') wire.handlers.get('snapshot')!(wire.initial); },
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
afterEach(() => { vi.useRealTimers(); wire.handlers.clear(); });

it('presents physical props on the shared interpolation clock with normalized rotation, then freezes on lost snapshots', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const fixture = (tick: number, discontinuityId = 0) => packSnapshot({ ...unpackSnapshot(snapshot(tick)), props: [{ entityId: 'barrel', kind: 'barrel' as const, scale: 1, position: { x: tick, y: 1, z: 0 }, rotation: tick === 100 ? { x: 0, y: 0, z: 0, w: 1 } : { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }, mode: 'dynamic' as const, sleeping: false, discontinuityId }] });
  wire.initial = fixture(100); const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ mode: 'create', nickname: 'Prop observer' });
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
    await session.connect({ mode: 'create', nickname: 'Quiet street' });
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
    await session.connect({ mode: 'create', nickname: 'Clock test' });
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
    await session.connect({ mode: 'create', nickname: 'Reverse test' });
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
    await session.connect({ mode: 'create', nickname: 'Reset test' });
    for (const tick of [103, 106, 109]) { vi.advanceTimersByTime(50); wire.handlers.get('snapshot')!(snapshot(tick)); }
    vi.advanceTimersByTime(200); session.sampleFrame();
    const next = reset === 'epoch' ? snapshot(112, { epoch: 'new-epoch' }) : reset === 'match' ? snapshot(10, { matchId: 'new-match' }) : snapshot(112, { discontinuity: 1 });
    wire.handlers.get('snapshot')!(next);
    expect(session.sampleFrame()!.vehicles.find(v => v.entityId === 'remote')!.pose.z).toBeCloseTo(next.cars.find(v => v[0] === 'remote')![4], 3);
  } finally { await session.dispose(); }
});

it('bounds remote extrapolation at 100ms after snapshots stop', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] }); wire.initial = snapshot(100);
  const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ mode: 'create', nickname: 'Extrapolation test' });
    vi.advanceTimersByTime(500); const first = session.sampleFrame()!.vehicles.find(v => v.entityId === 'remote')!.pose.z;
    vi.advanceTimersByTime(500); expect(session.sampleFrame()!.vehicles.find(v => v.entityId === 'remote')!.pose.z).toBe(first);
    expect(first).toBeCloseTo(100 / 6 + 1, 3);
  } finally { await session.dispose(); }
});
