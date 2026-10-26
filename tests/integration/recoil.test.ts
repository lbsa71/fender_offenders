import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { Client } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import { createGameServer } from '../../apps/server/src/index';
import { createOnlineSession } from '@fender/net-client';
import { PROTOCOL_VERSION, neutralActions } from '@fender/contracts';
import { districtMap } from '@fender/content';
import type { Simulation } from '@fender/sim';
import { disposeTestRooms } from '../support/rooms';
import { randomUUID } from 'node:crypto';

const endpoint = 'http://127.0.0.1:2736', sessions: ReturnType<typeof createOnlineSession>[] = [];
let server: Awaited<ReturnType<typeof createGameServer>>;
beforeAll(async () => { server = await createGameServer(2736); });
afterEach(async () => { await Promise.all(sessions.splice(0).map(s => s.dispose())); await disposeTestRooms(); });
afterAll(async () => { await server.gracefullyShutdown(false); });
async function until(check: () => boolean) { const end = performance.now() + 5000; while (!check()) { if (performance.now() > end) throw Error('Recoil room observation timed out'); await new Promise(r => setTimeout(r, 10)); } }
async function connect(roomId?: string) {
  const session = createOnlineSession(endpoint, districtMap); sessions.push(session);
  await session.connect({ roomId: roomId ?? randomUUID(), nickname: 'Recoil officer', vehicleBodyId: 'patrol' }); return session;
}
it.each(['arcade-v8', 'arcade-v9', 'arcade-v10', 'arcade-v11', 'arcade-v12', 'arcade-v13', 'arcade-v14', 'arcade-v15', 'arcade-v16', 'arcade-v17'])('rejects the earlier %s gameplay build rather than mixing handling rules', async revision => {
  await expect(new Client(endpoint).create('district', { nickname: 'Old build', protocolVersion: PROTOCOL_VERSION, mapRevision: districtMap.revision, gameplayRevision: revision })).rejects.toThrow(/version-mismatch/);
});
it('predicts the kick immediately and replicates the accepted recoil state to the real room', async () => {
  const host = await connect(), guest = await connect(host.getIdentity().roomId);
  const sim = (matchMaker.getLocalRoomById(host.getIdentity().roomId) as unknown as { sim: Simulation }).sim;
  const checkpoint = sim.checkpoint(); checkpoint.state.campaign!.dispatchIndex=2; checkpoint.state.phase = 'playing'; checkpoint.state.phaseEnd = checkpoint.tick + 18000;
  for (const r of checkpoint.state.records) {
    r.vehicle.pose = { x: r.vehicle.playerId === host.getIdentity().playerId ? 0 : 80, z: -40, yaw: 0 };
    r.vehicle.velocity = { x: 0, z: 20, yawRate: 0 }; r.vehicle.protectedUntilTick = 0;
    // Fixture teleport/velocity replacement is an explicit room intervention.
    r.vehicle.discontinuityId++;
  }
  sim.restore(checkpoint);
  await until(() => host.getSnapshot()?.phase === 'playing');
  const before = host.sampleFrame()!.vehicles.find(v => v.playerId === host.getIdentity().playerId)!.velocity.z;
  const current = host.getSnapshot()!;
  host.submit({ sessionEpoch: current.sessionEpoch, sequence: 0, clientTick: 0, actions: { ...neutralActions(), fire: true } });
  const immediate = host.sampleFrame()!.vehicles.find(v => v.playerId === host.getIdentity().playerId)!.velocity.z;
  expect(immediate).toBeLessThan(before - 2.5);
  await until(() => host.getSnapshot()!.local!.driver.shotOrdinal > 0);
  const speed = host.getSnapshot()!.local!.vehicle.velocity.z; expect(speed).toBeLessThan(before - 2.5);
  await until(() => guest.getSnapshot()!.vehicles.some(v => v.playerId === host.getIdentity().playerId && v.velocity.z < before - 2.5));
});
