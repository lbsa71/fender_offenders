import { afterEach, describe, expect, it } from 'vitest';
import { createGameServer } from '../../apps/server/src/index';

describe('production same-origin hosting', () => {
  let server: Awaited<ReturnType<typeof createGameServer>> | undefined;
  const priorOrigins = process.env.ALLOWED_ORIGINS;
  const priorRenderUrl = process.env.RENDER_EXTERNAL_URL;
  afterEach(async () => {
    await server?.gracefullyShutdown(false);
    server = undefined;
    if (priorOrigins === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = priorOrigins;
    if (priorRenderUrl === undefined) delete process.env.RENDER_EXTERNAL_URL;
    else process.env.RENDER_EXTERNAL_URL = priorRenderUrl;
  });

  it('admits the local production origin on the configured port by default', async () => {
    delete process.env.ALLOWED_ORIGINS;
    server = await createGameServer(2690);
    const response = await fetch('http://127.0.0.1:2690/health', { headers: { Connection: 'close', Origin: 'http://127.0.0.1:2690' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:2690');
  });

  it('honors an explicit allowlist and rejects unlisted origins', async () => {
    process.env.ALLOWED_ORIGINS = ' https://game.example.test ';
    server = await createGameServer(2690);
    const accepted = await fetch('http://127.0.0.1:2690/health', { headers: { Connection: 'close', Origin: 'https://game.example.test' } });
    const rejected = await fetch('http://127.0.0.1:2690/health', { headers: { Connection: 'close', Origin: 'https://unknown.example.test' } });
    expect(accepted.status).toBe(200);
    expect(rejected.status).toBe(403);
  });

  it('admits the platform supplied public origin without accepting arbitrary Render domains', async () => {
    delete process.env.ALLOWED_ORIGINS;
    process.env.RENDER_EXTERNAL_URL = 'https://fender-offenders-test.onrender.com';
    server = await createGameServer(2690);
    const accepted = await fetch('http://127.0.0.1:2690/health', { headers: { Connection: 'close', Origin: process.env.RENDER_EXTERNAL_URL } });
    const rejected = await fetch('http://127.0.0.1:2690/health', { headers: { Connection: 'close', Origin: 'https://someone-else.onrender.com' } });
    expect(accepted.status).toBe(200);
    expect(rejected.status).toBe(403);
  });
});
