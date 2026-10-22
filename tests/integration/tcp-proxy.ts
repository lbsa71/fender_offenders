import { createServer, connect, type Socket } from 'node:net';
import { performance } from 'node:perf_hooks';

export interface TcpProfile { oneWayLatencyMs: number; jitterMs: number; stallAtMs?: number; stallDurationMs?: number }

/** Ordered byte-stream delay/stall. This does not pretend data chunks are IP packets or simulate packet loss. */
export async function createTcpProxy(listenPort: number, targetPort: number, profile: TcpProfile) {
  const sockets = new Set<Socket>(), timers = new Set<ReturnType<typeof setTimeout>>();
  const began = performance.now(); let random = 42;
  const relay = (source: Socket, target: Socket) => {
    let previousDelivery = 0;
    const queue: { chunk: Buffer; delivery: number }[] = [];
    let scheduled = false;
    const pump = () => {
      if (!queue.length) { scheduled = false; return; }
      scheduled = true;
      const timer = setTimeout(() => {
        timers.delete(timer);
        const item = queue.shift()!;
        if (!target.destroyed) target.write(item.chunk);
        pump();
      }, Math.max(0, queue[0]!.delivery - performance.now()));
      timers.add(timer);
    };
    source.on('data', chunk => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      const jitter = ((random / 4294967296) * 2 - 1) * profile.jitterMs;
      const now = performance.now(), elapsed = now - began;
      const stall = profile.stallAtMs !== undefined && elapsed >= profile.stallAtMs && elapsed < profile.stallAtMs + (profile.stallDurationMs ?? 0) ? profile.stallAtMs + (profile.stallDurationMs ?? 0) - elapsed : 0;
      const delivery = Math.max(previousDelivery, now + Math.max(0, profile.oneWayLatencyMs + jitter) + stall);
      previousDelivery = delivery;
      queue.push({ chunk: Buffer.from(chunk), delivery });
      // One FIFO pump prevents millisecond timer rounding from reordering same-deadline chunks.
      if (!scheduled) pump();
    });
  };
  const server = createServer(downstream => {
    const upstream = connect(targetPort, '127.0.0.1');
    for (const socket of [downstream, upstream]) { sockets.add(socket); socket.setNoDelay(true); socket.on('error', () => {}); socket.on('close', () => sockets.delete(socket)); }
    downstream.on('close', () => upstream.destroy()); upstream.on('close', () => downstream.destroy());
    relay(downstream, upstream); relay(upstream, downstream);
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(listenPort, '127.0.0.1', resolve); });
  return {
    endpoint: `ws://127.0.0.1:${listenPort}`,
    async dispose() {
      for (const timer of timers) clearTimeout(timer); timers.clear();
      for (const socket of sockets) socket.destroy(); sockets.clear();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
