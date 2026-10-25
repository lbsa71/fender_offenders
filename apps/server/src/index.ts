import { Server, ErrorCode, createRouter, createEndpoint, createAuthContext, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DrivingRoom, serverMetrics, getRoomMetrics, roomRegistry } from '@fender/net-server';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { isInviteCode, isRecord } from '@fender/contracts';
export async function createGameServer(port = Number(process.env.PORT || 2567), host = process.env.HOST || '127.0.0.1') {
  const defaults = `http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,http://localhost:${port},http://127.0.0.1:${port},${process.env.RENDER_EXTERNAL_URL || ''}`;
  const allowed = new Set((process.env.ALLOWED_ORIGINS || defaults).split(',').map(origin => origin.trim()).filter(Boolean));
  const transport = new WebSocketTransport({ maxPayload: 16 * 1024, beforeUpgrade: context => {
    const origin = context.headers.get('origin');
    if (origin && !allowed.has(origin)) return new Response('Origin not allowed', { status: 403 });
  } });
  const server = new Server({ transport, greet: false, gracefullyShutdown: false, express: app => {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && !allowed.has(origin)) { res.status(403).send('Origin not allowed'); return; }
      if (origin) res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      if (req.method === 'OPTIONS') { res.sendStatus(204); return; } next();
    });
    app.get('/health', (_req, res) => res.json({ status: 'ok', ...serverMetrics, ...getRoomMetrics() }));
    app.get('/ready', (_req, res) => res.status(serverMetrics.draining ? 503 : 200).json({ ready: !serverMetrics.draining }));
    app.use(express.static(resolve('dist/client')));
  } });
  // Colyseus protocol errors overlap Cloudflare's 520–526 HTTP errors. Preserve
  // the SDK code in JSON while using standard HTTP statuses at the proxy boundary.
  const matchmakingStatuses: Record<number, number> = {
    [ErrorCode.MATCHMAKE_NO_HANDLER]: 404, [ErrorCode.MATCHMAKE_INVALID_CRITERIA]: 400,
    [ErrorCode.MATCHMAKE_INVALID_ROOM_ID]: 404, [ErrorCode.MATCHMAKE_UNHANDLED]: 500,
    [ErrorCode.MATCHMAKE_EXPIRED]: 410, [ErrorCode.AUTH_FAILED]: 401, [ErrorCode.APPLICATION_ERROR]: 400,
  };
  const dispatch = createEndpoint('/dispatch/:invite', { method: 'POST' }, async ctx => {
    const code = ctx.params.invite, request = ctx.request!, origin = request.headers.get('origin');
    if (origin && !allowed.has(origin)) return Response.json({ code: 403, error: 'Origin not allowed' }, { status: 403 });
    if (!isInviteCode(code) || !isRecord(ctx.body)) return Response.json({ code: 400, error: 'Invalid invite code' }, { status: 400 });
    if (serverMetrics.draining) return Response.json({ code: 503, error: 'server-shutdown' }, { status: 503 });
    const options = ctx.body;
    try {
      const auth = createAuthContext({ headers: request.headers, req: request });
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await roomRegistry.ensureInvite(code, options);
          return await matchMaker.joinById(code, options, auth);
        } catch (error) {
          const failure = error as { code?: number; message?: string };
          const vanished = failure.code === ErrorCode.MATCHMAKE_INVALID_ROOM_ID && /not found|disposed/i.test(failure.message ?? '');
          if (!vanished || attempt === 2) throw error;
        }
      }
      throw new Error('Dispatch unavailable');
    } catch (error) {
      const failure = error as { code?: number; message?: string };
      const code = failure.code ?? 500;
      const status = matchmakingStatuses[code] ?? (code >= 400 && code <= 599 ? code : 500);
      return Response.json({ code, error: failure.message ?? 'Dispatch unavailable' }, { status });
    }
  });
  server.router = createRouter({ dispatch }, { onResponse: async response => {
    const status = matchmakingStatuses[response.status];
    if (!status) return;
    const body = await response.clone().json().catch(() => null);
    if (body?.code !== response.status) return;
    return new Response(response.body, { status, headers: response.headers });
  } });
  server.define('district', DrivingRoom);
  await server.listen(port, host);
  console.log(`Fender Offenders game server http://${host}:${port}`);
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = await createGameServer();
  let shuttingDown = false;
  async function stop() { if (shuttingDown) return; shuttingDown = true; serverMetrics.draining = true; console.log('Dispatch closing; connected rooms will be notified.'); await server.gracefullyShutdown(false); process.exit(0); }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
