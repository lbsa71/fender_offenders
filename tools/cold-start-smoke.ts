import assert from 'node:assert/strict';
import { createOnlineSession } from '@fender/net-client';
import { districtMap } from '@fender/content';
import { initPhysics } from '@fender/sim';
import { neutralActions } from '@fender/contracts';

// Run locally against a freshly started production container. Browser E2E and
// steady-state load tests have separate jobs; this checks the first live chase.
const endpoint = process.env.TEST_SERVER_URL ?? 'http://127.0.0.1:2567';
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const readyDeadline = performance.now() + 60_000;
while (true) {
  try {
    const response = await fetch(new URL('/ready', endpoint), { signal: AbortSignal.timeout(2000) });
    if (response.ok) break;
  } catch { /* Startup deliberately remains unready while physics warms. */ }
  assert.ok(performance.now() < readyDeadline, 'Production startup must become ready within 60 seconds');
  await pause(100);
}
const health = await (await fetch(new URL('/health', endpoint))).json();
assert.equal(health.rooms, 0, 'Use a fresh process, with no existing campaigns');
assert.equal(health.steps, 0, 'Startup preparation must not count as room simulation');

await initPhysics();
const session = createOnlineSession(endpoint, districtMap);
let timer: ReturnType<typeof setInterval> | undefined;
try {
  await session.connect({ roomId: crypto.randomUUID(), nickname: 'Startup check', vehicleBodyId: 'patrol' });
  session.request('start-round');
  const deadline = performance.now() + 30_000;
  while (session.getSnapshot()?.phase !== 'playing') {
    assert.ok(performance.now() < deadline, 'One officer must enter the first dispatch');
    await pause(20);
  }
  const initial = session.getSnapshot()!, start = performance.now();
  const initialPose = { ...initial.local!.vehicle.pose };
  let sequence = 0, nextInput = start, previousZ: number | undefined, maxBackwards = 0;
  timer = setInterval(() => {
    const now = performance.now(), snapshot = session.getSnapshot()!;
    let steps = 0;
    while (nextInput <= now && steps++ < 4) {
      session.submit({ sessionEpoch: snapshot.sessionEpoch, sequence: sequence++, clientTick: sequence, actions: { ...neutralActions(), throttle: 1 } });
      nextInput += 1000 / 60;
    }
    if (now - nextInput > 100) nextInput = now;
    const frame = session.sampleFrame(now)!;
    const z = frame.vehicles.find(vehicle => vehicle.entityId === frame.localEntityId)!.pose.z;
    if (previousZ !== undefined) maxBackwards = Math.max(maxBackwards, previousZ - z);
    previousZ = z;
  }, 1000 / 60);
  await pause(15_000);
  clearInterval(timer); timer = undefined;
  const after = session.getSnapshot()!, elapsed = (performance.now() - start) / 1000;
  const tickRate = (after.serverTick - initial.serverTick) / elapsed;
  const pose = after.local!.vehicle.pose, distance = Math.hypot(pose.x - initialPose.x, pose.z - initialPose.z);
  console.log(JSON.stringify({ endpoint, elapsed, tickRate, distance, maxBackwards, stats: session.getStats() }));
  assert.ok(tickRate >= 50, `A fresh solo campaign must sustain at least 50 ticks/second; observed ${tickRate.toFixed(2)}`);
  assert.ok(distance > 50, 'The officer must travel through the real district');
  assert.ok(maxBackwards < .5, `Straight driving jumped backward ${maxBackwards.toFixed(2)} m`);
  console.log('Cold-start solo authority smoke passed.');
} finally {
  if (timer) clearInterval(timer);
  await session.dispose();
}
