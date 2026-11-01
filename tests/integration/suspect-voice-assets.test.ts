import { readFileSync, readdirSync, statSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { ALL_CAMPAIGN_TARGETS } from '@fender/contracts';
import catalog from '../../packages/ui/src/suspect-voices.json';
import { suspectVoices } from '../../packages/ui/src/suspect-voice';

it('ships every selectable recording with matching text, voice and provenance', () => {
  const root = 'apps/client/public/voices/';
  const manifest = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
  const files = readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(file => file.endsWith('.mp3')).map(file => file.replaceAll('\\', '/'));
  expect(files.sort()).toEqual(Object.keys(manifest).sort());
  const selectable = ALL_CAMPAIGN_TARGETS.flatMap(target => (['briefing', 'escaped', 'wrecked', 'arrested'] as const).flatMap(variant => suspectVoices(target.id, variant)));
  expect(selectable.length).toBeGreaterThanOrEqual(400);
  expect(Object.keys(manifest)).toHaveLength(selectable.length);
  for (const voice of selectable) {
    const path = voice.url.replace('/voices/', ''), entry = manifest[path];
    expect(entry.text).toBe(voice.text);
    expect(entry.bytes).toBe(statSync(root + path).size);
    expect(statSync(root + path).size).toBeGreaterThan(4000);
    expect(createHash('sha256').update(readFileSync(root + path)).digest('hex')).toBe(entry.sha256);
    const target = path.split('/')[0]!;
    expect(entry.voiceId).toBe(catalog[target as keyof typeof catalog].voiceId);
  }
  for (const target of ALL_CAMPAIGN_TARGETS) for (const variant of ['briefing', 'escaped', 'wrecked', 'arrested'] as const) {
    const path = `${target.id}/${variant}.mp3`, entry = manifest[path];
    const authored = catalog[target.id as keyof typeof catalog];
    expect(entry.text).toBe(authored.lines[variant]);
    expect(entry.voiceId).toBe(authored.voiceId);
    expect(statSync(root + path).size).toBeGreaterThan(4000);
    expect(createHash('sha256').update(readFileSync(root + path)).digest('hex')).toBe(entry.sha256);
  }
});
