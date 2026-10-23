import { expect, it } from 'vitest';
import type { WorldSnapshot } from '@fender/contracts';
import { deriveHud } from './index';

it('normalizes unit integrity against that vehicle max health instead of treating HP as a percentage', () => {
  const snapshot = { vehicles: [{ playerId: 'you', bodyAssetId: 'army', health: 150, maxHealth: 200, status: 'active', velocity: { x: 0, z: 0 } }], scores: [], phase: 'playing' } as unknown as WorldSnapshot;
  expect(deriveHud({ snapshot, localPlayerId: 'you' }).health).toBe(75);
});
