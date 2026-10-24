import { CAMPAIGN_BOSSES, CAMPAIGN_DISPATCHES, CAMPAIGN_TITLE, getBossTactics, getCampaignMugshot, getCampaignTarget, getVehicleProfile, isVehicleBodyId, randomCallsign, sanitizeNickname, VEHICLE_BODIES, type CampaignState, type CampaignTarget, type DeviceKind, type TargetIndicator, type VehicleBodyId, type WorldSnapshot } from '@fender/contracts';
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
  selectedVehicleBodyId?: VehicleBodyId;
}
export interface UiCallbacks {
  onPlay: (request: { mode: 'practice' | 'create' | 'join'; nickname: string; roomId?: string; vehicleBodyId?: VehicleBodyId }) => void | Promise<void>;
  onVehicleChange?: (vehicleBodyId: VehicleBodyId) => void;
  onResume?: () => void;
  onLeave?: () => void;
  onStartRound?: () => void;
  onRematch?: () => void;
  onSettings?: (settings: UiSettings) => void;
  onMenuVisibility?: (visible: boolean) => void;
}
const defaults: UiSettings = { masterVolume: .7, musicVolume: .3, effectsVolume: .8, reducedShake: false, reducedFlash: false, vibration: true, quality: 'medium', stickDeadzone: .16, triggerDeadzone: .08, sensitivity: 1, bindings: {} };
const errorMessages: Record<string, string> = {
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
    <header class="fo-top"><a class="fo-wordmark" href="#" aria-label="Fender Offenders home"><span class="fo-badge">FO</span><span>FENDER<br>OFFENDERS<span class="fo-edition">MOTOR DIVISION / 01</span></span></a><div class="fo-top-right"><span class="fo-connection"><i></i><span data-text="connection">LOCAL DISPATCH</span></span><button class="fo-icon" data-action="pause" aria-label="Open pause menu">Ⅱ</button></div></header>
    <section class="fo-hud" hidden aria-label="Driving dashboard"><div class="fo-round"><span data-text="phase">FREE PATROL</span><strong data-text="timer">05:00</strong></div><aside class="fo-scoreboard"><div class="fo-label">DISPATCH LEADERBOARD</div><ol data-scores></ol></aside><div class="fo-instruments"><div class="fo-speed"><strong data-text="speed">0</strong><span>KM/H</span></div><div class="fo-car-state"><div class="fo-label">UNIT INTEGRITY <b data-text="health">100%</b></div><div class="fo-health"><i></i></div><span data-text="ammo">AUTO / UNLIMITED AMMO</span></div></div><div class="fo-prompts" data-text="prompts">WASD DRIVE · SHIFT DRIFT · SPACE FIRE</div><div class="fo-recover" hidden><span>RECOVERING UNIT</span><progress max="1" value="0"></progress></div><div class="fo-pursuit" hidden><span data-text="pursuit">INTERCEPT THE SUSPECT</span><progress max="1" value="0"></progress></div><div class="fo-center-callout" hidden><span data-text="callout-label">STAND BY</span><strong data-text="callout">3</strong></div><button class="fo-invite" data-action="invite">COPY INVITE <span data-text="room"></span></button><button class="fo-start" data-action="start" hidden>START ROUND →</button></section>
    <div class="fo-menu-backdrop"></div><main class="fo-menu"><div class="fo-hero" aria-hidden="true"></div><section class="fo-panel" aria-label="Dispatch menu"><div class="fo-panel-heading"><span class="fo-kicker" data-text="panel-kicker">CITY MOTOR DIVISION</span><span class="fo-panel-no">FORM 01–FO</span></div><div class="fo-home"><h2>You're on duty.</h2><p class="fo-muted">Pick a callsign. Take the keys.</p><label class="fo-field">YOUR CALLSIGN<input name="nickname" maxlength="20" autocomplete="nickname" spellcheck="false" value="Officer Rookie" placeholder="Officer Rookie"></label><button class="fo-primary" data-action="practice"><span>HIT THE STREETS<small>Solo practice & pursuit challenge</small></span><b>↗</b></button><div class="fo-divider"><span>OR BRING BACKUP</span></div><div class="fo-actions"><button class="fo-secondary" data-action="create">CREATE ROOM <span>+</span></button><button class="fo-secondary" data-action="join-toggle">JOIN ROOM <span>→</span></button></div><form class="fo-join" hidden><label class="fo-field">ROOM CODE OR INVITE LINK<input name="room" maxlength="250" autocomplete="off" spellcheck="false" placeholder="Paste a code or invite link"></label><button class="fo-primary" type="submit">REPORT TO DISPATCH →</button></form><div class="fo-room-note">PRIVATE ROOMS · 2–8 DRIVERS · NO ACCOUNT NEEDED</div></div><div class="fo-pause" hidden><h2>Taking a breather?</h2><p class="fo-muted" data-text="pause-description">Your patrol is paused.</p><button class="fo-primary" data-action="resume">BACK ON PATROL →</button><button class="fo-secondary" data-action="leave">END PATROL <span>↗</span></button></div><div class="fo-settings" hidden><h2>Fine tuning.</h2><p class="fo-muted">Make this patrol yours.</p><div class="fo-settings-list"><label>Master volume<input type="range" data-setting="masterVolume" min="0" max="1" step=".05"></label><label>Music<input type="range" data-setting="musicVolume" min="0" max="1" step=".05"></label><label>Effects<input type="range" data-setting="effectsVolume" min="0" max="1" step=".05"></label><label>Graphics<select data-setting="quality"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label><label>Reduce camera shake<input type="checkbox" data-setting="reducedShake"></label><label>Reduce flashes<input type="checkbox" data-setting="reducedFlash"></label><label>Controller vibration<input type="checkbox" data-setting="vibration"></label><label>Stick dead zone<input type="range" data-setting="stickDeadzone" min=".05" max=".5" step=".01"></label><label>Trigger dead zone<input type="range" data-setting="triggerDeadzone" min="0" max=".5" step=".01"></label><label>Steering sensitivity<input type="range" data-setting="sensitivity" min=".4" max="1.8" step=".05"></label></div><details class="fo-bindings"><summary>KEYBOARD BINDINGS</summary><div data-bindings></div></details><button class="fo-secondary" data-action="settings-back">SAVE & BACK <span>↩</span></button></div><div class="fo-results" hidden><span class="fo-kicker">CASE CLOSED</span><h2 data-text="result-title">Patrol complete.</h2><p class="fo-muted">Final standings / confirmed by dispatch</p><ol data-results></ol><button class="fo-primary" data-action="rematch">ANOTHER ROUND →</button><button class="fo-secondary" data-action="leave">BACK TO DISPATCH <span>↗</span></button></div><div class="fo-notice" role="status" aria-live="polite" hidden></div><footer class="fo-panel-footer"><button class="fo-text-button" data-action="settings">SETTINGS & CONTROLS <span>⚙</span></button><span class="fo-input-hint" data-text="input-hint">↑ ↓ SELECT · ENTER CONFIRM</span></footer></section></main><footer class="fo-bottom"><span>MINOR INFRACTIONS. MAJOR COLLISIONS.</span><span>DRIVE FAST. FILE LATER.</span></footer><div class="fo-toast" role="status" aria-live="polite" hidden></div>`;
  root.append(shell);
  const one = <T extends HTMLElement = HTMLElement>(selector: string) => shell.querySelector<T>(selector)!;
  const all = <T extends HTMLElement = HTMLElement>(selector: string) => [...shell.querySelectorAll<T>(selector)];
  const targetBadge = doc.createElement('div'); targetBadge.className = 'fo-target-indicator'; targetBadge.hidden = true; targetBadge.setAttribute('role', 'img');
  targetBadge.innerHTML = '<span class="fo-target-arrow" aria-hidden="true"><svg viewBox="0 0 44 44"><path class="fo-target-chevron" d="m8 23 14-14 14 14"/><path class="fo-target-chevron" d="m8 36 14-14 14 14"/></svg></span><strong class="fo-target-label">WANTED SUSPECT</strong><span class="fo-target-distance"></span>';
  shell.append(targetBadge);
  const targetLabel = targetBadge.querySelector<HTMLElement>('.fo-target-label')!;
  const targetDistance = targetBadge.querySelector<HTMLElement>('.fo-target-distance')!;
  const arrestLabel = doc.createElement('span'); arrestLabel.className = 'fo-arrest-label';
  const arrestProgress = one<HTMLProgressElement>('.fo-pursuit progress'); arrestProgress.setAttribute('aria-label', 'Your arrest progress'); arrestProgress.before(arrestLabel);
  const arrestHelp = doc.createElement('small'); arrestHelp.className = 'fo-arrest-help'; arrestHelp.textContent = 'Stay close & match speed · 3s'; one('.fo-pursuit').append(arrestHelp);
  const resultOutcome = doc.createElement('p'); resultOutcome.className = 'fo-result-outcome'; resultOutcome.hidden = true; one('.fo-results h2').after(resultOutcome);
  one('.fo-home .fo-muted').textContent = 'Ten connected dispatches. Arrest suspects or stop their getaway cars.';
  one('.fo-home [data-action="practice"] small').textContent = 'Solo story campaign / ten connected pursuits';
  one('.fo-home .fo-divider span').textContent = 'COMPETE FOR THE ARREST';
  one('.fo-home .fo-room-note').textContent = 'SHARED CAMPAIGN · 2–8 DRIVERS · ARREST OR WRECK';
  const garage = doc.createElement('section'); garage.className = 'fo-garage'; garage.setAttribute('aria-label', 'Assigned vehicle garage');
  garage.innerHTML = `<div class="fo-garage-heading"><span class="fo-kicker">CITY MOTOR POOL / YOUR ASSIGNED UNIT</span><h1>TAKE THE KEYS.</h1><h2 data-text="vehicle-name"></h2><span class="fo-vehicle-role" data-text="vehicle-role"></span></div><div class="fo-garage-card"><div class="fo-garage-stats"><div><span>ARMOR</span><strong data-text="vehicle-armor"></strong></div><div><span>TOP SPEED</span><strong data-text="vehicle-speed"></strong></div><div><span>ACCELERATION</span><meter aria-label="Vehicle acceleration" min="0" max="1" value="0"></meter></div><div><span>HANDLING</span><meter aria-label="Vehicle handling" min="0" max="1" value="0"></meter></div></div><p data-text="vehicle-description"></p><button type="button" data-action="reassign">REASSIGN VEHICLE</button><span class="fo-garage-note">LUCK OF THE MOTOR POOL. MAKE IT YOURS.</span></div>`;
  shell.append(garage);
  const briefing = doc.createElement('section'); briefing.className = 'fo-campaign-briefing'; briefing.hidden = true; briefing.setAttribute('aria-label', 'Campaign dispatch briefing');
  briefing.innerHTML = '<header><span class="fo-kicker">MAJOR CASE / MOTOR DIVISION</span><h2 data-campaign-title></h2><span class="fo-campaign-number"></span></header><div class="fo-campaign-scroll"><div class="fo-campaign-target"><div class="fo-campaign-portrait" role="img"></div><div><span class="fo-campaign-role"></span><h3 data-campaign-name></h3><strong data-campaign-alias></strong><span data-campaign-target-car></span></div></div><h3 class="fo-campaign-dispatch-title"></h3><p data-campaign-briefing></p><section class="fo-campaign-progress"><h3>DISPATCH TRACKER / 10 FILES</h3><ol class="fo-campaign-tracker"></ol></section><details class="fo-campaign-evidence"><summary>CASE FILE / EARNED LEADS</summary><ol class="fo-campaign-casefile"></ol><p class="fo-campaign-no-evidence">No leads filed yet. Resolve this dispatch to unseal the next clue.</p></details></div><footer><button class="fo-primary" data-action="campaign-start">START DISPATCH →</button><span class="fo-campaign-wait" hidden>WAITING FOR DISPATCH LEAD / BACKUP</span><button class="fo-text-button" data-action="settings">SETTINGS & CONTROLS <span>⚙</span></button></footer>';
  shell.append(briefing);
  const campaignRoster = doc.createElement('section'); campaignRoster.className = 'fo-campaign-roster'; campaignRoster.hidden = true;
  campaignRoster.innerHTML = '<h3>UNITS ON THIS CASE</h3><div class="fo-score-head"><span aria-hidden="true">#</span><span>UNIT</span><span>PING / ms</span><span>PTS</span></div><ol></ol>';
  briefing.querySelector('.fo-campaign-target')!.after(campaignRoster);
  const tacticsCard = doc.createElement('section'); tacticsCard.className = 'fo-campaign-tactics'; tacticsCard.dataset.campaignTactics = ''; tacticsCard.setAttribute('aria-label', 'Target tactics and counterplay');
  tacticsCard.innerHTML = '<span class="fo-kicker" data-tactics-rank></span><h4 data-tactics-label></h4><div class="fo-tactics-meta"><span data-tactics-style></span><span data-tactics-weapon></span></div><label class="fo-tactics-difficulty"><span></span><meter min="1" max="10" value="1" aria-label="Target difficulty"></meter></label><p data-tactics-description></p>';
  briefing.querySelector('.fo-campaign-target')!.after(tacticsCard);
  const campaignResolution = doc.createElement('section'); campaignResolution.className = 'fo-campaign-resolution'; campaignResolution.hidden = true; campaignResolution.setAttribute('aria-label', 'Campaign dispatch resolution');
  campaignResolution.innerHTML = '<h3 class="fo-campaign-resolution-label"></h3><div class="fo-campaign-target"><div class="fo-campaign-portrait" role="img"></div><div><span class="fo-campaign-role"></span><h3 data-campaign-name></h3><strong data-campaign-alias></strong></div></div><ol class="fo-campaign-tracker"></ol><section class="fo-campaign-connections" hidden><h3>FOUR RINGLEADERS. ONE RACKET.</h3><div class="fo-campaign-bosses"></div></section><section class="fo-campaign-evidence"><h3>CASE FILE / EARNED LEADS</h3><ol class="fo-campaign-casefile"></ol><p class="fo-campaign-no-evidence">No new evidence. The suspect escaped; retry this dispatch.</p></section>';
  resultOutcome.after(campaignResolution);
  const latestLead = doc.createElement('section'); latestLead.className = 'fo-campaign-new-lead'; latestLead.hidden = true; latestLead.innerHTML = '<span class="fo-kicker">NEW LEAD</span><p></p>'; campaignResolution.querySelector('.fo-campaign-resolution-label')!.after(latestLead);
  const campaignLive = doc.createElement('aside'); campaignLive.className = 'fo-campaign-live'; campaignLive.hidden = true; campaignLive.setAttribute('aria-label', 'Campaign progress'); campaignLive.innerHTML = '<span></span><ol class="fo-campaign-tracker"></ol>'; shell.append(campaignLive);
  const campaignWait = doc.createElement('p'); campaignWait.className = 'fo-campaign-wait'; campaignWait.hidden = true; campaignWait.textContent = 'WAITING FOR DISPATCH LEAD'; one('[data-action="rematch"]').after(campaignWait);
  let campaignViewKey = '';
  const write = (key: string, value: string) => { const node = one(`[data-text="${key}"]`); if (node.textContent !== value) node.textContent = value; };
  const hide = (selector: string, hidden: boolean) => { one(selector).hidden = hidden; };
  const connectivityIcon = doc.createElement('span'); connectivityIcon.className = 'fo-connectivity-icon';
  connectivityIcon.setAttribute('role', 'img'); connectivityIcon.setAttribute('aria-live', 'polite');
  connectivityIcon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 8a15 15 0 0 1 18 0M6 11.5a10 10 0 0 1 12 0M9 15a5 5 0 0 1 6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="19" r="1.3" fill="currentColor"/><path class="fo-wifi-slash" d="m3 3 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  one('.fo-connection i').replaceWith(connectivityIcon);
  for (const selector of ['[data-scores]', '[data-results]']) {
    const heading = doc.createElement('div'); heading.className = 'fo-score-head';
    heading.innerHTML = '<span aria-hidden="true">#</span><span>UNIT</span><span class="fo-ping-label">PING / ms</span><span>PTS</span>';
    one(selector).before(heading);
  }
  const nickname = one<HTMLInputElement>('[name="nickname"]');
  const normalizeCallsign = (value: unknown) => { try { return sanitizeNickname(value); } catch { return ''; } };
  let savedCallsign = '';
  try { const saved = JSON.parse(view?.localStorage.getItem('fender-callsign-v1') ?? 'null'); savedCallsign = normalizeCallsign(typeof saved === 'string' ? saved : saved?.nickname); } catch { /* An unavailable or malformed store still gets an in-memory identity. */ }
  nickname.value = savedCallsign || randomCallsign(); nickname.placeholder = 'Make it memorable';
  const persistCallsign = () => { const name = normalizeCallsign(nickname.value); if (name) try { view?.localStorage.setItem('fender-callsign-v1', JSON.stringify({ nickname: name })); } catch { /* Callsigns also work without storage. */ } return name; };
  persistCallsign();
  const reroll = doc.createElement('button'); reroll.type = 'button'; reroll.className = 'fo-reroll-callsign'; reroll.dataset.action = 'reroll-callsign'; reroll.textContent = 'REROLL CALLSIGN'; nickname.closest('.fo-field')!.after(reroll);
  const roomInput = one<HTMLInputElement>('[name="room"]');
  const notify = (message: string) => { const node = one('.fo-notice'); node.textContent = message; node.hidden = !message; };
  const persist = () => { shell.classList.toggle('fo-reduced-motion', settings.reducedShake); try { view?.localStorage.setItem('fender-settings-v1', JSON.stringify(settings)); } catch { /* Optional persistence. */ } callbacks.onSettings?.(structuredClone(settings)); };
  function focusFirst() { const focusable = visibleControls(); (focusable.find(node => node.matches('.fo-primary')) ?? focusable[0])?.focus({ preventScroll: true }); }
  const lobby = () => model.snapshot?.phase === 'lobby' && (model.mode === 'online' || Boolean(model.snapshot.campaign));
  const hasResult = (candidate = model) => candidate.snapshot?.phase === 'results' || !candidate.snapshot?.campaign && candidate.mode === 'practice' && candidate.snapshot?.pursuit?.state === 'complete';
  const canDispatch = () => model.canStart !== false && (model.mode !== 'online' || ['lobby', 'playing'].includes(statusName(model.status)));
  function updateCampaignVisibility() {
    const campaign = model.snapshot?.campaign;
    briefing.hidden = !campaign || !lobby() || menu !== null;
    campaignResolution.hidden = !campaign || !hasResult();
    campaignLive.hidden = !campaign || model.snapshot?.phase !== 'playing' || menu !== null;
    shell.classList.toggle('fo-campaign-briefing-open', !briefing.hidden);
    shell.classList.toggle('fo-campaign-results', Boolean(campaign && hasResult() && menu !== 'settings'));
  }
  function portrait(node: HTMLElement, target: CampaignTarget) {
    if (node.dataset.target !== target.id) { node.innerHTML = getCampaignMugshot(target.id); node.dataset.target = target.id; }
    node.setAttribute('aria-label', `${target.name}, “${target.alias}”, ${target.role}`);
  }
  function officer(playerId: string) { return model.snapshot?.scores.find(score => score.playerId === playerId)?.nickname ?? 'Departed officer'; }
  function tracker(node: HTMLOListElement, campaign: CampaignState) {
    const rows = CAMPAIGN_DISPATCHES.map((dispatch, index) => {
      const outcome = campaign.outcomes.find(entry => entry.dispatchIndex === index), current = index === campaign.dispatchIndex && !outcome;
      const row = doc.createElement('li'); row.dataset.dispatchIndex = String(index); row.dataset.outcome = outcome?.outcome ?? 'pending'; row.classList.toggle('fo-current-dispatch', current);
      const mark = doc.createElement('b'), label = doc.createElement('span'), credit = doc.createElement('small');
      mark.textContent = outcome ? outcome.outcome === 'arrested' ? '✓' : '✕' : String(index + 1).padStart(2, '0');
      label.textContent = outcome ? getCampaignTarget(dispatch.targetId).alias : current ? 'CURRENT' : 'SEALED';
      credit.textContent = outcome ? officer(outcome.playerId) : current ? 'OPEN FILE' : 'PENDING';
      row.setAttribute('aria-label', `Dispatch ${index + 1}: ${outcome ? `${outcome.outcome} by ${officer(outcome.playerId)}` : current ? 'current assignment' : 'pending'}`);
      if (current) row.setAttribute('aria-current', 'step'); row.append(mark, label, credit); return row;
    });
    node.replaceChildren(...rows);
  }
  function updateCampaign() {
    updateCampaignVisibility();
    const campaign = model.snapshot?.campaign;
    if (!campaign) { campaignViewKey = ''; campaignWait.hidden = true; one<HTMLButtonElement>('[data-action="rematch"]').disabled = false; delete resultOutcome.dataset.outcome; return; }
    campaignRoster.hidden = model.mode !== 'online';
    if (!campaignRoster.hidden) updateScores(campaignRoster.querySelector('ol')!, false, campaignRosterRows);
    const key = JSON.stringify([campaign, model.snapshot?.phase, model.mode, model.canStart, statusName(model.status), pending, model.snapshot?.scores.map(score => [score.playerId, score.nickname])]);
    if (key === campaignViewKey) return; campaignViewKey = key;
    const dispatch = CAMPAIGN_DISPATCHES[campaign.dispatchIndex] ?? CAMPAIGN_DISPATCHES[0]!;
    const target = getCampaignTarget(dispatch.targetId), resolution = campaign.outcomes.find(outcome => outcome.dispatchIndex === campaign.dispatchIndex);
    const tactics = getBossTactics(campaign.dispatchIndex);
    tacticsCard.classList.toggle('fo-boss-tactics', target.isBoss); tacticsCard.dataset.drivingStyle = tactics.drivingStyle;
    tacticsCard.querySelector('[data-tactics-rank]')!.textContent = target.isBoss ? 'RINGLEADER TACTICS' : 'TARGET TACTICS';
    tacticsCard.querySelector('[data-tactics-label]')!.textContent = tactics.label;
    tacticsCard.querySelector('[data-tactics-style]')!.textContent = tactics.drivingStyle.replaceAll('-', ' ').toUpperCase();
    tacticsCard.querySelector('[data-tactics-weapon]')!.textContent = tactics.weapon === 'burst' ? 'FORWARD BURSTS' : tactics.weapon === 'grenades' ? 'MARKED GRENADES' : 'BURSTS + GRENADES';
    tacticsCard.querySelector('.fo-tactics-difficulty>span')!.textContent = `DIFFICULTY ${tactics.difficulty} / 10`;
    tacticsCard.querySelector<HTMLMeterElement>('meter')!.value = tactics.difficulty;
    tacticsCard.querySelector('[data-tactics-description]')!.textContent = tactics.description;
    const complete = campaign.status === 'complete';
    const allOutcomes = [...campaign.outcomes].filter(outcome => CAMPAIGN_DISPATCHES[outcome.dispatchIndex]).sort((a, b) => a.dispatchIndex - b.dispatchIndex);
    briefing.querySelector<HTMLElement>('[data-campaign-title]')!.textContent = CAMPAIGN_TITLE;
    briefing.querySelector<HTMLElement>('.fo-campaign-number')!.textContent = `DISPATCH ${String(campaign.dispatchIndex + 1).padStart(2, '0')} / 10 · ${target.isBoss ? 'RINGLEADER' : 'CREW FILE'}`;
    for (const scope of [briefing, campaignResolution]) {
      portrait(scope.querySelector<HTMLElement>('.fo-campaign-portrait')!, target);
      scope.querySelector<HTMLElement>('[data-campaign-name]')!.textContent = target.name;
      scope.querySelector<HTMLElement>('[data-campaign-alias]')!.textContent = `“${target.alias}”`;
      scope.querySelector<HTMLElement>('.fo-campaign-role')!.textContent = target.role;
    }
    briefing.querySelector<HTMLElement>('[data-campaign-target-car]')!.textContent = `SUSPECT VEHICLE / ${getVehicleProfile(target.vehicleBodyId).name}`;
    briefing.querySelector<HTMLElement>('.fo-campaign-dispatch-title')!.textContent = dispatch.title;
    briefing.querySelector<HTMLElement>('[data-campaign-briefing]')!.textContent = dispatch.briefing;
    for (const node of all<HTMLOListElement>('.fo-campaign-tracker')) tracker(node, campaign);
    campaignLive.querySelector('span')!.textContent = `CASE FILE / DISPATCH ${campaign.dispatchIndex + 1} OF 10`;
    for (const list of all<HTMLOListElement>('.fo-campaign-casefile')) {
      list.replaceChildren(...[...allOutcomes].reverse().map(outcome => {
        const chapter = CAMPAIGN_DISPATCHES[outcome.dispatchIndex]!, row = doc.createElement('li'), heading = doc.createElement('h4'), method = doc.createElement('span'), clue = doc.createElement('p');
        row.dataset.outcome = outcome.outcome; heading.textContent = chapter.title;
        method.className = 'fo-case-method'; method.textContent = `${outcome.outcome === 'arrested' ? '✓ ARRESTED' : '✕ WRECKED'} / ${officer(outcome.playerId)}`;
        clue.textContent = chapter.reveal; row.append(heading, method, clue); return row;
      }));
    }
    for (const node of all('.fo-campaign-no-evidence')) node.hidden = allOutcomes.length > 0;
    latestLead.hidden = !resolution;
    latestLead.querySelector('.fo-kicker')!.textContent = complete ? 'CASE FILE CLOSED' : 'NEW LEAD / EVIDENCE UNSEALED';
    latestLead.querySelector('p')!.textContent = resolution ? dispatch.reveal : '';
    const start = one<HTMLButtonElement>('[data-action="campaign-start"]'); start.disabled = pending || !canDispatch();
    briefing.querySelector<HTMLElement>('.fo-campaign-wait')!.hidden = canDispatch();
    campaignResolution.querySelector<HTMLElement>('.fo-campaign-resolution-label')!.textContent = complete ? 'CAMPAIGN COMPLETE' : resolution ? `${resolution.outcome.toUpperCase()} / DISPATCH ${campaign.dispatchIndex + 1}` : 'DISPATCH UNRESOLVED / SUSPECT ESCAPED';
    campaignResolution.querySelector<HTMLElement>('.fo-campaign-target')!.hidden = complete;
    const connections = campaignResolution.querySelector<HTMLElement>('.fo-campaign-connections')!; connections.hidden = !complete;
    const bosses = campaignResolution.querySelector<HTMLElement>('.fo-campaign-bosses')!;
    bosses.replaceChildren(...(complete ? CAMPAIGN_BOSSES.filter(boss => allOutcomes.some(outcome => CAMPAIGN_DISPATCHES[outcome.dispatchIndex]!.targetId === boss.id)).map(boss => {
      const node = doc.createElement('article'); node.className = 'fo-campaign-boss'; const image = doc.createElement('div'); image.className = 'fo-campaign-portrait'; image.setAttribute('role', 'img'); portrait(image, boss);
      const name = doc.createElement('strong'), role = doc.createElement('span'); name.textContent = boss.name; role.textContent = `“${boss.alias}” · ${boss.role}`; node.append(image, name, role); return node;
    }) : []));
    if (hasResult()) {
      write('result-title', complete ? 'The racket is exposed.' : resolution ? 'Dispatch resolved.' : 'Suspect escaped.');
      one('.fo-results>.fo-kicker').textContent = complete ? CAMPAIGN_TITLE : `DISPATCH ${String(campaign.dispatchIndex + 1).padStart(2, '0')} / 10`;
      resultOutcome.hidden = false; resultOutcome.dataset.outcome = resolution?.outcome ?? 'pending';
      resultOutcome.textContent = complete ? 'CAMPAIGN COMPLETE · TEN FILES RESOLVED' : resolution ? `${resolution.outcome === 'arrested' ? '✓ ARRESTED' : '✕ WRECKED'} · ${target.alias.toUpperCase()} · ${officer(resolution.playerId).toUpperCase()}` : 'TIME UP · NO RESOLUTION RECORDED';
      one('.fo-results .fo-muted').textContent = 'Shared case progress above / combat points below';
      const next = one<HTMLButtonElement>('[data-action="rematch"]'); next.disabled = !canDispatch();
      next.textContent = !canDispatch() ? 'WAITING FOR DISPATCH LEAD' : complete ? 'NEW CAMPAIGN →' : resolution ? 'NEXT BRIEFING →' : 'RETRY DISPATCH →';
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
    targetBadge.style.setProperty('--target-y', `${Math.max(0, Math.min(1, indicator.y)) * 100}%`);
    targetAngle += Math.atan2(Math.sin(indicator.angle - targetAngle), Math.cos(indicator.angle - targetAngle));
    targetBadge.style.setProperty('--target-angle', `${targetAngle}rad`);
    const label = indicator.offscreen ? 'SUSPECT' : 'WANTED SUSPECT', meters = Math.max(0, Math.min(99999, Math.round(indicator.distanceMeters)));
    if (targetLabel.textContent !== label) targetLabel.textContent = label;
    if (targetDistance.textContent !== `${meters} m`) targetDistance.textContent = `${meters} m`;
    const accessible = `Wanted suspect, ${meters} meters away, ${indicator.offscreen ? 'off screen' : 'on screen'}`;
    if (targetBadge.getAttribute('aria-label') !== accessible) targetBadge.setAttribute('aria-label', accessible);
  }
  function setTargetIndicator(indicator: TargetIndicator | null) { targetIndicator = indicator; updateTargetBadge(); }
  const canReassign = () => !pending && (menu === 'home' && !model.snapshot || menu === null && lobby() && ['lobby', 'playing'].includes(statusName(model.status)));
  function visibleControls() { return all<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLElement>('button,input,select,summary').filter(node => !node.closest('[hidden]') && !(node as HTMLButtonElement).disabled && (!node.closest('.fo-hud') || lobby() && node.matches('[data-action="start"],[data-action="invite"]')) && !node.closest('.fo-top')); }
  function updateGarage() {
    const visible = menu === 'home' && !model.snapshot || menu === null && lobby();
    garage.hidden = !visible;
    shell.classList.toggle('fo-in-garage', visible);
    shell.classList.toggle('fo-lobby', visible && lobby());
    garage.dataset.vehicle = vehicle;
    const profile = getVehicleProfile(vehicle);
    write('vehicle-name', profile.name); write('vehicle-role', profile.role);
    write('vehicle-armor', `${profile.maxHealth} HP`); write('vehicle-speed', `${Math.round(profile.topSpeed * 3.6)} KM/H`);
    write('vehicle-description', profile.description);
    one<HTMLMeterElement>('[aria-label="Vehicle acceleration"]').value = Math.min(1, profile.acceleration / 24);
    one<HTMLMeterElement>('[aria-label="Vehicle handling"]').value = Math.min(1, profile.steeringRate / 2.6 * Math.sqrt(profile.grip / 10));
    one<HTMLButtonElement>('[data-action="reassign"]').disabled = !canReassign();
  }
  function showMenu(next: Menu = 'pause') {
    if (next === 'settings') previousMenu = menu;
    menu = next;
    shell.classList.toggle('fo-is-playing', menu === null);
    shell.classList.toggle('fo-is-settings', menu === 'settings');
    hide('.fo-menu', menu === null); hide('.fo-menu-backdrop', menu === null); hide('.fo-hero', menu !== 'home'); hide('.fo-bottom', menu !== 'home');
    const results = hasResult() && !resultDismissed && menu !== 'settings';
    hide('.fo-home', menu !== 'home' || results); hide('.fo-pause', menu !== 'pause' || results); hide('.fo-settings', menu !== 'settings'); hide('.fo-results', !results);
    hide('[data-action="settings"]', menu === 'settings');
    write('pause-description', model.mode === 'online' ? 'THE MATCH IS STILL LIVE. Your unit is coasting with controls released.' : 'Your local patrol is paused. Take your time.');
    callbacks.onMenuVisibility?.(menu !== null || lobby());
    updateGarage();
    updateCampaignVisibility();
    updateTargetBadge();
    if (menu !== null) focusFirst();
  }
  function parseRoom(value: string): string {
    const cleaned = value.trim();
    try { const url = new URL(cleaned); return url.searchParams.get('room') ?? url.hash.replace(/^#/, '') ?? ''; } catch { return cleaned.replace(/^#/, ''); }
  }
  async function play(mode: 'practice' | 'create' | 'join') {
    if (pending) return;
    const name = persistCallsign(); const roomId = parseRoom(roomInput.value);
    if (!name) { notify('Your unit needs a callsign.'); nickname.focus(); return; }
    nickname.value = name;
    if (mode === 'join' && !roomId) { notify('Enter a room code or paste an invite link.'); roomInput.focus(); return; }
    pending = true; notify('Contacting dispatch…'); all<HTMLButtonElement>('.fo-home button').forEach(button => { button.disabled = true; });
    updateGarage();
    try { persistVehicle(); await callbacks.onPlay({ mode, nickname: name, vehicleBodyId: vehicle, ...(mode === 'join' ? { roomId } : {}) }); }
    catch (error) { notify(error instanceof Error ? error.message : 'Dispatch could not be reached. Try again.'); }
    finally { pending = false; if (!disposed) { all<HTMLButtonElement>('.fo-home button').forEach(button => { button.disabled = false; }); updateGarage(); updateCampaign(); if (model.snapshot?.campaign && lobby() && menu === null) focusFirst(); } }
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
    if (input === nickname) { persistCallsign(); return; }
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
      case 'reroll-callsign': {
        const current = normalizeCallsign(nickname.value); let next = current;
        for (let attempt = 0; attempt < 8 && next === current; attempt++) next = randomCallsign();
        if (next === current) { next = randomCallsign(() => 0); if (next === current) next = randomCallsign(() => 1); }
        nickname.value = next; persistCallsign(); break;
      }
      case 'reassign': if (canReassign()) { vehicle = rollVehicle(vehicle); awaitingVehicle = lobby() ? vehicle : null; persistVehicle(); updateGarage(); callbacks.onVehicleChange?.(vehicle); toast('NEW KEYS. SAME QUESTIONABLE DEPARTMENT.'); } break;
      case 'create': void play('create'); break;
      case 'join-toggle': hide('.fo-join', !one('.fo-join').hidden); roomInput.focus(); break;
      case 'pause': if (model.snapshot) showMenu(menu === null ? 'pause' : null); break;
      case 'resume': showMenu(null); callbacks.onResume?.(); break;
      case 'leave': resultDismissed = true; callbacks.onLeave?.(); model = {}; showMenu('home'); hide('.fo-hud', true); notify(''); break;
      case 'settings': showMenu('settings'); break;
      case 'settings-back': showMenu(previousMenu); break;
      case 'start': callbacks.onStartRound?.(); break;
      case 'campaign-start': if (canDispatch()) callbacks.onStartRound?.(); break;
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
  const resultRows = new Map<string, HTMLLIElement>();
  const campaignRosterRows = new Map<string, HTMLLIElement>();
  function updateScores(target: HTMLOListElement, results: boolean, rows = results ? resultRows : scoreRows) {
    const scores = [...(model.snapshot?.scores ?? [])].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname));
    const liveIds = new Set(scores.map(score => score.playerId));
    for (const [id, row] of rows) if (!liveIds.has(id)) { row.remove(); rows.delete(id); }
    scores.forEach((score, rank) => {
      let row = rows.get(score.playerId);
      if (!row) { row = doc.createElement('li'); row.innerHTML = '<span></span><span class="fo-score-name"></span><span class="fo-ping"></span><strong></strong>'; rows.set(score.playerId, row); }
      row.dataset.playerId = score.playerId;
      row.classList.toggle('fo-you', score.playerId === model.localPlayerId);
      row.children[0]!.textContent = `${rank + 1}`;
      row.children[1]!.textContent = `${score.nickname}${score.playerId === model.localPlayerId ? ' / YOU' : ''}${score.connection === 'reconnecting' ? ' …' : ''}${results ? ` · ${score.wrecks} WRECKS` : ''}`;
      const ping = typeof score.pingMs === 'number' && Number.isFinite(score.pingMs) && score.pingMs >= 0 ? Math.round(score.pingMs) : null;
      row.children[2]!.textContent = ping === null ? '—' : `${ping} ms`;
      row.children[2]!.setAttribute('aria-label', `${score.nickname} ping: ${ping === null ? 'unavailable' : `${ping} milliseconds`}`);
      row.children[3]!.textContent = String(score.score); target.append(row);
    });
  }
  function update(next: UiModel) {
    const previousEpoch = model.snapshot?.sessionEpoch, previousResult = hasResult(), previousDispatch = model.snapshot?.campaign?.dispatchIndex; const wasLobby = lobby(); model = { ...model, ...next };
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
    const snapshot = model.snapshot; const hud = deriveHud(model); const status = statusName(model.status);
    if (snapshot && menu === 'home' && status !== 'error') { resultDismissed = false; showMenu(null); notify(''); }
    if (hasResult() && !previousResult) { resultDismissed = false; updateScores(one('[data-results]'), true); showMenu('pause'); }
    if (previousResult && !hasResult() && menu === 'pause') showMenu(null);
    hide('.fo-hud', !snapshot); write('speed', String(hud.speed)); write('health', `${Math.ceil(hud.health)}%`);
    one<HTMLElement>('.fo-health i').style.width = `${Math.max(0, Math.min(100, hud.health))}%`; one('.fo-health').classList.toggle('fo-low-health', hud.health < 30);
    write('phase', model.mode === 'practice' ? 'SOLO PURSUIT' : hud.phase === 'lobby' ? 'WAITING FOR BACKUP' : hud.phase === 'countdown' ? 'PURSUIT STARTING' : hud.phase === 'results' ? 'PURSUIT COMPLETE' : 'COMPETING PURSUIT');
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
    write('connection', !remoteConnection ? 'LOCAL DISPATCH' : reconnecting ? 'Reconnecting…' : connectionLost ? 'Connection lost' : connecting ? 'Connecting…' : `CONNECTED${model.pingMs === undefined ? '' : ` / ${Math.round(model.pingMs)} MS`}`);
    shell.classList.toggle('fo-reconnecting', reconnecting);
    write('room', model.roomId ? ` / ${model.roomId}` : ''); hide('.fo-invite', !model.roomId || model.mode !== 'online');
    hide('.fo-start', !snapshot || snapshot.phase !== 'lobby' || model.mode !== 'online' || model.canStart === false || Boolean(snapshot.campaign));
    write('prompts', model.device === 'gamepad' ? 'LEFT STICK DRIVE · RT/LT DRIVE/BRAKE · A DRIFT · RB FIRE · X SIREN · HOLD Y RECOVER' : 'WASD DRIVE · SHIFT DRIFT · SPACE FIRE · E SIREN · HOLD R RECOVER');
    write('input-hint', model.device === 'gamepad' ? '↕ SELECT · A CONFIRM · B BACK' : '↑ ↓ SELECT · ENTER CONFIRM');
    const recovery = number(model.recoverProgress ?? 0); hide('.fo-recover', recovery <= 0); one<HTMLProgressElement>('.fo-recover progress').value = recovery;
    const authorityPursuit = snapshot?.pursuit;
    const pursuit = authorityPursuit ? { progress: authorityPursuit.progress, complete: authorityPursuit.state === 'complete' } : model.pursuit;
    hide('.fo-pursuit', !pursuit || snapshot?.phase !== 'playing' || Boolean(pursuit.complete));
    if (pursuit) {
      const own = authorityPursuit?.contenders?.find(contender => contender.playerId === model.localPlayerId)?.progress;
      const progress = Math.max(0, Math.min(1, number(own ?? (model.mode === 'practice' || authorityPursuit?.arrestingPlayerId === model.localPlayerId ? pursuit.progress : 0))));
      write('pursuit', snapshot?.campaign ? model.mode === 'online' ? 'FIRST TO RESOLVE DISPATCH' : 'ARREST OR WRECK THE TARGET' : model.mode === 'online' ? 'FIRST TO APPREHEND' : 'APPREHEND THE SUSPECT');
      arrestHelp.textContent = snapshot?.campaign ? 'Stay close & match speed · 3s · or wreck target' : 'Stay close & match speed · 3s';
      arrestLabel.textContent = `YOUR ARREST / ${Math.round(progress * 100)}%`; arrestProgress.value = progress;
    }
    const showCallout = snapshot?.phase === 'countdown' || hud.status !== 'active'; hide('.fo-center-callout', !showCallout);
    write('callout-label', snapshot?.phase === 'countdown' ? 'READY TO ROLL?' : 'UNIT OUT OF ACTION'); write('callout', snapshot?.phase === 'countdown' ? String(Math.max(1, Math.ceil(hud.seconds))) : `BACK IN ${Math.ceil(hud.respawn)}…`);
    updateScores(one('[data-scores]'), false);
    if (hasResult()) updateScores(one('[data-results]'), true);
    if (hasResult() && !snapshot?.campaign) {
      const winnerId = authorityPursuit?.winnerPlayerId;
      const practiceClosed = model.mode === 'practice' && authorityPursuit?.state === 'complete';
      const winner = snapshot?.scores.find(score => score.playerId === winnerId)?.nickname ?? (winnerId === model.localPlayerId ? 'YOUR UNIT' : 'ANOTHER UNIT');
      write('result-title', authorityPursuit ? winnerId || practiceClosed ? 'Suspect apprehended.' : 'Suspect escaped.' : 'Patrol complete.');
      one('.fo-results>.fo-kicker').textContent = authorityPursuit && !winnerId && !practiceClosed ? 'TIME UP' : 'CASE CLOSED';
      resultOutcome.hidden = !authorityPursuit;
      resultOutcome.textContent = winnerId ? `APPREHENDED BY ${winner.toUpperCase()}${winnerId === model.localPlayerId ? ' / YOU' : ''}` : practiceClosed ? 'SUSPECT IN CUSTODY. GOOD WORK, OFFICER.' : 'TIME UP · SUSPECT ESCAPED';
      one('.fo-results .fo-muted').textContent = authorityPursuit ? 'Combat points below / pursuit result confirmed by dispatch' : 'Final standings / confirmed by dispatch';
      one('[data-action="rematch"]').textContent = model.mode === 'practice' ? 'NEW DISPATCH →' : 'ANOTHER ROUND →';
    }
    const reason = typeof model.status === 'object' ? model.status.reason ?? model.status.message : undefined;
    const error = model.error ?? (status === 'error' ? reason ?? 'network-error' : null);
    if (error) { if (menu === null) showMenu('pause'); notify(errorMessages[error] ?? error); }
    if (model.unsupportedPad && model.unsupportedPad !== lastUnsupportedPad) toast('UNSUPPORTED CONTROLLER MAPPING — KEYBOARD CONTROLS AVAILABLE');
    lastUnsupportedPad = model.unsupportedPad ?? null;
    updateGarage();
    updateCampaign();
    updateTargetBadge();
    if (snapshot?.campaign && lobby() && menu === null && (!wasLobby || previousDispatch !== snapshot.campaign.dispatchIndex)) focusFirst();
  }
  function navigate(action: MenuAction) {
    if (action === 'pause' || action === 'back') {
      if (bindingAction) { bindingAction = null; return; }
      if (menu === 'settings') showMenu(previousMenu);
      else if (model.snapshot && !hasResult()) { showMenu(menu === null ? 'pause' : null); if (menu === null) callbacks.onResume?.(); }
      else if (!one('.fo-join').hidden) hide('.fo-join', true);
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
  // Invite links prefill the join flow, while preserving an intentional start action.
  const invitedRoom = new URLSearchParams(view?.location.search ?? '').get('room');
  if (invitedRoom) { roomInput.value = invitedRoom; hide('.fo-join', false); }
  showMenu('home'); shell.classList.toggle('fo-reduced-motion', settings.reducedShake); callbacks.onSettings?.(structuredClone(settings));
  return { update, showMenu, navigate, setTargetIndicator, getVehicle: () => vehicle, getSettings: () => structuredClone(settings), setSettings: (next: Partial<UiSettings>) => {
    settings = { ...settings, ...next };
    for (const input of all<HTMLInputElement | HTMLSelectElement>('[data-setting]')) { const key = input.dataset.setting as keyof UiSettings; if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(settings[key]); else input.value = String(settings[key]); }
    persist();
  }, isMenuVisible: () => menu !== null || lobby(),
    dispose: () => { disposed = true; clearTimeout(toastTimer); shell.removeEventListener('click', click); shell.removeEventListener('input', change); doc.removeEventListener('keydown', remapKey, true); shell.remove(); } };
}
