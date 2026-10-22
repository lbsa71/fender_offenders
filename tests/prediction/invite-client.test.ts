import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { Server, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import express from 'express';
import { DrivingRoom, serverMetrics } from '@fender/net-server';
import { createOnlineSession } from '@fender/net-client';
import { districtMap } from '@fender/content';
import { GAMEPLAY_REVISION, PROTOCOL_VERSION, type SessionStatus } from '@fender/contracts';

// A public HTTP/real SDK fixture isolates client routing from the separately owned production route.
class InviteFixtureRoom extends DrivingRoom {
  override async onCreate(options?: { inviteCode?: string }) {
    if (options?.inviteCode) this.roomId = options.inviteCode;
    await super.onCreate();
  }
}
const endpoint = 'http://127.0.0.1:2698';
const requests: { invite: string; body: unknown }[] = [];
const sessions: ReturnType<typeof createOnlineSession>[] = [];
let server: Server;
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
function session() { const value = createOnlineSession(endpoint, districtMap); sessions.push(value); return value; }
beforeAll(async () => {
  server = new Server({ transport: new WebSocketTransport(), greet: false, gracefullyShutdown: false, express: app => {
    app.use(express.json());
    app.post('/dispatch/:invite', async (req, res) => {
      const invite = String(req.params.invite); requests.push({ invite, body: req.body });
      if (invite === 'Capacity_') { res.status(503).json({ error: 'Dispatch capacity reached', code: 503 }); return; }
      try {
        const existing = matchMaker.getLocalRoomById(invite);
        const reservation = existing ? await matchMaker.joinById(invite, req.body) : await matchMaker.create('district', { ...req.body, inviteCode: invite });
        res.json(reservation);
      } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : String(error) }); }
    });
  } });
  server.define('district', InviteFixtureRoom);
  await server.listen(2698, '127.0.0.1');
}, 15000);
afterEach(async () => {
  await Promise.allSettled(sessions.splice(0).map(value => value.dispose()));
  const deadline = performance.now() + 5000;
  while (serverMetrics.rooms && performance.now() < deadline) await pause(10);
  expect(serverMetrics.rooms).toBe(0); requests.length = 0;
});
afterAll(async () => { await server?.gracefullyShutdown(false); });

it('joins a valid persistent invite through public HTTP and consumes its real seat reservation', async () => {
  const value = session();
  const joined = await value.connect({ mode: 'join', nickname: 'Invite client', roomId: '  Persist_A  ' });
  expect(requests).toEqual([{ invite: 'Persist_A', body: { nickname: 'Invite client', protocolVersion: PROTOCOL_VERSION, mapRevision: districtMap.revision, gameplayRevision: GAMEPLAY_REVISION } }]);
  expect(joined.roomId).toBe('Persist_A'); expect(joined.firstState.matchId).toBe('Persist_A');
  expect(joined.localEntityId).toBeTruthy(); expect(value.getIdentity().roomId).toBe('Persist_A');
  const second = await session().connect({ mode: 'join', nickname: 'Same invite', roomId: 'Persist_A' });
  expect(second.roomId).toBe(joined.roomId); expect(second.firstState.scores).toHaveLength(2);
  expect(requests).toHaveLength(2);
});

it('keeps malformed and long invite IDs on the existing missing-room path', async () => {
  for (const roomId of ['bad!code?', 'missing-dispatch-regression-room']) {
    const value = session(), statuses: SessionStatus[] = []; value.onStatus(status => statuses.push(status));
    await expect(value.connect({ mode: 'join', nickname: 'Malformed invite', roomId })).rejects.toThrow();
    expect(statuses.at(-1)).toMatchObject({ state: 'error', reason: 'room-missing' });
  }
  expect(requests).toEqual([]);
});

it('preserves the server-capacity status for a persistent invite HTTP rejection', async () => {
  const value = session(), statuses: SessionStatus[] = []; value.onStatus(status => statuses.push(status));
  await expect(value.connect({ mode: 'join', nickname: 'Capacity invite', roomId: 'Capacity_' })).rejects.toMatchObject({ code: 503, message: 'Dispatch capacity reached' });
  expect(statuses.at(-1)).toMatchObject({ state: 'error', reason: 'server-capacity' });
});
