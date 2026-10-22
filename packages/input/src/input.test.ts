import { describe, expect, it, vi } from 'vitest';
import { applyDeadzone, InputController, sanitizeSettings, type PadState } from './index';

function pad(overrides: Partial<PadState> = {}): PadState { return { id: 'Test standard pad', index: 0, mapping: 'standard', connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })), ...overrides }; }
function button(p: PadState, index: number, value = 1): PadState { return { ...p, buttons: p.buttons.map((b, i) => i === index ? { value, pressed: value > .5 } : b) }; }

describe('normalized driver input', () => {
  it('ramps vehicle-relative keyboard steering and preserves held fire', () => {
    const input = new InputController(); input.setEnabled(true); input.key('KeyD', true); input.key('Space', true);
    expect(input.sample(0)).toMatchObject({ steer: 8 / 60, fire: true, throttle: 0 });
    const next = input.sample(1000 / 60); expect(next.steer).toBeCloseTo(16 / 60); expect(next.fire).toBe(true);
    input.key('KeyD', false); expect(input.sample(2000 / 60).steer).toBeCloseTo(8 / 60);
  });
  it('consumes siren edges once and requires a one-second recover hold', () => {
    const input = new InputController(); input.setEnabled(true); input.key('KeyE', true); input.key('KeyR', true);
    expect(input.sample(0)).toMatchObject({ sirenToggle: true, recover: false });
    expect(input.sample(999)).toMatchObject({ sirenToggle: false, recover: false });
    expect(input.sample(1000).recover).toBe(true); expect(input.sample(1017).recover).toBe(false);
    input.key('KeyR', false); input.sample(1100); input.key('KeyR', true); expect(input.sample(2000).recover).toBe(false);
  });
  it('neutralizes immediately on blur and ignores held keys until a fresh press', () => {
    const neutralize = vi.fn(); const input = new InputController(undefined, neutralize); input.setEnabled(true); input.key('KeyW', true); input.key('Space', true);
    expect(input.sample(0).throttle).toBe(1); input.setFocused(false); expect(neutralize).toHaveBeenCalledTimes(2); expect(input.sample(17).fire).toBe(false);
    input.setFocused(true); input.key('KeyW', true); expect(input.sample(34).throttle).toBe(0);
    input.key('KeyW', false); input.key('KeyW', true); expect(input.sample(51).throttle).toBe(1);
  });
  it('opening and closing a menu cannot replay held acceleration or firing', () => {
    const input = new InputController(); input.setEnabled(true); input.key('Space', true); input.key('KeyW', true);
    input.setEnabled(false); expect(input.sample(0)).toMatchObject({ throttle: 0, fire: false }); input.setEnabled(true);
    expect(input.sample(17)).toMatchObject({ throttle: 0, fire: false });
  });
  it('respects analog precision and remaps keys without allowing invalid ranges', () => {
    expect(applyDeadzone(.1, .16)).toBe(0); expect(applyDeadzone(.58, .16)).toBeCloseTo(.5);
    const input = new InputController(); input.setEnabled(true); input.poll([pad()], 0); input.poll([button(pad({ axes: [.58, 0] }), 7, .54)], 16);
    expect(input.sample(16).steer).toBeCloseTo(.5); expect(input.sample(32).throttle).toBeCloseTo(.5);
    const settings = sanitizeSettings({ stickDeadzone: 100, sensitivity: Number.NaN, bindings: { ...input.settings.bindings, fire: ['KeyF'] } });
    expect(settings.stickDeadzone).toBe(.5); expect(settings.sensitivity).toBe(.4);
    const remapped = new InputController(settings); remapped.setEnabled(true); remapped.key('KeyF', true); expect(remapped.sample(0).fire).toBe(true);
  });
  it('hot unplug clears keyboard and pad held state; held controls on reconnect need release', () => {
    const input = new InputController(); input.setEnabled(true); input.poll([pad()], 0); input.poll([button(button(pad(), 7), 5)], 16);
    expect(input.sample(16)).toMatchObject({ throttle: 1, fire: true }); input.poll([], 32); expect(input.sample(32)).toMatchObject({ throttle: 0, fire: false });
    input.poll([button(pad(), 7)], 48); expect(input.sample(48).throttle).toBe(0); input.poll([pad()], 64); input.poll([button(pad(), 7)], 80); expect(input.sample(80).throttle).toBe(1);
  });
  it('never guesses a nonstandard controller mapping', () => {
    const input = new InputController(); input.setEnabled(true); input.poll([button(pad({ mapping: '', id: 'Unknown device' }), 7)], 0);
    expect(input.unsupportedPad).toBe('Unknown device'); expect(input.device).toBe('keyboard'); expect(input.sample(0).throttle).toBe(0);
  });
  it('controller navigation uses edges and bounded directional repeats', () => {
    const input = new InputController(); const down = button(pad(), 13);
    expect(input.poll([down], 0)).toEqual(['down']); expect(input.poll([down], 100)).toEqual([]); expect(input.poll([down], 400)).toEqual(['down']);
    expect(input.poll([down], 401)).toEqual([]); expect(input.poll([button(pad(), 0)], 550)).toEqual(['confirm']); expect(input.poll([button(pad(), 0)], 1000)).toEqual([]);
  });
});
