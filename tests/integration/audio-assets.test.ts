import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

describe('shipping audio provenance audit', () => {
  it('keeps the siren loop seam within the ordinary nearby waveform steps', () => {
    const bytes = readFileSync('packages/content/audio/patrol/siren.wav');
    const count = (bytes.length - 44) / 2, sample = (i: number) => bytes.readInt16LE(44 + i * 2);
    let nearbyStep = 0;
    for (let i = 1; i < 240; i++) nearbyStep = Math.max(nearbyStep, Math.abs(sample(i) - sample(i - 1)), Math.abs(sample(count - i) - sample(count - i - 1)));
    expect(Math.abs(sample(0) - sample(count - 1))).toBeLessThanOrEqual(nearbyStep * 1.1);
  });
  it('rejects a changed recording whose manifest hash no longer matches', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'fender-audio-audit-'));
    if (dirname(resolve(temporary)) !== resolve(tmpdir())) throw new Error('Audio audit temporary directory escaped its parent');
    try {
      cpSync('packages/content/audio/patrol', temporary, { recursive: true });
      const file = join(temporary, 'idle.wav'), bytes = readFileSync(file);
      bytes[100] ^= 1; writeFileSync(file, bytes);
      expect(() => execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'tools/assets/check.ts', '--audio-root', temporary], { stdio: 'pipe' })).toThrow(/Audio hash mismatch: idle\.wav/);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });
});
