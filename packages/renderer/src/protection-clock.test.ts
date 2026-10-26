import { expect, it } from 'vitest';
import { isSpawnProtected } from './protection-clock';

it('ends blinking when room protection expires even for a recently opened browser', () => {
  expect(isSpawnProtected({ protectedUntilTick: 12120 }, { serverTick: 12120, sampleTimeSeconds: 6 })).toBe(false);
});

it('retains protection while a solo room is frozen even if browser time advances', () => {
  expect(isSpawnProtected({ protectedUntilTick: 300 }, { serverTick: 240, sampleTimeSeconds: 600 })).toBe(true);
});

it('keeps offline render fixtures compatible with their explicitly supplied simulation time', () => {
  expect(isSpawnProtected({ protectedUntilTick: 120 }, { sampleTimeSeconds: 1 })).toBe(true);
  expect(isSpawnProtected({ protectedUntilTick: 120 }, { sampleTimeSeconds: 2 })).toBe(false);
});
