/** One compact control: click/Space to mute, drag vertically or use arrows for volume. */
export function mountVolumeKnob(doc: Document, change: (volume: number, muted: boolean) => void, activate: () => void) {
  const button = doc.createElement('button'); button.type = 'button'; button.className = 'fo-volume-knob'; button.dataset.audioControl = '';
  button.innerHTML = '<span aria-hidden="true">♪</span>';
  button.title = 'Click to mute/unmute. Drag up/down or use arrow keys to change volume.';
  let volume = .7, muted = false, lastAudible = .7, suppressClick = false;
  let drag: { pointer: number; y: number; volume: number; moved: boolean } | null = null;
  function update(value: number, silent: boolean) {
    volume = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0; muted = silent;
    if (volume > 0) lastAudible = volume;
    const quiet = muted || volume === 0;
    button.setAttribute('aria-label', `${quiet ? 'Unmute' : 'Mute'} audio. Volume ${Math.round(volume * 100)} percent.`);
    button.setAttribute('aria-pressed', String(quiet)); button.classList.toggle('fo-audio-muted', quiet);
    button.style.setProperty('--volume-angle', `${-120 + volume * 240}deg`);
  }
  const set = (value: number) => { const level = Math.max(0, Math.min(1, Math.round(value * 20) / 20)); update(level, level === 0); change(volume, muted); };
  const click = () => {
    if (suppressClick) { suppressClick = false; return; }
    activate(); const quiet = muted || volume === 0;
    update(quiet && volume === 0 ? lastAudible : volume, !quiet); change(volume, muted);
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    activate(); suppressClick = false; drag = { pointer: event.pointerId, y: event.clientY, volume, moved: false };
    button.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const delta = drag.y - event.clientY;
    if (Math.abs(delta) >= 4) drag.moved = true;
    if (drag.moved) set(drag.volume + delta / 120);
  };
  const up = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    suppressClick = drag.moved; drag = null;
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
  };
  const cancel = () => { drag = null; suppressClick = false; };
  const keys = (event: KeyboardEvent) => {
    if (['Enter', ' '].includes(event.key)) { event.stopPropagation(); return; }
    if (!['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); activate();
    set(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : volume + (['ArrowUp', 'ArrowRight'].includes(event.key) ? .05 : -.05));
  };
  const wheel = (event: WheelEvent) => { event.preventDefault(); event.stopPropagation(); activate(); set(volume - Math.sign(event.deltaY) * .05); };
  button.addEventListener('click', click); button.addEventListener('pointerdown', down); button.addEventListener('pointermove', move);
  button.addEventListener('pointerup', up); button.addEventListener('pointercancel', cancel); button.addEventListener('lostpointercapture', () => { drag = null; });
  button.addEventListener('keydown', keys); button.addEventListener('wheel', wheel, { passive: false });
  doc.defaultView?.addEventListener('blur', cancel); doc.defaultView?.addEventListener('resize', cancel);
  update(volume, muted);
  return { element: button, update, dispose() {
    cancel(); doc.defaultView?.removeEventListener('blur', cancel); doc.defaultView?.removeEventListener('resize', cancel); button.remove();
  } };
}
