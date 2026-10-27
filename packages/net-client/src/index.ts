import { Client, ErrorCode, MatchMakeError, ServerError, type Room, type SeatReservation } from '@colyseus/sdk';
import { predictVehicle, projectVehiclePose } from '@fender/sim';
import { ProjectilePresentation } from './projectile-presentation';
import { withRoadGadgets } from '@fender/contracts';
import { GAMEPLAY_REVISION, PROTOCOL_VERSION, zeroContactAdjustment, getDispatchFeatures, DEFAULT_DRIVING_CONTEXT, isInviteCode, isRecord, unpackSnapshot, type CollisionMap, type GameEvent, type GameSession, type InputCommand, type JoinResult, type LocalAuthorityState, type LocalVehicleMotion, type PropState, type RenderFrame, type SessionRequest, type SessionStatus, type VehicleState, type WireSnapshot, type WorldSnapshot } from '@fender/contracts';
const clone = <T>(v: T): T => structuredClone(v);
const wrap = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
const frozenCampaign = (state: WorldSnapshot) => state.paused === true || Boolean(state.campaign) && state.phase !== 'playing';
const REMOTE_BUFFER_TICKS = 12;
const REMOTE_EXTRAPOLATION_TICKS = 18;
const REMOTE_STALE_MS = 1000;
function correctionFraction(x: number, z: number, speed: number, dt: number) {
  const length = Math.hypot(x, z);
  // Ease presentation offsets without reversing a moving car.
  const catchupSpeed = speed > .05 ? speed * .8 : 4;
  return length ? Math.min(1 - Math.exp(-dt * 5), catchupSpeed * dt / length) : 0;
}
export function interpolateVehicle(a: VehicleState, b: VehicleState, t: number): VehicleState {
  if (a.discontinuityId !== b.discontinuityId || a.status !== b.status) return clone(b);
  const v = clone(b); v.pose.x = a.pose.x + (b.pose.x - a.pose.x) * t; v.pose.z = a.pose.z + (b.pose.z - a.pose.z) * t; v.pose.yaw = a.pose.yaw + wrap(b.pose.yaw - a.pose.yaw) * t; return v;
}
export function createOnlineSession(endpoint: string, map: CollisionMap) {
  const sdk = new Client(endpoint);
  const projectilePresentation = new ProjectilePresentation(map);
  let room: Room | null = null, snapshot: WorldSnapshot | null = null, predicted: LocalAuthorityState | null = null;
  let latestFullResync: WorldSnapshot | null = null;
  let pending: { command: InputCommand; motion?: LocalVehicleMotion }[] = [], outgoing: InputCommand[] = [];
  let history: { state: WorldSnapshot; arrived: number }[] = [];
  let state: SessionStatus = { state: 'idle' }, disposed = false, playerId = '', roomId = '';
  let rtt = 0, correctionX = 0, correctionZ = 0, lastRenderAt = performance.now(), lastSnapshotAt = performance.now();
  let predictionAt = performance.now();
  let appliedContact = zeroContactAdjustment();
  let lastLocalFrame: VehicleState['pose'] | null = null;
  let lateUntimedInput = false;
  let playbackTick: number | null = null;
  const remoteCorrections = new Map<string, { x: number; z: number; yaw: number }>();
  let corrections = 0, maxCorrection = 0, receivedBytes = 0, sentBytes = 0;
  let activityAt = -Infinity;
  let noticeId = 0;
  let presence = { menuOpen: false, hidden: false };
  const snapshotListeners = new Set<(s: WorldSnapshot) => void>(), eventListeners = new Set<(events: GameEvent[]) => void>(), statusListeners = new Set<(s: SessionStatus) => void>();
  const status = (s: SessionStatus) => { state = s; statusListeners.forEach(fn => fn(s)); };
  function localPose(now: number) {
    if (!predicted) return null;
    const pose = { ...predicted.vehicle.pose };
    if (snapshot && !frozenCampaign(snapshot) && predicted.vehicle.status === 'active') {
      const dt = Math.max(0, Math.min(.05, (now - predictionAt) / 1000));
      if(dt>0)return projectVehiclePose(predicted.vehicle, dt, visibleCollisionProxies(snapshot.serverTick));
    }
    return pose;
  }
  function remoteAt(tick: number): VehicleState[] {
    if (!history.length) return [];
    const before = [...history].reverse().find(h => h.state.serverTick <= tick) ?? history[0]!;
    const after = history.find(h => h.state.serverTick >= tick) ?? history.at(-1)!;
    const span = after.state.serverTick - before.state.serverTick;
    const t = span ? Math.max(0, Math.min(1, (tick - before.state.serverTick) / span)) : 1;
    return after.state.vehicles.map(v => {
      const prev = before.state.vehicles.find(p => p.entityId === v.entityId);
      const result = prev ? interpolateVehicle(prev, v, t) : clone(v);
      if (tick > after.state.serverTick && result.status === 'active' && !frozenCampaign(after.state)) {
        const dt = Math.min(REMOTE_EXTRAPOLATION_TICKS, tick - after.state.serverTick) / 60;
        result.pose.x += result.velocity.x * dt; result.pose.z += result.velocity.z * dt;
        result.pose.yaw += result.velocity.yawRate * dt;
      }
      return result;
    });
  }
  function visibleCollisionProxies(estimatedTick: number): VehicleState[] {
    // Contact uses the external trajectory the driver sees. A separate future
    // collider can jump on packet arrival even while the rendered car is steady.
    return remoteAt(playbackTick ?? estimatedTick-REMOTE_BUFFER_TICKS).map(vehicle=>{
      const offset=remoteCorrections.get(vehicle.entityId);
      if(offset){vehicle.pose.x+=offset.x;vehicle.pose.z+=offset.z;vehicle.pose.yaw+=offset.yaw;}
      return vehicle;
    });
  }
  function propsAt(tick: number): PropState[] {
    if (!history.length) return [];
    const before = [...history].reverse().find(h => h.state.serverTick <= tick) ?? history[0]!;
    const after = history.find(h => h.state.serverTick >= tick) ?? history.at(-1)!;
    const span = after.state.serverTick - before.state.serverTick;
    const t = span ? Math.max(0, Math.min(1, (tick - before.state.serverTick) / span)) : 1;
    const previous = new Map((before.state.props ?? []).map(prop => [prop.entityId, prop]));
    return (after.state.props ?? []).map(prop => {
      const a = previous.get(prop.entityId), result = clone(prop);
      if (!a || a.discontinuityId !== prop.discontinuityId || a.kind !== prop.kind) return result;
      for (const axis of ['x', 'y', 'z'] as const) result.position[axis] = a.position[axis] + (prop.position[axis] - a.position[axis]) * t;
      const dot = a.rotation.x * prop.rotation.x + a.rotation.y * prop.rotation.y + a.rotation.z * prop.rotation.z + a.rotation.w * prop.rotation.w;
      const sign = dot < 0 ? -1 : 1;
      for (const axis of ['x', 'y', 'z', 'w'] as const) result.rotation[axis] = a.rotation[axis] * (1 - t) + prop.rotation[axis] * sign * t;
      const length = Math.hypot(result.rotation.x, result.rotation.y, result.rotation.z, result.rotation.w) || 1;
      for (const axis of ['x', 'y', 'z', 'w'] as const) result.rotation[axis] /= length;
      return result;
    });
  }
  function receive(wire: WireSnapshot) {
    if(state.reason==='idle-timeout')return;
    const next = unpackSnapshot(wire, wire.m === snapshot?.matchId ? snapshot?.props : undefined); receivedBytes += JSON.stringify(wire).length;
    if (snapshot && next.serverTick < snapshot.serverTick && next.matchId === snapshot.matchId && next.sessionEpoch === snapshot.sessionEpoch) return;
    if (next.resetReason === 'resync' && !wire.propsPatch) latestFullResync = next;
    const frozen = frozenCampaign(next);
    // Queue/clock recovery does not teleport the vehicle. Its acknowledgment
    // retires old samples without changing the continuously driven local car.
    const continuousRecovery = next.resetReason === 'input-backlog' || next.resetReason === 'resync' && wire.propsPatch;
    const reset = (!continuousRecovery && next.resetReason) || next.paused !== snapshot?.paused || next.matchId !== snapshot?.matchId || next.sessionEpoch !== snapshot?.sessionEpoch || next.local?.vehicle.discontinuityId !== snapshot?.local?.vehicle.discontinuityId || next.local?.vehicle.status !== snapshot?.local?.vehicle.status || frozen && next.phase !== snapshot?.phase;
    const restoreRemoteTimeline = !reset && !frozen && snapshot && performance.now() - lastSnapshotAt > REMOTE_STALE_MS && next.serverTick - snapshot.serverTick > REMOTE_EXTRAPOLATION_TICKS;
    const oldPose = localPose(performance.now());
    const oldRemotes = !reset && !frozen && !restoreRemoteTimeline && playbackTick !== null ? new Map(remoteAt(playbackTick).map(car => [car.entityId, car])) : null;
    snapshot = next; lastSnapshotAt = performance.now();projectilePresentation.receive(next,Boolean(reset));
    if (reset) { pending = []; outgoing = []; history = []; correctionX = correctionZ = 0; playbackTick = null; lastLocalFrame = null; lateUntimedInput = false; }
    if (reset || frozen || restoreRemoteTimeline) remoteCorrections.clear();
    if (frozen) correctionX = correctionZ = 0;
    history.push({ state: next, arrived: lastSnapshotAt }); if (history.length > 40) history.shift();
    // After a prolonged blackout the held trajectory is obsolete. Rejoin the
    // current buffer instead of replaying seconds of missed traffic in slow motion.
    if (restoreRemoteTimeline) playbackTick = next.serverTick + rtt * .03 - REMOTE_BUFFER_TICKS;
    if (oldRemotes && playbackTick !== null) {
      const current = remoteAt(playbackTick), live = new Set(current.map(car => car.entityId));
      for (const car of current) {
        const before = oldRemotes.get(car.entityId);
        if (!before || car.entityId === next.local?.vehicle.entityId || before.discontinuityId !== car.discontinuityId || before.status !== car.status) { remoteCorrections.delete(car.entityId); continue; }
        const offset = remoteCorrections.get(car.entityId) ?? { x: 0, z: 0, yaw: 0 };
        offset.x += before.pose.x - car.pose.x; offset.z += before.pose.z - car.pose.z;
        offset.yaw = wrap(offset.yaw + wrap(before.pose.yaw - car.pose.yaw));
        remoteCorrections.set(car.entityId, offset);
      }
      for (const id of remoteCorrections.keys()) if (!live.has(id)) remoteCorrections.delete(id);
    }
    if (next.local) {
      pending = pending.filter(p => p.command.sequence > next.local!.lastConsumedSequence);
      if (pending.length > 180) { pending = []; room?.send('resync'); }
      if (!predicted || reset || frozen) {
        if(oldPose&&predicted&&reset){corrections++;maxCorrection=Math.max(maxCorrection,Math.hypot(oldPose.x-next.local.vehicle.pose.x,oldPose.z-next.local.vehicle.pose.z));}
        predicted = clone(next.local); predictionAt = performance.now();
        appliedContact = clone(next.local.contact ?? zeroContactAdjustment());
      } else {
        // Local movement is advanced once, by local input. Ordinary room
        // updates own shared state, not this car's steering or velocity.
        const contact = next.local.contact;
        if (contact && contact.revision > appliedContact.revision) {
          for (const axis of ['x','z','yaw'] as const) predicted.vehicle.pose[axis] += contact.pose[axis]-appliedContact.pose[axis];
          for (const axis of ['x','z','yawRate'] as const) predicted.vehicle.velocity[axis] += contact.velocity[axis]-appliedContact.velocity[axis];
          predicted.vehicle.pose.yaw = wrap(predicted.vehicle.pose.yaw);
          appliedContact = clone(contact);
        }
        const { health, maxHealth, protectedUntilTick, respawnAtTick, sirenOn } = next.local.vehicle;
        Object.assign(predicted.vehicle,{health,maxHealth,protectedUntilTick,respawnAtTick,sirenOn});
      }
    }
    status({ ...state, state: next.phase === 'lobby' ? 'lobby' : 'playing' });
    snapshotListeners.forEach(fn => fn(next));
  }
  function flush() {
    if (!room || disposed || state.state === 'reconnecting') { outgoing = []; return; }
    if (outgoing.length) {
      const commands = outgoing.splice(0, 4), motion = pending.find(entry=>entry.command.sequence===commands.at(-1)!.sequence)?.motion;
      const packet = { commands, ...(motion ? {motion} : {}) };
      sentBytes += JSON.stringify(packet).length; room.send('input', packet);
    }
  }
  const flushTimer = setInterval(flush, 1000 / 30);
  const pingTimer = setInterval(() => { if (room && !disposed && state.state !== 'reconnecting') room.send('ping', performance.now()); }, 1000);
  const api: GameSession & { sampleFrame(now?: number): RenderFrame | null; getSnapshot(): WorldSnapshot | null; getStats(): Record<string, number>; getIdentity(): { playerId: string; roomId: string }; } = {
    async connect(request: SessionRequest): Promise<JoinResult> {
      status({ state: 'connecting' });
      try {
        const options = { nickname: request.nickname, protocolVersion: PROTOCOL_VERSION, mapRevision: map.revision, gameplayRevision: GAMEPLAY_REVISION, ...(request.vehicleBodyId ? { vehicleBodyId: request.vehicleBodyId } : {}) };
          const invite = request.roomId.trim();
          if (isInviteCode(invite)) {
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                const response = await sdk.http.post(`dispatch/${invite}`, { body: options });
                room = await sdk.consumeSeatReservation(response.data as SeatReservation);
                break;
              } catch (error) {
                const failure = error instanceof ServerError || error instanceof MatchMakeError ? error : null;
                const code = error instanceof ServerError && isRecord(error.data) && Number.isInteger(error.data.code) ? error.data.code as number : failure?.code;
                const vanished = failure && (code === ErrorCode.MATCHMAKE_EXPIRED || code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID && /not found|disposed/i.test(failure.message));
                if (vanished && attempt < 2 && !disposed) continue;
                if (error instanceof ServerError) throw new MatchMakeError(error.message, code ?? error.code);
                throw error;
              }
            }
          } else room = await sdk.joinById(invite, options);
        if (!room) throw new Error('Dispatch unavailable');
        roomId = room.roomId; playerId = room.sessionId;
        const connection = room.connection, reconnect = connection.reconnect.bind(connection);
        // The SDK's queued retry has no cancellation handle; guard its public transport entry point.
        connection.reconnect = options => { if (!disposed) reconnect(options); };
        room.reconnection.maxRetries = 10; room.reconnection.minDelay = 300; room.reconnection.maxDelay = 1000; room.reconnection.minUptime = 0; room.reconnection.maxEnqueuedMessages = 0;
        room.onMessage('snapshot', receive);
        room.onMessage('events', (events: GameEvent[]) => { projectilePresentation.present(events);eventListeners.forEach(fn => fn(events)); });
        room.onMessage('latency-probe', (message: { nonce: string }) => { room!.send('latency-pong', { nonce: message.nonce }); });
        room.onMessage('idle-warning', (message: { remainingMs: number | null }) => status({ ...state, idleRemainingMs: message.remainingMs ?? undefined }));
        room.onMessage('room-notice', (message: { message: string }) => status({ ...state, notice: { id: ++noticeId, message: message.message } }));
        room.onMessage('session-ended', (message: { reason: string }) => {
          if(message.reason!=='idle-timeout')return;
          room!.reconnection.enabled=false;outgoing=[];pending=[];
          clearInterval(flushTimer);clearInterval(pingTimer);
          status({state:'disconnected',reason:'idle-timeout'});
        });
        room.onMessage('pong', (message: { sent: number }) => { const measured = performance.now() - message.sent; rtt = rtt ? .8 * rtt + .2 * measured : measured; });
        room.onDrop(() => { if (disposed || state.reason==='idle-timeout') return; pending = []; outgoing = []; status({ state: 'reconnecting', message: 'Reconnecting to dispatch…' }); });
        room.onReconnect(() => { pending = []; outgoing = []; room!.reconnection.enqueuedMessages.length = 0; room!.send('presence',presence);room!.send('resync'); });
        room.onLeave(() => { if (!disposed) status({ state: 'disconnected', reason: state.reason==='idle-timeout'?'idle-timeout':'reconnect-expired' }); });
        room.onError((_code, message) => status({ state: 'error', reason: 'network-error', message }));
        const first = await new Promise<WorldSnapshot>((resolve, reject) => {
          const timer = setTimeout(() => { snapshotListeners.delete(listener); reject(new Error('Dispatch did not send a world')); }, 10000);
          // A queued join or clock-only reset can precede the requested full baseline.
          // Let the caller submit its first command only after that baseline has arrived.
          const listener = (s: WorldSnapshot) => { if (s !== latestFullResync) return; clearTimeout(timer); snapshotListeners.delete(listener); resolve(s); };
          snapshotListeners.add(listener); room!.send('resync');
        });
        return { playerId, roomId, sessionEpoch: first.sessionEpoch, protocolVersion: first.protocolVersion, mapRevision: first.mapRevision, gameplayRevision: first.gameplayRevision, firstState: first, localEntityId: first.local?.vehicle.entityId ?? null };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const atCapacity = error instanceof MatchMakeError && error.code === 503 && /capacity/i.test(message);
        status({ state: 'error', reason: atCapacity ? 'server-capacity' : message.includes('version') ? 'version-mismatch' : message.includes('invalid-name') ? 'invalid-name' : message.includes('invalid-vehicle') ? 'invalid-vehicle' : message.includes('full') || message.includes('locked') ? 'room-full' : message.includes('not found') ? 'room-missing' : 'network-error', message });
        throw error;
      }
    },
    submit(command, localTickTimeMs) {
      if (!snapshot || snapshot.paused || !predicted || disposed || state.state === 'reconnecting' || state.state === 'disconnected') return;
      const estimatedTick = snapshot.serverTick + (performance.now() - lastSnapshotAt + rtt / 2) * .06;
      const entry:typeof pending[number]={command};pending.push(entry); outgoing.push(command);
      if (outgoing.length > 12 || pending.length > 180) { outgoing = []; pending = []; room?.send('resync'); return; }
      if (!frozenCampaign(snapshot) && (snapshot.phase === 'playing' || snapshot.phase === 'lobby')) {
        const now = performance.now(), previousTickTime = predictionAt;
        const actions = snapshot.phase === 'playing' ? command.actions : { ...command.actions, fire: false };
        const simulationTick = Math.max(snapshot.serverTick, predicted.driver.simulatedTick ?? 0) + 1;
        const drivingContext = withRoadGadgets(snapshot.campaign ? getDispatchFeatures(snapshot.campaign.dispatchIndex) : DEFAULT_DRIVING_CONTEXT, snapshot.gadgets ?? [], simulationTick);
        const result = predictVehicle(map, predicted.vehicle, predicted.driver, actions, visibleCollisionProxies(estimatedTick).filter(v => v.entityId !== predicted!.vehicle.entityId), undefined, simulationTick, drivingContext);
        predicted.vehicle = result.vehicle; predicted.driver = result.driver;
        const timed = localTickTimeMs !== undefined && Number.isFinite(localTickTimeMs);
        predictionAt = timed ? Math.max(now - 1000, Math.min(now, localTickTimeMs!)) : now;
        if(predicted.vehicle.status==='active')entry.motion={sequence:command.sequence,discontinuityId:predicted.vehicle.discontinuityId,contactRevision:appliedContact.revision,pose:{...predicted.vehicle.pose},velocity:{...predicted.vehicle.velocity}};
        // A late untimed caller may advance only one tick. Preserve its last
        // displayed travel after render correction has been applied, not before.
        if (!timed && lastLocalFrame && predictionAt - previousTickTime > 1000 / 60 + 2) lateUntimedInput = true;
      }
    },
    neutralize() { outgoing = []; pending = []; room?.send('neutralize'); },
    setPresence(menuOpen, hidden) { presence={menuOpen,hidden};outgoing = []; pending = []; room?.send('presence',presence); },
    activity() { const now=performance.now();if(now-activityAt>=1000){activityAt=now;room?.send('activity');} },
    request(action) { if (action === 'leave') { void api.dispose(); } else room?.send(action); },
    selectVehicle(vehicleBodyId) { if (!disposed && snapshot?.phase === 'lobby') room?.send('select-vehicle', { vehicleBodyId }); },
    onSnapshot(fn) { snapshotListeners.add(fn); return () => snapshotListeners.delete(fn); },
    onEvents(fn) { eventListeners.add(fn); return () => eventListeners.delete(fn); },
    onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); },
    async dispose() {
      if (disposed) return;
      disposed = true; clearInterval(flushTimer); clearInterval(pingTimer); outgoing = []; pending = [];projectilePresentation.dispose();
      remoteCorrections.clear();
      lastLocalFrame = null; lateUntimedInput = false;
      if (room) {
        room.reconnection.enabled = false;
        if (room.connection.isOpen) {
          let deadline: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([room.leave(true).catch(() => undefined), new Promise<void>(resolve => {
              deadline = setTimeout(() => { room!.connection.close(1000, 'Session disposed'); resolve(); }, 1000);
            })]);
          } finally { if (deadline) clearTimeout(deadline); }
        } else room.connection.close(1000, 'Session disposed');
        room.removeAllListeners();
      }
      room = null; status({ state: 'disconnected' }); snapshotListeners.clear(); eventListeners.clear(); statusListeners.clear();
    },
    sampleFrame(now = performance.now()) {
      if (!snapshot) return null;
      const elapsed = Math.max(0, (now - lastRenderAt) / 1000), dt = Math.min(.1, elapsed); lastRenderAt = now;
      const speed = predicted ? Math.hypot(predicted.vehicle.velocity.x, predicted.vehicle.velocity.z) : 0;
      // This offset only preserves already displayed travel for legacy untimed
      // callers. Network packets never add a local position or steering offset.
      const fraction = correctionFraction(correctionX, correctionZ, speed, dt);
      correctionX *= 1 - fraction; correctionZ *= 1 - fraction;
      const estimatedTick = snapshot.paused ? snapshot.serverTick : snapshot.serverTick + (now - lastSnapshotAt + rtt / 2) * .06;
      const desiredTick = estimatedTick - REMOTE_BUFFER_TICKS;
      // Correct clock phase by gently changing playback speed. Holding until a
      // late estimate catches up turns ordinary jitter into visible stop/start.
      if (snapshot.paused) playbackTick = snapshot.serverTick;
      else if (playbackTick === null) playbackTick = desiredTick;
      else {
        const error = desiredTick - (playbackTick + elapsed * 60);
        const rate = Math.max(.75, Math.min(1.1, 1 + error / 60));
        playbackTick = Math.min(snapshot.serverTick + REMOTE_EXTRAPOLATION_TICKS, playbackTick + elapsed * 60 * rate);
      }
      const hazardTick = frozenCampaign(snapshot) ? snapshot.serverTick : Math.max(estimatedTick, playbackTick + REMOTE_BUFFER_TICKS);
      const vehicles = remoteAt(playbackTick);
      for (const vehicle of vehicles) {
        const offset = remoteCorrections.get(vehicle.entityId);
        if (!offset) continue;
        const fraction = correctionFraction(offset.x, offset.z, Math.hypot(vehicle.velocity.x, vehicle.velocity.z), dt);
        offset.x *= 1 - fraction; offset.z *= 1 - fraction; offset.yaw *= Math.exp(-dt * 5);
        vehicle.pose.x += offset.x; vehicle.pose.z += offset.z; vehicle.pose.yaw += offset.yaw;
      }
      if (predicted) {
        const vehicle = clone(predicted.vehicle); vehicle.pose = localPose(now)!;
        vehicle.pose.x += correctionX; vehicle.pose.z += correctionZ;
        if (lateUntimedInput && lastLocalFrame) {
          const dx = lastLocalFrame.x - vehicle.pose.x, dz = lastLocalFrame.z - vehicle.pose.z;
          if (dx * vehicle.velocity.x + dz * vehicle.velocity.z > 0) { correctionX += dx; correctionZ += dz; vehicle.pose.x += dx; vehicle.pose.z += dz; }
        }
        lateUntimedInput = false;
        lastLocalFrame = { ...vehicle.pose };
        const index = vehicles.findIndex(v => v.entityId === vehicle.entityId); if (index >= 0) vehicles[index] = vehicle; else vehicles.push(vehicle);
      }
      return { sampleTimeSeconds: now / 1000, vehicles, projectiles: projectilePresentation.sample(predicted?.vehicle.entityId??null,estimatedTick,playbackTick), props: propsAt(playbackTick), brokenSnowbanks:[...(snapshot.brokenSnowbanks??[])], localEntityId: predicted?.vehicle.entityId ?? null, cameraTarget: vehicles.find(v => v.playerId === playerId)?.pose ?? null,
        helicopter: snapshot.phase==='playing'&&snapshot.helicopter?clone(snapshot.helicopter):undefined,
        serverTick: hazardTick, grenades: snapshot.phase === 'playing' ? clone((snapshot.grenades ?? []).filter(grenade => grenade.detonatesAtTick > hazardTick)) : [],
        gadgets: snapshot.phase === 'playing' ? clone((snapshot.gadgets ?? []).filter(gadget => gadget.expiresTick > hazardTick)) : [],
        pursuit: snapshot.phase === 'playing' && snapshot.pursuit?.state !== 'complete' ? clone(snapshot.pursuit) : undefined };
    },
    getSnapshot: () => snapshot,
    getIdentity: () => ({ playerId, roomId }),
    getStats: () => ({ rtt, corrections, maxCorrection, receivedBytes, sentBytes, pendingInputs: pending.length, snapshotAgeMs: performance.now() - lastSnapshotAt }),
  };
  return api;
}
