# Fender Offenders

*Protect. Swerve. Explain later.*

Fender Offenders is a playable browser arcade driving and vehicle-combat alpha inspired by the energy of the original 1987 APB. Patrol a stylized 3D district, dodge traffic, pursue a suspect, or trade shots with friends in private rooms. The elevated Babylon.js camera follows vehicle-relative driving on a planar road surface.

**[Play the public preview](https://fender-offenders.onrender.com)**. The free Render service may need about a minute to wake after inactivity. Every game has a room URL; share it to bring backup at any time.

This is a playable alpha, not a release candidate. [Execution status](spec/EXECUTION_STATUS.md) records all 49 implementation tasks, observed checks, and remaining acceptance gates. Fender Offenders remains a working name without trademark clearance.

Documentation reviewed: **2026-10-26**, for local source `arcade-v11`, protocol 2. Suspects make sharper swerves and harder brake checks only against a nearby officer closing the gap; bomb blasts use soft fire/smoke/ember particles, and pedestrians flee players and suspects. Civilian cars remain unarmed, wrecks split into their original physical components, and dusk/night lamps stay illuminated at any camera distance. Every playable campaign uses a server room; local previews retain bounded stepping and network input stays capped at four. Hosted rollout is recorded separately in [execution status](spec/EXECUTION_STATUS.md). The paperwork is catching up with the patrol car.

## Run locally

Use Node.js **22.12 or newer** and **pnpm 11.25.0**. Dependency versions are recorded in [package.json](package.json) and locked in [pnpm-lock.yaml](pnpm-lock.yaml). The implementation session used Node.js 25.8.1 on Windows 11.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [the game on port 5173](http://127.0.0.1:5173). Vite serves the client; the authoritative game server listens on `127.0.0.1:2567`. Exit the development command to stop its child processes. [Environment examples](.env.example) contain local defaults and no credentials.

Opening the bare URL assigns a random room URL without allocating a server simulation. Choose **Hit the streets**, read the briefing, change your assigned car if desired, then choose **Start dispatch**. One officer can start; any connected officer can proceed. Copy the address bar or click **Invite URL** to bring friends into the same game. To open a fresh room, visit the bare URL again. Localhost links work on this machine; use the public preview to invite friends on other machines.

Empty rooms pause for up to 15 minutes; returning resumes their campaign. At capacity the oldest eligible empty room can be reclaimed sooner. Reusable links survive disposal and server restarts by opening a fresh campaign under the same code. Legacy eight-character codes are supported alongside current IDs. Joining retries a room that disappears during reservation, without changing the link; genuine full-room or hosting-capacity errors still require a free slot.

## What is implemented

- A project-authored procedural district, six vehicle body designs, roads and dirt shortcuts, traffic, lighting, shadows, signs, skid marks, combat effects, and synthesized vehicle/action audio.
- Authored noon, dusk and night dispatch lighting with colored distance fog, directional sun/moon shadows and steady warm illumination from every upright street lamp at dusk/night on all presets. The [graphics polish plan](spec/GRAPHICS_POLISH.md) preserves the blocky toy-town style; water, reflections and subtle flares are next steps.
- Shared fixed-step driving, deliberate brake-to-reverse behavior, drifting, collisions, stuck recovery, and a suspect-apprehension objective in every server room and isolated simulation fixtures.
- **The Green Light Racket**: ten dispatches, four connected ringleaders and six crew members, original mugshots, assigned target cars, a shared campaign tracker and a story revealed through successful pursuits. Arrest or destroy the target to advance; only arrests earn green checks.
- Armed campaign targets with distinct driving styles, burst fire, grenade lobs and progressively tougher tactics. Briefings explain the threat and counterplay; marked grenade landing areas give players time to dodge.
- Private 1–8-player authoritative Colyseus rooms with a countdown, a five-minute dispatch limit, forward automatic fire, damage, wreck credit, protected respawns, cumulative standings and campaign results. The first driver to resolve the shared target wins that dispatch.
- Local movement prediction, remote interpolation with a playback clock that does not rewind on late snapshots, reconnect handling, input admission checks, and immediate control neutralization on focus/device loss or menu entry.
- Server-measured ping in milliseconds for every player in online standings and results, plus a persistent Wi-Fi indicator for connecting, connected, reconnecting and lost connections. Unknown or stale ping reads “—”.
- Reusable invite links: joining a valid room code after a restart opens a fresh room under the same code. Simultaneous visitors join the same room. Match progress and scores reset with the server.
- Keyboard and standard-mapped controller input, device prompts, keyboard remapping, dead zones, sensitivity, persisted settings, reduced shake/flashes, and graphics/audio controls. No external fonts or runtime art downloads are requested.

A lone officer opening a menu or hiding the tab pauses the server world. Backup joining resumes it with a notice. With multiple officers, menus neutralize only that driver's controls. Empty worlds freeze, including their dispatch clocks. Idle players receive a warning at 14 minutes and are disconnected at 15; heartbeats do not count as activity. See [room sessions](spec/ROOM_SESSIONS.md) for retention, reconnect and storage rules. Controller coverage currently uses synthetic standard-mapped devices; physical-controller handling and the full browser/OS matrix remain open. Music and vibration settings do not establish a shipped soundtrack or tested haptics.

The single **Invite URL** button stays available before entry, during play and in menus. It copies the current address; friends enter that same campaign with your earned leads, score, car and dispatch timer intact. Backup joins the patrol already underway.

Your first visit randomly assigns a patrol sedan, interceptor, roadster, army 4×4, ambulance or fire-chief SUV. The garage saves the assignment in this browser and shows the car on a rotating turntable, with its strengths and trade-offs. **Reassign vehicle** rolls a different car at home or in every dispatch briefing, beside the target's mugshot and assigned car. The choice locks at countdown; reconnects and respawns preserve it. Clearing browser storage starts a new garage assignment.

Fresh browsers also receive a random callsign such as **Captain Waffle** or **Squeaky Hubcap**. **Reroll callsign** picks another, or type your own. Generated and custom choices are saved between dispatches and reloads; the existing twenty-character limit applies.

Cars have distinct armor, speed, acceleration, steering and grip, using the same shared rules for authority, local prediction and practice. The army 4×4 absorbs more hits but accelerates and turns slowly; the roadster is fast and fragile. Collision dimensions, weapons and spawn protection remain equal. See the measured [vehicle balance report](packages/sim/BALANCE.md) for all six roles and the automated guardrails.

Cornering adds cartoon body lean and squash, while visible road humps trigger compression, rebound and short synthesized sounds. These animations preserve the underlying driving pose and collision shape. Reduced-motion preferences and reduced-shake settings suppress the deformation and turntable rotation.

Confirmed crashes squash the coachwork in the impact direction and spring back, with severity-scaled slapstick audio. Both guns fire real projectiles from their barrel tips, 2.45 m forward and 0.63 m either side of the car center. Each deals 5 damage, retaining 10 damage per volley at the same 12-tick cadence. Paired flashes follow the moving guns, with one recoil and sound per volley. Fresh trails start at the muzzle; local rounds advance by at most 100 ms to match driving prediction, while remote rounds use buffered playback. These effects share bounded pools and audio limits; crashes do not add ram damage.

Each barrel applies subtle aim assist to a visible opponent or the wanted suspect within **4°**, **2.5 m of its original firing line**, and **40 m**. Buildings and nearer cars block selection, including obstructions between the car center and a gun tip. The correction happens once when a shot is fired; projectiles retain their straight trajectory, and the car's heading is unchanged. One missed or blocked barrel deals only 5 damage. `arcade-v10` / protocol 2 clients and servers must match.

One AI car is the **WANTED** target. Its world marker and labeled screen-edge arrow identify it as the camera and suspect move. To arrest it, stay within 8 m with less than 5 m/s relative speed and a clear line of sight for three seconds. Each connected, active driver builds their own progress, which drains when they lose those conditions. Arresting awards three points and a green tracker check. Destroying the target's car awards the existing one-point wreck credit, advances the story, and leaves an amber wreck mark. Both end the dispatch immediately; cumulative combat points do not override its winner. A timeout reveals no clue and retries the same target.

Results reveal a new lead and identify the resolving officer. **Next briefing** opens the next target and motor pool; after ten successes, the finale closes the connected story and offers a new campaign. Online progress, results and clues are shared with late joiners and reconnecting players. Progress lasts for the current game/room, while the car assignment persists between runs. See [campaign rules and the engineering story outline](spec/CAMPAIGN.md).

The targets fight back: Mabel brake-checks and fires short bursts, Hector weaves and lobs grenades, Iris fires on serpentine drive-bys, and Aldo intercepts with mixed attacks. Crew encounters introduce the patterns more gently. All ten dispatches have authored difficulty and recovery windows. Grenades lock their landing point when thrown, display a blast-area warning and a 1.5-second fuse, then apply authoritative damage with distance falloff and cover checks. Original pooled cartoon effects and synthesized fuse/explosion sounds follow the existing reduced-effects and volume settings. See [boss combat and callsigns](spec/BOSS_COMBAT.md).

Guns appear on player and villain cars; civilian traffic is unarmed. Villains display their assigned vehicle body even outside live pursuit guidance. Wrecks now shed every authored component—40–58 pieces depending on the car—including separate tires, hubs, trim, lights and guns. Each piece gets local 3D physics, bouncing off the road, buildings and other fragments like a toy car losing an argument with the assembly manual. Debris clears within 2.6 seconds or immediately on respawn, and reduced motion suppresses it. A charred chassis remains until the protected respawn.

Loose barrels, crates, bins and park benches separately use server-owned 3D rigid-body physics. Lamp posts, signs and trees stand fixed until a car knocks them free. Cars push this scenery without receiving a physics impulse back. Wreck fragments remain cosmetic: they do not damage or push cars/pedestrians and add no network transforms.

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

Pulling the stick backward brakes a forward-moving car before reversing, just like the left trigger. Stick and trigger input combine without adding extra acceleration. Callsign text entry uses the keyboard. Unknown controller mappings display a keyboard-fallback message rather than guessing button assignments.

## Developer commands

| Command | Current behavior |
| --- | --- |
| `pnpm dev` | Start client and game server together |
| `pnpm dev:client` / `pnpm dev:server` | Start either development process separately |
| `pnpm check` | Typecheck, validate documentation links/task dependencies, check simulation import boundaries |
| `pnpm test` | Run both headless suites; no browsers |
| `pnpm test:unit` | Run isolated logic with controlled dependencies; no sockets, real physics or renderer adapters |
| `pnpm test:integration` | Run real physics/render adapters, HTTP/Colyseus rooms, prediction, hosting and tooling checks |
| `pnpm test:e2e` | Local Playwright game scenarios, then pursuit/campaign/callsign browser fixtures |
| `pnpm hooks:install` | Install the local Git pre-push hook; also runs automatically on local dependency installation |
| `pnpm test:load` | Run eight real SDK clients against the local server; write a payload-estimate report |
| `pnpm test:deploy` | Check production readiness/HTML and two real multiplayer WebSocket clients at `TEST_SERVER_URL` |
| `pnpm assets:check` | Validate authored map/content invariants |
| `pnpm build` | Build the production client and bundled server |
| `pnpm preview` | Preview the built static client on Vite's preview port; online play still needs a game server |
| `pnpm start` | Run the TypeScript game-server entrypoint |

For a fresh Playwright setup, run `pnpm exec playwright install chromium` before `pnpm test:e2e`. The browser config can use installed Chrome on Windows. Render-only smoke/alignment tools are in [tools/assets](tools/assets); no `test:visual` or `test:network` package script currently exists.

Browser E2E runs locally before each push through [the pre-push hook](.githooks/pre-push), and a failure stops the push. Local `pnpm install` installs the hook; existing checkouts can run `pnpm hooks:install`. Custom hook paths are preserved and need the same `pnpm test:e2e` command. CI runs unit, integration, types/docs, assets, build and production-container smoke. The browser patrol stays in the local garage; the server checks still report for duty.

For an isolated worktree push, set `FENDER_E2E_CLIENT_PORT=5195` and `FENDER_E2E_SERVER_PORT=2589` in the invoking environment. The pre-push browser checks start dedicated servers and never reuse another checkout's dev servers. The health-test endpoint follows the selected server port unless `TEST_SERVER_URL` is explicitly set. PowerShell uses `$env:FENDER_E2E_CLIENT_PORT='5195'` and `$env:FENDER_E2E_SERVER_PORT='2589'`.

After `pnpm build`, `node dist/server/index.js` serves the production client and WebSocket service on one port. Set `HOST`, `PORT`, and `ALLOWED_ORIGINS` for that deployment. See [the operations guide](infra/README.md) for container/TLS configuration, health/readiness, and staging checks. The connected Render service uses the Free plan in Frankfurt, with automatic deployment from `main` after GitHub checks pass. Pull requests run validation without changing the public preview.

## Validation and limits

The 2026-10-24 documentation review reran **465 headless tests across 54 files**, plus type/documentation/boundary and authored-asset checks, all passing. A separate audit verified all **25 Markdown artifacts**, their local links/anchors and all nine GPL package declarations. Playwright discovery lists **15 browser scenarios across six files**; those were not executed in this review. No gameplay behavior changed, so no artificial RED phase was required.

Historical implementation evidence includes the 2026-10-23 armed-campaign run of 460 headless tests and 14 browser scenarios, five UI fixtures, real boss-combat clients, native grenade checks and an SDK driving probe. The 2026-10-24 pacing commit records 465 headless tests and 12 practice browser scenarios passing; the badge fix records its style-recalculation regression. See [the evidence index](spec/EXECUTION_STATUS.md) for dates and scope. Browser checks are now local pre-push gates; CI retains the unit/integration suites and production-container smoke.

Human driving/visual approval, actual controllers, Firefox/Safari/macOS coverage, collision-correction traces, OS packet impairment, sustained browser frame budgets, ten-rematch memory stability, multi-room server density, and hosted rollback validation remain open. A short localhost eight-player run is not a capacity or remote-playability claim. Its JSON payload estimate exceeded the starting download budget; actual wire bandwidth is unverified. The free preview initially admits at most two rooms; deployments end active matches.

The [next-work queue](IMPLEMENTATION_PLAN.md#next-acceptance-work) prioritizes those acceptance gaps, plus contract/fixture completion, accessibility and dependency-license review. Original project work is distributed under GPL v3 or later; the remaining distribution audit covers dependency terms, notices and release packaging. More flashing lights will not close these gates, although the motor pool has submitted a strongly worded suggestion.

## Working agreements and design

[AGENTS.md](AGENTS.md) requires strict red–green–refactor for all new behavior and fixes: write the focused test, observe the intended failure, make the smallest change, then run affected checks. Handoffs must report observed red and green evidence. This agreement was adopted during implementation; earlier code is not claimed to have been written test-first. Documentation-only updates do not need artificial tests.

Use the ownership map and task register in [the implementation plan](IMPLEMENTATION_PLAN.md), with progress in [the execution ledger](spec/EXECUTION_STATUS.md). Public package APIs live under `packages/`; app roots own composition and lifecycle. The shared simulation never imports rendering or UI code.

- [Product specification](spec/PRODUCT_SPEC.md): scope, defaults, and P01–P10 acceptance criteria.
- [Architecture](spec/ARCHITECTURE.md): package/runtime boundaries and design targets.
- [Contracts](spec/CONTRACTS.md): semantic interfaces; executable exports live in `packages/contracts`.
- [Quality and operations](spec/QUALITY_AND_OPERATIONS.md): performance/network/device/release gates.
- [Art and assets](spec/ART_AND_ASSETS.md): original asset policy, provenance, and sourcing guidance.
- [Graphics polish](spec/GRAPHICS_POLISH.md): dispatch lighting schedule, water/flares/surface sequence, quality limits and visual acceptance.
- [Original runtime asset record](packages/content/manifests/licenses/ORIGINAL_ASSETS.md): project-authored geometry/materials/audio; dependency-license review remains separate.
- [Decision register](spec/DECISIONS.md): accepted requirements and defaults.
- [Contributors](CONTRIBUTORS.md): Stefan Andersson, Wictor Stenseke, Claude Code, and OpenAI Codex—the people and AI assistance behind the dispatch desk.

## License

Copyright (C) 2026 Fender Offenders contributors.

Unless a file states otherwise, the original code, documentation, procedural art, story content and synthesized audio in this repository are licensed under the **GNU General Public License, version 3 or any later version** (`GPL-3.0-or-later`). You may redistribute and modify that work under those terms. It is provided without warranty, including implied warranties of merchantability or fitness for a particular purpose. See [LICENSE](LICENSE) for the full terms and [GNU's licensing guidance](https://www.gnu.org/licenses/gpl-howto.en.html) for background.

Third-party dependencies retain their own licenses and notices; the project license does not replace them. See [asset provenance](packages/content/manifests/licenses/ORIGINAL_ASSETS.md) and [contributors](CONTRIBUTORS.md).
