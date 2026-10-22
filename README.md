# Fender Offenders

*Protect. Swerve. Explain later.*

Fender Offenders is a playable browser arcade driving and vehicle-combat alpha inspired by the energy of the original 1987 APB. Patrol a stylized 3D district, dodge traffic, pursue a suspect, or trade shots with friends in private rooms. The elevated Babylon.js camera follows vehicle-relative driving on a planar road surface.

**[Play the public preview](https://fender-offenders.onrender.com)**. The free Render service may need about a minute to wake after inactivity. Create a room and share its invite link to play with friends.

This is a playable alpha, not a release candidate. [Execution status](spec/EXECUTION_STATUS.md) records all 49 implementation tasks, observed checks, and remaining acceptance gates. Fender Offenders remains a working name without trademark clearance.

## Run locally

Use Node.js **22.12 or newer** and **pnpm 11.25.0**. Dependency versions are recorded in [package.json](package.json) and locked in [pnpm-lock.yaml](pnpm-lock.yaml). The implementation session used Node.js 25.8.1 on Windows 11.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [the game on port 5173](http://127.0.0.1:5173). Vite serves the client; the authoritative game server listens on `127.0.0.1:2567`. Exit the development command to stop its child processes. [Environment examples](.env.example) contain local defaults and no credentials.

Choose **Hit the streets** for solo practice and the pursuit challenge. Choose **Create room**, copy its invite link, and open that link in another browser context to bring backup; at least two connected players are needed to start a round. Localhost links work on this machine; use the public preview to invite friends on other machines. Production HTTPS and two real secure WebSocket clients have reached a shared round on Render.

## What is implemented

- A project-authored procedural district, three vehicle body designs, roads and dirt shortcuts, traffic, lighting, shadows, signs, skid marks, combat effects, and synthesized vehicle/action audio.
- Shared fixed-step driving, deliberate brake-to-reverse behavior, drifting, collisions, stuck recovery, and a solo suspect-interception challenge.
- Private 2–8-player authoritative Colyseus rooms with a countdown, five-minute free-for-all, forward automatic fire, damage, wreck credit, protected respawns, standings, results, and rematch.
- Local movement prediction, remote interpolation, reconnect handling, input admission checks, and immediate control neutralization on focus/device loss or menu entry.
- Keyboard and standard-mapped controller input, device prompts, keyboard remapping, dead zones, sensitivity, persisted settings, reduced shake/flashes, and graphics/audio controls. No external fonts or runtime art downloads are requested.

Online matches continue while a menu is open; that driver's held controls are released and safety braking applies. The pause menu stops a local practice simulation. Controller coverage currently uses synthetic standard-mapped devices; physical-controller handling and the full browser/OS matrix remain open. Music and vibration settings do not establish a shipped soundtrack or tested haptics.

## Controls

| Action | Keyboard | Standard controller |
| --- | --- | --- |
| Accelerate | W / Up | Left stick forward, or right trigger |
| Brake / reverse | S / Down | Left stick backward, or left trigger |
| Steer | A/D or Left/Right | Left stick left/right |
| Handbrake | Shift | A / south button |
| Fire | Space | Right shoulder |
| Siren | E | X / west button |
| Recover a stuck car | Hold R for one second | Hold Y / north button for one second |
| Pause / settings | Escape | Menu / Start |
| Menu navigation | Arrows, Enter, Escape; Tab for fields | D-pad / stick, A confirm, B back |

Pulling the stick backward brakes a forward-moving car before reversing, just like the left trigger. Stick and trigger input combine without adding extra acceleration. Nickname and room-code text entry use the keyboard. Unknown controller mappings display a keyboard-fallback message rather than guessing button assignments.

## Developer commands

| Command | Current behavior |
| --- | --- |
| `pnpm dev` | Start client and game server together |
| `pnpm dev:client` / `pnpm dev:server` | Start either development process separately |
| `pnpm check` | Typecheck, validate documentation links/task dependencies, check simulation import boundaries |
| `pnpm test` | Run Vitest logic, simulation, real-room, prediction, and hosting tests |
| `pnpm test:integration` | Run real Colyseus room and ordered TCP-delay harness tests |
| `pnpm test:e2e` | Run Playwright browser scenarios; reuse local services or start test-owned services |
| `pnpm test:load` | Run eight real SDK clients against the local server; write a payload-estimate report |
| `pnpm test:deploy` | Check production readiness/HTML and two real multiplayer WebSocket clients at `TEST_SERVER_URL` |
| `pnpm assets:check` | Validate authored map/content invariants |
| `pnpm build` | Build the production client and bundled server |
| `pnpm preview` | Preview the built static client on Vite's preview port; online play still needs a game server |
| `pnpm start` | Run the TypeScript game-server entrypoint |

For a fresh Playwright setup, run `pnpm exec playwright install chromium` before `pnpm test:e2e`. The browser config can use installed Chrome on Windows. Render-only smoke/alignment tools are in [tools/assets](tools/assets); no `test:visual` or `test:network` package script currently exists.

After `pnpm build`, `node dist/server/index.js` serves the production client and WebSocket service on one port. Set `HOST`, `PORT`, and `ALLOWED_ORIGINS` for that deployment. See [the operations guide](infra/README.md) for container/TLS configuration, health/readiness, and staging checks. The connected Render service uses the Free plan in Frankfurt, with automatic deployment from `main` after GitHub checks pass. Pull requests run validation without changing the public preview.

## Validation and limits

The seven-scenario integrated browser run passed in 1.8 minutes, covering local drive/fire/pause/settings, synthetic controller navigation/disconnect, blur safety, two-client room play, self-contained resource loading, and system-font layout. The run also verified actionable errors after an actual missing-room rejection. Real-socket tests cover authority, combat, respawn, reconnect, round ownership, and ordered latency/jitter/stall behavior. See [the evidence index](spec/EXECUTION_STATUS.md) for commands and scope.

Human driving/visual approval, actual controllers, Firefox/Safari/macOS coverage, collision-correction traces, OS packet impairment, sustained browser frame budgets, ten-rematch memory stability, multi-room server density, and hosted rollback validation remain open. A short localhost eight-player run is not a capacity or remote-playability claim. Its JSON payload estimate exceeded the starting download budget; actual wire bandwidth is unverified. The free preview initially admits at most two rooms; deployments end active matches.

## Working agreements and design

[AGENTS.md](AGENTS.md) requires strict red–green–refactor for all new behavior and fixes: write the focused test, observe the intended failure, make the smallest change, then run affected checks. Handoffs must report observed red and green evidence. This agreement was adopted during implementation; earlier code is not claimed to have been written test-first. Documentation-only updates do not need artificial tests.

Use the ownership map and task register in [the implementation plan](IMPLEMENTATION_PLAN.md), with progress in [the execution ledger](spec/EXECUTION_STATUS.md). Public package APIs live under `packages/`; app roots own composition and lifecycle. The shared simulation never imports rendering or UI code.

- [Product specification](spec/PRODUCT_SPEC.md): scope, defaults, and P01–P10 acceptance criteria.
- [Architecture](spec/ARCHITECTURE.md): package/runtime boundaries and design targets.
- [Contracts](spec/CONTRACTS.md): semantic interfaces; executable exports live in `packages/contracts`.
- [Quality and operations](spec/QUALITY_AND_OPERATIONS.md): performance/network/device/release gates.
- [Art and assets](spec/ART_AND_ASSETS.md): original asset policy, provenance, and sourcing guidance.
- [Original runtime asset record](packages/content/manifests/licenses/ORIGINAL_ASSETS.md): project-authored geometry/materials/audio; dependency-license review remains separate.
- [Decision register](spec/DECISIONS.md): accepted requirements and defaults.
