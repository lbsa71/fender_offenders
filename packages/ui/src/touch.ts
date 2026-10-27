import type { TouchControls } from '@fender/contracts';

const neutral = (): TouchControls => ({ driveX: 0, driveY: 0, handbrake: false, fire: false, siren: false, recover: false });

/** Pointer ownership stays local; only normalized held actions leave the UI. */
export function mountTouchControls(parent: HTMLElement, onInput: (state: TouchControls) => void, onCancel: () => void) {
  const root = parent.ownerDocument.createElement('section');
  root.className = 'fo-touch-controls'; root.hidden = true; root.setAttribute('aria-label', 'Touch driving controls');
  root.innerHTML = `<button type="button" class="fo-touch-drive" aria-label="Drive: drag toward where you want to go; release to coast"><span class="fo-touch-knob" aria-hidden="true"></span><span class="fo-touch-caption">DRIVE</span></button>
    <div class="fo-touch-actions"><div class="fo-touch-utility"><button type="button" data-touch="siren" aria-label="Toggle siren">SIREN</button><button type="button" data-touch="recover" aria-label="Hold to recover vehicle">HOLD<br>RECOVER</button></div><div class="fo-touch-deploy"><button type="button" data-touch="bomb" hidden>BOMB</button><button type="button" data-touch="oil" hidden>OIL</button><button type="button" data-touch="blades" hidden>BLADES</button></div><div class="fo-touch-primary"><button type="button" data-touch="handbrake">DRIFT</button><button type="button" data-touch="fire">FIRE</button></div><button type="button" data-touch="combo" aria-label="Drift and fire together">DRIFT + FIRE</button></div>`;
  parent.append(root);
  const drive = root.querySelector<HTMLButtonElement>('.fo-touch-drive')!;
  const knob = root.querySelector<HTMLElement>('.fo-touch-knob')!;
  const deployRow=root.querySelector<HTMLElement>('.fo-touch-deploy')!;
  const deployButtons=new Map([...deployRow.querySelectorAll<HTMLButtonElement>('button')].map(button=>[button.dataset.touch!,button]));
  for(const button of deployButtons.values())button.remove();
  const pointers = new Map<number, HTMLElement>();
  let state = neutral();
  const reset = () => {
    const held = [...pointers]; pointers.clear(); state = neutral();
    knob.style.transform = 'translate(0px, 0px)';
    root.querySelectorAll('.fo-touch-held').forEach(node => node.classList.remove('fo-touch-held'));
    for (const [id, node] of held) if (node.hasPointerCapture(id)) node.releasePointerCapture(id);
  };
  const emit = () => onInput({ ...state });
  const moveStick = (event: PointerEvent) => {
    const box = drive.getBoundingClientRect(), radius = Math.min(box.width, box.height) * .35;
    const x = (event.clientX - box.left - box.width / 2) / radius, y = (event.clientY - box.top - box.height / 2) / radius;
    const length = Math.max(1, Math.hypot(x, y));state.driveX=x/length;state.driveY=y/length;
    knob.style.transform = `translate(${x / length * radius}px, ${y / length * radius}px)`;
  };
  const buttons = () => {
    const active = new Set([...pointers.values()].map(node => node.dataset.touch));
    state.fire = active.has('fire') || active.has('combo'); state.handbrake = active.has('handbrake') || active.has('combo');
    state.siren = active.has('siren'); state.recover = active.has('recover');
    const deploy=['bomb','oil','blades'].find(kind=>active.has(kind)) as TouchControls['deploy'];if(deploy)state.deploy=deploy;else delete state.deploy;
  };
  const down = (event: PointerEvent) => {
    if (root.hidden || event.button !== 0) return;
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || button.hidden || !root.contains(button) || [...pointers.values()].includes(button)) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId); pointers.set(event.pointerId, button); button.classList.add('fo-touch-held');
    if (button === drive) moveStick(event); else buttons();
    emit();
  };
  const move = (event: PointerEvent) => { if (pointers.get(event.pointerId) === drive) { event.preventDefault(); moveStick(event); emit(); } };
  const up = (event: PointerEvent) => {
    const button = pointers.get(event.pointerId); if (!button) return;
    event.preventDefault(); pointers.delete(event.pointerId); button.classList.remove('fo-touch-held');
    if (button === drive) { state.driveX = state.driveY = 0; knob.style.transform = 'translate(0px, 0px)'; } else buttons();
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    emit();
  };
  const cancel = (event: PointerEvent) => { if (pointers.has(event.pointerId)) { reset(); onCancel(); } };
  const context = (event: Event) => event.preventDefault();
  root.addEventListener('pointerdown', down); root.addEventListener('pointermove', move); root.addEventListener('pointerup', up);
  root.addEventListener('pointercancel', cancel); root.addEventListener('lostpointercapture', cancel); root.addEventListener('contextmenu', context);
  return { reset, setWeaponsEnabled(weapons:{bombsEnabled?:boolean;oilEnabled?:boolean;bladesEnabled?:boolean}) {
      for(const [kind,enabled] of [['bomb',weapons.bombsEnabled],['oil',weapons.oilEnabled],['blades',weapons.bladesEnabled]] as const){const button=deployButtons.get(kind)!;if(enabled){if(button.parentElement!==deployRow)deployRow.append(button);button.hidden=false;}else button.remove();if(!enabled&&state.deploy===kind){reset();onCancel();}}
    }, setGunsEnabled(enabled: boolean) {
      root.querySelectorAll<HTMLElement>('[data-touch="fire"],[data-touch="combo"]').forEach(button => { button.hidden = !enabled; });
      if (!enabled && state.fire) { reset(); onCancel(); }
    }, setVisible(visible: boolean) { if (!visible && !root.hidden) { const held = pointers.size > 0; reset(); if (held) onCancel(); } root.hidden = !visible; },
    dispose() { reset(); root.removeEventListener('pointerdown', down); root.removeEventListener('pointermove', move); root.removeEventListener('pointerup', up); root.removeEventListener('pointercancel', cancel); root.removeEventListener('lostpointercapture', cancel); root.removeEventListener('contextmenu', context); root.remove(); } };
}
