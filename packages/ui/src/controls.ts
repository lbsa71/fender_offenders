import type { DeviceKind } from '@fender/contracts';

/** Original DOM/CSS control graphics; key labels always use textContent. */
export const keyboardBindings: Record<string, string[]> = {
  throttle: ['KeyW', 'ArrowUp'], brakeReverse: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  handbrake: ['ShiftLeft', 'ShiftRight'], fire: ['Space'], siren: ['KeyE'], recover: ['KeyR'], bomb: ['KeyB'], oil: ['KeyQ'], blades: ['KeyC'],
};
const keyNames: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', Space: 'SPACE', Escape: 'ESC' };
function keycap(doc: Document, code: string) {
  const key = doc.createElement('kbd'); key.className = 'fo-keycap';
  key.textContent = keyNames[code] ?? code.replace(/^(Key|Digit)/, '');
  if (code.startsWith('Arrow')) key.setAttribute('aria-label', code.replace('Arrow', '') + ' arrow');
  return key;
}
function row(doc: Document, controls: HTMLElement[], label: string, action?: string) {
  const item = doc.createElement('div'); item.className = 'fo-control-row';
  if (action) item.dataset.control = action;
  const graphics = doc.createElement('span'); graphics.className = 'fo-control-graphics'; graphics.append(...controls);
  const text = doc.createElement('span'); text.className = 'fo-control-label'; text.textContent = label;
  item.append(graphics, text); return item;
}
export function keyboardControls(doc: Document, bindings: Record<string, string[]>, compact = false) {
  const group = doc.createElement('div'); group.className = 'fo-control-list';
  const keys = (action: string, primary = compact) => {
    const codes = bindings[action]?.length ? bindings[action]! : keyboardBindings[action]!;
    const unique = [...new Map(codes.map(code => [keyNames[code] ?? code, code])).values()];
    return (primary ? unique.slice(0, 1) : unique).map(code => keycap(doc, code));
  };
  if (compact) {
    const cluster = doc.createElement('span'); cluster.className = 'fo-key-cluster';
    cluster.append(...['throttle', 'left', 'brakeReverse', 'right'].flatMap(action => keys(action)));
    group.append(row(doc, [cluster], 'DRIVE'));
  } else {
    for (const [action, label] of [['throttle', 'Accelerate'], ['brakeReverse', 'Brake / reverse'], ['left', 'Steer left'], ['right', 'Steer right']]) group.append(row(doc, keys(action!), label!));
  }
  for (const [action, label] of [['handbrake', 'Drift'], ['fire', 'Fire'], ['bomb','Throw bomb'], ['oil','Drop oil'], ['blades','Extend blades'], ['siren', 'Siren'], ['recover', 'Hold to recover']]) {
    if (compact && (action === 'siren' || action === 'recover')) continue;
    group.append(row(doc, keys(action!), compact ? label!.toUpperCase() : label!, action));
  }
  if (!compact) group.append(row(doc, [keycap(doc, 'Escape')], 'Pause / help'));
  return group;
}
function padGraphic(doc: Document, kind: string, text: string, name: string) {
  const graphic = doc.createElement('span'); graphic.className = `fo-pad fo-pad-${kind}`;
  graphic.setAttribute('role', 'img'); graphic.setAttribute('aria-label', name);
  const mark = doc.createElement('span'); mark.textContent = text; graphic.append(mark); return graphic;
}
export function gamepadControls(doc: Document, compact = false) {
  const group = doc.createElement('div'); group.className = 'fo-control-list';
  const pad = (kind: string, text: string, name: string) => padGraphic(doc, kind, text, name);
  if (compact) group.append(row(doc, [pad('stick', 'L', 'Left stick'), pad('trigger', 'RT', 'Right trigger'), pad('trigger', 'LT', 'Left trigger')], 'POINT LEFT STICK TO DRIVE · RELEASE TO COAST'));
  else {
    group.append(row(doc, [pad('stick', 'L', 'Left stick')], 'Point toward where you want to go'));
    group.append(row(doc, [pad('trigger', 'RT', 'Right trigger')], 'Accelerate'));
    group.append(row(doc, [pad('trigger', 'LT', 'Left trigger')], 'Brake / reverse'));
  }
  group.append(row(doc, [pad('a', 'A', 'A button')], compact ? 'DRIFT' : 'Drift'));
  group.append(row(doc, [pad('bumper', 'RB', 'Right bumper')], compact ? 'FIRE' : 'Fire', 'fire'));
  for(const [action,label,kind,text,name] of [['bomb','Throw bomb','bumper','LB','Left bumper'],['oil','Drop oil','stick','LS','Left stick button'],['blades','Extend blades','stick','RS','Right stick button']])group.append(row(doc,[pad(kind!,text!,name!)],label!,action));
  if (!compact) {
    group.append(row(doc, [pad('x', 'X', 'X button')], 'Siren'));
    group.append(row(doc, [pad('y', 'Y', 'Y button')], 'Hold to recover'));
    group.append(row(doc, [pad('menu', '☰', 'Menu button')], 'Pause / help'));
  }
  return group;
}

/** Preserve authored dispatch hints while drawing device-specific silhouettes. */
export function controlGraphics(doc: Document, hints: readonly { action: string; label: string; glyph: string }[], device: DeviceKind) {
  const result = doc.createDocumentFragment();
  const buttons: Record<string, [string, string, string]> = {
    drive: ['stick', 'L', 'Left stick'], throttle: ['trigger', 'RT', 'Right trigger'], brakeReverse: ['trigger', 'LT', 'Left trigger'], steer: ['stick', 'L', 'Left stick'],
    handbrake: ['a', 'A', 'A button'], siren: ['x', 'X', 'X button'], recover: ['y', 'Y', 'Y button'], fire: ['bumper', 'RB', 'Right bumper'], bomb:['bumper','LB','Left bumper'], oil:['stick','LS','Left stick button'], blades:['stick','RS','Right stick button'],
  };
  for (const hint of hints) {
    const button = buttons[hint.action];
    const graphics = device === 'gamepad' && button ? [padGraphic(doc, ...button)] : hint.glyph.split(/\s*\/\s*|\s+/).filter(Boolean).map(key => keycap(doc, key));
    result.append(row(doc, graphics, hint.label, hint.action));
  }
  return result;
}
