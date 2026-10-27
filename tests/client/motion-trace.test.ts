import { expect, it } from 'vitest';
import { maxUnexplainedBackstep, summarizeMotion } from '../support/motion-trace';

it('measures a constant-speed rendered trace without introducing velocity changes', () => {
  const samples = Array.from({ length: 90 }, (_, i) => ({ at: i * 1000 / 60, sampleAt: i * 1000 / 60, z: i * 20 / 60, ack: i - 8, pending: 8 }));
  const result = summarizeMotion(samples);
  expect(result.steps).toHaveLength(89);
  expect(result.meanSpeed).toBeCloseTo(20, 8);
  expect(result.speedVariation).toBeLessThan(1e-8);
  expect(result.p95SpeedJump).toBeLessThan(1e-8);
});

it('uses pose sample time even when observer work takes a variable amount of time', () => {
  const samples = Array.from({ length: 90 }, (_, i) => ({ at: i * 1000 / 60 + (i % 2 ? 8 : 0), sampleAt: i * 1000 / 60, z: i * 20 / 60, ack: i - 8, pending: 8 }));
  const result = summarizeMotion(samples);
  expect(result.steps).toHaveLength(89);
  expect(result.meanSpeed).toBeCloseTo(20, 8);
  expect(result.speedVariation).toBeLessThan(1e-8);
  expect(result.p95SpeedJump).toBeLessThan(1e-8);
});

it('still exposes actual frame-to-frame jumps with an accurate sample clock', () => {
  const samples = Array.from({ length: 90 }, (_, i) => ({ at: i * 1000 / 60, sampleAt: i * 1000 / 60, z: i * 20 / 60 + (i >= 40 && i < 60 && i % 2 ? .5 : 0), ack: i - 8, pending: 8 }));
  const result = summarizeMotion(samples);
  expect(result.p95SpeedJump).toBeGreaterThan(12);
  expect(result.maxBackwards).toBeGreaterThan(.1);
});

it('detects a backward teleport without a contact correction', () => {
  expect(maxUnexplainedBackstep([
    { at: 0, z: 0, velocity: 0, contactZ: 0 },
    { at: 40, z: -.4, velocity: 0, contactZ: 0 },
  ])).toBeGreaterThan(.2);
});

it('does not mistake an authorized separation or continuous reverse motion for a rewind', () => {
  expect(maxUnexplainedBackstep([
    { at: 0, z: 0, velocity: 0, contactZ: 0 },
    { at: 40, z: -.35, velocity: 0, contactZ: -.35 },
  ])).toBeCloseTo(0, 9);
  expect(maxUnexplainedBackstep([
    { at: 0, z: 0, velocity: -2, contactZ: 0 },
    { at: 200, z: -.4, velocity: -2, contactZ: 0 },
  ])).toBeCloseTo(0, 9);
});

it('still detects a contact displacement applied twice or replayed with the same revision', () => {
  expect(maxUnexplainedBackstep([
    { at: 0, z: 0, velocity: 0, contactZ: 0 },
    { at: 40, z: -.7, velocity: 0, contactZ: -.35 },
  ])).toBeGreaterThan(.2);
  expect(maxUnexplainedBackstep([
    { at: 0, z: -.35, velocity: 0, contactZ: -.35 },
    { at: 40, z: -.7, velocity: 0, contactZ: -.35 },
  ])).toBeGreaterThan(.2);
});
