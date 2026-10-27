import { afterEach, expect, it, vi } from 'vitest';
import { packSnapshot, unpackSnapshot, neutralActions, getDispatchFeatures, type VehicleState, type WireSnapshot, type WorldSnapshot } from '@fender/contracts';
import { createOnlineSession } from './index.js';
import { predictVehicle } from '@fender/sim';
import type { CollisionMap } from '@fender/contracts';

const wire = vi.hoisted(() => ({ handlers: new Map<string, (message: unknown) => void>(), initial: null as unknown, deferBaseline: false, sent: [] as string[], queued: [] as import('@fender/contracts').InputCommand[], batches: [] as {commands:import('@fender/contracts').InputCommand[];motion?:import('@fender/contracts').LocalVehicleMotion}[] }));
vi.mock('@colyseus/sdk', () => ({ Client: class {
  http={post:async()=>({data:{}})};
  async consumeSeatReservation() { return {
    roomId: 'clock-fixture', sessionId: 'local', reconnection: { enqueuedMessages: [] },
    connection: { isOpen: true, reconnect() {}, close() {} },
    onMessage(type: string, handler: (value: unknown) => void) { wire.handlers.set(type, handler); },
    onDrop() {}, onReconnect() {}, onLeave() {}, onError() {},
    send(type: string, message?: { commands?: import('@fender/contracts').InputCommand[];motion?:import('@fender/contracts').LocalVehicleMotion }) { wire.sent.push(type);if(type==='input'&&message?.commands){wire.queued.push(...message.commands);wire.batches.push(structuredClone({commands:message.commands,motion:message.motion}));}if (type === 'resync') wire.handlers.get('snapshot')!({ ...(wire.initial as WireSnapshot), reset: wire.deferBaseline ? 'join' : 'resync' }); },
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
afterEach(() => { vi.useRealTimers(); wire.handlers.clear(); wire.deferBaseline = false; wire.queued = []; wire.batches=[]; });

it('applies received armed oil to the continuous local driver without waiting for a server position correction', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.local!.vehicle.velocity = { x: 4, z: 12, yawRate: 0 };
  source.vehicles = source.vehicles.map(vehicle => vehicle.entityId === 'local' ? source.local!.vehicle : vehicle);
  const gadgets = [{ entityId: 'received-oil', ownerEntityId: 'remote', kind: 'oil' as const, pose: { x: 100, z: 100, yaw: 0 }, bornTick: 40, activeAtTick: 85, expiresTick: 385 }];
  wire.initial = packSnapshot({ ...source, gadgets }); const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Oil inspector' });
    let dry = { vehicle: structuredClone(source.local!.vehicle), driver: structuredClone(source.local!.driver) };
    for (let sequence = 0; sequence < 10; sequence++) {
      session.submit({ sessionEpoch: source.sessionEpoch, sequence, clientTick: sequence, actions: neutralActions() }, performance.now());
      dry = predictVehicle(map, dry.vehicle, dry.driver, neutralActions(), [], undefined, 101 + sequence);
    }
    const rendered = session.sampleFrame()!.vehicles.find(vehicle => vehicle.entityId === 'local')!;
    expect(rendered.velocity.x).toBeGreaterThan(dry.vehicle.velocity.x + .25);
    expect(session.sampleFrame()).toHaveProperty('gadgets', gadgets);
  } finally { await session.dispose(); }
});

it('applies contact displacement once to the current local car without rewinding steering or dropping fresh commands',async()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval','performance']});
  const source=unpackSnapshot(snapshot(100));source.local!.vehicle.velocity.z=20;wire.initial=packSnapshot(source);
  const session=createOnlineSession('ws://clock-fixture',map);
  const local=()=>session.sampleFrame()!.vehicles.find(car=>car.entityId==='local')!;
  try{
    await session.connect({roomId:crypto.randomUUID(),nickname:'Bumper contact without a time machine'});
    for(let sequence=0;sequence<12;sequence++){vi.advanceTimersByTime(1000/60);session.submit({sessionEpoch:source.sessionEpoch,sequence,clientTick:sequence,actions:{...neutralActions(),throttle:1,steer:sequence<8?1:0}},performance.now());}
    const before=local(),update=structuredClone(source);update.serverTick+=3;update.local!.lastConsumedSequence=3;
    update.local!.vehicle.pose.x-=.12;update.local!.driver.resolvedSteering=1;
    const contact={revision:1,pose:{x:-.12,z:0,yaw:0},velocity:{x:-.4,z:0,yawRate:0}};
    const packet=packSnapshot(update);packet.local![3]=contact;wire.handlers.get('snapshot')!(packet);
    const after=local();
    expect(after.pose.x,'Apply only the room contact displacement, not its older absolute car pose').toBeCloseTo(before.pose.x-.12,6);
    expect(after.pose.z).toBeCloseTo(before.pose.z,6);expect(after.pose.yaw).toBeCloseTo(before.pose.yaw,6);
    expect(after.velocity.yawRate,'Contact must preserve local steering release').toBeCloseTo(before.velocity.yawRate,6);
    expect(session.getStats().pendingInputs).toBe(8);
    packet.t++;wire.handlers.get('snapshot')!(packet);expect(local().pose.x).toBeCloseTo(after.pose.x,6);
    session.submit({sessionEpoch:source.sessionEpoch,sequence:12,clientTick:12,actions:{...neutralActions(),throttle:1,steer:-1}},performance.now());
    vi.advanceTimersByTime(34);expect(wire.batches.at(-1)?.motion?.contactRevision).toBe(1);
  }finally{await session.dispose();}
});

it('roundtrips cumulative contact corrections without losing sub-millimetre separation',()=>{
  const state=unpackSnapshot(snapshot(100)),contact={revision:3,pose:{x:.000012,z:-.23456789,yaw:0},velocity:{x:-1.23456789,z:0,yawRate:0}};
  Object.assign(state.local!,{contact});expect(unpackSnapshot(packSnapshot(state)).local!.contact).toEqual(contact);
});

it('predicts contact against the visible external car instead of an unseen extrapolated collider',async()=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval','performance']});
  const source=unpackSnapshot(snapshot(100)),remote=source.vehicles.find(v=>v.entityId==='remote')!;
  remote.pose={x:100,z:106,yaw:0};remote.velocity={x:0,z:-10,yawRate:0};wire.initial=packSnapshot(source);
  const session=createOnlineSession('ws://clock-fixture',map);
  try{
    await session.connect({roomId:crypto.randomUUID(),nickname:'Visible bumper'});
    vi.advanceTimersByTime(100);const next=structuredClone(source);next.serverTick+=6;next.vehicles.find(v=>v.entityId==='remote')!.pose.z=105;
    wire.handlers.get('snapshot')!(packSnapshot(next));vi.advanceTimersByTime(150);
    const frame=session.sampleFrame()!,visible=frame.vehicles.find(v=>v.entityId==='remote')!;
    expect(visible.pose.z-100,'The rendered cars must still have physical clearance').toBeGreaterThan(4.3);
    session.submit({sessionEpoch:source.sessionEpoch,sequence:0,clientTick:0,actions:neutralActions()},performance.now());
    expect(session.sampleFrame()!.vehicles.find(v=>v.entityId==='local')!.pose.z,'A future collider must not shove a stationary local car before visible contact').toBeCloseTo(100,6);
  }finally{await session.dispose();}
});

it.each([2.03, -2.03])('keeps between-tick presentation outside a visible bumper while permitting departure (%s m/s)',async speed=>{
  vi.useFakeTimers({toFake:['setInterval','clearInterval','performance']});
  const source=unpackSnapshot(snapshot(100)),remote=source.vehicles.find(v=>v.entityId==='remote')!;
  source.local!.vehicle.velocity.z=speed;
  remote.pose={x:100,z:104.35,yaw:Math.PI};remote.velocity={x:0,z:0,yawRate:0};
  wire.initial=packSnapshot(source);const session=createOnlineSession('ws://clock-fixture',map);
  try{
    await session.connect({roomId:crypto.randomUUID(),nickname:'No projected bumper overlap'});
    vi.advanceTimersByTime(50);
    const car=session.sampleFrame()!.vehicles.find(v=>v.entityId==='local')!;
    if(speed>0)expect(car.pose.z,'Presentation must stop at the visible bumper, before the next physics tick resolves contact').toBeLessThanOrEqual(100.05+1e-6);
    else expect(car.pose.z,'Leaving contact must retain immediate between-tick movement').toBeCloseTo(100+speed*.05,6);
    expect(car.velocity.z,'Presentation clipping must not change the local physics velocity').toBeCloseTo(speed,6);
    expect(session.getSnapshot()!.local!.vehicle.pose.z).toBe(100);
  }finally{await session.dispose();}
});

it('replicates the completed local physics step outward, without sending presentation extrapolation or health', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source=unpackSnapshot(snapshot(100));source.local!.vehicle.velocity.z=20;
  wire.initial=packSnapshot(source);const session=createOnlineSession('ws://clock-fixture',map),actions={...neutralActions(),throttle:1,steer:1};
  try{
    await session.connect({roomId:crypto.randomUUID(),nickname:'Send my movement outward'});
    session.submit({sessionEpoch:source.sessionEpoch,sequence:0,clientTick:0,actions},performance.now());
    const expected=predictVehicle(map,source.local!.vehicle,source.local!.driver,actions);
    vi.advanceTimersByTime(34);session.sampleFrame();
    expect(wire.batches.at(-1)?.motion).toEqual({sequence:0,discontinuityId:0,contactRevision:0,pose:expected.vehicle.pose,velocity:expected.vehicle.velocity});
    expect(wire.batches.at(-1)?.motion).not.toHaveProperty('health');
  }finally{await session.dispose();}
});

it('runs local steering and release exactly once while ordinary network snapshots update shared state', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.local!.vehicle.velocity.z = 20;
  wire.initial = packSnapshot(source); const session = createOnlineSession('ws://clock-fixture', map);
  let expected = structuredClone(source.local!);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'One local steering wheel' });
    for (let sequence = 0; sequence < 48; sequence++) {
      vi.advanceTimersByTime(1000 / 60);
      const actions = { ...neutralActions(), throttle: 1, steer: sequence < 8 ? 1 : 0 };
      expected = { ...expected, ...predictVehicle(map, expected.vehicle, expected.driver, actions) };
      session.submit({ sessionEpoch: source.sessionEpoch, sequence, clientTick: sequence, actions }, performance.now());
      if (sequence % 3 === 2) {
        const next = structuredClone(source); next.serverTick += sequence + 1;
        next.local!.lastConsumedSequence = sequence - 2;
        next.local!.vehicle.pose.yaw = .3; next.local!.vehicle.velocity.yawRate = 1;
        next.local!.driver.resolvedSteering = 1; next.local!.vehicle.health = 90;
        wire.handlers.get('snapshot')!(packSnapshot(next));
      }
      const rendered = session.sampleFrame()!.vehicles.find(car => car.entityId === 'local')!;
      expect(rendered.pose.yaw, 'Routine snapshots must not rewind, replay or filter my local steering').toBeCloseTo(expected.vehicle.pose.yaw, 6);
      expect(rendered.velocity.yawRate, 'Release must follow the same local physics with delayed or stale acknowledgements').toBeCloseTo(expected.vehicle.velocity.yawRate, 6);
      expect(rendered.pose.x).toBeCloseTo(expected.vehicle.pose.x, 6);
      if (sequence >= 2) expect(rendered.health, 'Shared damage remains server mediated').toBe(90);
    }
  } finally { await session.dispose(); }
});

it('applies local steering release during snapshot silence without putting controls behind a network clock', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.local!.vehicle.velocity.z = 20;
  wire.initial = packSnapshot(source); const session = createOnlineSession('ws://clock-fixture', map);
  let expected = structuredClone(source.local!);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Release means release' });
    for (let sequence = 0; sequence < 54; sequence++) {
      vi.advanceTimersByTime(1000 / 60);
      const actions = { ...neutralActions(), throttle: 1, steer: sequence < 24 ? 1 : 0 };
      expected = { ...expected, ...predictVehicle(map, expected.vehicle, expected.driver, actions) };
      session.submit({ sessionEpoch: source.sessionEpoch, sequence, clientTick: sequence, actions }, performance.now());
    }
    const car = session.sampleFrame()!.vehicles.find(car => car.entityId === 'local')!;
    expect(car.velocity.yawRate, 'An open connection with delayed snapshots must not retain the last steering input').toBeCloseTo(expected.vehicle.velocity.yawRate, 6);
    expect(car.pose.yaw).toBeCloseTo(expected.vehicle.pose.yaw, 6);
  } finally { await session.dispose(); }
});

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

it('keeps local motion immediate during snapshot silence and clears stale input on an explicit full resync', async () => {
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
    expect(lead(), 'An open connection must not put fresh local controls behind snapshot arrival').toBeGreaterThan(held + 10);
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
    // Reach the short render horizon before checking that network recovery
    // does not pull the locally driven car back toward a stale server pose.
    vi.advanceTimersByTime(50);
    const before = position(), next = structuredClone(source);
    next.serverTick++; next.local!.vehicle.pose.z += .35; next.local!.lastConsumedSequence = 3;
    const update = packSnapshot(next); update.reset = reason === 'input-backlog' ? reason : 'resync'; update.propsPatch = true;
    wire.handlers.get('snapshot')!(update);
    expect(position(), 'Clock/input recovery must preserve the displayed position while reconciling').toBeCloseTo(before, 5);
    expect(session.getStats().pendingInputs, 'Only acknowledged samples are retired').toBe(2);
    vi.advanceTimersByTime(200); expect(position()).toBeCloseTo(before, 5);
    session.submit({ sessionEpoch: source.sessionEpoch, sequence: 6, clientTick: 6, actions: { ...neutralActions(), throttle: 1, steer: 1 } },performance.now());
    expect(session.sampleFrame()!.vehicles.find(car=>car.entityId==='local')!.velocity.yawRate).toBeGreaterThan(.01);
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

it('keeps routine snapshots out of local steering while fresh steering applies immediately', async () => {
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
    expect(middle.pose.x, 'A routine snapshot cannot pull the local car sideways').toBeCloseTo(before.pose.x,6);
    expect(middle.pose.yaw, 'A routine snapshot cannot add a delayed turn').toBeCloseTo(before.pose.yaw,6);
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

it('keeps a parked local car steady until an explicit server intervention corrects it', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map);
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'Parked paperwork' });
    const next = structuredClone(source); next.serverTick++; next.local!.vehicle.pose.z -= 1;
    wire.handlers.get('snapshot')!(packSnapshot(next));
    for (let frame = 0; frame < 15; frame++) { vi.advanceTimersByTime(100); session.sampleFrame(); }
    expect(session.sampleFrame()!.vehicles.find(car => car.entityId === 'local')!.pose.z).toBeCloseTo(source.local!.vehicle.pose.z,6);
    next.serverTick++;next.local!.vehicle.discontinuityId++;
    wire.handlers.get('snapshot')!(packSnapshot(next));
    expect(session.sampleFrame()!.vehicles.find(car => car.entityId === 'local')!.pose.z,'A server collision/life correction is accepted immediately').toBeCloseTo(next.local!.vehicle.pose.z,6);
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

it('does not repay more correction than a late untimed input advanced before its next rendered frame', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.local!.vehicle.velocity.z = 20;
  wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map), actions = { ...neutralActions(), throttle: 1 };
  const local = () => session.sampleFrame()!.vehicles.find(car => car.entityId === 'local')!;
  try {
    await session.connect({ roomId: crypto.randomUUID(), nickname: 'No delayed tow truck' });
    session.submit({ sessionEpoch: source.sessionEpoch, sequence: 0, clientTick: 0, actions });
    vi.advanceTimersByTime(16); local();
    const next = structuredClone(source); next.serverTick++; next.local!.lastConsumedSequence = 0; next.local!.vehicle.pose.z -= 2;
    wire.handlers.get('snapshot')!(packSnapshot(next)); const before = local();
    vi.advanceTimersByTime(80);
    session.submit({ sessionEpoch: source.sessionEpoch, sequence: 1, clientTick: 1, actions: { ...actions, steer: 1 } });
    const after = local();
    expect(after.pose.z, 'Correction must not reverse the last displayed position after a late input callback').toBeGreaterThanOrEqual(before.pose.z - .00001);
    expect(after.velocity.yawRate, 'Late steering must still apply immediately').toBeGreaterThan(.01);
  } finally { await session.dispose(); }
});

it.each([false, true].flatMap(timed => [0, 8, 16, 24, 32].flatMap(flushPhase => [0, 1, 2].map(publishPhase => ({ timed, flushPhase, publishPhase })))))('replicates local motion with 16ms input and 20Hz publication ($timed / flush $flushPhase / publish $publishPhase)', async ({ timed, flushPhase, publishPhase }) => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  const source = unpackSnapshot(snapshot(100)); source.local!.vehicle.pose.z = -76; source.local!.vehicle.velocity.z = 20;
  source.local!.driver.simulatedTick = source.serverTick;
  wire.initial = packSnapshot(source);
  const session = createOnlineSession('ws://clock-fixture', map), actions = { ...neutralActions(), throttle: 1 };
  let authority = source.local!, tick = source.serverTick, sequence = 0, previousZ: number | null = null;
  const leads: number[] = [], steps: number[] = [];
  await session.connect({ roomId: crypto.randomUUID(), nickname: 'Same clock on every OS' });
  vi.advanceTimersByTime(flushPhase); const started = performance.now();
  const authorityTimer = setInterval(() => {
    const accepted=wire.batches.splice(0).at(-1);++tick;
    if(accepted?.motion){authority={...authority,vehicle:{...authority.vehicle,pose:{...accepted.motion.pose},velocity:{...accepted.motion.velocity}},lastConsumedSequence:accepted.motion.sequence};}
    // The room mediates completed driver movement instead of integrating
    // their steering twice. Publication still runs at an independent 20Hz.
    if ((tick - source.serverTick + publishPhase) % 3 === 0) wire.handlers.get('snapshot')!(packSnapshot({ ...source, serverTick: tick, local: authority, vehicles: [authority.vehicle, source.vehicles[1]!] }));
  }, 50);
  const inputTimer = setInterval(() => session.submit({ sessionEpoch: source.sessionEpoch, sequence: sequence++, clientTick: sequence, actions }, timed ? performance.now() : undefined), 16);
  const renderTimer = setInterval(() => {
    const z = session.sampleFrame()!.vehicles.find(car => car.entityId === 'local')!.pose.z;
    if (performance.now() - started > 1000) { leads.push(z - authority.vehicle.pose.z); if (previousZ !== null) steps.push(z - previousZ); }
    previousZ = z;
  }, 8);
  try {
    vi.advanceTimersByTime(6000);
    expect(Math.max(...leads), 'Movement publication must not grow a permanent visual lead').toBeLessThan(8.4);
    const middle = leads.slice(Math.floor(leads.length / 3), Math.floor(leads.length * 2 / 3)), final = leads.slice(Math.floor(leads.length * 2 / 3));
    expect(Math.max(...final) - Math.max(...middle), 'A slower publication clock must keep a bounded movement lead').toBeLessThan(1);
    expect(Math.min(...steps), 'Network publication must preserve forward motion').toBeGreaterThan(0);
    session.submit({ sessionEpoch: source.sessionEpoch, sequence: sequence++, clientTick: sequence, actions: { ...actions, steer: 1 } });
    expect(session.sampleFrame()!.vehicles.find(car => car.entityId === 'local')!.velocity.yawRate).toBeGreaterThan(.01);
  } finally { clearInterval(authorityTimer); clearInterval(inputTimer); clearInterval(renderTimer); await session.dispose(); }
});

it('derives winter grip from a late-joined campaign snapshot without correcting the current local driver',async()=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval','performance']});const source=unpackSnapshot(snapshot(100));source.campaign={campaignId:'green-light-racket-v1',dispatchIndex:8,status:'active',outcomes:[]};source.local!.vehicle.velocity={x:4,z:20,yawRate:0};source.vehicles=source.vehicles.map(v=>v.entityId==='local'?source.local!.vehicle:v);wire.initial=packSnapshot(source);const session=createOnlineSession('ws://clock-fixture',map);
 try{await session.connect({roomId:crypto.randomUUID(),nickname:'Ice inspector'});let dry={vehicle:structuredClone(source.local!.vehicle),driver:structuredClone(source.local!.driver)},snow=structuredClone(dry);
 for(let sequence=0;sequence<15;sequence++){vi.advanceTimersByTime(1000/60);session.submit({sessionEpoch:source.sessionEpoch,sequence,clientTick:sequence,actions:neutralActions()},performance.now());dry=predictVehicle(map,dry.vehicle,dry.driver,neutralActions(),[],undefined,101+sequence);snow=predictVehicle(map,snow.vehicle,snow.driver,neutralActions(),[],undefined,101+sequence,getDispatchFeatures(8));}
 const velocity=session.sampleFrame()!.vehicles.find(v=>v.entityId==='local')!.velocity;
 expect(session.getStats().pendingInputs).toBe(15);expect(velocity).toEqual(snow.vehicle.velocity);expect(velocity.x).toBeGreaterThan(dry.vehicle.velocity.x);
 }finally{await session.dispose();}
});
