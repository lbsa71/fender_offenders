import { createGameRenderer } from '@fender/renderer';
import { districtMap, districtProps } from '@fender/content';
import { createSimulation, initPhysics, type Simulation } from '@fender/sim';
import { createInputSource, type InputSettings } from '@fender/input';
import { mountGameUi, type UiSettings } from '@fender/ui';
import { createOnlineSession } from '@fender/net-client';
import { isVehicleBodyId, neutralActions, type GameEvent, type RenderFrame, type SessionRequest, type SessionStatus, type WorldSnapshot } from '@fender/contracts';
import './style.css';

async function boot() {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
  const root = document.querySelector<HTMLElement>('#ui')!;
  const renderer = createGameRenderer(canvas, districtMap);
  await initPhysics();
  let local: Simulation | null = createSimulation(districtMap, { mode: 'practice', trafficCount: 8, props: districtProps });
  local.addPlayer({ playerId: 'preview', nickname: 'Preview', bodyAssetId: 'police' });
  let online: ReturnType<typeof createOnlineSession> | null = null;
  let input: ReturnType<typeof createInputSource> | undefined;
  let snapshot: WorldSnapshot | null = null, status: SessionStatus = { state: 'idle' };
  let active = false, mode: 'practice' | 'online' = 'practice', playerId = '', roomId = '', sequence = 0, clientTick = 0, epoch = '';
  let previousTime = performance.now(), accumulator = 0, hudAt = 0, stopped = false, animation = 0;
  let observedEvents: GameEvent[] = [];
  const frameDurations: number[] = [];
  const canStartDispatch = () => Boolean(snapshot && snapshot.scores[0]?.playerId === playerId && (snapshot.phase === 'results' || snapshot.scores.filter(score => score.connection === 'connected').length >= (mode === 'practice' ? 1 : 2)));
  function present(events: GameEvent[]) { renderer.present(events); observedEvents.push(...events); if (observedEvents.length > 100) observedEvents.splice(0, observedEvents.length - 100); }
  function applySettings(settings: UiSettings) {
    renderer.setSettings(settings);
    input?.setSettings({ stickDeadzone: settings.stickDeadzone, triggerDeadzone: settings.triggerDeadzone, sensitivity: settings.sensitivity, bindings: settings.bindings as InputSettings['bindings'] });
  }
  async function leave() {
    active = false; input?.setEnabled(false); snapshot = null; roomId = ''; playerId = ''; observedEvents = [];
    const old = online; online = null; await old?.dispose();
    local?.dispose(); local = createSimulation(districtMap, { mode: 'practice', trafficCount: 8, props: districtProps });
    local.addPlayer({ playerId: 'preview', nickname: 'Preview', bodyAssetId: 'police' });
    status = { state: 'idle' }; ui.update({ snapshot: null, status, roomId: null, error: null });
  }
  async function play(request: SessionRequest) {
    await renderer.unlockAudio();
    await leave();
    sequence = 0; clientTick = 0; accumulator = 0; epoch = crypto.randomUUID();
    if (request.mode === 'practice') {
      local?.dispose(); local = createSimulation(districtMap, { mode: 'practice', trafficCount: 8, pursuit: true, campaign: true, props: districtProps });
      playerId = 'local-player'; local.addPlayer({ playerId, nickname: request.nickname, sessionEpoch: epoch, bodyAssetId: request.vehicleBodyId ?? ui.getVehicle() });
      snapshot = local.snapshot(playerId); mode = 'practice'; status = { state: 'playing' }; active = true;
    } else {
      mode = 'online'; status = { state: 'connecting' }; ui.update({ status, error: null, snapshot: null });
      const serverUrl = import.meta.env.VITE_SERVER_URL || `${location.protocol}//${location.hostname}:${location.port === '5173' || location.port === '4173' ? '2567' : location.port || (location.protocol === 'https:' ? '443' : '80')}`;
      const session = createOnlineSession(serverUrl, districtMap); online = session;
      session.onSnapshot(s => { snapshot = s; if (epoch !== s.sessionEpoch) { epoch = s.sessionEpoch; sequence = 0; input?.resetHeldState(); } });
      session.onEvents(present); session.onStatus(s => { status = s; });
      try {
        const joined = await session.connect(request);
        playerId = joined.playerId; roomId = joined.roomId; epoch = joined.sessionEpoch; snapshot = joined.firstState; active = true;
        local?.dispose(); local = null;
      } catch (error) {
        const failedStatus: SessionStatus = { ...status, state: 'error', reason: status.reason ?? 'network-error', message: status.message ?? (error instanceof Error ? error.message : String(error)) };
        await session.dispose(); online = null; status = failedStatus;
        ui.update({ status, error: status.reason });
        return;
      }
    }
    ui.update({ snapshot, status, mode, localPlayerId: playerId, roomId, error: null, canStart: canStartDispatch() });
    ui.showMenu(null); input?.setEnabled(!ui.isMenuVisible() && snapshot?.phase !== 'lobby');
  }
  const ui = mountGameUi(root, {
    onPlay: play,
    onResume: () => { void renderer.unlockAudio(); },
    onLeave: () => { void leave(); },
    onStartRound: () => {
      if (online) online.request('start-round');
      else if (local?.startRound(playerId)) { snapshot = local.snapshot(playerId); ui.update({ snapshot }); }
    },
    onRematch: () => {
      if (mode === 'online') online?.request('rematch');
      else if (local && snapshot?.campaign) { local.rematch(playerId); snapshot = local.snapshot(playerId); ui.update({ snapshot }); }
      else void play({ mode: 'practice', nickname: snapshot?.scores.find(score => score.playerId === playerId)?.nickname ?? 'Officer Rookie', vehicleBodyId: ui.getVehicle() });
    },
    onSettings: applySettings,
    onVehicleChange: vehicleBodyId => {
      if (snapshot?.phase !== 'lobby') return;
      if (online) online.selectVehicle(vehicleBodyId);
      else if (local?.setPlayerVehicle(playerId, vehicleBodyId)) { snapshot = local.snapshot(playerId); ui.update({ snapshot, selectedVehicleBodyId: vehicleBodyId }); }
    },
    onMenuVisibility: visible => { input?.setEnabled(active && !visible && snapshot?.phase !== 'lobby'); if (visible) online?.neutralize(); },
  });
  input = createInputSource({ onNeutralize: () => online?.neutralize(), onMenuAction: action => ui.navigate(action) });
  applySettings(ui.getSettings());
  const resize = () => renderer.resize(); window.addEventListener('resize', resize);
  const visibility = () => { accumulator = 0; previousTime = performance.now(); input?.resetHeldState(); if (document.hidden) online?.neutralize(); };
  document.addEventListener('visibilitychange', visibility);
  function frame(now: number) {
    if (stopped) return;
    const dt = Math.min(.1, Math.max(0, (now - previousTime) / 1000)); previousTime = now;
    frameDurations.push(dt * 1000); if (frameDurations.length > 600) frameDurations.shift();
    input!.setEnabled(active && !ui.isMenuVisible() && snapshot?.phase !== 'lobby');
    input!.pollMenus();
    if (document.hidden) { animation = requestAnimationFrame(frame); return; }
    const paused = active && mode === 'practice' && ui.isMenuVisible();
    if (paused) accumulator = 0; else accumulator += dt;
    let steps = 0;
    while (accumulator >= 1 / 60 && steps++ < 4) {
      accumulator -= 1 / 60; clientTick++;
      const actions = active ? input!.sample() : neutralActions();
      if (online && active && snapshot) {
        const command = { sessionEpoch: epoch, sequence: sequence++, clientTick, actions }; online.submit(command);
      } else if (local) {
        const current = local.snapshot(active ? playerId : 'preview');
        const entity = current.local?.vehicle.entityId;
        local.step(entity ? new Map([[entity, { actions, sessionEpoch: epoch, sourceCommandSequence: sequence++ }]]) : new Map());
        const events = local.drainEvents(); if (active) { snapshot = local.snapshot(playerId); present(events); }
      }
    }
    if (accumulator > .25) accumulator = 0;
    let renderFrame: RenderFrame | null = online?.sampleFrame(now) ?? null;
    if (!renderFrame && local) {
      const state = local.snapshot(active ? playerId : 'preview');
      renderFrame = { sampleTimeSeconds: now / 1000, serverTick: state.serverTick, grenades: active && state.phase === 'playing' ? state.grenades ?? [] : [], vehicles: state.vehicles, projectiles: state.projectiles.map(projectile=>({...projectile,presentationAgeSeconds:Math.max(0,(state.serverTick-projectile.bornTick+1)/60)})), props: state.props, localEntityId: state.local?.vehicle.entityId ?? null, cameraTarget: state.local?.vehicle.pose ?? { x: 4, z: -48, yaw: 0 },
        pursuit: active && state.phase === 'playing' && state.pursuit?.state !== 'complete' ? state.pursuit : undefined };
    }
    renderer.setGaragePreview(!active || snapshot?.phase === 'lobby' ? ui.getVehicle() : null);
    if (renderFrame && (!active || ui.isMenuVisible())) renderFrame.pursuit = undefined;
    if (renderFrame) renderer.render(renderFrame, dt);
    ui.setTargetIndicator(active ? renderer.getTargetIndicator() : null);
    if (now - hudAt > 80) {
      hudAt = now; const device = input!.getStatus();
      ui.update({ snapshot: active ? snapshot : null, status, mode, localPlayerId: playerId, roomId, device: device.activeDevice, recoverProgress: device.recoverProgress, unsupportedPad: device.unsupportedPad,
        canStart: canStartDispatch(), pingMs: online?.getStats().rtt,
        selectedVehicleBodyId: snapshot?.local && isVehicleBodyId(snapshot.local.vehicle.bodyAssetId) ? snapshot.local.vehicle.bodyAssetId : undefined });
    }
    animation = requestAnimationFrame(frame);
  }
  animation = requestAnimationFrame(frame);
  if (import.meta.env.DEV) {
    Object.defineProperty(window, '__FENDER_DEBUG__', { configurable: true, value: Object.freeze({
      get snapshot() { return snapshot ? structuredClone(snapshot) : null; },
      get events() { return structuredClone(observedEvents); },
      get identity() { return { playerId, roomId, active, mode }; },
      get garage() { return { vehicleBodyId: ui.getVehicle(), visible: !active || snapshot?.phase === 'lobby' }; },
      get stats() { return { renderer: renderer.getStats(), network: online?.getStats(), frameDurations: [...frameDurations] }; },
      get input() { return input!.getStatus(); },
    }) });
  }
  const dispose = () => { stopped = true; cancelAnimationFrame(animation); input?.dispose(); ui.dispose(); renderer.dispose(); local?.dispose(); void online?.dispose(); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility); };
  import.meta.hot?.dispose(dispose);
}
boot().catch(error => {
  console.error(error);
  const node = document.createElement('main'); node.className = 'fatal-error';
  const title = document.createElement('h1'); title.textContent = 'Dispatch could not start.';
  const message = document.createElement('p'); message.textContent = error instanceof Error ? error.message : String(error);
  const button = document.createElement('button'); button.textContent = 'Reload'; button.onclick = () => location.reload();
  node.append(title, message, button); document.body.append(node);
});
