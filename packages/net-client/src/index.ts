import { Client, ErrorCode, MatchMakeError, ServerError, type Room, type SeatReservation } from '@colyseus/sdk';
import { predictVehicle } from '@fender/sim';
import { ProjectilePresentation } from './projectile-presentation';
import { GAMEPLAY_REVISION, PROTOCOL_VERSION, isInviteCode, isRecord, unpackSnapshot, type CollisionMap, type GameEvent, type GameSession, type InputCommand, type JoinResult, type LocalAuthorityState, type PropState, type RenderFrame, type SessionRequest, type SessionStatus, type VehicleState, type WireSnapshot, type WorldSnapshot } from '@fender/contracts';
const clone = <T>(v: T): T => structuredClone(v);
const wrap = (n: number) => Math.atan2(Math.sin(n), Math.cos(n));
const frozenCampaign = (state: WorldSnapshot) => Boolean(state.campaign) && state.phase !== 'playing';
export function interpolateVehicle(a: VehicleState, b: VehicleState, t: number): VehicleState {
  if (a.discontinuityId !== b.discontinuityId || a.status !== b.status) return clone(b);
  const v = clone(b); v.pose.x = a.pose.x + (b.pose.x - a.pose.x) * t; v.pose.z = a.pose.z + (b.pose.z - a.pose.z) * t; v.pose.yaw = a.pose.yaw + wrap(b.pose.yaw - a.pose.yaw) * t; return v;
}
export function createOnlineSession(endpoint: string, map: CollisionMap) {
  const sdk = new Client(endpoint);
  const projectilePresentation = new ProjectilePresentation(map);
  let room: Room | null = null, snapshot: WorldSnapshot | null = null, predicted: LocalAuthorityState | null = null;
  let latestFullResync: WorldSnapshot | null = null;
  let pending: { command: InputCommand; estimatedTick: number }[] = [], outgoing: InputCommand[] = [];
  let history: { state: WorldSnapshot; arrived: number }[] = [];
  let state: SessionStatus = { state: 'idle' }, disposed = false, playerId = '', roomId = '';
  let rtt = 0, correctionX = 0, correctionZ = 0, lastRenderAt = performance.now(), lastSnapshotAt = performance.now();
  let playbackTick: number | null = null;
  let corrections = 0, maxCorrection = 0, receivedBytes = 0, sentBytes = 0;
  const snapshotListeners = new Set<(s: WorldSnapshot) => void>(), eventListeners = new Set<(events: GameEvent[]) => void>(), statusListeners = new Set<(s: SessionStatus) => void>();
  const status = (s: SessionStatus) => { state = s; statusListeners.forEach(fn => fn(s)); };
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
        const dt = Math.min(6, tick - after.state.serverTick) / 60;
        result.pose.x += result.velocity.x * dt; result.pose.z += result.velocity.z * dt;
      }
      return result;
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
    const next = unpackSnapshot(wire, wire.m === snapshot?.matchId ? snapshot?.props : undefined); receivedBytes += JSON.stringify(wire).length;
    if (snapshot && next.serverTick < snapshot.serverTick && next.matchId === snapshot.matchId && next.sessionEpoch === snapshot.sessionEpoch) return;
    if (next.resetReason === 'resync' && !wire.propsPatch) latestFullResync = next;
    const frozen = frozenCampaign(next);
    const reset = next.resetReason || next.matchId !== snapshot?.matchId || next.sessionEpoch !== snapshot?.sessionEpoch || next.local?.vehicle.discontinuityId !== snapshot?.local?.vehicle.discontinuityId || frozen && next.phase !== snapshot?.phase;
    const oldPose = predicted?.vehicle.pose;
    snapshot = next; lastSnapshotAt = performance.now();projectilePresentation.receive(next,Boolean(reset));
    if (reset) { pending = []; outgoing = []; history = []; correctionX = correctionZ = 0; playbackTick = null; }
    if (frozen) correctionX = correctionZ = 0;
    history.push({ state: next, arrived: lastSnapshotAt }); if (history.length > 40) history.shift();
    if (next.local) {
      pending = pending.filter(p => p.command.sequence > next.local!.lastConsumedSequence);
      predicted = clone(next.local);
      if (pending.length > 180) { pending = []; room?.send('resync'); }
      if (!frozen) for (const entry of pending) {
        const result = predictVehicle(map, predicted.vehicle, predicted.driver, entry.command.actions, remoteAt(entry.estimatedTick).filter(v => v.entityId !== predicted!.vehicle.entityId));
        predicted.vehicle = result.vehicle; predicted.driver = result.driver;
      }
      if (oldPose && !reset && !frozen) {
        const dx = oldPose.x - predicted.vehicle.pose.x, dz = oldPose.z - predicted.vehicle.pose.z;
        const distance = Math.hypot(dx, dz); corrections++; maxCorrection = Math.max(maxCorrection, distance);
        if (distance < 3) { correctionX += dx; correctionZ += dz; } else correctionX = correctionZ = 0;
      }
    }
    status({ state: next.phase === 'lobby' ? 'lobby' : 'playing' });
    snapshotListeners.forEach(fn => fn(next));
  }
  function flush() {
    if (!room || disposed || state.state === 'reconnecting') { outgoing = []; return; }
    if (outgoing.length) { const commands = outgoing.splice(0, 4); sentBytes += JSON.stringify(commands).length; room.send('input', { commands }); }
  }
  const flushTimer = setInterval(flush, 1000 / 30);
  const pingTimer = setInterval(() => { if (room && !disposed && state.state !== 'reconnecting') room.send('ping', performance.now()); }, 1000);
  const api: GameSession & { sampleFrame(now?: number): RenderFrame | null; getSnapshot(): WorldSnapshot | null; getStats(): Record<string, number>; getIdentity(): { playerId: string; roomId: string }; } = {
    async connect(request: SessionRequest): Promise<JoinResult> {
      status({ state: 'connecting' });
      try {
        const options = { nickname: request.nickname, protocolVersion: PROTOCOL_VERSION, mapRevision: map.revision, gameplayRevision: GAMEPLAY_REVISION, ...(request.vehicleBodyId ? { vehicleBodyId: request.vehicleBodyId } : {}) };
        if (request.mode === 'create') room = await sdk.create('district', options);
        else {
          const invite = request.roomId!.trim();
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
        }
        if (!room) throw new Error('Dispatch unavailable');
        roomId = room.roomId; playerId = room.sessionId;
        const connection = room.connection, reconnect = connection.reconnect.bind(connection);
        // The SDK's queued retry has no cancellation handle; guard its public transport entry point.
        connection.reconnect = options => { if (!disposed) reconnect(options); };
        room.reconnection.maxRetries = 10; room.reconnection.minDelay = 300; room.reconnection.maxDelay = 1000; room.reconnection.minUptime = 0; room.reconnection.maxEnqueuedMessages = 0;
        room.onMessage('snapshot', receive);
        room.onMessage('events', (events: GameEvent[]) => { projectilePresentation.present(events);eventListeners.forEach(fn => fn(events)); });
        room.onMessage('latency-probe', (message: { nonce: string }) => { room!.send('latency-pong', { nonce: message.nonce }); });
        room.onMessage('pong', (message: { sent: number }) => { const measured = performance.now() - message.sent; rtt = rtt ? .8 * rtt + .2 * measured : measured; });
        room.onDrop(() => { if (disposed) return; pending = []; outgoing = []; status({ state: 'reconnecting', message: 'Reconnecting to dispatch…' }); });
        room.onReconnect(() => { pending = []; outgoing = []; room!.reconnection.enqueuedMessages.length = 0; room!.send('resync'); });
        room.onLeave(() => { if (!disposed) status({ state: 'disconnected', reason: 'reconnect-expired' }); });
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
    submit(command) {
      if (!snapshot || !predicted || disposed || state.state === 'reconnecting' || state.state === 'disconnected') return;
      const estimatedTick = snapshot.serverTick + (performance.now() - lastSnapshotAt + rtt / 2) * .06;
      pending.push({ command, estimatedTick }); outgoing.push(command);
      if (outgoing.length > 12 || pending.length > 180) { outgoing = []; pending = []; room?.send('resync'); return; }
      if (!frozenCampaign(snapshot) && (snapshot.phase === 'playing' || snapshot.phase === 'lobby')) {
        const result = predictVehicle(map, predicted.vehicle, predicted.driver, command.actions, remoteAt(estimatedTick).filter(v => v.entityId !== predicted!.vehicle.entityId));
        predicted.vehicle = result.vehicle; predicted.driver = result.driver;
      }
    },
    neutralize() { outgoing = []; pending = []; room?.send('neutralize'); },
    request(action) { if (action === 'leave') { void api.dispose(); } else room?.send(action); },
    selectVehicle(vehicleBodyId) { if (!disposed && snapshot?.phase === 'lobby') room?.send('select-vehicle', { vehicleBodyId }); },
    onSnapshot(fn) { snapshotListeners.add(fn); return () => snapshotListeners.delete(fn); },
    onEvents(fn) { eventListeners.add(fn); return () => eventListeners.delete(fn); },
    onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); },
    async dispose() {
      if (disposed) return;
      disposed = true; clearInterval(flushTimer); clearInterval(pingTimer); outgoing = []; pending = [];projectilePresentation.dispose();
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
      const dt = Math.min(.1, (now - lastRenderAt) / 1000); lastRenderAt = now;
      correctionX *= Math.exp(-dt * 20); correctionZ *= Math.exp(-dt * 20);
      const estimatedTick = snapshot.serverTick + (now - lastSnapshotAt + rtt / 2) * .06;
      // A late arrival may lower the clock estimate; pause playback rather than rewind it.
      playbackTick = Math.max(playbackTick ?? -Infinity, estimatedTick - 6);
      const vehicles = remoteAt(playbackTick);
      if (predicted) {
        const vehicle = clone(predicted.vehicle); vehicle.pose.x += correctionX; vehicle.pose.z += correctionZ;
        const index = vehicles.findIndex(v => v.entityId === vehicle.entityId); if (index >= 0) vehicles[index] = vehicle; else vehicles.push(vehicle);
      }
      return { sampleTimeSeconds: now / 1000, vehicles, projectiles: projectilePresentation.sample(predicted?.vehicle.entityId??null,estimatedTick,playbackTick), props: propsAt(playbackTick), localEntityId: predicted?.vehicle.entityId ?? null, cameraTarget: vehicles.find(v => v.playerId === playerId)?.pose ?? null,
        pursuit: snapshot.phase === 'playing' && snapshot.pursuit?.state !== 'complete' ? clone(snapshot.pursuit) : undefined };
    },
    getSnapshot: () => snapshot,
    getIdentity: () => ({ playerId, roomId }),
    getStats: () => ({ rtt, corrections, maxCorrection, receivedBytes, sentBytes, pendingInputs: pending.length, snapshotAgeMs: performance.now() - lastSnapshotAt }),
  };
  return api;
}
