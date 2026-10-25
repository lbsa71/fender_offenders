import { Room, ServerError, matchMaker, type Client } from '@colyseus/core';
import { randomInt, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { districtMap, districtProps, VEHICLE_BODIES } from '@fender/content';
import { createSimulation, initPhysics, type Simulation } from '@fender/sim';
import { GAMEPLAY_REVISION, PROTOCOL_VERSION, isInputCommand, isInviteCode, isRecord, isVehicleBodyId, neutralActions, packSnapshot, sanitizeNickname, type AppliedDriverInput, type InputCommand, type VehicleBodyId, type WorldSnapshot } from '@fender/contracts';
import { createPropPublisher } from './prop-publisher.js';
import { roomRegistry, serverMetrics } from './room-registry.js';
export { roomRegistry, serverMetrics, getRoomMetrics } from './room-registry.js';

interface DriverConnection { epoch: string; entityId: string; queue: InputCommand[]; last: InputCommand | null; ack: number; received: number; lastInputAt: number; connected: boolean; windowStart: number; packets: number; reset?: WorldSnapshot['resetReason']; client: Client; latencyProbe: { nonce: string; sentAt: number } | null; pingMs: number | null; latencyMeasuredAt: number | null; propPublisher:ReturnType<typeof createPropPublisher>; menuOpen: boolean; hidden: boolean; lastActivityAt: number; activityNoticeAt: number; idleWarned: boolean; }
export class DrivingRoom extends Room {
  maxClients = 8;
  private sim!: Simulation;
  private drivers = new Map<string, DriverConnection>();
  private accumulator = 0;
  private tick = 0;
  private disposed = false;
  private retiring = false;
  private paused = true;
  private lastSnapshotAt = 0;
  emptySince: number | null = null;
  protected wallNow() { return Date.now(); }
  get isPaused() { return this.paused; }
  occupancy() { const drivers=[...this.drivers.values()];return {connected:drivers.filter(d=>d.connected).length,reconnecting:drivers.filter(d=>!d.connected).length}; }
  override hasReachedMaxClients() { return this.retiring || super.hasReachedMaxClients(); }
  /** Block new reservations synchronously before checking the public matchmaking seat count. */
  async retire(reason: 'expiry' | 'eviction') {
    if(this.disposed||this.retiring||this.emptySince===null||this.drivers.size>0) return false;
    this.retiring=true;
    try {
      const listing=await matchMaker.getRoomById(this.roomId);
      if(this.drivers.size>0||(listing?.clients??0)>0){this.retiring=false;return false;}
      await this.disconnect();
      if(reason==='expiry')serverMetrics.expiredRooms++;else serverMetrics.evictedRooms++;
      return true;
    } catch(error) { this.retiring=false; throw error; }
  }
  private releaseAdmission() {
    roomRegistry.release(this);
  }
  async onCreate(options?: unknown) {
    if (isRecord(options) && 'inviteCode' in options) {
      if (!isInviteCode(options.inviteCode)) throw new ServerError(400, 'Invalid invite code');
      this.roomId = options.inviteCode;
    }
    await roomRegistry.reserve(this);
    try {
      await initPhysics();
      if (this.disposed) throw new ServerError(503, 'Dispatch creation expired');
      this.setPrivate(true);
      this.sim = createSimulation(districtMap, { mode: 'multiplayer', matchId: this.roomId, trafficCount: 8, pursuit: true, campaign: true, props: districtProps });
      this.maxMessagesPerSecond = 100;
      this.onMessage('input', (client, message: unknown) => {
        const driver = this.drivers.get(client.sessionId);
        if (!driver || !driver.connected || !isRecord(message) || !Array.isArray(message.commands) || message.commands.length > 4) { serverMetrics.rejectedInputs++; return; }
        const now = performance.now();
        if (now - driver.windowStart > 1000) { driver.windowStart = now; driver.packets = 0; }
        if (++driver.packets > 65) { serverMetrics.rejectedInputs++; return; }
        for (const command of message.commands) {
          if (!isInputCommand(command) || command.sessionEpoch !== driver.epoch || command.sequence <= driver.received || command.sequence > driver.received + 600) { serverMetrics.rejectedInputs++; continue; }
          driver.received = command.sequence; driver.lastInputAt = now;
          if (!driver.menuOpen && !driver.hidden && !this.paused) {
            driver.queue.push(command);
            if(Object.values(command.actions).some(value=>typeof value==='number'?Math.abs(value)>.001:value===true))this.recordActivity(driver);
          } else driver.ack=command.sequence;
        }
        if (driver.queue.length > 12) {
          const removed = driver.queue.splice(0, driver.queue.length - 2);
          driver.ack = Math.max(driver.ack, removed.at(-1)?.sequence ?? -1); driver.reset = 'input-backlog'; serverMetrics.queueResets++;
        }
      });
      this.onMessage('neutralize', client => this.neutralize(client.sessionId));
      this.onMessage('presence', (client, message: unknown) => {
        const driver=this.drivers.get(client.sessionId);
        if(!driver?.connected||!isRecord(message)||typeof message.menuOpen!=='boolean'||typeof message.hidden!=='boolean')return;
        driver.menuOpen=message.menuOpen;driver.hidden=message.hidden;this.neutralize(client.sessionId);this.updatePause();
      });
      this.onMessage('activity', client => { const driver=this.drivers.get(client.sessionId);if(driver?.connected&&this.wallNow()-driver.activityNoticeAt>=1000){driver.activityNoticeAt=this.wallNow();this.recordActivity(driver);} });
      this.onMessage('resync', client => { this.neutralize(client.sessionId); const d = this.drivers.get(client.sessionId); if (d) d.reset = 'resync'; this.publish(client,true); });
      this.onMessage('start-round', client => {if(this.sim.startRound(client.sessionId))this.touch(client.sessionId);});
      this.onMessage('rematch', client => {if(this.sim.rematch(client.sessionId))this.touch(client.sessionId);});
      this.onMessage('select-vehicle', (client, message: unknown) => {
        if (!isRecord(message) || !isVehicleBodyId(message.vehicleBodyId)) return;
        if (!this.sim.setPlayerVehicle(client.sessionId, message.vehicleBodyId)) return;
        this.touch(client.sessionId);
        this.neutralize(client.sessionId);
        const driver = this.drivers.get(client.sessionId); if (driver) driver.reset = 'resync';
        for (const peer of this.clients) this.publish(peer);
      });
      this.onMessage('ping', (client, message: unknown) => { if (typeof message === 'number' && Number.isFinite(message)) client.send('pong', { sent: message, tick: this.tick }); });
      this.onMessage('latency-pong', (client, message: unknown) => {
        const d = this.drivers.get(client.sessionId);
        if (!d?.connected || d.client !== client || !d.latencyProbe || !isRecord(message) || message.nonce !== d.latencyProbe.nonce) return;
        const now = performance.now(), elapsed = now - d.latencyProbe.sentAt;
        d.latencyProbe = null; // A nonce accepts exactly one response from its current connection.
        if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 5000) return;
        d.pingMs = Math.round(elapsed); d.latencyMeasuredAt = now;
      });
      this.clock.setInterval(() => {
        this.maintain();
        for (const client of this.clients) {
          const d = this.drivers.get(client.sessionId); if (!d?.connected || d.client !== client) continue;
          const now = performance.now();
          if (d.latencyProbe && now - d.latencyProbe.sentAt < 5000) continue;
          d.latencyProbe = { nonce: randomUUID(), sentAt: now };
          client.send('latency-probe', { nonce: d.latencyProbe.nonce });
        }
      }, 1000);
      this.setSimulationInterval(dt => {
        if(this.paused){this.accumulator=0;const now=performance.now();if(now-this.lastSnapshotAt>=50){this.lastSnapshotAt=now;for(const client of this.clients)this.publish(client);}return;}
        this.accumulator += Math.min(dt, 250);
        let count = 0;
        while (this.accumulator >= 1000 / 60 && count++ < 4) { this.accumulator -= 1000 / 60; this.step(); }
        if (this.accumulator > 250) { this.accumulator = 0; for (const d of this.drivers.values()) d.reset = 'resync'; }
      }, 1000 / 60);
      roomRegistry.register(this);
    } catch (error) { this.releaseAdmission(); throw error; }
  }
  onAuth(_client: Client, options: unknown) {
    if(this.retiring)throw new ServerError(410,'Dispatch expired');
    if (!isRecord(options) || options.protocolVersion !== PROTOCOL_VERSION || options.mapRevision !== districtMap.revision || options.gameplayRevision !== GAMEPLAY_REVISION) throw new ServerError(409, 'version-mismatch');
    if (serverMetrics.draining) throw new ServerError(503, 'server-shutdown');
    if (options.vehicleBodyId !== undefined && !isVehicleBodyId(options.vehicleBodyId)) throw new ServerError(400, 'invalid-vehicle');
    try { return { nickname: sanitizeNickname(options.nickname), vehicleBodyId: options.vehicleBodyId as VehicleBodyId | undefined }; } catch { throw new ServerError(400, 'invalid-name'); }
  }
  onJoin(client: Client, _options: unknown, auth: { nickname: string; vehicleBodyId?: VehicleBodyId }) {
    this.autoDispose=false;this.emptySince=null;
    const epoch = randomUUID();
    const car = this.sim.addPlayer({ playerId: client.sessionId, nickname: auth.nickname, sessionEpoch: epoch, bodyAssetId: auth.vehicleBodyId ?? VEHICLE_BODIES[randomInt(VEHICLE_BODIES.length)] });
    this.drivers.set(client.sessionId, { epoch, entityId: car.entityId, queue: [], last: null, ack: -1, received: -1, lastInputAt: 0, connected: true, windowStart: performance.now(), packets: 0, reset: 'join', client, latencyProbe: null, pingMs: null, latencyMeasuredAt: null, propPublisher:createPropPublisher(),menuOpen:false,hidden:false,lastActivityAt:this.wallNow(),activityNoticeAt:-Infinity,idleWarned:false });
    this.updatePause();
    this.publish(client);
  }
  private touch(id:string){const driver=this.drivers.get(id);if(driver)this.recordActivity(driver);}
  private recordActivity(driver:DriverConnection){driver.lastActivityAt=this.wallNow();if(driver.idleWarned){driver.idleWarned=false;driver.client.send('idle-warning',{remainingMs:null});}}
  private updatePause(){
    const connected=[...this.drivers.values()].filter(driver=>driver.connected);
    const paused=connected.length===0||connected.length===1&&(connected[0]!.menuOpen||connected[0]!.hidden);
    if(connected.length===0){this.emptySince??=this.wallNow();}else this.emptySince=null;
    if(paused===this.paused)return;
    const wasPaused=this.paused;this.paused=paused;this.accumulator=0;
    for(const [id,driver]of this.drivers){this.neutralize(id);driver.reset='resync';}
    for(const client of this.clients)this.publish(client,true);
    if(wasPaused&&!paused&&connected.length>1)for(const driver of connected)if(driver.menuOpen||driver.hidden)driver.client.send('room-notice',{message:'Backup joined. The dispatch is live.'});
  }
  protected maintain(){
    if(this.disposed)return;const now=this.wallNow();
    for(const driver of this.drivers.values())if(driver.connected){
      const idle=now-driver.lastActivityAt;
      if(idle>=900_000){driver.client.send('session-ended',{reason:'idle-timeout'});serverMetrics.idleDisconnects++;driver.connected=false;this.neutralize(driver.client.sessionId);driver.client.leave(4000,'idle-timeout');}
      else if(idle>=840_000&&!driver.idleWarned){driver.idleWarned=true;driver.client.send('idle-warning',{remainingMs:900_000-idle});}
    }
    this.updatePause();
    if(this.emptySince!==null&&now-this.emptySince>=900_000)void this.retire('expiry').catch(error=>console.error('Failed to expire empty room',error));
  }
  private neutralize(id: string) {
    const d = this.drivers.get(id); if (!d) return;
    d.ack = Math.max(d.ack, d.received); d.queue = []; d.last = null; d.lastInputAt = 0;
  }
  private step() {
    const started = performance.now();
    const inputs = new Map<string, AppliedDriverInput>();
    for (const d of this.drivers.values()) {
      const interactive=d.connected&&!d.menuOpen&&!d.hidden;
      const cmd = interactive ? d.queue.shift() : undefined;
      if (cmd) { d.last = cmd; d.ack = cmd.sequence; }
      const held = interactive && d.last && started - d.lastInputAt < 100;
      const actions = cmd ? cmd.actions : held ? { ...d.last!.actions, sirenToggle: false, recover: false } : { ...neutralActions(), handbrake: true };
      inputs.set(d.entityId, { actions, sessionEpoch: d.epoch, sourceCommandSequence: d.last?.sequence ?? null });
    }
    this.sim.step(inputs); this.tick++;
    const events = this.sim.drainEvents(); if (events.length) this.broadcast('events', events);
    if (this.tick % 3 === 0) for (const client of this.clients) this.publish(client);
    const cost = performance.now() - started; serverMetrics.steps++; serverMetrics.maxStepMs = Math.max(serverMetrics.maxStepMs, cost); if (cost > 8) serverMetrics.slowSteps++;
  }
  private publish(client: Client, replacePropBaseline = false) {
    const d = this.drivers.get(client.sessionId); if (!d || !d.connected) return;
    const snapshot = this.sim.snapshot(client.sessionId);
    snapshot.paused=this.paused;
    const now = performance.now();
    snapshot.scores = snapshot.scores.map(score => {
      const connection = this.drivers.get(score.playerId);
      const fresh = connection?.connected && connection.latencyMeasuredAt !== null && now - connection.latencyMeasuredAt <= 3000;
      return { ...score, pingMs: fresh ? connection.pingMs : null };
    });
    snapshot.sessionEpoch = d.epoch; if (snapshot.local) snapshot.local.lastConsumedSequence = d.ack;
    snapshot.resetReason = d.reset; d.reset = undefined;
    const wire = d.propPublisher.filter(packSnapshot(snapshot),replacePropBaseline); serverMetrics.bytesPublished += JSON.stringify(wire).length;
    client.send('snapshot', wire);
  }
  async onDrop(client: Client) {
    const d = this.drivers.get(client.sessionId); if (!d) return;
    d.connected = false; d.latencyProbe = null; d.pingMs = null; d.latencyMeasuredAt = null; this.neutralize(client.sessionId); this.sim.setConnection(client.sessionId, 'reconnecting');
    this.updatePause();
    try { await this.allowReconnection(client, 10); } catch { /* onLeave performs final disposal. */ }
  }
  onReconnect(client: Client) {
    const d = this.drivers.get(client.sessionId); if (!d) return;
    // Preserve stable identity but replace the input epoch so old queued packets cannot resume.
    d.epoch = randomUUID(); d.connected = true; d.received = -1; d.ack = -1; d.last = null; d.queue = []; d.reset = 'reconnect';
    d.client = client; d.latencyProbe = null; d.pingMs = null; d.latencyMeasuredAt = null;
    d.menuOpen=false;d.hidden=false;this.recordActivity(d);this.emptySince=null;this.updatePause();
    this.sim.setConnection(client.sessionId, 'connected'); this.publish(client,true);
  }
  onLeave(client: Client) { this.drivers.delete(client.sessionId); if (!this.disposed) {this.sim?.removePlayer(client.sessionId);this.updatePause();} }
  onDispose() {
    if (this.disposed) { this.releaseAdmission(); return; }
    this.disposed = true;
    try { this.sim?.dispose(); }
    catch (error) { console.error('Failed to dispose room simulation', error); }
    finally { this.drivers.clear(); this.releaseAdmission(); }
  }
}
