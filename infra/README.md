# Hosting and continuous delivery

The live preview is **[fender-offenders.onrender.com](https://fender-offenders.onrender.com)**. The root [`render.yaml`](../render.yaml) defines its free Docker web service in Frankfurt for `lbsa71/fender_offenders`, branch `main`. It serves the browser game and multiplayer WebSocket endpoint at one HTTPS URL. `autoDeployTrigger: checksPass` waits for GitHub checks before automatic deployments.

The Render GitHub app is scoped to this repository. The service dashboard confirms Free, Frankfurt, `/ready` health checks and **After CI Checks Pass**. Hosted smoke validation passed HTML/readiness, two real secure WebSocket clients, a shared live round and client cleanup. A real browser created a room and rendered the district; the hosted endpoint returned 200 for its own origin and 403 for an unrelated origin. These checks do not establish full Internet playability or capacity.

## Initial Render setup

Initial setup is complete. To recreate it, connect the Render account and its GitHub integration with access to this repository. Create a Blueprint using root `render.yaml`, retaining Free, one instance and Frankfurt. Wait for the build and `/ready` health check, then use the actual URL returned by Render; the requested service name does not guarantee an exact subdomain. The Git provider integration is required for Render to observe CI checks. Initial Blueprint creation starts a deployment immediately; the CI condition governs subsequent automatic deployments.

Future pushes to `main` run validation before Render deploys them. Pull requests validate without changing the preview. No deploy-hook secret is required. [GitHub CI](../.github/workflows/ci.yml) runs types/document checks, unit and real-room tests, content validation, the production build, browser interactions, and a production Docker smoke with two real WebSocket clients.

Render supplies `RENDER_EXTERNAL_URL`; the server admits that exact origin. It does not trust arbitrary `onrender.com` domains. For custom domains, set `ALLOWED_ORIGINS` to the full comma-separated list of desired HTTPS origins; it replaces the default list. Leave `VITE_SERVER_URL` unset for same-origin hosting. The Blueprint sets `HOST=0.0.0.0`, `PORT=10000` and an initial two-room cap. This cap is provisional, not a measured capacity claim.

The free service sleeps after 15 idle minutes and may take about a minute to wake. Review monthly usage/billing limits before sharing widely. Keep the Free plan unless the project owner explicitly chooses an upgrade. Matches and scores live in memory, so restarts/deployments end them.

Official references checked 2026-10-22: [Blueprint fields/CI gating](https://render.com/docs/blueprint-spec), [WebSockets](https://render.com/docs/websocket), [environment variables](https://render.com/docs/environment-variables), [free-tier limits](https://render.com/docs/free).

## Production smoke

With dependencies installed, run against the actual service URL:

```powershell
$env:TEST_SERVER_URL = 'https://fender-offenders.onrender.com'
pnpm test:deploy
Remove-Item Env:TEST_SERVER_URL
```

This checks readiness, production HTML, two WebSocket players, authoritative cars, round start and both players' measured ping on both clients. It creates and then leaves a temporary room. It does not substitute for browser rendering, internet-latency and sustained-capacity checks.

A deployment ends existing in-memory matches. Refresh and use the same invite link to open a fresh room with that code; new visitors to that link join together. Scores and progress do not survive a deployment.

The pinned Colyseus release uses protocol codes 520–526, including 522 for a missing room. Its default router also uses these as HTTP statuses, which Cloudflare can replace with its own error response. The application normalizes these to standard HTTP statuses while preserving the SDK code inside JSON. A missing room on the legacy matchmaking endpoint returns HTTP 404 with JSON code 522; genuine capacity rejection remains HTTP 503. Valid invite links use `/dispatch/:invite` to join or recreate the room.

`/health` reports `rooms`, `maxRooms`, `registeredRooms`, `creatingRooms`, `connectedPlayers` and `reconnectingPlayers`, without player names or room codes. The two-room preview cap can reject new rooms while the process remains healthy. Pending creation reserves a slot immediately; failed creation and room disposal release it. The interface distinguishes server capacity from an eight-player room being full.

## Local and self-hosted operation

Local development: `pnpm dev` starts Vite on 5173 and the authoritative Colyseus server on 2567. Only localhost is bound by default. The room link is usable by other local browser tabs; remote friends need a reachable HTTPS/WSS deployment.

Production build: `pnpm build`, then `node dist/server/index.js`. This serves the built client and WebSocket game service on the same port. Set `HOST`, `PORT`, and `ALLOWED_ORIGINS` explicitly. For example the allowed browser origin for a same-port localhost test is `http://127.0.0.1:2567`.

Container packaging: `docker compose -f infra/compose.yaml up --build`. The supplied compose file binds port2567 only to localhost. The Docker image has been built and its running HTML/readiness/two-player WebSocket smoke passed locally on Linux/Node22 and on the Render preview. See the execution status for the scope of each check.

For a public host, configure a domain and TLS reverse proxy (example Caddyfile supplied), allow that exact HTTPS browser origin, and bind the game process only where the proxy can reach it. The client derives the same-origin endpoint in production. A separate CDN client may use `VITE_SERVER_URL` at build time.

`GET /health` reports process and aggregate room metrics. `GET /ready` reports admission readiness. All matches are in memory: a restart ends them. Signal shutdown marks readiness false and invokes Colyseus shutdown/reconnect error handling. The current implementation stops active rooms; a full match-length rolling drain remains a follow-up operational gate.

Before public release:

- Measure multiple-room capacity on the actual host; `MAX_ROOMS` is an explicit admission cap, not a capacity claim.
- Run `pnpm test:load` with `LOAD_SECONDS=300` and remote network/browser acceptance tests.
- Validate TLS/WSS, origin rejection, startup, shutdown and previous-version rollback in staging.
- Retain a complete matching client/server/content build. Never mix map or gameplay revisions.
- Record the environment and unresolved gates in `spec/EXECUTION_STATUS.md`.

## Rollback

Keep the prior healthy deployment if a new build or health check fails. Roll back a complete client/server/content set in Render; never mix map/protocol versions. Free-service rollback availability follows Render's current limits. Hosted rollback and finish-current-round draining remain unverified operational gates.

Check [the execution status](../spec/EXECUTION_STATUS.md) for observed evidence and remaining release gates.
