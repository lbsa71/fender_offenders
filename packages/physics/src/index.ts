import RAPIER from '@dimforge/rapier3d-compat';

let initialization: Promise<void> | undefined;
/** One WASM startup shared by independent authority, scenery and presentation worlds. */
export function initPhysics(): Promise<void> {
  return initialization ??= RAPIER.init();
}
