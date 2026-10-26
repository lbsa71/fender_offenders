import type { ControlScheme, DeviceKind, DriverActions, TouchControls } from '@fender/contracts';

export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'pause';
export type BoundAction = 'throttle' | 'brakeReverse' | 'left' | 'right' | 'handbrake' | 'fire' | 'siren' | 'recover';
export interface InputSettings {
  controlScheme: ControlScheme;
  stickDeadzone: number;
  triggerDeadzone: number;
  sensitivity: number;
  steeringRamp: number;
  bindings: Record<BoundAction, string[]>;
}
export const DEFAULT_INPUT_SETTINGS: InputSettings = {
  controlScheme: 'auto',
  stickDeadzone: 0.16, triggerDeadzone: 0.08, sensitivity: 1, steeringRamp: 8,
  bindings: { throttle: ['KeyW', 'ArrowUp'], brakeReverse: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], handbrake: ['ShiftLeft', 'ShiftRight'], fire: ['Space'], siren: ['KeyE'], recover: ['KeyR'] },
};
const neutral = (): DriverActions => ({ steer: 0, throttle: 0, brakeReverse: 0, handbrake: false, fire: false, sirenToggle: false, recover: false });
const neutralTouch = (): TouchControls => ({ steer: 0, throttle: 0, brakeReverse: 0, handbrake: false, fire: false, siren: false, recover: false });
const clamp = (value: number, min: number, max: number) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
export function applyDeadzone(value: number, deadzone: number): number {
  const bounded = clamp(value, -1, 1);
  return Math.abs(bounded) <= deadzone ? 0 : Math.sign(bounded) * (Math.abs(bounded) - deadzone) / (1 - deadzone);
}
export function sanitizeSettings(settings: Partial<InputSettings> = {}): InputSettings {
  const bindings = Object.fromEntries(Object.entries(DEFAULT_INPUT_SETTINGS.bindings).map(([action, fallback]) => {
    const proposed = settings.bindings?.[action as BoundAction];
    return [action, Array.isArray(proposed) && proposed.length && proposed.every(key => typeof key === 'string' && /^[A-Za-z0-9]+$/.test(key)) ? proposed.slice(0, 3) : [...fallback]];
  })) as InputSettings['bindings'];
  const controlScheme = ['auto', 'keyboard', 'gamepad', 'touch'].includes(settings.controlScheme ?? '') ? settings.controlScheme! : 'auto';
  return { controlScheme, stickDeadzone: clamp(settings.stickDeadzone ?? .16, .05, .5), triggerDeadzone: clamp(settings.triggerDeadzone ?? .08, 0, .5), sensitivity: clamp(settings.sensitivity ?? 1, .4, 1.8), steeringRamp: clamp(settings.steeringRamp ?? 8, 2, 20), bindings };
}
export interface PadState { id: string; index: number; mapping: string; connected: boolean; axes: readonly number[]; buttons: readonly { value: number; pressed: boolean }[] }
/** Pure device state machine. Raw devices never escape this module. */
export class InputController {
  settings: InputSettings;
  device: DeviceKind = 'keyboard';
  enabled = false;
  focused = true;
  unsupportedPad: string | null = null;
  recoverProgress = 0;
  private keys = new Set<string>();
  private blockedKeys = new Set<string>();
  private steering = 0;
  private lastTime: number | null = null;
  private recoverStarted: number | null = null;
  private recoverSent = false;
  private sirenWasDown = false;
  private padBlocked = false;
  private padIndex: number | null = null;
  private activePad: PadState | null = null;
  private touchState = neutralTouch();
  private touchSirenPending = false;
  private menuPrevious = new Set<MenuAction>();
  private repeatAt = 0;
  private repeatAction: MenuAction | null = null;
  constructor(settings?: Partial<InputSettings>, private onNeutralize: () => void = () => {}) {
    this.settings = sanitizeSettings(settings);
    if (this.settings.controlScheme !== 'auto') this.device = this.settings.controlScheme;
  }
  private accepts(device: DeviceKind): boolean { return this.settings.controlScheme === 'auto' || this.settings.controlScheme === device; }
  activate(device: DeviceKind): void {
    if (!this.accepts(device) || !this.focused) return;
    if (this.device !== device) { this.reset(); this.device = device; }
  }
  touch(state: TouchControls): void {
    if (!this.enabled || !this.focused || !this.accepts('touch')) return;
    this.activate('touch');
    if (state.siren && !this.touchState.siren) this.touchSirenPending = true;
    this.touchState = { ...state, steer: Number.isFinite(state.steer) ? clamp(state.steer, -1, 1) : 0, throttle: clamp(state.throttle, 0, 1), brakeReverse: clamp(state.brakeReverse, 0, 1) };
  }
  key(code: string, down: boolean): void {
    if (!down) { this.keys.delete(code); this.blockedKeys.delete(code); return; }
    if (this.focused && this.accepts('keyboard') && !this.blockedKeys.has(code)) { this.activate('keyboard'); this.keys.add(code); }
  }
  reset(): void {
    this.keys.forEach(code => this.blockedKeys.add(code));
    this.keys.clear(); this.touchState = neutralTouch(); this.touchSirenPending = false; this.steering = 0; this.lastTime = null; this.recoverStarted = null; this.recoverProgress = 0; this.recoverSent = false; this.sirenWasDown = false; this.padBlocked = true;
    this.onNeutralize();
  }
  setEnabled(enabled: boolean): void { if (enabled !== this.enabled) { this.enabled = enabled; this.reset(); } }
  setFocused(focused: boolean): void { if (focused !== this.focused) { this.focused = focused; this.reset(); } }
  poll(pads: readonly (PadState | null)[], now: number): MenuAction[] {
    const connected = pads.filter((pad): pad is PadState => !!pad?.connected);
    const standard = connected.filter(pad => pad.mapping === 'standard');
    this.unsupportedPad = connected.find(pad => pad.mapping !== 'standard')?.id ?? null;
    const pad = standard.find(p => this.padActive(p)) ?? standard.find(p => p.index === this.padIndex) ?? standard[0] ?? null;
    if (this.padIndex !== null && !standard.some(p => p.index === this.padIndex)) this.reset();
    this.padIndex = pad?.index ?? null;
    this.activePad = pad;
    if (pad && this.padActive(pad) && !this.padBlocked && this.focused && this.accepts('gamepad')) { this.activate('gamepad'); this.padBlocked = false; }
    if (pad && !this.padActive(pad)) this.padBlocked = false;
    const held = new Set<MenuAction>();
    if (pad && this.focused) {
      const b = (index: number) => !!pad.buttons[index]?.pressed;
      if (b(12) || (pad.axes[1] ?? 0) < -.6) held.add('up');
      if (b(13) || (pad.axes[1] ?? 0) > .6) held.add('down');
      if (b(14) || (pad.axes[0] ?? 0) < -.6) held.add('left');
      if (b(15) || (pad.axes[0] ?? 0) > .6) held.add('right');
      if (b(0)) held.add('confirm'); if (b(1)) held.add('back'); if (b(9)) held.add('pause');
    }
    const events = [...held].filter(action => !this.menuPrevious.has(action));
    const direction = [...held].find(action => ['up', 'down', 'left', 'right'].includes(action)) ?? null;
    if (direction !== this.repeatAction) { this.repeatAction = direction; this.repeatAt = now + 400; }
    else if (direction && now >= this.repeatAt) { events.push(direction); this.repeatAt = now + 130; }
    this.menuPrevious = held;
    return events;
  }
  private padActive(pad: PadState): boolean { return pad.axes.some(axis => Math.abs(axis) > this.settings.stickDeadzone) || pad.buttons.some(button => button.pressed || button.value > this.settings.triggerDeadzone); }
  sample(now: number): DriverActions {
    const dt = this.lastTime === null ? 1 / 60 : clamp((now - this.lastTime) / 1000, 0, .05); this.lastTime = now;
    if (!this.enabled || !this.focused) return neutral();
    const held = (action: BoundAction) => this.accepts('keyboard') && this.device !== 'touch' && this.settings.bindings[action].some(key => this.keys.has(key));
    const pad = this.accepts('gamepad') && this.device !== 'touch' && this.activePad && !this.padBlocked ? this.activePad : null;
    const touch = this.device === 'touch' ? this.touchState : neutralTouch();
    const b = (index: number) => !!pad?.buttons[index]?.pressed;
    const trigger = (index: number) => Math.max(0, applyDeadzone(pad?.buttons[index]?.value ?? 0, this.settings.triggerDeadzone));
    const target = Number(held('right')) - Number(held('left'));
    const delta = this.settings.steeringRamp * dt;
    this.steering += clamp(target - this.steering, -delta, delta);
    const analog = applyDeadzone(pad?.axes[0] ?? 0, this.settings.stickDeadzone) * this.settings.sensitivity;
    const longitudinal = applyDeadzone(pad?.axes[1] ?? 0, this.settings.stickDeadzone);
    const siren = held('siren') || b(2) || touch.siren;
    const recovering = held('recover') || b(3) || touch.recover;
    if (recovering && this.recoverStarted === null) this.recoverStarted = now;
    if (!recovering) { this.recoverStarted = null; this.recoverSent = false; }
    this.recoverProgress = this.recoverStarted === null ? 0 : clamp((now - this.recoverStarted) / 1000, 0, 1);
    const recover = this.recoverProgress === 1 && !this.recoverSent;
    if (recover) this.recoverSent = true;
    const actions = { steer: this.device === 'touch' ? touch.steer : clamp(Math.abs(analog) > .001 ? analog : this.steering, -1, 1), throttle: Math.max(touch.throttle, Number(held('throttle')), trigger(7), -longitudinal), brakeReverse: Math.max(touch.brakeReverse, Number(held('brakeReverse')), trigger(6), longitudinal), handbrake: touch.handbrake || held('handbrake') || b(0), fire: touch.fire || held('fire') || b(5), sirenToggle: this.touchSirenPending || siren && !this.sirenWasDown, recover };
    this.touchSirenPending = false;
    this.sirenWasDown = siren;
    return actions;
  }
}

export interface InputSourceOptions {
  target?: Window;
  document?: Document;
  gamepads?: () => readonly (PadState | null)[];
  now?: () => number;
  onNeutralize?: () => void;
  onReset?: () => void;
  onMenuAction?: (action: MenuAction) => void;
  settings?: Partial<InputSettings>;
}
export function createInputSource(options: InputSourceOptions = {}) {
  const target = options.target ?? window;
  const doc = options.document ?? target.document;
  const now = options.now ?? (() => performance.now());
  const readPads = options.gamepads ?? (() => Array.from(target.navigator.getGamepads?.() ?? []));
  let persisted: Partial<InputSettings> = {};
  try { persisted = JSON.parse(target.localStorage.getItem('fender-input-v1') ?? '{}') as Partial<InputSettings>; } catch { /* Storage can be disabled. */ }
  const controller = new InputController({ ...persisted, ...options.settings }, () => { options.onReset?.(); options.onNeutralize?.(); });
  const preferredDevice = (): DeviceKind => controller.settings.controlScheme === 'auto' ? target.navigator.maxTouchPoints > 0 ? 'touch' : 'keyboard' : controller.settings.controlScheme;
  controller.device = preferredDevice();
  const menuKeys: Record<string, MenuAction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'confirm', Escape: 'pause' };
  const isEditing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(doc.activeElement?.tagName ?? '');
  const keydown = (event: KeyboardEvent) => {
    // Text entry (including an on-screen keyboard) does not choose a driving device.
    if (controller.focused && !event.repeat && !isEditing() && (menuKeys[event.code] || Object.values(controller.settings.bindings).flat().includes(event.code))) controller.activate('keyboard');
    if (event.code === 'Escape') { event.preventDefault(); if (!event.repeat) options.onMenuAction?.('pause'); return; }
    if (!controller.enabled) { if (!isEditing() && menuKeys[event.code]) { event.preventDefault(); options.onMenuAction?.(menuKeys[event.code]); } return; }
    if (isEditing()) return;
    if (Object.values(controller.settings.bindings).flat().includes(event.code)) {
      event.preventDefault();
      // Repeats must never resurrect a key held across a menu or focus change.
      // A new physical press also clears a release that happened while unfocused.
      if (!event.repeat) { controller.key(event.code, false); controller.key(event.code, true); }
    }
  };
  const keyup = (event: KeyboardEvent) => controller.key(event.code, false);
  const blur = () => controller.setFocused(false);
  const focus = () => controller.setFocused(!doc.hidden);
  const visibility = () => controller.setFocused(!doc.hidden && doc.hasFocus());
  const disconnect = () => { controller.reset(); controller.poll(readPads(), now()); };
  const pointer = (event: PointerEvent) => { if (event.pointerType === 'touch' && controller.enabled) controller.activate('touch'); };
  const resize = () => { if (controller.device === 'touch') controller.reset(); };
  const poll = () => { for (const action of controller.poll(readPads(), now())) if (!controller.enabled || action === 'pause') options.onMenuAction?.(action); };
  target.addEventListener('keydown', keydown); target.addEventListener('keyup', keyup); target.addEventListener('blur', blur); target.addEventListener('focus', focus); target.addEventListener('gamepaddisconnected', disconnect); target.addEventListener('pointerdown', pointer); target.addEventListener('resize', resize); doc.addEventListener('visibilitychange', visibility);
  return {
    sample: () => { poll(); return controller.sample(now()); },
    activeDevice: () => controller.device,
    resetHeldState: () => controller.reset(),
    setTouchState: (state: TouchControls) => controller.touch(state),
    setEnabled: (enabled: boolean) => controller.setEnabled(enabled),
    pollMenus: poll,
    getStatus: () => ({ activeDevice: controller.device, unsupportedPad: controller.unsupportedPad, recoverProgress: controller.recoverProgress, focused: controller.focused }),
    getSettings: () => structuredClone(controller.settings),
    setSettings: (settings: Partial<InputSettings>) => { const previousScheme = controller.settings.controlScheme; controller.settings = sanitizeSettings({ ...controller.settings, ...settings }); controller.reset(); if (previousScheme !== controller.settings.controlScheme) controller.device = preferredDevice(); try { target.localStorage.setItem('fender-input-v1', JSON.stringify(controller.settings)); } catch { /* Optional persistence. */ } },
    dispose: () => { controller.reset(); target.removeEventListener('keydown', keydown); target.removeEventListener('keyup', keyup); target.removeEventListener('blur', blur); target.removeEventListener('focus', focus); target.removeEventListener('gamepaddisconnected', disconnect); target.removeEventListener('pointerdown', pointer); target.removeEventListener('resize', resize); doc.removeEventListener('visibilitychange', visibility); },
  };
}
