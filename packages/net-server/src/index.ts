import { Room, ServerError, matchMaker, type Client } from '@colyseus/core';
import { randomInt, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { districtMap, districtProps, districtSnowbanks, VEHICLE_BODIES } from '@fender/content';
import { createSimulation, initPhysics, type Simulation } from '@fender/sim';
import { GAMEPLAY_REVISION, PROTOCOL_VERSION, STORYLINES, isStorylineId, getVehicleProfile, isInputCommand, isInviteCode, isRecord, isVehicleBodyId, neutralActions, packSnapshot, sanitizeNickname, type AppliedDriverInput, type InputCommand, type LocalVehicleMotion, type VehicleBodyId, type VehicleState, type WorldSnapshot } from '@fender/contracts';
import { createPropPublisher } from './prop-publisher.js';
import { ContactLedger } from './contact-ledger.js';
import { roomRegistry, serverMetrics } from './room-registry.js';
export { roomRegistry, serverMetrics, getRoomMetrics } from './room-registry.js';
export { createPropPublisher } from './prop-publisher.js';

interface DriverConnection { epoch: string; entityId: string; queue: InputCommand[]; last: InputCommand | null; ack: number; received: number; lastInputAt: number; connected: boolean; windowStart: number; packets: number; reset?: WorldSnapshot['resetReason']; client: Client; latencyProbe: { nonce: string; sentAt: number } | null; pingMs: number | null; latencyMeasuredAt: number | null; propPublisher:ReturnType<typeof createPropPublisher>; menuOpen: boolean; hidden: boolean; lastActivityAt: number; activityNoticeAt: number; idleWarned: boolean; localDriving: boolean; motion: LocalVehicleMotion | null; pendingMotion: LocalVehicleMotion | null; motionAt: number; motionBudget: { distance: number; at: number } | null; contacts: ContactLedger; }
function validLocalMotion(value: unknown, command: InputCommand, vehicle: VehicleState, driver: DriverConnection, previousSequence: number, now: number): value is LocalVehicleMotion {
  if (!isRecord(value) || value.sequence !== command.sequence || value.discontinuityId !== vehicle.discontinuityId || !isRecord(value.pose) || !isRecord(value.velocity) || vehicle.status !== 'active') return false;
  const { pose, velocity } = value;
  if (![pose.x, pose.z, pose.yaw, velocity.x, velocity.z, velocity.yawRate].every(n => typeof n === 'number' && Number.isFinite(n))) return false;
  const x = pose.x as number, z = pose.z as number, maxSpeed = getVehicleProfile(vehicle.bodyAssetId).topSpeed * 28 / 24;
  if (Math.abs(pose.yaw as number) > Math.PI + .001 || Math.hypot(velocity.x as number, velocity.z as number) > maxSpeed * 1.25 + 2 || Math.abs(velocity.yawRate as number) > 12 || x < districtMap.bounds.minX || x > districtMap.bounds.maxX || z < districtMap.bounds.minZ || z > districtMap.bounds.maxZ) return false;
  // Compare consecutive reports even when a network burst arrives before the
  // next world tick. Client sequence duration permits that burst, never a teleport.
  const previous = driver.motion?.discontinuityId === vehicle.discontinuityId ? driver.motion : null;
  const seconds = Math.min(.3, Math.max((now - driver.motionAt) / 1000, (command.sequence - (previous?.sequence ?? previousSequence)) / 60));
  const origin = previous?.pose ?? vehicle.pose;
  const distance = Math.hypot(x - origin.x, z - origin.z);
  if (distance > maxSpeed * Math.max(1 / 60, seconds) + .25) return false;
  // A bounded allowance absorbs ordered packet bursts. Only elapsed server
  // time replenishes it; extra command IDs or packets cannot buy more travel.
  const capacity = maxSpeed + .25, budget = driver.motionBudget;
  const available = budget ? Math.min(capacity, budget.distance + Math.max(0, now - budget.at) / 1000 * maxSpeed) : capacity;
  if (distance > available) return false;
  driver.motionBudget = { distance: available - distance, at: now };
  return true;
}
export class DrivingRoom extends Room {
  maxClients = 8;
  private sim!: Simulation;
  private initialDebugDispatch:number|null=null;
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
  debugDispatch(dispatch:number,campaignId?:string){return this.sim.debugDispatch(dispatch,campaignId);}
  private releaseAdmission() {
    roomRegistry.release(this);
  }
  protected chooseCampaignId(excluding?:string):string{const choices=STORYLINES.filter(story=>story.id!==excluding);return choices[randomInt(choices.length)]!.id;}
  protected initialCampaignId():string{return this.chooseCampaignId();}
  async onCreate(options?: unknown) {
    const launch=isRecord(options)?options:{};
    if(launch.debugDispatch!==undefined&&(!Number.isInteger(launch.debugDispatch)||(launch.debugDispatch as number)<1||(launch.debugDispatch as number)>10))throw new ServerError(400,'invalid-debug-dispatch');
    if(launch.debugCase!==undefined&&(launch.debugDispatch===undefined||!isStorylineId(launch.debugCase)))throw new ServerError(400,'invalid-debug-case');
    this.initialDebugDispatch=typeof launch.debugDispatch==='number'?launch.debugDispatch:null;

    if (isRecord(options) && 'inviteCode' in options) {
      if (!isInviteCode(options.inviteCode)) throw new ServerError(400, 'Invalid invite code');
      this.roomId = options.inviteCode;
    }
    await roomRegistry.reserve(this);
    try {
      await initPhysics();
      if (this.disposed) throw new ServerError(503, 'Dispatch creation expired');
      this.setPrivate(true);
      this.sim = createSimulation(districtMap, { mode: 'multiplayer', matchId: this.roomId, trafficCount: 8, pursuit: true, campaign: true, campaignId:typeof launch.debugCase==='string'?launch.debugCase:this.initialCampaignId(), props: districtProps, snowbanks:districtSnowbanks });
      this.maxMessagesPerSecond = 100;
      this.onMessage('input', (client, message: unknown) => {
        const driver = this.drivers.get(client.sessionId);
        if (!driver || !driver.connected || !isRecord(message) || !Array.isArray(message.commands) || message.commands.length > 4) { serverMetrics.rejectedInputs++; return; }
        const now = performance.now();
        if (now - driver.windowStart > 1000) { driver.windowStart = now; driver.packets = 0; }
        if (++driver.packets > 65) { serverMetrics.rejectedInputs++; return; }
        const previousSequence = driver.received;
        let latest: InputCommand | null = null;
        for (const command of message.commands) {
          if (!isInputCommand(command) || command.sessionEpoch !== driver.epoch || command.sequence <= driver.received || command.sequence > driver.received + 600) { serverMetrics.rejectedInputs++; continue; }
          driver.received = command.sequence; driver.lastInputAt = now;
          latest = command;
          if (!driver.menuOpen && !driver.hidden && !this.paused) {
            driver.queue.push(command);
            if(Object.values(command.actions).some(value=>typeof value==='number'?Math.abs(value)>.001:value===true))this.recordActivity(driver);
          } else driver.ack=command.sequence;
        }
        if (message.motion !== undefined && latest && !driver.menuOpen && !driver.hidden && !this.paused) {
          const vehicle = this.sim.authority(client.sessionId)?.vehicle;
          if(vehicle)driver.contacts.sync(vehicle.discontinuityId);
          const motion=driver.contacts.adjust(message.motion);
          if (vehicle && motion && validLocalMotion(motion, latest, vehicle, driver, previousSequence, now)) {
            driver.motion = driver.pendingMotion = { sequence: motion.sequence, discontinuityId: motion.discontinuityId, pose: { ...motion.pose }, velocity: { ...motion.velocity }, contactRevision:motion.contactRevision };
            driver.localDriving = true; driver.motionAt = now;
          } else {
            serverMetrics.rejectedInputs++;
            if (vehicle && isRecord(message.motion) && message.motion.discontinuityId === vehicle.discontinuityId && this.sim.correctLocalMotion(client.sessionId)) {
              this.neutralize(client.sessionId);
              // Wait for a corrected local baseline. Old-life packets cannot
              // steer the server or trigger repeated correction generations.
              driver.localDriving = true; driver.reset = 'resync'; this.publish(client, true);
            }
          }
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
      this.onMessage('rematch', client => {const campaign=this.sim.snapshot().campaign,next=campaign?.status==='complete'?this.chooseCampaignId(campaign.campaignId):undefined;if(this.sim.rematch(client.sessionId,next))this.touch(client.sessionId);});
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
    if(this.initialDebugDispatch!==null){this.sim.debugDispatch(this.initialDebugDispatch);this.initialDebugDispatch=null;}
    this.drivers.set(client.sessionId, { epoch, entityId: car.entityId, queue: [], last: null, ack: -1, received: -1, lastInputAt: 0, connected: true, windowStart: performance.now(), packets: 0, reset: 'join', client, latencyProbe: null, pingMs: null, latencyMeasuredAt: null, propPublisher:createPropPublisher(),menuOpen:false,hidden:false,lastActivityAt:this.wallNow(),activityNoticeAt:-Infinity,idleWarned:false,localDriving:false,motion:null,pendingMotion:null,motionAt:performance.now(),motionBudget:null,contacts:new ContactLedger(car.discontinuityId) });
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
    d.localDriving = false; d.motion = d.pendingMotion = null; d.motionAt = performance.now();
  }
  private step() {
    const started = performance.now();
    const inputs = new Map<string, AppliedDriverInput>();
    for (const d of this.drivers.values()) {
      const interactive=d.connected&&!d.menuOpen&&!d.hidden;
      // A held-input tick can run before its next network packet arrives. Do not
      // let those timing gaps permanently add latency to every later command.
      const consumed = interactive ? d.queue.splice(0, d.localDriving ? d.queue.length : Math.max(1, d.queue.length - 2)) : [];
      const latest = consumed.at(-1);
      const cmd = latest && { ...latest, actions: {
        ...latest.actions,
        sirenToggle: consumed.reduce((toggle, entry) => toggle !== entry.actions.sirenToggle, false),
        recover: consumed.some(entry => entry.actions.recover),
        deploy: consumed.find(entry => entry.actions.deploy)?.actions.deploy,
      } };
      if (cmd) { d.last = cmd; d.ack = cmd.sequence; }
      const held = interactive && d.last && started - d.lastInputAt < 100;
      const localDriving = interactive && d.localDriving && started - d.motionAt < 100 && d.motion?.discontinuityId === this.sim.authority(d.client.sessionId)?.vehicle.discontinuityId;
      const actions = d.localDriving && !localDriving ? { ...neutralActions(), handbrake: true } : cmd ? cmd.actions : held ? { ...d.last!.actions, sirenToggle: false, recover: false, deploy: undefined } : { ...neutralActions(), handbrake: true };
      inputs.set(d.entityId, { actions, sessionEpoch: d.epoch, sourceCommandSequence: d.last?.sequence ?? null, ...(localDriving ? { localDriving: true, ...(d.pendingMotion ? { motion: d.pendingMotion } : {}) } : {}) });
      d.pendingMotion = null;
    }
    const contacts=this.sim.step(inputs); this.tick++;
    for(const delta of contacts){
      const driver=[...this.drivers.values()].find(d=>d.entityId===delta.entityId);
      if(!driver)continue;
      driver.contacts.record(delta);
      // Reports already in flight carry an older contact acknowledgment. Keep
      // their validation anchor in the corrected frame so they cannot undo it.
      if(driver.motion)driver.motion=driver.contacts.adjust(driver.motion);
    }
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
    snapshot.sessionEpoch = d.epoch;
    if (snapshot.local) {
      snapshot.local.lastConsumedSequence = d.ack;
      d.contacts.sync(snapshot.local.vehicle.discontinuityId);snapshot.local.contact=d.contacts.state;
    }
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
    d.localDriving = false; d.motion = d.pendingMotion = null; d.motionAt = performance.now();
    d.contacts=new ContactLedger(this.sim.authority(client.sessionId)!.vehicle.discontinuityId);
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
