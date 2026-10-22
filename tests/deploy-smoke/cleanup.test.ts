import { afterAll, beforeAll, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { Server, type Client } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DrivingRoom } from '@fender/net-server';
import type { Simulation } from '@fender/sim';

const consentedCloseCodes: number[] = [];
class ProxyCloseRoom extends DrivingRoom {
  override async onCreate() {
    await super.onCreate();
    const sim = (this as unknown as { sim: Simulation }).sim;
    const start = sim.startRound.bind(sim);
    sim.startRound = requester => {
      const accepted = start(requester);
      if (accepted) {
        const checkpoint = sim.checkpoint();
        // Exceed SDK's default five-second minimum reconnection uptime.
        checkpoint.state.phaseEnd = checkpoint.tick + 330;
        sim.restore(checkpoint);
      }
      return accepted;
    };
  }
  override onJoin(client: Client, options: unknown, auth: { nickname: string }) {
    super.onJoin(client, options, auth);
    const socket = client.ref as unknown as { close(code?: number, reason?: string): void };
    const close = socket.close.bind(socket);
    socket.close = (code, reason) => {
      if (code === 4000) consentedCloseCodes.push(code);
      // Reproduce a proxy surfacing intentional room leave as WebSocket Going Away.
      close(code === 4000 ? 1001 : code, reason);
    };
  }
}
let server: Server;
beforeAll(async () => {
  server = new Server({ transport: new WebSocketTransport(), greet: false, gracefullyShutdown: false, express: app => {
    app.get('/ready', (_req, res) => res.json({ ready: true }));
    app.get('/', (_req, res) => res.type('html').send('<title>Fender Offenders</title>'));
  } });
  server.define('district', ProxyCloseRoom);
  await server.listen(2695, '127.0.0.1');
}, 15000);
afterAll(async () => { await server?.gracefullyShutdown(false); });

it('exits successfully after smoke assertions even when a proxy changes intentional leave to Going Away', async () => {
  let child: ChildProcess | undefined;
  let output = '';
  let exitCode: number | null | undefined;
  try {
    child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'tools/deploy-smoke.ts'], { cwd: process.cwd(), env: { ...process.env, TEST_SERVER_URL: 'http://127.0.0.1:2695', TEST_ORIGIN: 'http://127.0.0.1:2695' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('exit', code => { exitCode = code; });
    child.stdout!.on('data', bytes => { output += bytes.toString(); });
    child.stderr!.on('data', bytes => { output += bytes.toString(); });
    const deadline = performance.now() + 12000;
    while (!output.includes('Production smoke passed:') && performance.now() < deadline && exitCode === undefined) await new Promise(resolve => setTimeout(resolve, 20));
    expect(output, 'The real smoke must finish its two-player round assertions first').toContain('Production smoke passed:');
    const cleanupDeadline = performance.now() + 2000;
    while (exitCode === undefined && performance.now() < cleanupDeadline) await new Promise(resolve => setTimeout(resolve, 20));
    expect(consentedCloseCodes).toHaveLength(2);
    expect(exitCode, `Smoke must exit instead of retrying intentionally left rooms. Output:\n${output}`).toBe(0);
    expect(output).not.toContain('will retry');
  } finally {
    if (child && exitCode === undefined) child.kill();
  }
}, 20000);
