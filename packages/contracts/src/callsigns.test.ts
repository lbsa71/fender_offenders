import { afterEach, expect, it, vi } from 'vitest';
import { randomCallsign } from './callsigns';

afterEach(() => vi.restoreAllMocks());

it('generates different original callsigns from different random choices', () => {
  const names = [0, .15, .4, .65, .9, 1].map(value => randomCallsign(() => value));
  expect(new Set(names).size).toBe(6);
  expect(names).not.toContain('Officer Rookie');
});

it('provides broad deterministic variety while keeping every name clean and at most 20 characters', () => {
  let state = 123456;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  const names = Array.from({ length: 400 }, () => randomCallsign(random));
  expect(new Set(names).size).toBeGreaterThan(80);
  for (const name of names) { expect(name).toMatch(/^[A-Za-z]+ [A-Za-z]+$/); expect(name.length).toBeLessThanOrEqual(20); }
});

it('uses the default random source rather than returning a fixed default identity', () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0); const first = randomCallsign();
  random.mockReturnValue(.99); expect(randomCallsign()).not.toBe(first);
});

it('keeps an invalid or endpoint random source bounded and returns a valid name', () => {
  for (const value of [-Infinity, -5, 0, 1, 3, Infinity, NaN]) {
    const name = randomCallsign(() => value); expect(name).toMatch(/^[A-Za-z]+ [A-Za-z]+$/); expect(name.length).toBeLessThanOrEqual(20);
  }
});
