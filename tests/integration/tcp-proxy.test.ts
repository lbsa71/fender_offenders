import { createConnection, createServer } from 'node:net';
import { expect, it } from 'vitest';
import { createTcpProxy } from './tcp-proxy.js';

it('preserves the exact ordered TCP byte stream across jitter and a shared stall deadline', async () => {
  const target = createServer(socket => socket.pipe(socket));
  await new Promise<void>(resolve => target.listen(2680, '127.0.0.1', resolve));
  const proxy = await createTcpProxy(2681, 2680, { oneWayLatencyMs: 4, jitterMs: 18, stallAtMs: 35, stallDurationMs: 90 });
  const socket = createConnection(2681, '127.0.0.1');
  socket.setNoDelay(true);
  const expected = Array.from({ length: 100 }, (_, i) => `${i.toString().padStart(3, '0')}\n`).join('');
  let interval: ReturnType<typeof setInterval> | undefined;
  try {
    const received = await new Promise<string>((resolve, reject) => {
      let output = '', ordinal = 0;
      const timer = setTimeout(() => reject(new Error('TCP echo timed out')), 3000);
      socket.on('error', reject);
      socket.on('data', bytes => { output += bytes.toString(); if (output.length >= expected.length) { clearTimeout(timer); resolve(output); } });
      socket.on('connect', () => { interval = setInterval(() => { socket.write(`${(ordinal++).toString().padStart(3, '0')}\n`); if (ordinal === 100) { clearInterval(interval); interval = undefined; } }, 1); });
    });
    expect(received).toBe(expected);
  } finally {
    if (interval) clearInterval(interval);
    socket.destroy(); await proxy.dispose();
    await new Promise<void>((resolve, reject) => target.close(error => error ? reject(error) : resolve()));
  }
});
