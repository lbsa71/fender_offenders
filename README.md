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

Choose **Hit the streets** for a solo ten-dispatch campaign. Read the briefing, change your assigned car if desired, then choose **Start dispatch**. Choose **Create room**, copy its invite link, and open that link in another browser context to bring backup; at least two connected players are needed for the creator to start an online dispatch. Localhost links work on this machine; use the public preview to invite friends on other machines.

Invite links survive empty-room disposal and server restarts: joining lazily recreates the same room code. Legacy eight-character codes are supported alongside current IDs. Joining retries a room that disappears during reservation, without changing the link; genuine full-room or hosting-capacity errors still require a free slot.

## What is implemented

- A project-authored procedural district, six vehicle body designs, roads and dirt shortcuts, traffic, lighting, shadows, signs, skid marks, combat effects, and synthesized vehicle/action audio.
- Shared fixed-step driving, deliberate brake-to-reverse behavior, drifting, collisions, stuck recovery, and a suspect-apprehension objective in practice and multiplayer.
- **The Green Light Racket**: ten dispatches, four connected ringleaders and six crew members, original mugshots, assigned target cars, a shared campaign tracker and a story revealed through successful pursuits. Arrest or destroy the target to advance; only arrests earn green checks.
- Private 2–8-player authoritative Colyseus rooms with a countdown, a five-minute dispatch limit, forward automatic fire, damage, wreck credit, protected respawns, cumulative standings and campaign results. The first driver to resolve the shared target wins that dispatch.
- Local movement prediction, remote interpolation with a playback clock that does not rewind on late snapshots, reconnect handling, input admission checks, and immediate control neutralization on focus/device loss or menu entry.
- Server-measured ping in milliseconds for every player in online standings and results, plus a persistent Wi-Fi indicator for connecting, connected, reconnecting and lost connections. Unknown or stale ping reads “—”.
- Reusable invite links: joining a valid room code after a restart opens a fresh room under the same code. Simultaneous visitors join the same room. Match progress and scores reset with the server.
- Keyboard and standard-mapped controller input, device prompts, keyboard remapping, dead zones, sensitivity, persisted settings, reduced shake/flashes, and graphics/audio controls. No external fonts or runtime art downloads are requested.

Online matches continue while a menu is open; that driver's held controls are released and safety braking applies. The pause menu stops a local practice simulation. Controller coverage currently uses synthetic standard-mapped devices; physical-controller handling and the full browser/OS matrix remain open. Music and vibration settings do not establish a shipped soundtrack or tested haptics.

Your first visit randomly assigns a patrol sedan, interceptor, roadster, army 4×4, ambulance or fire-chief SUV. The garage saves the assignment in this browser and shows the car on a rotating turntable, with its strengths and trade-offs. **Reassign vehicle** rolls a different car at home or in every dispatch briefing, beside the target's mugshot and assigned car. The choice locks at countdown; reconnects and respawns preserve it. Clearing browser storage starts a new garage assignment.

Cars have distinct armor, speed, acceleration, steering and grip, using the same shared rules for authority, local prediction and practice. The army 4×4 absorbs more hits but accelerates and turns slowly; the roadster is fast and fragile. Collision dimensions, weapons and spawn protection remain equal. See the measured [vehicle balance report](packages/sim/BALANCE.md) for all six roles and the automated guardrails.

Cornering adds cartoon body lean and squash, while visible road humps trigger compression, rebound and short synthesized sounds. These animations preserve the underlying driving pose and collision shape. Reduced-motion preferences and reduced-shake settings suppress the deformation and turntable rotation.

Confirmed crashes squash the coachwork in the impact direction and spring back, with severity-scaled slapstick audio. Both guns fire real projectiles from their barrel tips, 2.45 m forward and 0.63 m either side of the car center. Each deals 5 damage, retaining 10 damage per volley at the same 12-tick cadence. Paired flashes follow the moving guns, with one recoil and sound per volley. Fresh trails start at the muzzle; local rounds advance by at most 100 ms to match driving prediction, while remote rounds use buffered playback. These effects share bounded pools and audio limits; crashes do not add ram damage.

Each barrel applies subtle aim assist to a visible opponent or the wanted suspect within **4°**, **2.5 m of its original firing line**, and **40 m**. Buildings and nearer cars block selection, including obstructions between the car center and a gun tip. The correction happens once when a shot is fired; projectiles retain their straight trajectory, and the car's heading is unchanged. One missed or blocked barrel deals only 5 damage. `arcade-v7` clients and servers must match.

One AI car is the **WANTED** target. Its world marker and labeled screen-edge arrow identify it as the camera and suspect move. To arrest it, stay within 8 m with less than 5 m/s relative speed and a clear line of sight for three seconds. Each connected, active driver builds their own progress, which drains when they lose those conditions. Arresting awards three points and a green tracker check. Destroying the target's car awards the existing one-point wreck credit, advances the story, and leaves an amber wreck mark. Both end the dispatch immediately; cumulative combat points do not override its winner. A timeout reveals no clue and retries the same target.

Results reveal a new lead and identify the resolving officer. **Next briefing** opens the next target and motor pool; after ten successes, the finale closes the connected story and offers a new campaign. Online progress, results and clues are shared with late joiners and reconnecting players. Progress lasts for the current game/room, while the car assignment persists between runs. See [campaign rules and the engineering story outline](spec/CAMPAIGN.md).

Wrecks throw off four wheels and colored body panels in a cartoon explosion, then leave a charred chassis until the protected respawn. Loose barrels, crates, bins and park benches use server-owned 3D rigid-body physics. Lamp posts, signs and trees stand fixed until a car knocks them free. Cars push this scenery without receiving a physics impulse back, preserving their shared arcade handling and prediction.

Twenty-four cosmetic pedestrians walk sidewalks, wait for safe crossing gaps and flee approaching cars. Predictive avoidance and a final rendered-car sweep check keep them clear of vehicles; they have no health, collision bodies or combat targeting. Their animation runs locally and can differ between viewers. See [world reactions](spec/WORLD_REACTIONS.md) for lifecycle, safety, budgets and reproducible visual checks.

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

The campaign build passed all **400 headless tests across 47 files** locally. Four UI browser fixtures pass, with native inspection of the briefing, tracker, story results and all ten 96px mugshots. The game browser suite covers 13 scenarios, including campaign start/car selection, keyboard and synthetic controller driving, target guidance, two-client roster/HUD pings, garage persistence and reusable invites. Real-socket checks cover shared campaign outcomes, host progression, late joins, actual target shooting, combat/respawn/reconnect, sparse prop publication and delayed transport. The production-server smoke also passes with two real clients sharing the campaign and assigned target. CI runs the complete browser suite, campaign UI fixture and deployable-container smoke. See [the evidence index](spec/EXECUTION_STATUS.md) for commands and scope.

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
