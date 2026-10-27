import { getDispatchFeatures, getStoryline, getCampaignDispatch, getCampaignMugshot, getCampaignTarget, getVehicleProfile, isInviteCode, isVehicleBodyId, randomCallsign, sanitizeNickname, VEHICLE_BODIES, type CampaignTarget, type DeviceKind, type TargetIndicator, type VehicleBodyId, type WorldSnapshot } from '@fender/contracts';
import './style.css';
import type { CampaignMugshotVariant } from '@fender/contracts';
import { controlGraphics, gamepadControls, keyboardBindings, keyboardControls } from './controls';
import { controlHints, placeControlCard } from './tutorial';
import type { ControlScheme, TouchControls } from '@fender/contracts';
import { mountTouchControls } from './touch';

export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause';
export type Menu = 'home' | 'pause' | 'settings' | 'help' | null;
export interface UiSettings {
  controlScheme: ControlScheme;
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
  status?: string | { state?: string; kind?: string; reason?: string; message?: string; idleRemainingMs?: number; notice?: { id: number; message: string } };
  roomId?: string | null;
  device?: DeviceKind;
  recoverProgress?: number;
  unsupportedPad?: string | null;
  error?: string | null;
  pursuit?: { progress: number; complete?: boolean; message?: string } | null;
  pingMs?: number;
  canStart?: boolean;
  selectedVehicleBodyId?: VehicleBodyId;
}
export interface UiCallbacks {
  onTouchInput?: (state: TouchControls) => void;
  onTouchCancel?: () => void;
  onPlay: (request: { nickname: string; roomId: string; vehicleBodyId?: VehicleBodyId }) => void | Promise<void>;
  onActivity?: () => void;
  onVehicleChange?: (vehicleBodyId: VehicleBodyId) => void;
  onResume?: () => void;
  onLeave?: () => void;
  onStartRound?: () => void;
  onRematch?: () => void;
  onSettings?: (settings: UiSettings) => void;
  onMenuVisibility?: (visible: boolean) => void;
}
const defaults: UiSettings = { controlScheme: 'auto', masterVolume: .7, musicVolume: .3, effectsVolume: .8, reducedShake: false, reducedFlash: false, vibration: true, quality: 'medium', stickDeadzone: .16, triggerDeadzone: .08, sensitivity: 1, bindings: {} };
const errorMessages: Record<string, string> = {
  'idle-timeout': 'Your unit was signed off after 15 minutes of inactivity. Enter the room again to continue if it is still available.',
  'invalid-vehicle': 'Choose a valid garage vehicle and try again.',
  'server-capacity': 'Dispatch is at capacity. Join an existing room or try creating one again shortly.',
  'room-full': 'All eight units are out on patrol. Try another room.', 'room-missing': 'That invite could not be opened. Check the code or link and try again.',
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
  const maxHealth = car?.maxHealth ?? getVehicleProfile(car?.bodyAssetId ?? 'patrol').maxHealth;
  return { speed: car ? Math.round(Math.hypot(car.velocity.x, car.velocity.z) * 3.6) : 0, health: car ? Math.max(0, Math.min(100, car.health / Math.max(1, maxHealth) * 100)) : 100,
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
  if (!['auto', 'touch', 'gamepad', 'keyboard'].includes(settings.controlScheme)) settings.controlScheme = 'auto';
  let model: UiModel = {};
  let targetIndicator: TargetIndicator | null = null;
  let targetAngle = 0;
  let menu: Menu = 'home';
  let previousMenu: Menu = 'home';
  let pending = false;
  let disposed = false;
  let resultDismissed = false;
  let bindingAction: string | null = null;
  let lastUnsupportedPad: string | null = null;
  const rollVehicle = (except?: VehicleBodyId): VehicleBodyId => { const choices = VEHICLE_BODIES.filter(id => id !== except); return choices[Math.floor(Math.random() * choices.length)]!; };
  let vehicle: VehicleBodyId;
  try { const saved = JSON.parse(view?.localStorage.getItem('fender-garage-v1') ?? 'null'); vehicle = isVehicleBodyId(saved?.vehicleBodyId) ? saved.vehicleBodyId : rollVehicle(); } catch { vehicle = rollVehicle(); }
  const persistVehicle = () => { try { view?.localStorage.setItem('fender-garage-v1', JSON.stringify({ vehicleBodyId: vehicle })); } catch { /* Garage remains usable without storage. */ } };
  persistVehicle();
  let awaitingVehicle: VehicleBodyId | null = null;
  const shell = doc.createElement('div'); shell.className = 'fo-ui';
  shell.innerHTML = `
    <div class="fo-grain" aria-hidden="true"></div>
    <header class="fo-top"><a class="fo-wordmark" href="#" aria-label="Fender Offenders home"><span class="fo-badge">FO</span><span>FENDER<br>OFFENDERS</span></a><div class="fo-top-right"><span class="fo-connection"><i></i><span data-text="connection">LOCAL DISPATCH</span></span><button class="fo-icon" data-action="pause" aria-label="Open pause menu">Ⅱ</button></div></header>
    <section class="fo-hud" hidden aria-label="Driving dashboard"><div class="fo-round"><span data-text="phase">FREE PATROL</span><strong data-text="timer">05:00</strong></div><div class="fo-instruments"><div class="fo-car-state"><div class="fo-label">UNIT <b data-text="health">100%</b></div><div class="fo-health" role="progressbar" aria-label="Vehicle integrity" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i></i></div><span data-text="ammo" hidden></span></div></div><div class="fo-prompts" data-text="prompts">WASD DRIVE · SHIFT DRIFT · SPACE FIRE</div><div class="fo-recover" hidden><span>RECOVERING UNIT</span><progress max="1" value="0"></progress></div><div class="fo-pursuit" hidden><span data-text="pursuit">INTERCEPT THE SUSPECT</span><progress max="1" value="0"></progress></div><div class="fo-center-callout" hidden><span data-text="callout-label">STAND BY</span><strong data-text="callout">3</strong></div><button class="fo-start" data-action="start" hidden>START ROUND →</button></section>
    <div class="fo-menu-backdrop"></div><main class="fo-menu"><div class="fo-hero" aria-hidden="true"></div><section class="fo-panel" aria-label="Dispatch menu"><div class="fo-home"><h2>You're on duty.</h2><p class="fo-muted">Pick a callsign. Take the keys.</p><label class="fo-field">YOUR CALLSIGN<input name="nickname" maxlength="20" autocomplete="nickname" spellcheck="false" value="Officer Rookie" placeholder="Officer Rookie"></label><button class="fo-primary" data-action="practice"><span>HIT THE STREETS<small>Play. Share the URL anytime.</small></span><b>↗</b></button></div><div class="fo-pause" hidden><h2>Taking a breather?</h2><p class="fo-muted" data-text="pause-description">Your patrol is paused.</p><button class="fo-primary" data-action="resume">BACK ON PATROL →</button><button class="fo-secondary" data-action="leave">END PATROL <span>↗</span></button></div><div class="fo-settings" hidden><h2>Fine tuning.</h2><p class="fo-muted">Make this patrol yours.</p><div class="fo-settings-list"><label>Master volume<input type="range" data-setting="masterVolume" min="0" max="1" step=".05"></label><label>Music<input type="range" data-setting="musicVolume" min="0" max="1" step=".05"></label><label>Effects<input type="range" data-setting="effectsVolume" min="0" max="1" step=".05"></label><label>Graphics<select data-setting="quality"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Reduce camera shake<input type="checkbox" data-setting="reducedShake"></label><label>Reduce flashes<input type="checkbox" data-setting="reducedFlash"></label><label>Controller vibration<input type="checkbox" data-setting="vibration"></label><label>Stick dead zone<input type="range" data-setting="stickDeadzone" min=".05" max=".5" step=".01"></label><label>Trigger dead zone<input type="range" data-setting="triggerDeadzone" min="0" max=".5" step=".01"></label><label>Steering sensitivity<input type="range" data-setting="sensitivity" min=".4" max="1.8" step=".05"></label></div><details class="fo-bindings"><summary>KEYBOARD BINDINGS</summary><div data-bindings></div></details><button class="fo-secondary" data-action="settings-back">SAVE & BACK <span>↩</span></button></div><div class="fo-results" hidden><span class="fo-kicker">CASE CLOSED</span><h2 data-text="result-title">Patrol complete.</h2><button class="fo-primary" data-action="rematch">ANOTHER ROUND →</button><button class="fo-secondary" data-action="leave">BACK TO DISPATCH <span>↗</span></button></div><div class="fo-notice" role="status" aria-live="polite" hidden></div><footer class="fo-panel-footer"><button class="fo-text-button" data-action="settings">SETTINGS & CONTROLS <span>⚙</span></button><span class="fo-input-hint" data-text="input-hint">↑ ↓ SELECT · ENTER CONFIRM</span></footer></section></main><button class="fo-invite" data-action="invite">INVITE URL</button><footer class="fo-bottom"><span>MINOR INFRACTIONS. MAJOR COLLISIONS.</span><span>DRIVE FAST. FILE LATER.</span></footer><div class="fo-toast" role="status" aria-live="polite" hidden></div>`;
  root.append(shell);
  const touchControls = mountTouchControls(shell, state => callbacks.onTouchInput?.(state), () => callbacks.onTouchCancel?.());
  const scheme = doc.createElement('label'); scheme.textContent = 'Control scheme';
  scheme.innerHTML += '<select data-setting="controlScheme" aria-label="Control scheme"><option value="auto">Automatic</option><option value="touch">Touch</option><option value="gamepad">Controller</option><option value="keyboard">Keyboard</option></select>';
  shell.querySelector('.fo-settings-list')!.prepend(scheme);
  const schemeHelp = doc.createElement('p'); schemeHelp.className = 'fo-control-help';
  schemeHelp.textContent = 'Automatic follows keyboard or controller use. Tap the play area to return to touch. Choose a control scheme to keep it fixed.';
  scheme.after(schemeHelp);
  const idleWarning=doc.createElement('section');idleWarning.className='fo-idle-warning';idleWarning.setAttribute('role','alert');idleWarning.hidden=true;idleWarning.innerHTML='<p>Your unit is idle. You will disconnect in one minute.</p><button data-action="stay-active">STAY ON PATROL</button>';shell.append(idleWarning);
  const one = <T extends HTMLElement = HTMLElement>(selector: string) => shell.querySelector<T>(selector)!;
  const all = <T extends HTMLElement = HTMLElement>(selector: string) => [...shell.querySelectorAll<T>(selector)];
  const tutorial = one('.fo-prompts'); tutorial.removeAttribute('data-text'); tutorial.hidden = true;
  const help = doc.createElement('div'); help.className = 'fo-help-view'; help.hidden = true;
  help.innerHTML = '<h2>Controls help.</h2><p class="fo-muted">A refresher from the motor pool. Close this guide when you are ready to roll.</p><section class="fo-controls-guide" aria-label="Driving controls"><section><h3>KEYBOARD</h3><div data-keyboard-controls></div></section><section><h3>CONTROLLER</h3><p class="fo-controller-note">Standard layout · A / X / Y labels</p><div data-gamepad-controls></div></section></section><button class="fo-secondary" data-action="help-back">BACK</button>';
  one('.fo-settings').after(help);
  const helpLesson = doc.createElement('p'); helpLesson.dataset.controlLesson = ''; helpLesson.className = 'fo-help-lesson'; help.querySelector('.fo-muted')!.after(helpLesson);
  const addHelpButton = (footer: HTMLElement) => {
    const button = doc.createElement('button'); button.className = 'fo-text-button fo-help-button'; button.dataset.action = 'help'; button.textContent = 'CONTROLS HELP'; footer.append(button);
  };
  addHelpButton(one('.fo-panel-footer'));
  let tutorialRemaining = 8000;
  let tutorialStarted: number | null = null;
  let tutorialTimer: ReturnType<typeof setTimeout> | undefined;
  let controlsViewKey = '';
  function updateControls() {
    updateTutorial();
    const device = controlDevice(), campaign = model.snapshot?.campaign;
    const weapons=campaign?getDispatchFeatures(campaign.dispatchIndex):null;
    const guns = weapons?.gunsEnabled ?? true;
    const reminder = currentReminder();
    const key = JSON.stringify([device, settings.bindings, guns, reminder]);
    if (key !== controlsViewKey) {
      controlsViewKey = key;
      help.querySelector('[data-keyboard-controls]')!.replaceChildren(keyboardControls(doc, settings.bindings));
      help.querySelector('[data-gamepad-controls]')!.replaceChildren(gamepadControls(doc));
      for(const [action,enabled] of [['fire',guns],['bomb',weapons?.bombsEnabled],['oil',weapons?.oilEnabled],['blades',weapons?.bladesEnabled]])help.querySelectorAll<HTMLElement>(`[data-control="${action}"]`).forEach(row=>{row.hidden=!enabled;});
      helpLesson.textContent = reminder; helpLesson.hidden = !reminder;
    }
    const visible = device !== 'touch' && !disposed && !doc.hidden && menu === null && model.snapshot?.phase === 'playing' && !model.snapshot.paused && !model.error
      && (model.mode !== 'online' || statusName(model.status) === 'playing') && tutorialRemaining > 0;
    if (!visible && tutorialStarted !== null) {
      tutorialRemaining = Math.max(0, tutorialRemaining - ((view?.performance.now() ?? Date.now()) - tutorialStarted));
      tutorialStarted = null; clearTimeout(tutorialTimer);
    }
    tutorial.hidden = !visible;
    positionControls();
    if (visible && tutorialStarted === null) {
      tutorialStarted = view?.performance.now() ?? Date.now();
      tutorialTimer = setTimeout(() => { tutorialRemaining = 0; tutorialStarted = null; updateControls(); }, tutorialRemaining);
    }
  }
  const targetBadge = doc.createElement('div'); targetBadge.className = 'fo-target-indicator'; targetBadge.hidden = true; targetBadge.setAttribute('role', 'img');
  targetBadge.innerHTML = '<span class="fo-target-arrow" aria-hidden="true"><svg viewBox="0 0 44 44"><path class="fo-target-chevron" d="m8 23 14-14 14 14"/><path class="fo-target-chevron" d="m8 36 14-14 14 14"/></svg></span><strong class="fo-target-label">WANTED SUSPECT</strong><span class="fo-target-distance"></span>';
  shell.append(targetBadge);
  const targetLabel = targetBadge.querySelector<HTMLElement>('.fo-target-label')!;
  const targetDistance = targetBadge.querySelector<HTMLElement>('.fo-target-distance')!;
  const arrestProgress = one<HTMLProgressElement>('.fo-pursuit progress'); arrestProgress.setAttribute('aria-label', 'Your arrest progress');
  const arrestHelp = doc.createElement('small'); arrestHelp.className = 'fo-arrest-help'; arrestHelp.textContent = 'Stay close & match speed · 3s'; one('.fo-pursuit').append(arrestHelp);
  const controls=one<HTMLElement>('.fo-prompts');controls.dataset.tutorialControls='';controls.setAttribute('aria-label','Driving controls');controls.setAttribute('role','group');controls.replaceChildren();
  const objectiveTitle=one<HTMLElement>('[data-text="pursuit"]');objectiveTitle.dataset.objectiveTitle='';arrestHelp.dataset.objectiveInstruction='';
  const markerGuidance=doc.createElement('span');markerGuidance.className='fo-marker-guidance';
  const markerProgress=doc.createElement('progress');markerProgress.max=1;markerProgress.setAttribute('aria-label','Your arrest progress at suspect');targetBadge.append(markerGuidance,markerProgress);
  let controlAnchor:{x:number;y:number}|null=null,badgeAnchor:{x:number;y:number}|null=null,controlKey='',controlWidth=252,controlHeight=116,shellWidth=view?.innerWidth??960,shellHeight=view?.innerHeight??720;
  const controlObserver=typeof ResizeObserver==='undefined'?null:new ResizeObserver(entries=>{for(const entry of entries){if(entry.target===shell){shellWidth=entry.contentRect.width;shellHeight=entry.contentRect.height;}else if(entry.contentRect.width){controlWidth=entry.borderBoxSize[0]?.inlineSize??entry.contentRect.width;controlHeight=entry.borderBoxSize[0]?.blockSize??entry.contentRect.height;}}positionControls();});
  controlObserver?.observe(shell);controlObserver?.observe(controls);
  function positionControls(){if(controls.hidden)return;const p=placeControlCard(controlAnchor??{x:.5,y:.55},shellWidth,shellHeight,controlWidth,controlHeight,targetBadge.hidden?null:badgeAnchor);controls.style.transform=`translate(${Math.round(p.x)}px,${Math.round(p.y)}px)`;}
  function setControlAnchor(anchor:{x:number;y:number}|null){controlAnchor=anchor;positionControls();}
  function briefLesson(index:number):string {
    return [
      'Catch up → match speed → stay close for 3 seconds. Arresting is automatic.',
      'Approach from behind or a flank. Police guns arrive next dispatch.',
      'Fire forward in short bursts. Bombs predict your route: leave the marked circle within 1 second.',
      'Puddles reduce grip. Steer gently; enemy bombs lead your route and explode after 0.8 seconds.',
      'Bomb ahead. A black chopper bombs your route: shoot toward its amber ground marker to down it for this dispatch.',
      'Suspect oil: steer around marked patches.',
      'Amber hubcaps warn of blades. Give them room.',
      'Drop oil behind you after a cutoff.',
      'Use side blades. A black chopper returns: shoot toward its amber ground marker to down it for this dispatch.',
      'Dodge fast bombs. A black chopper returns: shoot toward its amber ground marker to down it for this dispatch.',
    ][index]??'';
  }
  function currentReminder() {
    const index = model.snapshot?.campaign?.dispatchIndex;
    if(index!==undefined&&index>=4)return getDispatchFeatures(index).lesson;
    return index === undefined ? '' : ['Arresting is automatic. Stay close and match speed.', 'Suspect guns: approach from behind or a flank. Police guns arrive next dispatch.', 'Fire forward in short bursts. Bombs: leave the marked circle.', 'Puddles reduce grip. Steer gently.'][index] ?? '';
  }
  function updateTutorial(){
    const campaign=model.snapshot?.campaign,features=campaign?getDispatchFeatures(campaign.dispatchIndex):null,guns=features?.gunsEnabled??Boolean(model.snapshot);
    touchControls.setGunsEnabled(guns);touchControls.setWeaponsEnabled(features??{});
    controls.classList.toggle('fo-snow-controls',features?.winterRoads===true);
    const reminder=features?.winterRoads?'SNOW + ICE: brake early. Frozen puddles are even slicker. Steer gently.':campaign&&campaign.dispatchIndex>0?briefLesson(campaign.dispatchIndex):'',device=controlDevice(),hints=controlHints(device,settings.bindings,guns,features??{}),key=JSON.stringify({device,hints,reminder});
    if(key!==controlKey){controlKey=key;controls.replaceChildren(controlGraphics(doc,hints,device));if(reminder){const tip=doc.createElement('p');tip.dataset.controlLesson='';tip.textContent=reminder;controls.append(tip);}const tip=doc.createElement('small');tip.className='fo-tutorial-dismiss';tip.textContent=(device==='gamepad'?'MENU':'ESC')+' · CONTROLS';controls.append(tip);}
    for(const [action,enabled] of [['fire',guns],['bomb',features?.bombsEnabled],['oil',features?.oilEnabled],['blades',features?.bladesEnabled]]){const button=one(`[data-binding="${action}"]`);if(button.parentElement)button.parentElement.hidden=!enabled;}
    const cooldown=Math.max(0,Math.ceil(((model.snapshot?.local?.driver.nextDeployTick??0)-(model.snapshot?.serverTick??0))/60));
    write('ammo',cooldown?`GEAR ${cooldown}s`:'');hide('[data-text="ammo"]',!features?.bombsEnabled||cooldown===0);positionControls();
  }
  const resultOutcome = doc.createElement('p'); resultOutcome.className = 'fo-result-outcome'; resultOutcome.hidden = true; one('.fo-results h2').after(resultOutcome);
  one('.fo-home .fo-muted').textContent = 'Take the keys. Cause a little paperwork.';
  one('.fo-home [data-action="practice"] small').textContent = 'Play. Share the URL anytime.';
  const garage = doc.createElement('section'); garage.className = 'fo-garage'; garage.setAttribute('aria-label', 'Vehicle comparison');
  garage.innerHTML = '<header class="fo-garage-heading"><h1>ON THEIR TAIL.</h1></header><div class="fo-vehicle-comparison"><article class="fo-garage-card" data-vehicle-comparison="unit"><span class="fo-kicker">YOUR UNIT</span><h2 data-text="vehicle-name"></h2><span class="fo-vehicle-role" data-text="vehicle-role"></span><button type="button" data-action="reassign">REASSIGN VEHICLE</button></article><article class="fo-garage-card fo-suspect-card" data-vehicle-comparison="suspect"><span class="fo-kicker">SUSPECT CAR</span><h2 data-text="suspect-vehicle-name"></h2><span class="fo-vehicle-role" data-text="suspect-vehicle-role"></span></article></div>';
  shell.append(garage);
  one('[data-text="vehicle-name"]').setAttribute('aria-live','polite');
  const briefing = doc.createElement('section'); briefing.className = 'fo-campaign-briefing'; briefing.hidden = true; briefing.setAttribute('aria-label', 'Campaign dispatch briefing');
  briefing.innerHTML = '<header><span class="fo-kicker" data-campaign-series></span><h2 data-campaign-title></h2></header><div class="fo-campaign-scroll"><div class="fo-campaign-target"><div class="fo-campaign-portrait" role="img"></div><div><span class="fo-campaign-role"></span><h3 data-campaign-name></h3><strong data-campaign-alias></strong><span data-campaign-target-car></span></div></div><p data-campaign-briefing></p></div><footer><button class="fo-primary" data-action="campaign-start">START DISPATCH →</button><span class="fo-campaign-wait" hidden>RECONNECT TO CONTINUE</span><button class="fo-text-button" data-action="settings">SETTINGS & CONTROLS <span>⚙</span></button></footer>';
  shell.append(briefing);
  addHelpButton(briefing.querySelector('footer')!);
  const lesson=doc.createElement('section');lesson.className='fo-tutorial-lesson';lesson.dataset.tutorialLesson='';lesson.setAttribute('role','status');lesson.setAttribute('aria-live','polite');lesson.innerHTML='<strong></strong><p></p>';
  let lessonKey='';
  briefing.querySelector('[data-campaign-briefing]')!.after(lesson);
  const campaignResolution = doc.createElement('section'); campaignResolution.className = 'fo-campaign-resolution'; campaignResolution.hidden = true; campaignResolution.setAttribute('aria-label', 'Campaign dispatch resolution');
  campaignResolution.innerHTML = '<div class="fo-campaign-target"><div class="fo-campaign-portrait" role="img"></div><div><h3 data-campaign-result-name></h3><strong data-campaign-result-alias></strong></div></div><h3 class="fo-campaign-resolution-label"></h3>';
  resultOutcome.after(campaignResolution);
  const latestLead = doc.createElement('section'); latestLead.className = 'fo-campaign-new-lead'; latestLead.hidden = true; latestLead.innerHTML = '<span class="fo-kicker">NEW LEAD</span><p></p>'; campaignResolution.querySelector('.fo-campaign-resolution-label')!.after(latestLead);
  const campaignWait = doc.createElement('p'); campaignWait.className = 'fo-campaign-wait'; campaignWait.hidden = true; campaignWait.textContent = 'RECONNECT TO CONTINUE'; one('[data-action="rematch"]').after(campaignWait);
  let campaignViewKey = '';
  const write = (key: string, value: string) => { const node = one(`[data-text="${key}"]`); if (node.textContent !== value) node.textContent = value; };
  const hide = (selector: string, hidden: boolean) => { one(selector).hidden = hidden; };
  const connectivityIcon = doc.createElement('span'); connectivityIcon.className = 'fo-connectivity-icon';
  connectivityIcon.setAttribute('role', 'img'); connectivityIcon.setAttribute('aria-live', 'polite');
  connectivityIcon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 8a15 15 0 0 1 18 0M6 11.5a10 10 0 0 1 12 0M9 15a5 5 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="19" r="1.3" fill="currentColor"/><path class="fo-wifi-slash" d="m3 3 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  one('.fo-connection i').replaceWith(connectivityIcon);
  const nickname = one<HTMLInputElement>('[name="nickname"]');
  const normalizeCallsign = (value: unknown) => { try { return sanitizeNickname(value); } catch { return ''; } };
  let savedCallsign = '';
  try { const saved = JSON.parse(view?.localStorage.getItem('fender-callsign-v1') ?? 'null'); savedCallsign = normalizeCallsign(typeof saved === 'string' ? saved : saved?.nickname); } catch { /* An unavailable or malformed store still gets an in-memory identity. */ }
  nickname.value = savedCallsign || randomCallsign(); nickname.placeholder = 'Make it memorable';
  const persistCallsign = () => { const name = normalizeCallsign(nickname.value); if (name) try { view?.localStorage.setItem('fender-callsign-v1', JSON.stringify({ nickname: name })); } catch { /* Callsigns also work without storage. */ } return name; };
  persistCallsign();
  const reroll = doc.createElement('button'); reroll.type = 'button'; reroll.className = 'fo-reroll-callsign'; reroll.dataset.action = 'reroll-callsign'; reroll.textContent = 'REROLL CALLSIGN'; nickname.closest('.fo-field')!.after(reroll);
  const notify = (message: string) => { const node = one('.fo-notice'); node.textContent = message; node.hidden = !message; };
  const persist = () => { shell.classList.toggle('fo-reduced-motion', settings.reducedShake); try { view?.localStorage.setItem('fender-settings-v1', JSON.stringify(settings)); } catch { /* Optional persistence. */ } callbacks.onSettings?.(structuredClone(settings)); };
  function focusFirst() { const focusable = visibleControls(); (focusable.find(node => node.matches('.fo-primary')) ?? focusable[0])?.focus({ preventScroll: true }); }
  const lobby = () => model.snapshot?.phase === 'lobby' && (model.mode === 'online' || Boolean(model.snapshot.campaign));
  const hasResult = (candidate = model) => candidate.snapshot?.phase === 'results' || !candidate.snapshot?.campaign && candidate.mode === 'practice' && candidate.snapshot?.pursuit?.state === 'complete';
  const controlDevice = () => settings.controlScheme === 'auto' ? model.device ?? ((view?.navigator.maxTouchPoints ?? 0) > 0 ? 'touch' : 'keyboard') : settings.controlScheme;
  function updateTouchVisibility() {
    const visible = controlDevice() === 'touch' && menu === null && Boolean(model.snapshot) && !lobby() && !hasResult() && !['reconnecting', 'disconnected', 'error'].includes(statusName(model.status));
    touchControls.setVisible(visible); shell.classList.toggle('fo-touch-active', visible);
  }
  const canDispatch = () => model.canStart !== false && (model.mode !== 'online' || ['lobby', 'playing'].includes(statusName(model.status)));
  function updateCampaignVisibility() {
    const campaign = model.snapshot?.campaign;
    briefing.hidden = !campaign || !lobby() || menu !== null;
    campaignResolution.hidden = !campaign || !hasResult();
    shell.classList.toggle('fo-campaign-briefing-open', !briefing.hidden);
    shell.classList.toggle('fo-campaign-results', Boolean(campaign && hasResult() && menu !== 'settings' && menu !== 'help'));
  }
  function portrait(node: HTMLElement, target: CampaignTarget, variant: CampaignMugshotVariant = 'briefing') {
    if (node.dataset.target !== target.id || node.dataset.variant !== variant) {
      node.innerHTML = getCampaignMugshot(target.id, variant); node.dataset.target = target.id; node.dataset.variant = variant;
    }
    node.setAttribute('aria-label', variant === 'briefing' ? `${target.name}, “${target.alias}”, ${target.role}` : `${node.querySelector('svg')!.getAttribute('aria-label')}, ${target.role}`);
  }
  function officer(playerId: string) { return model.snapshot?.scores.find(score => score.playerId === playerId)?.nickname ?? 'Departed officer'; }
  function updateCampaign() {
    updateCampaignVisibility();
    const campaign = model.snapshot?.campaign;
    if (!campaign) { campaignViewKey = ''; campaignWait.hidden = true; one<HTMLButtonElement>('[data-action="rematch"]').disabled = false; delete resultOutcome.dataset.outcome; return; }
    const key = JSON.stringify([campaign, model.snapshot?.phase, model.mode, model.canStart, statusName(model.status), pending, model.snapshot?.scores.map(score => [score.playerId, score.nickname])]);
    if (key === campaignViewKey) return; campaignViewKey = key;
    const story=getStoryline(campaign.campaignId),dispatch=getCampaignDispatch(campaign);
    const target = getCampaignTarget(dispatch.targetId), resolution = campaign.outcomes.find(outcome => outcome.dispatchIndex === campaign.dispatchIndex);
    const features=getDispatchFeatures(campaign.dispatchIndex),tip=briefLesson(campaign.dispatchIndex);
    const nextLesson=features.lessonTitle+tip;
    if(lessonKey!==nextLesson){lessonKey=nextLesson;lesson.querySelector('strong')!.textContent=features.lessonTitle;lesson.querySelector('p')!.textContent=tip;}
    lesson.hidden=!tip;
    const complete = campaign.status === 'complete';
    briefing.querySelector<HTMLElement>('[data-campaign-series]')!.textContent = story.title;
    briefing.querySelector<HTMLElement>('[data-campaign-title]')!.textContent = dispatch.title.replace(/^\d+\s*·\s*/, '');
    portrait(briefing.querySelector<HTMLElement>('.fo-campaign-portrait')!,target);
    portrait(campaignResolution.querySelector<HTMLElement>('.fo-campaign-portrait')!, target, resolution?.outcome ?? 'escaped');
    campaignResolution.querySelector<HTMLElement>('[data-campaign-result-name]')!.textContent = target.name;
    campaignResolution.querySelector<HTMLElement>('[data-campaign-result-alias]')!.textContent = `“${target.alias}”`;
    briefing.querySelector<HTMLElement>('[data-campaign-name]')!.textContent=target.name;
    briefing.querySelector<HTMLElement>('[data-campaign-alias]')!.textContent=`“${target.alias}”`;
    briefing.querySelector<HTMLElement>('.fo-campaign-role')!.textContent=target.role;
    briefing.querySelector<HTMLElement>('[data-campaign-target-car]')!.textContent = `SUSPECT VEHICLE / ${getVehicleProfile(target.vehicleBodyId).name}`;
    briefing.querySelector<HTMLElement>('[data-campaign-briefing]')!.textContent=features.arrestOnly?dispatch.briefing.replace(' Arrest him or wreck the getaway car.',''):dispatch.briefing;
    latestLead.hidden = !resolution;
    latestLead.querySelector('.fo-kicker')!.textContent = complete ? 'STREETS REOPENED' : 'NEXT LEAD';
    latestLead.querySelector('p')!.textContent = resolution ? dispatch.reveal : '';
    const start = one<HTMLButtonElement>('[data-action="campaign-start"]'); start.disabled = pending || !canDispatch();
    briefing.querySelector<HTMLElement>('.fo-campaign-wait')!.hidden = canDispatch();
    const stamp=campaignResolution.querySelector<HTMLElement>('.fo-campaign-resolution-label')!;
    stamp.textContent=resolution&&campaign.dispatchIndex===0&&resolution.outcome==='arrested'?'ARREST CERTIFIED':'';
    stamp.hidden=!stamp.textContent;
    if (hasResult()) {
      write('result-title', complete ? 'The racket is exposed.' : resolution?.outcome==='arrested' ? 'Suspect apprehended.' : resolution ? 'Getaway stopped.' : 'Suspect escaped.');
      one('.fo-results>.fo-kicker').textContent = complete ? story.title : 'CASE CLOSED';
      resultOutcome.hidden = false; resultOutcome.dataset.outcome = resolution?.outcome ?? 'pending';
      resultOutcome.textContent = complete ? 'CASE CLOSED. NICE WORK.' : resolution ? `${resolution.outcome === 'arrested' ? '✓ ARRESTED' : '✕ WRECKED'} · ${target.alias.toUpperCase()} · ${(resolution.callsign ?? officer(resolution.playerId)).toUpperCase()}` : 'TIME UP · SUSPECT ESCAPED';
      const next = one<HTMLButtonElement>('[data-action="rematch"]'); next.disabled = !canDispatch();
      next.textContent = !canDispatch() ? 'RECONNECT TO CONTINUE' : complete ? 'ANOTHER CASE →' : resolution ? 'NEXT BRIEFING →' : 'RETRY DISPATCH →';
      campaignWait.hidden = canDispatch();
    }
  }
  function updateTargetBadge() {
    const snapshot = model.snapshot, pursuit = snapshot?.pursuit;
    const connected = model.mode !== 'online' || statusName(model.status) === 'playing';
    const allowed = !disposed && menu === null && snapshot?.phase === 'playing' && pursuit && pursuit.state !== 'complete' && connected && !model.error && snapshot.vehicles.some(v => v.entityId === pursuit.suspectId && v.status !== 'respawning');
    const indicator = targetIndicator;
    targetBadge.hidden = !allowed || !indicator || ![indicator.x, indicator.y, indicator.angle, indicator.distanceMeters].every(Number.isFinite);
    if (targetBadge.hidden || !indicator) return;
    targetBadge.dataset.offscreen = String(indicator.offscreen);
    // The position is applied directly every frame. The former CSS left/top transition was retargeted on each
    // write, which made Blink's style recalculation grow for the whole dispatch and read as worsening frame drops.
    targetBadge.style.setProperty('--target-x', `${Math.max(0, Math.min(1, indicator.x)) * 100}%`);
    const safeY=indicator.offscreen && indicator.x<.35 ? Math.max(indicator.y,Math.min(.65,(shellWidth<=740?390:340)/shellHeight)) : indicator.y;
    targetBadge.style.setProperty('--target-y', `${Math.max(0, Math.min(1, safeY)) * 100}%`);badgeAnchor={x:indicator.x,y:safeY};
    targetAngle += Math.atan2(Math.sin(indicator.angle - targetAngle), Math.cos(indicator.angle - targetAngle));
    targetBadge.style.setProperty('--target-angle', `${targetAngle}rad`);
    const label = indicator.offscreen ? 'SUSPECT' : 'WANTED SUSPECT', meters = Math.max(0, Math.min(99999, Math.round(indicator.distanceMeters)));
    if (targetLabel.textContent !== label) targetLabel.textContent = label;
    if (targetDistance.textContent !== `${meters} m`) targetDistance.textContent = `${meters} m`;
    const accessible = `Wanted suspect, ${meters} meters away, ${indicator.offscreen ? 'off screen' : 'on screen'}`;
    if (targetBadge.getAttribute('aria-label') !== accessible) targetBadge.setAttribute('aria-label', accessible);
  }
  function setTargetIndicator(indicator: TargetIndicator | null) { targetIndicator = indicator; updateTargetBadge(); }
  const canReassign = () => !pending && menu === null && lobby() && ['lobby', 'playing'].includes(statusName(model.status));
  function visibleControls() { return all<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLElement>('button,input,select,summary').filter(node => !node.closest('[hidden]') && !(node as HTMLButtonElement).disabled && (!node.closest('.fo-hud') || lobby() && node.matches('[data-action="start"],[data-action="invite"]')) && !node.closest('.fo-top')); }
  function updateGarage() {
    const visible = menu === null && lobby();
    garage.hidden = !visible;
    shell.classList.toggle('fo-in-garage', visible);
    shell.classList.toggle('fo-lobby', visible && lobby());
    garage.dataset.vehicle = vehicle;
    const profile=getVehicleProfile(vehicle);
    write('vehicle-name',profile.name);write('vehicle-role',profile.role);
    const campaign=model.snapshot?.campaign,suspectCard=one('[data-vehicle-comparison="suspect"]');
    suspectCard.hidden=!campaign;
    if(campaign){
      const target=getCampaignTarget(getCampaignDispatch(campaign).targetId),suspect=getVehicleProfile(target.vehicleBodyId);
      write('suspect-vehicle-name',suspect.name);write('suspect-vehicle-role',suspect.role);
    }
    one<HTMLButtonElement>('[data-action="reassign"]').disabled = !canReassign();
  }
  function showMenu(next: Menu = 'pause') {
    if(persistentToast && (next===null || next==='home'))clearToast();
    if (next === 'settings' || next === 'help') previousMenu = menu;
    menu = next;
    shell.classList.toggle('fo-is-playing', menu === null);
    shell.classList.toggle('fo-is-settings', menu === 'settings');
    shell.classList.toggle('fo-is-help', menu === 'help');
    hide('.fo-menu', menu === null); hide('.fo-menu-backdrop', menu === null); hide('.fo-hero', menu !== 'home'); hide('.fo-bottom', true); hide('.fo-hud', !model.snapshot || lobby() || menu !== null);
    const results = hasResult() && !resultDismissed && menu !== 'settings' && menu !== 'help';
    hide('.fo-home', menu !== 'home' || results); hide('.fo-pause', menu !== 'pause' || results); hide('.fo-settings', menu !== 'settings'); hide('.fo-results', !results);
    help.hidden = menu !== 'help';
    hide('[data-action="settings"]', menu === 'settings' || menu === 'help');
    one('.fo-panel-footer .fo-help-button').hidden = menu === 'settings' || menu === 'help';
    write('pause-description', model.snapshot?.paused ? 'Your patrol is paused while you are alone. Backup joining resumes the dispatch.' : 'THE DISPATCH IS LIVE. Your unit has its controls released.');
    callbacks.onMenuVisibility?.(menu !== null || lobby());
    updateGarage();
    updateCampaignVisibility();
    updateTargetBadge();updateTutorial();
    updateControls();
    updateTouchVisibility();
    if (menu !== null) focusFirst();
  }
  async function play() {
    if (pending) return;
    const name = persistCallsign(); const url = new URL(view?.location.href ?? 'http://localhost');
    const roomId = url.searchParams.get('room') ?? '';
    if (!name) { notify('Your unit needs a callsign.'); nickname.focus(); return; }
    nickname.value = name;
    if (!isInviteCode(roomId)) { notify(errorMessages['room-missing']); nickname.focus(); return; }
    url.searchParams.set('room',roomId); view?.history.replaceState(null,'',url);
    pending = true; notify('Contacting dispatch…'); all<HTMLButtonElement>('.fo-home button').forEach(button => { button.disabled = true; });
    updateGarage();
    try { persistVehicle(); await callbacks.onPlay({ nickname: name, vehicleBodyId: vehicle, roomId }); }
    catch (error) { notify(error instanceof Error ? error.message : 'Dispatch could not be reached. Try again.'); }
    finally { pending = false; if (!disposed) { all<HTMLButtonElement>('.fo-home button').forEach(button => { button.disabled = false; }); updateGarage(); updateCampaign(); if (model.snapshot?.campaign && lobby() && menu === null) focusFirst(); } }
  }
  const bindingDefaults = keyboardBindings;
  const bindingLabels: Record<string, string> = { throttle: 'Accelerate', brakeReverse: 'Brake / reverse', left: 'Steer left', right: 'Steer right', handbrake: 'Handbrake', fire: 'Fire', bomb: 'Throw bomb', oil: 'Drop oil', blades: 'Extend blades', siren: 'Siren', recover: 'Hold to recover' };
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
    if (input === nickname) { persistCallsign(); return; }
    const key = input.dataset.setting as keyof UiSettings | undefined;
    if (!key) return;
    const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
    settings = { ...settings, [key]: value }; persist();
  };
  const click = (event: MouseEvent) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action],[data-binding]');
    if (!button) return;
    callbacks.onActivity?.();
    if (button.dataset.binding) { bindingAction = button.dataset.binding; button.textContent = 'PRESS A KEY…'; return; }
    switch (button.dataset.action) {
      case 'stay-active': callbacks.onActivity?.();break;
      case 'practice': void play(); break;
      case 'reroll-callsign': {
        const current = normalizeCallsign(nickname.value); let next = current;
        for (let attempt = 0; attempt < 8 && next === current; attempt++) next = randomCallsign();
        if (next === current) { next = randomCallsign(() => 0); if (next === current) next = randomCallsign(() => 1); }
        nickname.value = next; persistCallsign(); break;
      }
      case 'reassign': if (canReassign()) { vehicle = rollVehicle(vehicle); awaitingVehicle = lobby() ? vehicle : null; persistVehicle(); updateGarage(); callbacks.onVehicleChange?.(vehicle); } break;
      case 'pause': if (model.snapshot) showMenu(menu === null ? 'pause' : null); break;
      case 'resume': showMenu(null); callbacks.onResume?.(); break;
      case 'leave': resultDismissed = true; callbacks.onLeave?.(); model = {}; showMenu('home'); hide('.fo-hud', true); notify(''); break;
      case 'settings': showMenu('settings'); break;
      case 'settings-back': showMenu(previousMenu); break;
      case 'help': showMenu('help'); break;
      case 'help-back': showMenu(previousMenu); break;
      case 'start': callbacks.onStartRound?.(); break;
      case 'campaign-start': if (canDispatch()) callbacks.onStartRound?.(); break;
      case 'rematch': callbacks.onRematch?.(); break;
      case 'invite': void copyInvite(); break;
    }
  };
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let persistentToast=false,lastNoticeId:number|null=null;
  function clearToast(){clearTimeout(toastTimer);one('.fo-toast').hidden=true;persistentToast=false;}
  function toast(message: string, persistent=false) { const node = one('.fo-toast'); node.textContent = message; node.hidden = false; clearTimeout(toastTimer);persistentToast=persistent;if(!persistent)toastTimer=setTimeout(clearToast,3500); }
  async function copyInvite() {
    const url = view?.location.href, clipboard = view?.navigator.clipboard;
    const manual = () => toast('Copy this page’s address to invite a friend.');
    if (!url || !clipboard?.writeText) { manual(); return; }
    try { await clipboard.writeText(url); toast('INVITE URL COPIED.'); } catch { manual(); }
  }
  const remapKey = (event: KeyboardEvent) => {
    if (!bindingAction) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const action = bindingAction; bindingAction = null;
    if (event.code !== 'Escape' && !['Enter', 'Tab'].includes(event.code)) settings.bindings[action] = [event.code];
    one(`[data-binding="${action}"]`).textContent = (settings.bindings[action] ?? bindingDefaults[action] ?? []).join(' / ').replaceAll('Key', ''); persist(); updateControls();
  };
  shell.addEventListener('click', click); shell.addEventListener('input', change); doc.addEventListener('keydown', remapKey, true);
  doc.addEventListener('visibilitychange', updateControls);
  function update(next: UiModel) {
    const previousReason=typeof model.status==='object'?model.status.reason:undefined;
    const previousPaused=model.snapshot?.paused; const previousEpoch = model.snapshot?.sessionEpoch, previousResult = hasResult(), previousDispatch = model.snapshot?.campaign?.dispatchIndex; const wasLobby = lobby(); model = { ...model, ...next };
    if (wasLobby && !lobby() && model.snapshot?.campaign) { clearTimeout(toastTimer); hide('.fo-toast', true); }
    if (wasLobby !== lobby()) callbacks.onMenuVisibility?.(menu !== null || lobby());
    const leavingWithPending = wasLobby && !lobby() && awaitingVehicle !== null;
    const interrupted = ['reconnecting', 'disconnected', 'error'].includes(statusName(model.status));
    const epochChanged = previousEpoch !== undefined && previousEpoch !== model.snapshot?.sessionEpoch;
    if (interrupted || epochChanged || leavingWithPending) awaitingVehicle = null;
    const authoritative = next.selectedVehicleBodyId ?? next.snapshot?.local?.vehicle.bodyAssetId;
    if ((lobby() || leavingWithPending) && isVehicleBodyId(authoritative)) {
      if (authoritative === awaitingVehicle) awaitingVehicle = null;
      if (!awaitingVehicle && vehicle !== authoritative) { vehicle = authoritative; persistVehicle(); }
    }
    if (!lobby()) awaitingVehicle = null;
    shell.classList.toggle('fo-online', model.mode === 'online');
    if(previousPaused===false && model.snapshot?.paused && persistentToast)clearToast();
    const snapshot = model.snapshot; const hud = deriveHud(model); const status = statusName(model.status);
    if (snapshot && menu === 'home' && status !== 'error') { resultDismissed = false; showMenu(null); notify(''); }
    if (hasResult() && !previousResult) { resultDismissed = false; showMenu('pause'); }
    if (previousResult && !hasResult() && menu === 'pause') showMenu(null);
    hide('.fo-hud', !snapshot || lobby() || menu !== null); write('health', `${Math.ceil(hud.health)}%`);
    one('.fo-health').setAttribute('aria-valuenow',String(Math.ceil(hud.health)));
    one<HTMLElement>('.fo-health i').style.width = `${Math.max(0, Math.min(100, hud.health))}%`; one('.fo-health').classList.toggle('fo-low-health', hud.health < 30);
    write('pause-description', snapshot?.paused ? 'Your patrol is paused while you are alone. Backup joining resumes the dispatch.' : 'THE DISPATCH IS LIVE. Your unit has its controls released.');
    const sessionStatus=typeof model.status==='object'?model.status:undefined;
    const notice=sessionStatus?.notice;
    if(!notice)lastNoticeId=null;
    else if(notice.id!==lastNoticeId){lastNoticeId=notice.id;if(!snapshot?.paused && (snapshot?.scores.filter(score=>score.connection==='connected').length??0)>1)toast(notice.message,menu!==null);}
    idleWarning.hidden=!sessionStatus?.idleRemainingMs;
    if(sessionStatus?.reason==='idle-timeout' && previousReason!=='idle-timeout' && menu!== 'home'){showMenu('pause');notify(errorMessages['idle-timeout']);}
    write('phase',hud.phase==='countdown'?'GET READY':'TIME LEFT');
    write('timer', hud.phase === 'lobby' ? 'STAND BY' : model.mode === 'practice' && !snapshot?.campaign ? 'ON DUTY' : time(hud.seconds));
    const remoteConnection = model.mode === 'online' && status !== 'idle';
    const reconnecting = remoteConnection && status === 'reconnecting';
    const connectionLost = remoteConnection && (status === 'disconnected' || status === 'error');
    const connecting = remoteConnection && status === 'connecting';
    const connectionLabel = !remoteConnection ? 'Local practice' : reconnecting ? 'Reconnecting' : connectionLost ? 'Connection lost' : connecting ? 'Connecting' : 'Connected';
    connectivityIcon.setAttribute('aria-label', connectionLabel);
    const connection = one('.fo-connection');
    connection.classList.toggle('fo-connection-local', !remoteConnection);
    connection.classList.toggle('fo-connection-reconnecting', reconnecting);
    connection.classList.toggle('fo-connection-broken', connectionLost);
    connection.classList.toggle('fo-connection-connecting', connecting);
    write('connection', connectionLabel);one('[data-text="connection"]').hidden=!reconnecting&&!connectionLost&&!connecting;
    shell.classList.toggle('fo-reconnecting', reconnecting);

    hide('.fo-start', !snapshot || snapshot.phase !== 'lobby' || model.mode !== 'online' || model.canStart === false || Boolean(snapshot.campaign));
    updateTutorial();
    write('input-hint', controlDevice() === 'touch' ? 'TAP TO SELECT' : controlDevice() === 'gamepad' ? '↕ SELECT · A CONFIRM · B BACK' : '↑ ↓ SELECT · ENTER CONFIRM');
    const recovery = number(model.recoverProgress ?? 0); hide('.fo-recover', recovery <= 0); one<HTMLProgressElement>('.fo-recover progress').value = recovery;
    const authorityPursuit = snapshot?.pursuit;
    const pursuit = authorityPursuit ? { progress: authorityPursuit.progress, complete: authorityPursuit.state === 'complete' } : model.pursuit;
    hide('.fo-pursuit', !pursuit || snapshot?.phase !== 'playing' || Boolean(pursuit.complete));
    if (pursuit) {
      const own = authorityPursuit?.contenders?.find(contender => contender.playerId === model.localPlayerId)?.progress;
      const progress = Math.max(0, Math.min(1, number(own ?? (model.mode === 'practice' || authorityPursuit?.arrestingPlayerId === model.localPlayerId ? pursuit.progress : 0))));
      const chapter=snapshot?.campaign?getCampaignDispatch(snapshot.campaign):null;
      const name=chapter?getCampaignTarget(chapter.targetId).name.split(' ')[0]!.toUpperCase():'THE SUSPECT';
      write('pursuit', `APPREHEND ${name}`);
      arrestHelp.textContent = 'Catch up → match speed → stay close for 3 seconds.';
      const guidance=authorityPursuit?.contenders?.find(c=>c.playerId===model.localPlayerId)?.guidance;
      const labels={'get-closer':'Get closer','match-speed':'Match speed','clear-obstruction':'Clear the obstruction','hold-steady':'Hold steady','unavailable':'Return to your unit'};
      markerGuidance.textContent=guidance?labels[guidance]:'Get closer';markerProgress.value=progress;
      arrestProgress.value = progress;
    }
    const showCallout = snapshot?.phase === 'countdown' || hud.status !== 'active'; hide('.fo-center-callout', !showCallout);
    write('callout-label', snapshot?.phase === 'countdown' ? 'READY TO ROLL?' : 'UNIT OUT OF ACTION'); write('callout', snapshot?.phase === 'countdown' ? String(Math.max(1, Math.ceil(hud.seconds))) : `BACK IN ${Math.ceil(hud.respawn)}…`);
    if (hasResult() && !snapshot?.campaign) {
      const winnerId = authorityPursuit?.winnerPlayerId;
      const practiceClosed = model.mode === 'practice' && authorityPursuit?.state === 'complete';
      const winner = snapshot?.scores.find(score => score.playerId === winnerId)?.nickname ?? (winnerId === model.localPlayerId ? 'YOUR UNIT' : 'ANOTHER UNIT');
      write('result-title', authorityPursuit ? winnerId || practiceClosed ? 'Suspect apprehended.' : 'Suspect escaped.' : 'Patrol complete.');
      one('.fo-results>.fo-kicker').textContent = authorityPursuit && !winnerId && !practiceClosed ? 'TIME UP' : 'CASE CLOSED';
      resultOutcome.hidden = !authorityPursuit;
      resultOutcome.textContent = winnerId ? `APPREHENDED BY ${winner.toUpperCase()}${winnerId === model.localPlayerId ? ' / YOU' : ''}` : practiceClosed ? 'SUSPECT IN CUSTODY. GOOD WORK, OFFICER.' : 'TIME UP · SUSPECT ESCAPED';
      one('[data-action="rematch"]').textContent = model.mode === 'practice' ? 'NEW DISPATCH →' : 'ANOTHER ROUND →';
    }
    const reason = typeof model.status === 'object' ? model.status.reason ?? model.status.message : undefined;
    const error = model.error ?? (status === 'error' ? reason ?? 'network-error' : null);
    if (error) { if (menu === null) showMenu('pause'); notify(errorMessages[error] ?? error); }
    if (model.unsupportedPad && model.unsupportedPad !== lastUnsupportedPad) toast('UNSUPPORTED CONTROLLER MAPPING — CHOOSE TOUCH OR KEYBOARD IN SETTINGS');
    lastUnsupportedPad = model.unsupportedPad ?? null;
    updateGarage();
    updateCampaign();
    updateTargetBadge();
    updateControls();
    updateTouchVisibility();
    if (snapshot?.campaign && lobby() && menu === null && (!wasLobby || previousDispatch !== snapshot.campaign.dispatchIndex)) focusFirst();
  }
  function navigate(action: MenuAction) {
    callbacks.onActivity?.();
    if (action === 'pause' || action === 'back') {
      if (bindingAction) { bindingAction = null; return; }
      if (menu === 'settings' || menu === 'help') showMenu(previousMenu);
      else if (model.snapshot && !hasResult()) { showMenu(menu === null ? 'pause' : null); if (menu === null) callbacks.onResume?.(); }
      return;
    }
    if (menu === null && !lobby()) return;
    if (menu === null && lobby() && action === 'confirm' && !visibleControls().includes(doc.activeElement as HTMLElement)) { if (canDispatch()) callbacks.onStartRound?.(); else focusFirst(); return; }
    const controls = visibleControls(); const focused = doc.activeElement as HTMLElement; let index = controls.indexOf(focused);
    if (action === 'up' || action === 'down') { index = (index + (action === 'down' ? 1 : -1) + controls.length) % controls.length; controls[index]?.focus(); controls[index]?.scrollIntoView({ block: 'nearest' }); }
    else if (action === 'confirm') {
      if (focused instanceof HTMLInputElement && ['text', ''].includes(focused.type)) { const next = focused === nickname ? one('[data-action="practice"]') : controls[index + 1]; next?.focus(); }
      else focused?.click();
    } else if ((action === 'left' || action === 'right') && focused instanceof HTMLInputElement && focused.type === 'range') {
      focused.value = String(Math.max(Number(focused.min), Math.min(Number(focused.max), Number(focused.value) + (action === 'left' ? -1 : 1) * Number(focused.step || .05)))); focused.dispatchEvent(new Event('input', { bubbles: true }));
    } else if ((action === 'left' || action === 'right') && focused instanceof HTMLSelectElement) {
      focused.selectedIndex = Math.max(0, Math.min(focused.options.length - 1, focused.selectedIndex + (action === 'left' ? -1 : 1))); focused.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  showMenu('home'); shell.classList.toggle('fo-reduced-motion', settings.reducedShake); callbacks.onSettings?.(structuredClone(settings));
  return { update, showMenu, navigate, setTargetIndicator, setControlAnchor, resetTouchControls: touchControls.reset, getVehicle: () => vehicle, getSettings: () => structuredClone(settings), setSettings: (next: Partial<UiSettings>) => {
    settings = { ...settings, ...next };
    for (const input of all<HTMLInputElement | HTMLSelectElement>('[data-setting]')) { const key = input.dataset.setting as keyof UiSettings; if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(settings[key]); else input.value = String(settings[key]); }
    persist(); updateControls();
  }, isMenuVisible: () => menu !== null || lobby(), isMenuOpen: () => menu !== null,
    dispose: () => { disposed = true; controlObserver?.disconnect(); clearTimeout(toastTimer); clearTimeout(tutorialTimer); touchControls.dispose(); shell.removeEventListener('click', click); shell.removeEventListener('input', change); doc.removeEventListener('keydown', remapKey, true); doc.removeEventListener('visibilitychange', updateControls); shell.remove(); } };
}
