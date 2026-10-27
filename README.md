# Fender Offenders

*Protect. Swerve. Explain later.*

Fender Offenders is a playable browser arcade driving and vehicle-combat alpha inspired by the energy of the original 1987 APB. Patrol a stylized 3D district, dodge traffic, pursue a suspect, or trade shots with friends in private rooms. The elevated Babylon.js camera follows vehicle-relative driving on a planar road surface.

**[Play the public preview](https://fender-offenders.onrender.com)**. The free Render service may need about a minute to wake after inactivity. Every game has a room URL; share it to bring backup at any time.

This is a playable alpha, not a release candidate. [Execution status](spec/EXECUTION_STATUS.md) records all 49 implementation tasks, observed checks, and remaining acceptance gates. Fender Offenders remains a working name without trademark clearance.

Documentation reviewed: **2026-10-27**, for integrated source `arcade-v20`, protocol 5, map `sunset-borough-3`. The district now spans 400 metres with long avenues around its original centre. Otis drops marked oil slicks; Tess warns before extending short-lived hubcap blades. Suspects introduce every weapon first; police guns, bombs, oil and blades unlock in dispatches 3, 5, 8 and 9. Unlocked controls and reminders remain in later dispatches. Gadgets have generous cooldowns and preserve front-cutoff arrests. Suspects swerve and brake-check against closing officers, with a brief normal-speed breakaway after braking. Particle blasts, pedestrian threat filtering, the progressive tutorial, all control schemes and continuous local driving remain integrated. Civilian cars are unarmed, wrecks split into their original physical components, and dusk/night lamps stay illuminated at any camera distance. Hosted rollout is recorded separately in [execution status](spec/EXECUTION_STATUS.md). The paperwork now covers a few more city blocks.

The `arcade-v20` winter follow-up makes dispatch 9 of every case snow-covered, with pronounced icy handling and even slicker frozen puddles. Raised rounded roof caps, snowy furniture and 280 ploughed curb banks give the snow a fluffy cartoon silhouette. Cars, bullets and bombs break the banks into bounded snow chunks; peers and late joins share the cleared gaps.

## Run locally

Use Node.js **22.12 or newer** and **pnpm 11.25.0**. Dependency versions are recorded in [package.json](package.json) and locked in [pnpm-lock.yaml](pnpm-lock.yaml). The implementation session used Node.js 25.8.1 on Windows 11.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [the game on port 5173](http://127.0.0.1:5173). Vite serves the client; the authoritative game server listens on `127.0.0.1:2567`. Exit the development command to stop its child processes. [Environment examples](.env.example) contain local defaults and no credentials.

For local debugging, open [dispatch 9 directly](http://127.0.0.1:5173/?debugDispatch=9), choose **Hit the streets**, then **Start dispatch**. Replace `9` with any number from `1` to `10`. Add `&debugCase=green-light-racket-v1` to choose a case; omit it to keep the room's case. In the development browser console, use `__FENDER_DEBUG__.dispatch(9)` to jump again, or inspect `__FENDER_DEBUG__.cases` for case IDs and dispatch names. The jump returns the whole room to that briefing, clears scores and earned outcomes, and awards no skipped arrests. URL shortcut parameters are consumed once so the remaining invite resumes normally. `pnpm dev` enables the local debug route; the default server and production client omit it. Separate server runs can explicitly enable `FENDER_DEBUG_DISPATCH=1`.

Opening the bare URL assigns a random room URL without allocating a server simulation. Choose **Hit the streets**, read the briefing, change your assigned car if desired, then choose **Start dispatch**. One officer can start; any connected officer can proceed. Copy the address bar or click **Invite URL** to bring friends into the same game. To open a fresh room, visit the bare URL again. Localhost links work on this machine; use the public preview to invite friends on other machines.

Empty rooms pause for up to 15 minutes; returning resumes their campaign. At capacity the oldest eligible empty room can be reclaimed sooner. Reusable links survive disposal and server restarts by opening a fresh campaign under the same code. Legacy eight-character codes are supported alongside current IDs. Joining retries a room that disappears during reservation, without changing the link; genuine full-room or hosting-capacity errors still require a free slot.

The [opening dispatches in every case teach the job](spec/TUTORIAL.md): arrest an unarmed suspect, avoid suspect guns in dispatch 2, unlock police guns and learn suspect bombs in dispatch 3, then slippery puddles in dispatch 4. Police bombs, oil and blades unlock in dispatches 5, 8 and 9. Brief hints appear during the chase; complete controls remain in Controls Help, and both cars appear in the briefing garage. The driving instructor has mercifully skipped the written exam.

## What is implemented

- A project-authored procedural district, six vehicle body designs, roads and dirt shortcuts, traffic, lighting, shadows, signs, skid marks and combat effects. A local patrol sound bank combines CC0 engine/foley recordings with original layers and synthesized fallback.
- Authored noon, dusk and night dispatch lighting with colored distance fog, directional sun/moon shadows and steady warm illumination from every upright street lamp at dusk/night on all presets. The [graphics polish plan](spec/GRAPHICS_POLISH.md) preserves the blocky toy-town style; four road puddles, a park pond and a garden pool are visible from the opening dispatch, with slippery-road handling introduced in dispatch 4. Reflections use a cheap shared finish rather than extra render passes.
- Shared fixed-step driving, deliberate brake-to-reverse behavior, drifting, collisions, stuck recovery, and a suspect-apprehension objective in every server room and isolated simulation fixtures.
- **Five storylines, ten dispatches each**: The Green Light Racket, The Midnight Munch Run, The Grand Detour, The Clockwork Caper and The Great Duck-Out. Fifty original suspects and mugshots connect twenty ringleaders and thirty crew encounters. Each new room receives one case automatically; **Another case** opens a different one after its ending. Short briefings and results keep the action moving without trackers or statistics tables.
- Armed campaign targets with distinct driving styles, burst fire, grenade lobs and progressively tougher tactics. Briefings explain the threat and counterplay; marked grenade landing areas give players time to dodge.
- Private 1–8-player authoritative Colyseus rooms with a countdown, a five-minute dispatch limit, forward automatic fire, damage, wreck credit, protected respawns and shared campaign results. Scores remain authoritative without a statistics dashboard. The first driver to resolve the shared target wins that dispatch.
- Continuous local driving: each input applies once on your machine and completed movement is validated by the room. Routine snapshots cannot replay your steering. Other cars use buffered interpolation. Contact applies server displacement/impulse once to current movement without restarting local steering; resets, damage and campaign outcomes remain mediated. Focus/device loss or menu entry neutralizes controls immediately.
- Server-measured ping in authority snapshots and a persistent accessible Wi-Fi indicator for connecting, connected, reconnecting and lost connections. Main screens omit latency and score tables.
- Reusable invite links: joining a valid room code after a restart opens a fresh room under the same code. Simultaneous visitors join the same room. Match progress and scores reset with the server.
- Keyboard, standard-mapped controller and generic touch input, device prompts, keyboard remapping, dead zones, sensitivity, persisted control selection, reduced shake/flashes, and graphics/audio controls. Audio files are served with the game; no external fonts or third-party media requests are required at runtime.

A lone officer opening a menu or hiding the tab pauses the server world. Backup joining resumes it with a notice. With multiple officers, menus neutralize only that driver's controls. Empty worlds freeze, including their dispatch clocks. Idle players receive a warning at 14 minutes and are disconnected at 15; heartbeats do not count as activity. See [room sessions](spec/ROOM_SESSIONS.md) for retention, reconnect and storage rules. Controller coverage currently uses synthetic standard-mapped devices; physical-controller handling and the full browser/OS matrix remain open. The supplied soundtrack and playback controls are described below; vibration settings do not establish tested haptics.

The single **Invite URL** button stays available before entry, during play and in menus. Small screens put sharing in the pause menu to keep the road visible. It copies the current address; friends enter that same campaign with your earned leads, score, car and dispatch timer intact. Backup joins the patrol already underway.

Your first visit asks for a callsign and saves a random patrol sedan, interceptor, roadster, army 4×4, ambulance or fire-chief SUV. The dispatch briefing shows your unit chasing the suspect on one shared road, with each vehicle’s name and role, alongside a short story briefing. **Reassign vehicle** rolls a different car there, alongside the suspect's mugshot and dispatch. The choice locks at countdown; reconnects and respawns preserve it. Clearing browser storage starts a new garage assignment. Quick swooshes and suspect reveals finish within 220 ms and never delay a button press.

Fresh browsers also receive a random callsign such as **Captain Waffle** or **Squeaky Hubcap**. **Reroll callsign** picks another, or type your own. Generated and custom choices are saved between dispatches and reloads; the existing twenty-character limit applies.

Cars have distinct armor, speed, acceleration, steering and grip, using the same shared rules for authority, local prediction and practice. The army 4×4 absorbs more hits but accelerates and turns slowly; the roadster is fast and fragile. Collision dimensions, weapons and spawn protection remain equal. See the measured [vehicle balance report](packages/sim/BALANCE.md) for all six roles and the automated guardrails.

Cornering adds cartoon body lean and squash, while visible road humps trigger compression, rebound and short spring/foley sounds. These animations preserve the underlying driving pose and collision shape. Reduced-motion preferences and reduced-shake settings suppress the deformation, briefing road/car motion and UI animations.

Confirmed crashes squash the coachwork in the impact direction and spring back, with severity-scaled slapstick audio. Both guns fire real projectiles from their barrel tips, 2.45 m forward and 0.63 m either side of the car center. Each deals 5 damage, retaining 10 damage per volley at the same 12-tick cadence. Paired flashes follow the moving guns, with one recoil and sound per volley. Fresh trails start at the muzzle; local rounds advance by at most 100 ms to match driving prediction, while remote rounds use buffered playback. These effects share bounded pools and audio limits; crashes do not add ram damage.

Each barrel applies subtle aim assist to a visible opponent or the wanted suspect within **4°**, **2.5 m of its original firing line**, and **40 m**. Buildings and nearer cars block selection, including obstructions between the car center and a gun tip. The correction happens once when a shot is fired; projectiles retain their straight trajectory, and the car's heading is unchanged. One missed or blocked barrel deals only 5 damage. `arcade-v11` / protocol 3 clients and servers must match.

One AI car is the **WANTED** target. Its world marker and labeled screen-edge arrow identify it as the camera and suspect move. To arrest it, stay within 8 m with less than 5 m/s relative speed and a clear line of sight for three seconds. Each connected, active driver builds their own progress, which drains when they lose those conditions. Arresting awards three internal points; destroying the target’s car awards the existing one-point wreck credit. Results distinguish the outcome and name the officer, without a leaderboard. Both advance the story and end the dispatch immediately; cumulative combat points do not override its winner. A timeout reveals no clue and retries the same target.

Results reveal a new lead and identify the resolving officer. **Next briefing** opens the next target and motor pool; after ten successes, the finale closes the connected story and offers a new campaign. Online progress, results and clues are shared with late joiners and reconnecting players. Progress lasts for the current game/room, while the car assignment persists between runs. See [campaign rules and the engineering story outline](spec/CAMPAIGN.md).

The targets fight back: Mabel brake-checks and fires short bursts, Hector weaves and lobs grenades, Iris fires on serpentine drive-bys, and Aldo intercepts with mixed attacks. Crew encounters introduce the patterns more gently. All ten dispatches have authored difficulty and recovery windows. Enemy bombs lead your release-time velocity, then lock a marked landing point: one-second fuses in dispatch 3 and 0.8 seconds later. Change speed or direction to dodge. Dispatches 5, 9 and 10 add a black chopper that bombs, departs and returns; normal guns aimed along its amber ground marker can down it for that dispatch. Damage remains authoritative with distance falloff and cover checks. Original pooled cartoon effects and authored fuse/explosion sounds follow the existing reduced-effects and volume settings. See [boss combat and callsigns](spec/BOSS_COMBAT.md).

Guns appear on player and villain cars; civilian traffic is unarmed. Villains display their assigned vehicle body even outside live pursuit guidance. Wrecks now shed every authored component—40–58 pieces depending on the car—including separate tires, hubs, trim, lights and guns. Each piece gets local 3D physics, bouncing off the road, buildings and other fragments like a toy car losing an argument with the assembly manual. Debris clears within 2.6 seconds or immediately on respawn, and reduced motion suppresses it. A charred chassis remains until the protected respawn.

Loose barrels, crates, bins and park benches separately use server-owned 3D rigid-body physics. Lamp posts, signs and trees stand fixed until a car knocks them free. Cars push this scenery without receiving a physics impulse back. Wreck fragments remain cosmetic: they do not damage or push cars/pedestrians and add no network transforms.

Twenty-four cosmetic pedestrians walk sidewalks, wait for safe crossing gaps and flee approaching cars. Predictive avoidance and a final rendered-car sweep check keep them clear of vehicles; they have no health, collision bodies or combat targeting. Their animation runs locally and can differ between viewers. See [world reactions](spec/WORLD_REACTIONS.md) for lifecycle, safety, budgets and reproducible visual checks.

## Controls

Choose **Control scheme** in **Settings & controls**: **Automatic**, **Touch**, **Controller** or **Keyboard**. The choice persists. Automatic starts with touch on devices reporting touch support, otherwise keyboard; using a controller or keyboard switches the active device. Tap the play area to return to touch. An explicit choice keeps the driving source and overlay fixed. Touch controls appear during driving and hide in menus, briefings, results and lost connections. No touchscreen detection relies on an iPad name tag.

The labeled touch controls replace the floating keyboard/controller card. Fire and Drift + Fire appear when the campaign unlocks guns in dispatch 2; the first dispatch remains an unarmed arrest lesson.

| Action | Keyboard | Standard controller | Touch |
| --- | --- | --- | --- |
| Accelerate | W / Up | Left stick forward, or right trigger | Drag drive pad up |
| Brake / reverse | S / Down | Left stick backward, or left trigger | Drag drive pad down |
| Steer | A/D or Left/Right | Left stick left/right | Drag drive pad left/right |
| Handbrake | Shift | A / south button | Hold Drift |
| Fire | Space | Right shoulder | Hold Fire; Drift + Fire holds both |
| Siren | E | X / west button | Tap Siren |
| Recover a stuck car | Hold R for one second | Hold Y / north button for one second | Hold Recover for one second |
| Pause / settings | Escape | Menu / Start | Pause button |
| Menu navigation | Arrows, Enter, Escape; Tab for fields | D-pad / stick, A confirm, B back | Tap buttons and fields |

Pulling the stick backward brakes a forward-moving car before reversing, just like the left trigger. Stick and trigger input combine without adding extra acceleration. The touch pad uses the same vehicle-relative steering and brake/reverse rules. Pointer cancellation, lost capture, viewport resize, focus loss, menus and control changes clear held touches; a fresh touch is required. Callsign text entry uses the device's keyboard. Unknown controller mappings direct players to touch or keyboard in settings rather than guessing button assignments. Browser touch/controller checks use Chromium touch emulation and injected standard gamepads; physical iPad, Android and controller acceptance and sustained mobile performance remain open.

Small screens (width at most 740 CSS pixels or height at most 420) keep health, time, pause, the audio knob and a compact suspect marker with distance, guidance and local arrest progress during driving. This applies to touch, keyboard and controller modes. Branding, healthy connection status, speed, standings, campaign tracker, floating tutorials, duplicate arrest instructions and the live Invite URL button leave the driving view. Pause retains current dispatch/target, speed/health, standings, help and sharing; connection trouble remains visible. [Compact HUD checks](tests/e2e/compact-hud.spec.ts) limit the status indicators to 10% of the tested phone viewports, excluding touch buttons.

Click/tap the audio knob to mute/unmute; drag up/down, scroll or use arrow keys to change volume. The chosen level and mute state persist. The supplied `titles.mp3` plays on the title screen; `slow.mp3` and `fast.mp3` crossfade during dispatches, with smooth tempo increases up to 15% as the car approaches its top speed. Music starts after you interact with the page. See [music setup and test scope](spec/AUDIO.md#adaptive-soundtrack-and-volume-control). Existing gameplay sound effects remain available.

Small-phone touch layouts target iPhone SE 2020/2022-sized screens: 375×667 portrait, 667×375 landscape and a reduced 667×290 visible viewport. Driving targets remain at least 44 CSS pixels. The briefing reserves at least 80 CSS pixels for scrolling case details and groups its settings/help actions beside each other. Entry, briefing, pause and control settings are covered by [small-screen browser checks](tests/e2e/small-touch.spec.ts). Real iPhone Safari, sustained frame rate and the original 2016 SE remain separate acceptance work. The pocket patrol still needs a road test.

## Developer commands

| Command | Current behavior |
| --- | --- |
| `pnpm dev` | Start client and game server together |
| `pnpm dev:client` / `pnpm dev:server` | Start either development process separately |
| `pnpm check` | Typecheck, validate documentation links/task dependencies, check simulation import boundaries |
| `pnpm test` | Run both headless suites; no browsers |
| `pnpm test:unit` | Run isolated logic with controlled dependencies; no sockets, real physics or renderer adapters |
| `pnpm test:integration` | Run real physics/render adapters, HTTP/Colyseus rooms, prediction, hosting and tooling checks |
| `pnpm test:ui` | Five fast UI fixtures with mocked game state; real DOM/CSS, no physics, renderer or sockets |
| `pnpm test:e2e` | Local game browser checks, mocked UI fixtures, native water checks and the audio bank/mix gate |
| `pnpm test:water` | Native water visibility/reflection, isolated glass, tire-spray pixels and splash audio; owns a temporary renderer server |
| `pnpm hooks:install` | Install the local Git pre-push hook; also runs automatically on local dependency installation |
| `pnpm test:load` | Run eight real SDK clients against the local server; write a payload-estimate report |
| `pnpm test:deploy` | Check production readiness/HTML and two real multiplayer WebSocket clients at `TEST_SERVER_URL` |
| `pnpm assets:check` | Validate authored map/content invariants |
| `pnpm build` | Build the production client and bundled server |
| `pnpm preview` | Preview the built static client on Vite's preview port; online play still needs a game server |
| `pnpm start` | Run the TypeScript game-server entrypoint |

For a fresh Playwright setup, run `pnpm exec playwright install chromium` before `pnpm test:e2e`. The browser config can use installed Chrome on Windows or a specific `CHROME_PATH`. On a dual-GPU machine, `FENDER_E2E_HIGH_PERFORMANCE_GPU=1` requests Chromium's high-performance adapter; set `FENDER_E2E_EXPECTED_GPU=NVIDIA` (or the expected renderer substring) to make a browser check verify the actual game's WebGL backend. This is an explicit local test environment choice; it does not alter the game preset, viewport or driving assertions. Render-only smoke/alignment tools are in [tools/assets](tools/assets); no `test:visual` or `test:network` package script currently exists.

Browser E2E runs locally before each push through [the pre-push hook](.githooks/pre-push), and a failure stops the push. Local `pnpm install` installs the hook; existing checkouts can run `pnpm hooks:install`. Custom hook paths are preserved and need the same `pnpm test:e2e` command. CI runs unit, integration, types/docs, assets, build and production-container smoke. The browser patrol stays in the local garage; the server checks still report for duty.

Timing-sensitive driving checks use the actual frame clock, controlled road/contact fixtures and bounded sample collection. They retain strict motion/reset limits and separately report raw physical movement and unexplained contact jumps. Reproduce them with `pnpm exec playwright test tests/e2e/contact-driving.spec.ts tests/e2e/solo-driving.spec.ts --repeat-each=5`; see [the measurement contract](spec/QUALITY_AND_OPERATIONS.md#1-test-principles). These correctness runs do not certify a device's frame-rate budget.

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
- [Patrol audio](spec/AUDIO.md): sound bank, playback rules and the reproducible before/after listening check.
- [Original runtime asset record](packages/content/manifests/licenses/ORIGINAL_ASSETS.md): project-authored geometry/materials/audio; dependency-license review remains separate.
- [Decision register](spec/DECISIONS.md): accepted requirements and defaults.
- [Contributors](CONTRIBUTORS.md): Stefan Andersson, Wictor Stenseke, Claude Code, and OpenAI Codex—the people and AI assistance behind the dispatch desk.

## License

Copyright (C) 2026 Fender Offenders contributors.

Unless a file states otherwise, the original code, documentation, procedural art, story content and synthesized audio in this repository are licensed under the **GNU General Public License, version 3 or any later version** (`GPL-3.0-or-later`). You may redistribute and modify that work under those terms. It is provided without warranty, including implied warranties of merchantability or fitness for a particular purpose. See [LICENSE](LICENSE) for the full terms and [GNU's licensing guidance](https://www.gnu.org/licenses/gpl-howto.en.html) for background.

Third-party dependencies and CC0 source recordings retain their own licenses and notices; the project license does not replace them. See [original asset provenance](packages/content/manifests/licenses/ORIGINAL_ASSETS.md), [audio provenance](packages/content/manifests/licenses/audio/README.md) and [contributors](CONTRIBUTORS.md).
