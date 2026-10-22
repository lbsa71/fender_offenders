import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DrivingRoom, serverMetrics } from '@fender/net-server';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
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
    app.get('/health', (_req, res) => res.json({ status: 'ok', ...serverMetrics }));
    app.get('/ready', (_req, res) => res.status(serverMetrics.draining ? 503 : 200).json({ ready: !serverMetrics.draining }));
    app.use(express.static(resolve('dist/client')));
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
