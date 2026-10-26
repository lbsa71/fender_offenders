import { getMessageBytes, Protocol } from '@colyseus/core';
import { districtMap, districtProps } from '@fender/content';
import { neutralActions, packSnapshot, type AppliedDriverInput } from '@fender/contracts';
import { createPropPublisher } from '@fender/net-server';
import { createSimulation, initPhysics } from '@fender/sim';

const WARMUP_TICKS = 600;
let warmed: Promise<void> | undefined;

/** Compile initial dispatch hot paths before accepting a real officer's room. */
export function warmServerRuntime(): Promise<void> {
  return warmed ??= runWarmup();
}

async function runWarmup(): Promise<void> {
  await initPhysics();
  const playerId = 'startup-officer';
  const sim = createSimulation(districtMap, {
    mode: 'multiplayer', matchId: 'startup-warmup', campaign: true,
    pursuit: true, trafficCount: 8, props: districtProps,
  });
  try {
    const officer = sim.addPlayer({ playerId, nickname: 'Warmup', sessionEpoch: 'startup', bodyAssetId: 'patrol' });
    const input: AppliedDriverInput = { actions: { ...neutralActions(), throttle: 1 }, sessionEpoch: 'startup', sourceCommandSequence: 0 };
    const inputs = new Map([[officer.entityId, input]]), publisher = createPropPublisher();
    sim.startRound(playerId);
    for (let tick = 0; tick < WARMUP_TICKS; tick++) {
      input.sourceCommandSequence = tick;
      input.actions.steer = Math.sin(tick / 80) * .35;
      sim.step(inputs);
      sim.drainEvents();
      if (tick % 3 === 0) {
        const snapshot = publisher.filter(packSnapshot(sim.snapshot(playerId)));
        getMessageBytes.raw(Protocol.ROOM_DATA, 'snapshot', snapshot);
      }
    }
  } finally { sim.dispose(); }
}
