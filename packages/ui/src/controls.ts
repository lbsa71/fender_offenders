/** Original DOM/CSS control graphics; key labels always use textContent. */
export const keyboardBindings: Record<string, string[]> = {
  throttle: ['KeyW', 'ArrowUp'], brakeReverse: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  handbrake: ['ShiftLeft', 'ShiftRight'], fire: ['Space'], siren: ['KeyE'], recover: ['KeyR'],
};
const keyNames: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', Space: 'SPACE', Escape: 'ESC' };
function keycap(doc: Document, code: string) {
  const key = doc.createElement('kbd'); key.className = 'fo-keycap';
  key.textContent = keyNames[code] ?? code.replace(/^(Key|Digit)/, '');
  if (code.startsWith('Arrow')) key.setAttribute('aria-label', code.replace('Arrow', '') + ' arrow');
  return key;
}
function row(doc: Document, controls: HTMLElement[], label: string) {
  const item = doc.createElement('div'); item.className = 'fo-control-row';
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
  for (const [action, label] of [['handbrake', 'Drift'], ['fire', 'Fire'], ['siren', 'Siren'], ['recover', 'Hold to recover']]) {
    if (compact && (action === 'siren' || action === 'recover')) continue;
    group.append(row(doc, keys(action!), compact ? label!.toUpperCase() : label!));
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
  if (compact) group.append(row(doc, [pad('stick', 'L', 'Left stick'), pad('trigger', 'RT', 'Right trigger'), pad('trigger', 'LT', 'Left trigger')], 'LEFT STICK DRIVE · RT/LT DRIVE/BRAKE'));
  else {
    group.append(row(doc, [pad('stick', 'L', 'Left stick')], 'Steer / drive'));
    group.append(row(doc, [pad('trigger', 'RT', 'Right trigger')], 'Accelerate'));
    group.append(row(doc, [pad('trigger', 'LT', 'Left trigger')], 'Brake / reverse'));
  }
  group.append(row(doc, [pad('a', 'A', 'A button')], compact ? 'DRIFT' : 'Drift'));
  group.append(row(doc, [pad('bumper', 'RB', 'Right bumper')], compact ? 'FIRE' : 'Fire'));
  if (!compact) {
    group.append(row(doc, [pad('x', 'X', 'X button')], 'Siren'));
    group.append(row(doc, [pad('y', 'Y', 'Y button')], 'Hold to recover'));
    group.append(row(doc, [pad('menu', '☰', 'Menu button')], 'Pause / help'));
  }
  return group;
}
