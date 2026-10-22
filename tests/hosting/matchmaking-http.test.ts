import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErrorCode, Room, ServerError, type Server } from '@colyseus/core';
import { createGameServer } from '../../apps/server/src/index.js';

const endpoint = 'http://127.0.0.1:2694';
let server: Server;
beforeAll(async () => {
  server = await createGameServer(2694);
  for (const code of [ErrorCode.MATCHMAKE_UNHANDLED, ErrorCode.MATCHMAKE_EXPIRED, ErrorCode.AUTH_FAILED, ErrorCode.APPLICATION_ERROR]) {
    server.define(`reject-${code}`, class extends Room { onCreate() { throw new ServerError(code, `fixture-${code}`); } });
  }
});
afterAll(async () => { await server?.gracefullyShutdown(false); });
async function request(path: string) {
  const response = await fetch(`${endpoint}/matchmake/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Connection: 'close' }, body: '{}',
  });
  return { response, body: await response.json() };
}
describe('matchmaking uses HTTP statuses that reverse proxies can preserve', () => {
  it('reports aggregate room occupancy without exposing player names or room IDs', async () => {
    const response = await fetch(`${endpoint}/health`, { headers: { Connection: 'close' } });
    const health = await response.json();
    expect(health).toMatchObject({ registeredRooms: 0, creatingRooms: 0, connectedPlayers: 0, reconnectingPlayers: 0 });
    expect(health.maxRooms).toBeGreaterThan(0);
  });
  it('returns 404 for an expired invite while preserving the SDK room-not-found code', async () => {
    const { response, body } = await request('joinById/Bi4bIat17');
    expect(response.status, 'A missing room must not emit HTTP 522, which Cloudflare treats as an origin timeout').toBe(404);
    expect(body).toEqual({ code: ErrorCode.MATCHMAKE_INVALID_ROOM_ID, error: 'room "Bi4bIat17" not found' });
  });
  it('returns 404 for an unknown room type instead of HTTP 520', async () => {
    const { response, body } = await request('create/nonexistent-room-type');
    expect(response.status).toBe(404); expect(body.code).toBe(ErrorCode.MATCHMAKE_NO_HANDLER);
  });
  it.each([
    [ErrorCode.MATCHMAKE_UNHANDLED, 500], [ErrorCode.MATCHMAKE_EXPIRED, 410],
    [ErrorCode.AUTH_FAILED, 401], [ErrorCode.APPLICATION_ERROR, 400],
  ])('preserves protocol code %i inside a standard HTTP %i response', async (code, httpStatus) => {
    const { response, body } = await request(`create/reject-${code}`);
    expect(response.status).toBe(httpStatus); expect(body).toEqual({ code, error: `fixture-${code}` });
  });
});
