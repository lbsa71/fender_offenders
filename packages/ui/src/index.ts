import type { DeviceKind, WorldSnapshot } from '@fender/contracts';
import './style.css';

export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause';
export type Menu = 'home' | 'pause' | 'settings' | null;
export interface UiSettings {
  masterVolume: number;
  musicVolume: number;
  effectsVolume: number;
  reducedShake: boolean;
  reducedFlash: boolean;
  vibration: boolean;
  quality: 'low' | 'medium' | 'high';
  stickDeadzone: number;
  triggerDeadzone: number;
  sensitivity: number;
  bindings: Record<string, string[]>;
}
export interface UiModel {
  snapshot?: WorldSnapshot | null;
  localPlayerId?: string | null;
  mode?: 'practice' | 'online';
  status?: string | { state?: string; kind?: string; reason?: string; message?: string };
  roomId?: string | null;
  device?: DeviceKind;
  recoverProgress?: number;
  unsupportedPad?: string | null;
  error?: string | null;
  pursuit?: { progress: number; complete?: boolean; message?: string } | null;
  pingMs?: number;
  canStart?: boolean;
}
export interface UiCallbacks {
  onPlay: (request: { mode: 'practice' | 'create' | 'join'; nickname: string; roomId?: string }) => void | Promise<void>;
  onResume?: () => void;
  onLeave?: () => void;
  onStartRound?: () => void;
  onRematch?: () => void;
  onSettings?: (settings: UiSettings) => void;
  onMenuVisibility?: (visible: boolean) => void;
}
const defaults: UiSettings = { masterVolume: .7, musicVolume: .3, effectsVolume: .8, reducedShake: false, reducedFlash: false, vibration: true, quality: 'medium', stickDeadzone: .16, triggerDeadzone: .08, sensitivity: 1, bindings: {} };
const errorMessages: Record<string, string> = {
  'room-full': 'All eight units are out on patrol. Try another room.', 'room-missing': 'That dispatch room has closed. Check the code or create a new one.',
  'version-mismatch': 'Your game version does not match this room. Refresh and try again.', 'invalid-name': 'Enter a callsign between 1 and 20 characters.',
  'server-shutdown': 'Dispatch is offline for maintenance. Try again shortly.', 'network-error': 'Dispatch could not be reached. Check your connection and retry.',
  'reconnect-expired': 'Your reserved seat expired. Join the room again to return to patrol.',
};
const statusName = (status: UiModel['status']) => typeof status === 'string' ? status : status?.state ?? status?.kind ?? 'idle';
const time = (seconds: number) => { const whole = Math.ceil(Math.max(0, seconds)); return `${Math.floor(whole / 60).toString().padStart(2, '0')}:${(whole % 60).toString().padStart(2, '0')}`; };
const number = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;

export function deriveHud(model: UiModel) {
  const snapshot = model.snapshot;
  const car = snapshot?.local?.vehicle ?? snapshot?.vehicles.find(vehicle => vehicle.playerId === model.localPlayerId);
  return { speed: car ? Math.round(Math.hypot(car.velocity.x, car.velocity.z) * 3.6) : 0, health: car?.health ?? 100,
    phase: snapshot?.phase ?? 'lobby', seconds: snapshot?.phaseEndsAtTick == null ? 0 : (snapshot.phaseEndsAtTick - snapshot.serverTick) / 60,
    status: car?.status ?? 'active', score: snapshot?.scores.find(score => score.playerId === model.localPlayerId)?.score ?? 0,
    respawn: car?.respawnAtTick == null || !snapshot ? 0 : Math.max(0, (car.respawnAtTick - snapshot.serverTick) / 60) };
}

export function mountGameUi(root: HTMLElement, callbacks: UiCallbacks) {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  let stored: Partial<UiSettings> = {};
  try { stored = JSON.parse(view?.localStorage.getItem('fender-settings-v1') ?? '{}') as Partial<UiSettings>; } catch { /* Storage is optional. */ }
  let settings: UiSettings = { ...defaults, ...stored, bindings: stored.bindings ?? {} };
  let model: UiModel = {};
  let menu: Menu = 'home';
  let previousMenu: Menu = 'home';
  let pending = false;
  let disposed = false;
  let resultDismissed = false;
  let bindingAction: string | null = null;
  let lastUnsupportedPad: string | null = null;
  const shell = doc.createElement('div'); shell.className = 'fo-ui';
  shell.innerHTML = `
    <div class="fo-grain" aria-hidden="true"></div>
    <header class="fo-top"><a class="fo-wordmark" href="#" aria-label="Fender Offenders home"><span class="fo-badge">FO</span><span>FENDER<br>OFFENDERS<span class="fo-edition">MOTOR DIVISION / 01</span></span></a><div class="fo-top-right"><span class="fo-connection"><i></i><span data-text="connection">LOCAL DISPATCH</span></span><button class="fo-icon" data-action="pause" aria-label="Open pause menu">Ⅱ</button></div></header>
    <section class="fo-hud" hidden aria-label="Driving dashboard"><div class="fo-round"><span data-text="phase">FREE PATROL</span><strong data-text="timer">05:00</strong></div><aside class="fo-scoreboard"><div class="fo-label">DISPATCH LEADERBOARD</div><ol data-scores></ol></aside><div class="fo-instruments"><div class="fo-speed"><strong data-text="speed">0</strong><span>KM/H</span></div><div class="fo-car-state"><div class="fo-label">UNIT INTEGRITY <b data-text="health">100%</b></div><div class="fo-health"><i></i></div><span data-text="ammo">AUTO / UNLIMITED AMMO</span></div></div><div class="fo-prompts" data-text="prompts">WASD DRIVE · SHIFT DRIFT · SPACE FIRE</div><div class="fo-recover" hidden><span>RECOVERING UNIT</span><progress max="1" value="0"></progress></div><div class="fo-pursuit" hidden><span data-text="pursuit">INTERCEPT THE SUSPECT</span><progress max="1" value="0"></progress></div><div class="fo-center-callout" hidden><span data-text="callout-label">STAND BY</span><strong data-text="callout">3</strong></div><button class="fo-invite" data-action="invite">COPY INVITE <span data-text="room"></span></button><button class="fo-start" data-action="start" hidden>START ROUND →</button></section>
    <div class="fo-menu-backdrop"></div><main class="fo-menu"><div class="fo-hero"><span class="fo-kicker">AN OPEN CASE. A FULL TANK.</span><h1>KEEP THE<br><em>PEACE.</em><br>CAUSE A<br><span>LITTLE CHAOS.</span></h1><p>A city full of bad drivers.<br>One very questionable police department.</p><div class="fo-stamp"><span>DISPATCH</span><strong>AUTHORIZED<br>EXCESSIVE FUN</strong><span>EST. 1987 ENERGY</span></div></div><section class="fo-panel" aria-label="Dispatch menu"><div class="fo-panel-heading"><span class="fo-kicker" data-text="panel-kicker">CITY MOTOR DIVISION</span><span class="fo-panel-no">FORM 01–FO</span></div><div class="fo-home"><h2>You're on duty.</h2><p class="fo-muted">Pick a callsign. Take the keys.</p><label class="fo-field">YOUR CALLSIGN<input name="nickname" maxlength="20" autocomplete="nickname" spellcheck="false" value="Officer Rookie" placeholder="Officer Rookie"></label><button class="fo-primary" data-action="practice"><span>HIT THE STREETS<small>Solo practice & pursuit challenge</small></span><b>↗</b></button><div class="fo-divider"><span>OR BRING BACKUP</span></div><div class="fo-actions"><button class="fo-secondary" data-action="create">CREATE ROOM <span>+</span></button><button class="fo-secondary" data-action="join-toggle">JOIN ROOM <span>→</span></button></div><form class="fo-join" hidden><label class="fo-field">ROOM CODE OR INVITE LINK<input name="room" maxlength="250" autocomplete="off" spellcheck="false" placeholder="Paste a code or invite link"></label><button class="fo-primary" type="submit">REPORT TO DISPATCH →</button></form><div class="fo-room-note">PRIVATE ROOMS · 2–8 DRIVERS · NO ACCOUNT NEEDED</div></div><div class="fo-pause" hidden><h2>Taking a breather?</h2><p class="fo-muted" data-text="pause-description">Your patrol is paused.</p><button class="fo-primary" data-action="resume">BACK ON PATROL →</button><button class="fo-secondary" data-action="leave">END PATROL <span>↗</span></button></div><div class="fo-settings" hidden><h2>Fine tuning.</h2><p class="fo-muted">Make this patrol yours.</p><div class="fo-settings-list"><label>Master volume<input type="range" data-setting="masterVolume" min="0" max="1" step=".05"></label><label>Music<input type="range" data-setting="musicVolume" min="0" max="1" step=".05"></label><label>Effects<input type="range" data-setting="effectsVolume" min="0" max="1" step=".05"></label><label>Graphics<select data-setting="quality"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Reduce camera shake<input type="checkbox" data-setting="reducedShake"></label><label>Reduce flashes<input type="checkbox" data-setting="reducedFlash"></label><label>Controller vibration<input type="checkbox" data-setting="vibration"></label><label>Stick dead zone<input type="range" data-setting="stickDeadzone" min=".05" max=".5" step=".01"></label><label>Trigger dead zone<input type="range" data-setting="triggerDeadzone" min="0" max=".5" step=".01"></label><label>Steering sensitivity<input type="range" data-setting="sensitivity" min=".4" max="1.8" step=".05"></label></div><details class="fo-bindings"><summary>KEYBOARD BINDINGS</summary><div data-bindings></div></details><button class="fo-secondary" data-action="settings-back">SAVE & BACK <span>↩</span></button></div><div class="fo-results" hidden><span class="fo-kicker">CASE CLOSED</span><h2 data-text="result-title">Patrol complete.</h2><p class="fo-muted">Final standings / confirmed by dispatch</p><ol data-results></ol><button class="fo-primary" data-action="rematch">ANOTHER ROUND →</button><button class="fo-secondary" data-action="leave">BACK TO DISPATCH <span>↗</span></button></div><div class="fo-notice" role="status" aria-live="polite" hidden></div><footer class="fo-panel-footer"><button class="fo-text-button" data-action="settings">SETTINGS & CONTROLS <span>⚙</span></button><span class="fo-input-hint" data-text="input-hint">↑ ↓ SELECT · ENTER CONFIRM</span></footer></section></main><footer class="fo-bottom"><span>MINOR INFRACTIONS. MAJOR COLLISIONS.</span><span>DRIVE FAST. FILE LATER.</span></footer><div class="fo-toast" role="status" aria-live="polite" hidden></div>`;
  root.append(shell);
  const one = <T extends HTMLElement = HTMLElement>(selector: string) => shell.querySelector<T>(selector)!;
  const all = <T extends HTMLElement = HTMLElement>(selector: string) => [...shell.querySelectorAll<T>(selector)];
  const write = (key: string, value: string) => { const node = one(`[data-text="${key}"]`); if (node.textContent !== value) node.textContent = value; };
  const hide = (selector: string, hidden: boolean) => { one(selector).hidden = hidden; };
  const nickname = one<HTMLInputElement>('[name="nickname"]');
  const roomInput = one<HTMLInputElement>('[name="room"]');
  const notify = (message: string) => { const node = one('.fo-notice'); node.textContent = message; node.hidden = !message; };
  const persist = () => { try { view?.localStorage.setItem('fender-settings-v1', JSON.stringify(settings)); } catch { /* Optional persistence. */ } callbacks.onSettings?.(structuredClone(settings)); };
  function focusFirst() { const focusable = visibleControls(); (focusable.find(node => node.matches('.fo-primary')) ?? focusable[0])?.focus({ preventScroll: true }); }
  function visibleControls() { return all<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLElement>('button,input,select,summary').filter(node => !node.closest('[hidden]') && !(node as HTMLButtonElement).disabled && !node.closest('.fo-hud') && !node.closest('.fo-top')); }
  function showMenu(next: Menu = 'pause') {
    if (next === 'settings') previousMenu = menu;
    menu = next;
    shell.classList.toggle('fo-is-playing', menu === null);
    shell.classList.toggle('fo-is-settings', menu === 'settings');
    hide('.fo-menu', menu === null); hide('.fo-menu-backdrop', menu === null); hide('.fo-hero', menu !== 'home'); hide('.fo-bottom', menu !== 'home');
    const results = model.snapshot?.phase === 'results' && !resultDismissed && menu !== 'settings';
    hide('.fo-home', menu !== 'home' || results); hide('.fo-pause', menu !== 'pause' || results); hide('.fo-settings', menu !== 'settings'); hide('.fo-results', !results);
    hide('[data-action="settings"]', menu === 'settings');
    write('pause-description', model.mode === 'online' ? 'THE MATCH IS STILL LIVE. Your unit is coasting with controls released.' : 'Your local patrol is paused. Take your time.');
    callbacks.onMenuVisibility?.(menu !== null);
    if (menu !== null) focusFirst();
  }
  function parseRoom(value: string): string {
    const cleaned = value.trim();
    try { const url = new URL(cleaned); return url.searchParams.get('room') ?? url.hash.replace(/^#/, '') ?? ''; } catch { return cleaned.replace(/^#/, ''); }
  }
  async function play(mode: 'practice' | 'create' | 'join') {
    if (pending) return;
    const name = nickname.value.trim(); const roomId = parseRoom(roomInput.value);
    if (!name) { notify('Your unit needs a callsign.'); nickname.focus(); return; }
    if (mode === 'join' && !roomId) { notify('Enter a room code or paste an invite link.'); roomInput.focus(); return; }
    pending = true; notify('Contacting dispatch…'); all<HTMLButtonElement>('.fo-home button').forEach(button => { button.disabled = true; });
    try { await callbacks.onPlay({ mode, nickname: name, ...(mode === 'join' ? { roomId } : {}) }); }
    catch (error) { notify(error instanceof Error ? error.message : 'Dispatch could not be reached. Try again.'); }
    finally { pending = false; if (!disposed) all<HTMLButtonElement>('.fo-home button').forEach(button => { button.disabled = false; }); }
  }
  const bindingDefaults: Record<string, string[]> = { throttle: ['KeyW'], brakeReverse: ['KeyS'], left: ['KeyA'], right: ['KeyD'], handbrake: ['ShiftLeft'], fire: ['Space'], siren: ['KeyE'], recover: ['KeyR'] };
  const bindingLabels: Record<string, string> = { throttle: 'Accelerate', brakeReverse: 'Brake / reverse', left: 'Steer left', right: 'Steer right', handbrake: 'Handbrake', fire: 'Fire', siren: 'Siren', recover: 'Hold to recover' };
  for (const [action, fallback] of Object.entries(bindingDefaults)) {
    const row = doc.createElement('label'); row.textContent = bindingLabels[action] ?? action;
    const button = doc.createElement('button'); button.type = 'button'; button.dataset.binding = action; button.textContent = (settings.bindings[action] ?? fallback).join(' / ').replaceAll('Key', ''); row.append(button); one('[data-bindings]').append(row);
  }
  for (const input of all<HTMLInputElement | HTMLSelectElement>('[data-setting]')) {
    const key = input.dataset.setting as keyof UiSettings;
    if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(settings[key]); else input.value = String(settings[key]);
  }
  const change = (event: Event) => {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    const key = input.dataset.setting as keyof UiSettings | undefined;
    if (!key) return;
    const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
    settings = { ...settings, [key]: value }; persist();
  };
  const click = (event: MouseEvent) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action],[data-binding]');
    if (!button) return;
    if (button.dataset.binding) { bindingAction = button.dataset.binding; button.textContent = 'PRESS A KEY…'; return; }
    switch (button.dataset.action) {
      case 'practice': void play('practice'); break;
      case 'create': void play('create'); break;
      case 'join-toggle': hide('.fo-join', !one('.fo-join').hidden); roomInput.focus(); break;
      case 'pause': if (model.snapshot) showMenu(menu === null ? 'pause' : null); break;
      case 'resume': showMenu(null); callbacks.onResume?.(); break;
      case 'leave': resultDismissed = true; callbacks.onLeave?.(); model = {}; showMenu('home'); hide('.fo-hud', true); notify(''); break;
      case 'settings': showMenu('settings'); break;
      case 'settings-back': showMenu(previousMenu); break;
      case 'start': callbacks.onStartRound?.(); break;
      case 'rematch': callbacks.onRematch?.(); break;
      case 'invite': { const url = new URL(view?.location.href ?? 'http://localhost'); url.searchParams.set('room', model.roomId ?? ''); void view?.navigator.clipboard?.writeText(url.href).then(() => toast('INVITE LINK COPIED. CALL IN BACKUP.')).catch(() => toast(`ROOM CODE: ${model.roomId ?? ''}`)); break; }
    }
  };
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function toast(message: string) { const node = one('.fo-toast'); node.textContent = message; node.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { node.hidden = true; }, 3500); }
  const submit = (event: SubmitEvent) => { event.preventDefault(); void play('join'); };
  const remapKey = (event: KeyboardEvent) => {
    if (!bindingAction) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const action = bindingAction; bindingAction = null;
    if (event.code !== 'Escape' && !['Enter', 'Tab'].includes(event.code)) settings.bindings[action] = [event.code];
    one(`[data-binding="${action}"]`).textContent = (settings.bindings[action] ?? bindingDefaults[action] ?? []).join(' / ').replaceAll('Key', ''); persist();
  };
  shell.addEventListener('click', click); shell.addEventListener('input', change); one('form').addEventListener('submit', submit); doc.addEventListener('keydown', remapKey, true);
  const scoreRows = new Map<string, HTMLLIElement>();
  function updateScores(target: HTMLOListElement, results: boolean) {
    const scores = [...(model.snapshot?.scores ?? [])].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
    if (results) target.replaceChildren();
    const liveIds = new Set(scores.map(score => score.playerId));
    if (!results) for (const [id, row] of scoreRows) if (!liveIds.has(id)) { row.remove(); scoreRows.delete(id); }
    scores.forEach((score, rank) => {
      let row = results ? undefined : scoreRows.get(score.playerId);
      if (!row) { row = doc.createElement('li'); row.innerHTML = '<span></span><span></span><strong></strong>'; if (!results) scoreRows.set(score.playerId, row); }
      row.classList.toggle('fo-you', score.playerId === model.localPlayerId);
      row.children[0]!.textContent = `${rank + 1}`;
      row.children[1]!.textContent = `${score.nickname}${score.playerId === model.localPlayerId ? ' / YOU' : ''}${score.connection === 'reconnecting' ? ' …' : ''}${results ? ` · ${score.wrecks} WRECKS` : ''}`;
      row.children[2]!.textContent = String(score.score); target.append(row);
    });
  }
  function update(next: UiModel) {
    const previousPhase = model.snapshot?.phase; model = { ...model, ...next };
    const snapshot = model.snapshot; const hud = deriveHud(model); const status = statusName(model.status);
    if (snapshot && menu === 'home' && status !== 'error') { resultDismissed = false; showMenu(null); notify(''); }
    if (snapshot?.phase === 'results' && previousPhase !== 'results') { resultDismissed = false; updateScores(one('[data-results]'), true); showMenu('pause'); }
    if (previousPhase === 'results' && snapshot?.phase !== 'results' && menu === 'pause') showMenu(null);
    hide('.fo-hud', !snapshot); write('speed', String(hud.speed)); write('health', `${Math.ceil(hud.health)}%`);
    one<HTMLElement>('.fo-health i').style.width = `${Math.max(0, Math.min(100, hud.health))}%`; one('.fo-health').classList.toggle('fo-low-health', hud.health < 30);
    write('phase', model.mode === 'practice' ? 'FREE PATROL / PURSUIT' : hud.phase === 'lobby' ? 'WAITING FOR BACKUP' : hud.phase === 'countdown' ? 'PATROL STARTING' : hud.phase === 'results' ? 'CASE CLOSED' : 'FREE-FOR-ALL');
    write('timer', hud.phase === 'lobby' ? 'STAND BY' : model.mode === 'practice' ? 'ON DUTY' : time(hud.seconds));
    write('connection', status === 'reconnecting' ? 'RECONNECTING…' : status === 'disconnected' ? 'DISPATCH LOST' : model.mode === 'online' ? `LIVE DISPATCH${model.pingMs === undefined ? '' : ` / ${Math.round(model.pingMs)} MS`}` : 'LOCAL DISPATCH');
    shell.classList.toggle('fo-reconnecting', status === 'reconnecting' || status === 'disconnected');
    write('room', model.roomId ? ` / ${model.roomId}` : ''); hide('.fo-invite', !model.roomId || model.mode !== 'online');
    hide('.fo-start', !snapshot || snapshot.phase !== 'lobby' || model.mode !== 'online' || model.canStart === false);
    write('prompts', model.device === 'gamepad' ? 'LEFT STICK DRIVE · RT/LT DRIVE/BRAKE · A DRIFT · RB FIRE · X SIREN · HOLD Y RECOVER' : 'WASD DRIVE · SHIFT DRIFT · SPACE FIRE · E SIREN · HOLD R RECOVER');
    write('input-hint', model.device === 'gamepad' ? '↕ SELECT · A CONFIRM · B BACK' : '↑ ↓ SELECT · ENTER CONFIRM');
    const recovery = number(model.recoverProgress ?? 0); hide('.fo-recover', recovery <= 0); one<HTMLProgressElement>('.fo-recover progress').value = recovery;
    const pursuit = model.pursuit ?? (snapshot?.pursuit ? { progress: snapshot.pursuit.progress, complete: snapshot.pursuit.state === 'complete' } : null);
    hide('.fo-pursuit', !pursuit); if (pursuit) { write('pursuit', 'message' in pursuit && pursuit.message ? pursuit.message : pursuit.complete ? 'SUSPECT CITED. PAPERWORK PENDING.' : 'INTERCEPT SUSPECT · MATCH SPEED TO ARREST'); one<HTMLProgressElement>('.fo-pursuit progress').value = pursuit.progress; }
    const showCallout = snapshot?.phase === 'countdown' || hud.status !== 'active'; hide('.fo-center-callout', !showCallout);
    write('callout-label', snapshot?.phase === 'countdown' ? 'READY TO ROLL?' : 'UNIT OUT OF ACTION'); write('callout', snapshot?.phase === 'countdown' ? String(Math.max(1, Math.ceil(hud.seconds))) : `BACK IN ${Math.ceil(hud.respawn)}…`);
    updateScores(one('[data-scores]'), false);
    const reason = typeof model.status === 'object' ? model.status.reason ?? model.status.message : undefined;
    const error = model.error ?? (status === 'error' ? reason ?? 'network-error' : null);
    if (error) { if (menu === null) showMenu('pause'); notify(errorMessages[error] ?? error); }
    if (model.unsupportedPad && model.unsupportedPad !== lastUnsupportedPad) toast('UNSUPPORTED CONTROLLER MAPPING — KEYBOARD CONTROLS AVAILABLE');
    lastUnsupportedPad = model.unsupportedPad ?? null;
  }
  function navigate(action: MenuAction) {
    if (action === 'pause' || action === 'back') {
      if (bindingAction) { bindingAction = null; return; }
      if (menu === 'settings') showMenu(previousMenu);
      else if (model.snapshot && model.snapshot.phase !== 'results') { showMenu(menu === null ? 'pause' : null); if (menu === null) callbacks.onResume?.(); }
      else if (!one('.fo-join').hidden) hide('.fo-join', true);
      return;
    }
    if (menu === null) { if (action === 'confirm' && model.snapshot?.phase === 'lobby') callbacks.onStartRound?.(); return; }
    const controls = visibleControls(); const focused = doc.activeElement as HTMLElement; let index = controls.indexOf(focused);
    if (action === 'up' || action === 'down') { index = (index + (action === 'down' ? 1 : -1) + controls.length) % controls.length; controls[index]?.focus(); controls[index]?.scrollIntoView({ block: 'nearest' }); }
    else if (action === 'confirm') {
      if (focused instanceof HTMLInputElement && ['text', ''].includes(focused.type)) { const next = controls[index + 1]; next?.focus(); }
      else focused?.click();
    } else if ((action === 'left' || action === 'right') && focused instanceof HTMLInputElement && focused.type === 'range') {
      focused.value = String(Math.max(Number(focused.min), Math.min(Number(focused.max), Number(focused.value) + (action === 'left' ? -1 : 1) * Number(focused.step || .05)))); focused.dispatchEvent(new Event('input', { bubbles: true }));
    } else if ((action === 'left' || action === 'right') && focused instanceof HTMLSelectElement) {
      focused.selectedIndex = Math.max(0, Math.min(focused.options.length - 1, focused.selectedIndex + (action === 'left' ? -1 : 1))); focused.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  // Invite links prefill the join flow, while preserving an intentional start action.
  const invitedRoom = new URLSearchParams(view?.location.search ?? '').get('room');
  if (invitedRoom) { roomInput.value = invitedRoom; hide('.fo-join', false); }
  showMenu('home'); callbacks.onSettings?.(structuredClone(settings));
  return { update, showMenu, navigate, getSettings: () => structuredClone(settings), setSettings: (next: Partial<UiSettings>) => {
    settings = { ...settings, ...next };
    for (const input of all<HTMLInputElement | HTMLSelectElement>('[data-setting]')) { const key = input.dataset.setting as keyof UiSettings; if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(settings[key]); else input.value = String(settings[key]); }
    persist();
  }, isMenuVisible: () => menu !== null,
    dispose: () => { disposed = true; clearTimeout(toastTimer); shell.removeEventListener('click', click); shell.removeEventListener('input', change); doc.removeEventListener('keydown', remapKey, true); shell.remove(); } };
}
