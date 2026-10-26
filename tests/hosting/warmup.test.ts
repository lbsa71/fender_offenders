import { afterEach, expect, it, vi, type Mock } from 'vitest';
import type { Simulation } from '@fender/sim';
import type { WorldSnapshot } from '@fender/contracts';

const observed = vi.hoisted(() => ({
  failStep: false,
  simulations: [] as { sim: Simulation; dispose: Mock<() => void>; finalState?: WorldSnapshot }[],
}));
vi.mock('@fender/sim', async original => {
  const actual = await original<typeof import('@fender/sim')>();
  return { ...actual, createSimulation: vi.fn((...args: Parameters<typeof actual.createSimulation>) => {
    const sim = actual.createSimulation(...args);
    const record: typeof observed.simulations[number] = { sim, dispose: vi.fn<() => void>() };
    const dispose = sim.dispose.bind(sim);
    record.dispose = vi.fn(() => { record.finalState = sim.snapshot(); dispose(); });
    sim.dispose = record.dispose;
    if (observed.failStep) sim.step = () => { throw new Error('forced warmup step failure'); };
    observed.simulations.push(record);
    return sim;
  }) };
});

afterEach(() => {
  observed.failStep = false;
  // Successful startup must already have disposed its temporary world.
  for (const record of observed.simulations.splice(0)) {
    if (!record.dispose.mock.calls.length) record.sim.dispose();
  }
  vi.clearAllMocks();
  vi.resetModules();
});

it('warms only one disposable world for concurrent callers without changing rooms, metrics or a fresh campaign', async () => {
  const { serverMetrics, roomRegistry } = await import('@fender/net-server');
  const beforeMetrics = structuredClone(serverMetrics);
  const beforeRooms = { registered: roomRegistry.registered.size, creating: roomRegistry.creating.size };
  const { warmServerRuntime } = await import('../../apps/server/src/warmup');
  await Promise.all([warmServerRuntime(), warmServerRuntime(), warmServerRuntime()]);
  expect(observed.simulations).toHaveLength(1);
  const warm = observed.simulations[0]!;
  expect(warm.finalState!.serverTick).toBeGreaterThan(0);
  expect(warm.finalState!.props!.length).toBeGreaterThan(100);
  expect(warm.dispose).toHaveBeenCalledTimes(1);
  expect(() => warm.sim.snapshot()).toThrow('disposed');
  await warmServerRuntime();
  expect(observed.simulations).toHaveLength(1);
  expect(serverMetrics).toEqual(beforeMetrics);
  expect({ registered: roomRegistry.registered.size, creating: roomRegistry.creating.size }).toEqual(beforeRooms);

  const { createSimulation } = await import('@fender/sim');
  const { districtMap, districtProps } = await import('@fender/content');
  const fresh = createSimulation(districtMap, { mode: 'multiplayer', matchId: 'fresh-after-warmup', campaign: true, pursuit: true, trafficCount: 8, props: districtProps });
  fresh.addPlayer({ playerId: 'first-officer', nickname: 'First officer' });
  try {
    const state = fresh.snapshot('first-officer');
    expect(state).toMatchObject({ serverTick: 0, phase: 'lobby', campaign: { dispatchIndex: 0, status: 'active', outcomes: [] } });
    expect(state.local!.driver.shotOrdinal).toBe(0);
    expect(state.scores).toMatchObject([{ playerId: 'first-officer', score: 0, wrecks: 0 }]);
    expect(state.props!.every(prop => prop.discontinuityId === 0)).toBe(true);
  } finally { fresh.dispose(); }
});

it('disposes temporary physics and rejects startup when warmup fails', async () => {
  observed.failStep = true;
  const { serverMetrics, roomRegistry } = await import('@fender/net-server');
  const beforeMetrics = structuredClone(serverMetrics);
  const { warmServerRuntime } = await import('../../apps/server/src/warmup');
  await expect(warmServerRuntime()).rejects.toThrow('forced warmup step failure');
  expect(observed.simulations).toHaveLength(1);
  expect(observed.simulations[0]!.dispose).toHaveBeenCalledTimes(1);
  expect(() => observed.simulations[0]!.sim.snapshot()).toThrow('disposed');
  expect(serverMetrics).toEqual(beforeMetrics);
  expect(roomRegistry.registered.size).toBe(0);
  expect(roomRegistry.creating.size).toBe(0);
});
