import { describe, expect, it } from 'vitest';
import { ALL_CAMPAIGN_TARGETS } from '@fender/contracts';
import catalog from './suspect-voices.json';
import { suspectVoice } from './suspect-voice';

describe('authored suspect speech', () => {
  it('covers all fifty suspects in roster order with four individual short lines', () => {
    expect(Object.keys(catalog)).toEqual(ALL_CAMPAIGN_TARGETS.map(target => target.id));
    const lines = new Set<string>();
    for (const target of ALL_CAMPAIGN_TARGETS) {
      for (const variant of ['briefing', 'escaped', 'wrecked', 'arrested'] as const) {
        const voice = suspectVoice(target.id, variant)!;
        expect(voice.url).toBe(`/voices/${target.id}/${variant}.mp3`);
        expect(voice.text.length).toBeGreaterThan(10);
        expect(voice.text.length).toBeLessThan(80);
        expect(lines.has(voice.text), voice.text).toBe(false); lines.add(voice.text);
      }
    }
    expect(lines.size).toBe(200);
    expect(suspectVoice('__proto__', 'briefing')).toBeNull();
    expect(suspectVoice('unknown', 'briefing')).toBeNull();
  });
});

import { vi } from 'vitest';
import { SuspectVoicePlayer } from './suspect-voice';
it('retries blocked playback only on intentional activation, not routine screen updates', async () => {
  const listeners = new Map<string, () => void>();
  const audio = { hidden: false, preload: '', dataset: {}, src: '', currentTime: 0, muted: false, volume: 1,
    play: vi.fn().mockRejectedValue(new Error('Playback blocked')), pause: vi.fn(), load: vi.fn(), removeAttribute: vi.fn(), remove: vi.fn() };
  const doc = { createElement: () => audio, body: { append: vi.fn() },
    addEventListener: (kind: string, callback: () => void) => listeners.set(kind, callback), removeEventListener: vi.fn() } as unknown as Document;
  const player = new SuspectVoicePlayer(doc);
  const settings = { masterVolume: .7, effectsVolume: .8, muted: false };
  player.update('nico:briefing', '/voices/nico-nickel/briefing.mp3', true, settings);
  listeners.get('pointerdown')!(); await Promise.resolve();
  expect(audio.play).toHaveBeenCalledTimes(1);
  player.update('nico:briefing', '/voices/nico-nickel/briefing.mp3', true, settings);
  expect(audio.play).toHaveBeenCalledTimes(1);
  listeners.get('keydown')!(); await Promise.resolve();
  expect(audio.play).toHaveBeenCalledTimes(2);
  player.dispose();
});

import { SuspectVoiceSelection, suspectVoices } from './suspect-voice';
it('rotates each suspect/outcome independently, retaining a line through snapshots and settings', () => {
  const selection = new SuspectVoiceSelection();
  const first = selection.select('attempt-1:briefing', 'nico-nickel', 'briefing', true);
  expect(first).toEqual(suspectVoice('nico-nickel', 'briefing'));
  expect(selection.select('attempt-1:briefing', 'nico-nickel', 'briefing', false)).toBe(first);
  expect(selection.select('attempt-1:briefing', 'nico-nickel', 'briefing', true)).toBe(first);
  selection.select('attempt-1:playing', 'nico-nickel', 'briefing', false);
  const second = selection.select('attempt-2:briefing', 'nico-nickel', 'briefing', true);
  expect(second?.url).not.toBe(first?.url);
  expect(selection.select('attempt-2:briefing', 'nico-nickel', 'briefing', true)).toBe(second);
  expect(selection.select('attempt-2:results', 'nico-nickel', 'arrested', true)).toEqual(suspectVoice('nico-nickel', 'arrested'));
  expect(selection.select('mabel:briefing', 'mabel-clench', 'briefing', true)).toEqual(suspectVoice('mabel-clench', 'briefing'));
});
it('cycles all available lines before repeating and does not consume hidden arrivals', () => {
  const selection = new SuspectVoiceSelection();
  expect(selection.select('hidden:briefing', 'nico-nickel', 'briefing', false)).toBeNull();
  const lines = suspectVoices('nico-nickel', 'briefing');
  expect(lines.length).toBeGreaterThanOrEqual(2);
  for (let index = 0; index <= lines.length; index++) {
    expect(selection.select(`visit-${index}`, 'nico-nickel', 'briefing', true)).toEqual(lines[index % lines.length]);
  }
});
it('every selectable alternate is short, individual and attached to an original suspect/outcome', () => {
  const text = new Set<string>();
  for (const target of ALL_CAMPAIGN_TARGETS) for (const variant of ['briefing', 'escaped', 'wrecked', 'arrested'] as const) {
    const lines = suspectVoices(target.id, variant);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const line of lines) {
      expect(text.has(line.text), line.text).toBe(false); text.add(line.text);
      expect(line.text.length).toBeLessThan(100);
      expect(line.url).toMatch(new RegExp(`^/voices/${target.id}/${variant}(?:-\\d+)?\\.mp3$`));
    }
  }
});

import plannedAlternates from '../../../tools/suspect-voice-alternates.json';
it('keeps pending scripts distinct from selectable recordings and validates the complete draft roster', () => {
  expect(Object.keys(plannedAlternates)).toEqual(ALL_CAMPAIGN_TARGETS.map(target => target.id));
  const seen = new Set(Object.values(catalog).flatMap(entry => Object.values(entry.lines)));
  for (const entry of Object.values(plannedAlternates)) {
    expect(Object.keys(entry)).toEqual(['briefing', 'escaped', 'wrecked', 'arrested']);
    for (const lines of Object.values(entry)) for (const line of lines) {
      expect(seen.has(line), line).toBe(false); seen.add(line);
      expect(line.length).toBeGreaterThan(10);
      expect(line.length).toBeLessThan(100);
      expect(line).not.toMatch(/\[|\]/);
    }
  }
});
