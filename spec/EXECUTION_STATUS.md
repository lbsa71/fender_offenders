# Execution status and evidence

Updated: 2026-10-23. This ledger covers the 49 tasks in [the plan](../IMPLEMENTATION_PLAN.md). The playable alpha is deployed at [fender-offenders.onrender.com](https://fender-offenders.onrender.com). Release-candidate acceptance remains incomplete.

`Implemented` means the principal code path exists with the evidence cited here; it does not waive outstanding release gates. `Partial` means code exists but a named deliverable or acceptance check remains. `Open` means the deciding gate has not been demonstrated. The plan retains its original acceptance definitions.

## Observed baseline

| Evidence | Observed scope | Reproduce / source |
| --- | --- | --- |
| Simulation | 23 headless tests: driving, real Rapier feasibility, checkpoints, combat, rounds, pursuit, disposal | `pnpm test -- packages/sim/src/core/simulation.test.ts`; [simulation notes](../packages/sim/README.md) |
| Input | 13 tests: left-stick forward/brake/reverse, trigger alternatives, dead zones, ramp/remap, edges/hold, focus/menu/device-loss safety and controller navigation | `pnpm test -- packages/input/src/input.test.ts`; [input notes](../packages/input/README.md) |
| Real room/network | 12 integration tests, including 3 safety-braking regressions; real authority/combat/reconnect/lifecycle and ordered delay/jitter/stall | `pnpm test:integration`; [integration evidence](../tests/integration/README.md) |
| Browser | 7 scenarios passed together in 1.8 minutes; local practice, synthetic pad, blur, two-context online play, no external resources, typography, actionable session failures | `pnpm test:e2e`; [scenarios](../tests/e2e/game.spec.ts) |
| Actionable session error | A separate real missing-room browser regression passed in 16.8 seconds after the intended raw-message failure was observed | [browser regression](../tests/e2e/session-errors.spec.ts) |
| UI fixture | Keyboard menus, settings/remap, invite parsing, safe nickname/results/rematch, 740×580 panel bounds | `node packages/ui/dev/smoke.mjs`; [UI notes](../packages/ui/README.md) |
| Hosting origins | 3 tests: local production origin, explicit allowlist, platform-provided public origin | `pnpm test -- tests/hosting`; [tests](../tests/hosting/origin.test.ts) |
| Prediction facade | 10 targeted real-session/interpolation tests passed, including invalid-name error handling; final aggregate run is separate | [prediction tests](../tests/prediction/online-session.test.ts), [interpolation tests](../packages/net-client/src/index.test.ts) |
| Static/build | Local typecheck/docs/boundary checks passed; production build scripts exist | `pnpm check`, `pnpm assets:check`, `pnpm build` |
| Linux production container | Docker build on Node 22 passed all 56 headless tests and built the client/server. Running image passed readiness, production HTML, two actual WebSocket players and round start | `docker build --load -f infra/Dockerfile -t fender-offenders:preview .`; `pnpm test:deploy` with the container endpoint |
| Published CI | Commit `8ecec99` passed 79 headless tests, all 7 browser scenarios, production image build and its two-player WebSocket/ping smoke on Ubuntu 24.04/Node 22 | [Passing workflow](https://github.com/lbsa71/fender_offenders/actions/runs/39833404150) |
| Stick drive follow-up | Five new mapping tests and the browser prompt first failed; 13 input plus 23 simulation tests and the updated controller browser scenario then passed locally | [Input tests](../packages/input/src/input.test.ts), [controller scenario](../tests/e2e/game.spec.ts) |
| Shared ping and connection UI | Server/wire regressions cover both observers, nonce identity/single use, expiry, reconnect cleanup and 1300 ms replies. The UI fixture covers numeric/unknown ping, practice omission and Wi-Fi states; a real two-browser match displayed both players' numeric ping on each client | [Latency tests](../packages/net-server/src/latency.test.ts), [UI fixture](../packages/ui/dev/smoke.mjs), [browser scenario](../tests/e2e/game.spec.ts) |
| Remote presentation clock | Late snapshots first reproduced backward movement; match changes first retained old history. Six deterministic regressions then passed, including legitimate reversing and the 100 ms extrapolation cap | [Clock tests](../packages/net-client/src/clock.test.ts) |
| Session disposal | Real socket regressions first reproduced unwanted retry after a 1001 close, a pending leave while reconnecting, and a hanging unanswered close handshake. All 20 affected facade/interpolation/clock tests then passed; disposal blocks queued reconnect transports and bounds the live leave handshake to one second | [Facade tests](../tests/prediction/online-session.test.ts) |
| Matchmaking HTTP errors | Real HTTP regressions first emitted Colyseus 520–526 as HTTP statuses; normalization preserves protocol JSON while using standard HTTP statuses. Public old-room 522 and create-room 503 were reproduced; the latter returned `Dispatch capacity reached` | [HTTP tests](../tests/hosting/matchmaking-http.test.ts) |
| Reusable invites | Real SDK/HTTP tests pass lazy creation, three simultaneous visitors under a one-room cap, same-link reuse across an actual server restart, invalid-code/origin rejection and capacity retry | [Invite integration](../tests/hosting/invite-links.test.ts), [client adapter](../tests/prediction/invite-client.test.ts) |
| Room admission and motor pool | Focused failures reproduced cold admission races, interrupted initialization, disposal counter leaks and obsolete body IDs. Server regressions pass bounded admission/reuse, lifecycle cleanup, six-body random assignment and stable bodies across reconnect/respawn | [Lifecycle tests](../packages/net-server/src/lifecycle.test.ts) |
| Six vehicle bodies | Patrol, interceptor, roadster, army 4×4, ambulance and fire-chief SUV use original procedural geometry and shared gameplay rules. NullEngine checks cover distinct silhouettes/materials, emergency lights, medical markings, spare tire and instancing; reproducible fleet renders support visual review | [Renderer notes](../packages/renderer/README.md), [body tests](../packages/renderer/src/cars.test.ts) |
| Combined invite/fleet verification | All 120 headless tests across 16 files pass locally after integrating HTTP error normalization, reusable invites, admission cleanup and the six-car pool. Types, documentation links and asset audit pass; front/rear/default-game-camera renders were inspected | `pnpm test`, `pnpm check`, `pnpm assets:check`; [fleet render tool](../packages/renderer/dev/capture-bodies.mjs) |
| Vehicle profiles and selection | Focused failures first reproduced uniform HP/speed, missing selection, lost wire maximum and ignored join choice. Shared controller/profile and real two-client tests now cover tuning, authority, lobby broadcast/lock, respawn/reconnect and forged tuning rejection. A follow-up RED caught two armor-rounding advantages before values were tightened | [Profile tests](../packages/sim/src/vehicles/vehicle-profiles.test.ts), [selection integration](../tests/integration/vehicle-selection.test.ts), [balance measurements](../packages/sim/BALANCE.md) |
| Saved garage and preview | Three real browser scenarios passed persistence/reload/repair, keyboard reassignment, selected-body practice, rotating preview/reduced-motion stop and two-client lobby broadcast/countdown lock, with no page errors. Follow-up fixture RED/GREEN checks cover offline reassignment, pending choice across reconnect/epoch/countdown boundaries and clear notification placement at 960×640 | [Garage browser scenarios](../tests/e2e/garage.spec.ts), [UI fixture](../packages/ui/dev/garage-smoke.mjs) |
| Cartoon driving presentation | Focused RED/GREEN tests cover body/suspension hierarchy, bounded heel/squash, hump crossing/settling, cue cooldowns, audio activation/mute/voice cap and garage lifecycle/quality. The real renderer fixture verified body replacement, max-health bars, lean, compression, single boing/squeak and reduced-motion rotation stop; close-camera captures were inspected | [Renderer QA and acceptance](../packages/renderer/README.md), [deformation tests](../packages/renderer/src/deformation.test.ts) |
| Integrated profiles/garage/cartoon verification | All 175 headless tests across 23 files and all 10 browser scenarios pass locally after integration. Type/document/boundary checks, original asset audit and production client/server build pass. Browser checks include keyboard/pad input, practice, two-client live rounds and garage lifecycle; captured home/lobby layouts at 1440×900 and 960×640 support review | `pnpm test`, `pnpm test:e2e`, `pnpm check`, `pnpm assets:check`, `pnpm build` |
| Synthetic disconnect fixture | A new page-error assertion first exposed Babylon reading the absent `gamepad` field on the test's synthetic disconnect event. Supplying that event payload fixed the fixture; the focused controller browser scenario then passed without page errors. Production device handling was unchanged | [Controller browser scenario](../tests/e2e/game.spec.ts) |
| Published garage/profile build | Commit `b227a64` passed all 175 headless tests, 10 browser scenarios and the production Docker WebSocket/ping smoke. The hosted two-client check verified old-invite reuse, army 130 HP, roadster 80 HP, shared ambulance reassignment and countdown lock; a browser verified saved public garage selection across reload | [Passing CI](https://github.com/lbsa71/fender_offenders/actions/runs/39910016049) |
| Confirmed crash and wall-strike events | Four initial failures exposed absent wall/boundary/car impact observations and crash publication. Six focused tests now pass unchanged contact response/health, both head-on normals, event gating, scrape suppression, checkpointed 30-tick cooldown and a real Rapier blocked-shot strike. A real legacy-client rejection first accepted `arcade-v2`, then passed after the `arcade-v3` revision bump. Two real peers receive identical corrected-shot/crash events with the expected damage; the full 13-case room suite passes | [Impact tests](../packages/sim/src/vehicles/impacts.test.ts), [room tests](../tests/integration/rooms.test.ts) |
| Narrow aim assist | Real-simulation near misses first retained 100 HP instead of 90; helper/authority tests now cover the 4°/2.5 m/40 m bounds, world and car occlusion, protection/civilian exclusion, explicit suspect identity, deterministic choice and fixed projectile direction without steering | [Aim-assist tests](../packages/sim/src/combat/aim-assist.test.ts) |
| Slapstick audio | Missing crash synthesis, noise-only combat sounds and ignored distance attenuation were observed RED before the fixes. Twelve focused tests pass activation/mute/volume, pitched layers/severity, distance scaling, the 12-source bound and deterministic cleanup. Native OfflineAudioContext renders verify audible cues, exact muted silence and a non-clipping overlap sample | [Audio tests](../packages/renderer/src/audio.test.ts), [native audio QA](../packages/renderer/dev/render-audio.mjs) |
| Crash and weapon presentation | Native browser RED checks first exposed absent directional squash/rebound, crash audio, recoil, paired muzzle flashes, tracer trails and hit rings. Follow-up RED/GREEN checks cover low-frame-rate first-presentation visibility, correct authoritative muzzle position, wall strikes, distance attenuation, stale lives/event deduplication and returning to a prior room. Warm close-camera captures support visual acceptance | [Renderer reproduction](../packages/renderer/README.md), [combat browser fixture](../packages/renderer/scenarios/combat-check.ts) |
| Integrated combat update | All 221 headless tests across 27 files pass, with types/docs/assets and production build. The full existing 10 browser scenarios pass; the affected keyboard gunfire case and new real-driving crash scenario also pass with visible muzzle/impact pools and no ram damage. CI includes all 11 scenarios; the driving scenario reserves extra wall-clock time for software-GPU simulation progress | [Browser scenarios](../tests/e2e/game.spec.ts), [impact tests](../packages/sim/src/vehicles/impacts.test.ts) |
| Spectacular wrecks | Native renderer checks first exposed 12 missing event/lifecycle behaviors. Four wheels and six detailed panels now tumble/bounce around a fireball, leave a charred chassis and restore on respawn. Pool, body-state and owner-scoped audio cleanup tests pass, with duplicate/stale-life and reduced-effects checks; seven native timeline captures support review | [Wreck tests](../packages/renderer/src/wreck-effects.test.ts), [native lifecycle check](../packages/renderer/scenarios/wreck-check.ts), [renderer notes](../packages/renderer/README.md) |
| Physical street scenery | Initial focused failures showed missing authoritative gravity state, wreck metadata and lost wire props. Real Rapier tests cover loose barrels/crates/bins/benches, fixed-to-dynamic lamps/signs/trees, fast-car sweeps, exact checkpoint replay and unchanged arcade vehicle response. Two real clients receive current props and observe a thrown barrel; the initial server integration first returned zero props | [Physics tests](../packages/sim/src/physics/props.test.ts), [socket integration](../tests/integration/physical-props.test.ts), [world lifecycle](WORLD_REACTIONS.md) |
| Rigid-prop presentation | Three initial observable failures showed missing native props, pose/rotation updates and lifecycle instances. Tests now verify seven kinds, full falling rotation, native resource reuse/removal/disposal. A real browser drove through a fixture of all seven kinds: lamp/tree/sign released, barrel/bench moved, armor stayed 130, 24 people remained visible, no errors or unsupported instance warnings | [Native prop tests](../packages/renderer/src/props.test.ts), [real-physics browser check](../packages/renderer/scenarios/world-check.ts) |
| Safe pedestrian crowd | Focused motion/mesh regressions and native walk/flee scenes cover sidewalk paths, crossing gaps, all-car predicted/swept avoidance, late teleports, reduced-motion gait and cleanup. A curb-pass visual audit reproduced excessive emergency retreats before a focused fix added safe sideways evasion and gradual route rejoining | [Motion tests](../packages/renderer/src/pedestrian-motion.test.ts), [crowd mesh tests](../packages/renderer/src/pedestrians.test.ts), [native QA](../packages/renderer/dev/PEDESTRIANS.md) |
| Sparse scenery replication | Wire and live-server failures first exposed lost patch rosters and missing sparse publication. Per-recipient baselines and last-sent motion thresholds now omit unchanged tuples, preserve quiet scenery, publish metadata changes and rebuild on resync. A client facade regression first cleared two props on a quiet packet, then passed after same-match patch reconstruction | [Publisher tests](../packages/net-server/src/prop-publisher.test.ts), [real publisher socket](../packages/net-server/src/prop-publishing.test.ts), [clock tests](../packages/net-client/src/clock.test.ts) |
| Integrated reactive-world verification | All 283 headless tests across 36 files and all 11 browser scenarios pass locally on the final integrated source. Types/docs/boundaries, original content audit and production build pass. A separate read-only lane review found no additional concrete integration defect. A final live-socket RED/GREEN fixed unnecessary full prop baselines during input-backlog corrections | `pnpm test`, `pnpm test:e2e`, `pnpm check`, `pnpm assets:check`, `pnpm build`; [world reactions](WORLD_REACTIONS.md) |
| Reactive scenery benchmark | 192 props, 8 scripted players + 8 traffic, 1,200 ticks/120 warmup; final local mean 0.515–0.544 ms and p95 0.872–0.929 ms. Sparse MessagePack snapshots averaged 2.51–2.52 KB versus 11.44–11.88 KB full, excluding WebSocket/TLS framing. Machine/JIT/concurrency and short-run limits apply; no capacity acceptance is claimed | `node node_modules/tsx/dist/cli.mjs packages/sim/props-bench.ts`; [bandwidth scope](WORLD_REACTIONS.md) |
| One-room sim benchmark | 8 scripted players + 16 traffic, 18,600 ticks; mean 0.230 ms, p95 0.450 ms, p99 0.680 ms after warmup | `pnpm exec tsx packages/sim/bench.ts`; [methodology](../packages/sim/README.md) |
| Short live load | 8 real localhost clients, 30 seconds, all remained connected; about 18.7 snapshot publications/s during concurrent GPU testing | `pnpm test:load`; local `reports/load-latest.json` is regenerated, not a retained release report |

The live-load JSON snapshot payload estimate was about **67.5 KB/s per client**, exceeding the starting <50 KB/s download budget. This is not captured WebSocket/TCP wire bandwidth or upstream traffic. The bandwidth budget is **not verified**. The 20 Hz publication target also needs an isolated sustained run. One room does not establish production server density.

Development environment: Intel Core i7-1355U, Intel Iris Xe, Windows 11 Pro 10.0.26300, graphics driver 32.0.101.7085, Node.js 25.8.1. Browser behavior tests use the shipped low graphics preset at 960×640; typography retains 1440×900 and render tools record their own settings. Trace screencasts are disabled to avoid repeated WebGL readbacks on software-rendered CI; DOM/action/network traces and failure screenshots remain. Physical-device performance acceptance is separate. Exact release-browser versions, power mode, production build identity, and formal approved target/minimum-device reports remain outstanding. Dependency versions are in [package.json](../package.json) and [the lockfile](../pnpm-lock.yaml).

## Task ledger

### Foundation and integration

| ID | State | Evidence / remaining work |
| --- | --- | --- |
| F00 | Implemented | Workspace, TypeScript/Vite, app roots, environment sample and test/check/build scripts exist. Published GitHub CI passes validation and the production-container multiplayer smoke. |
| F01 | Partial | DTOs/config/adapters, input/map checks and compact wire snapshots exist. Complete schema/collection validation and fixture compatibility matrix remain. |
| F02 | Partial | Authored map and executable sim/render/browser/network fixtures unblock consumers. Proposed versioned `test-support` fixture catalog is incomplete. |
| F03 | Implemented | Practice/online composition, adapter wiring, cleanup and fatal-start display are integrated; debug getters are development-only. |
| F04 | Partial | Browser practice and synthetic-controller flow pass. Real controller and human handling acceptance remain. |
| F05 | Partial | Real combat/respawn tests and two-context browser round/scoreboard flow pass. Human remote combat and contact-correction traces remain. |
| F06 | Partial | District, traffic, pursuit, bodies, round loop, settings and reconnect code exist. Full human eight-player walkthrough and unresolved gates remain. |
| F07 | Open | Release-candidate/P01–P10 evidence and validated public operation are incomplete. |

### Simulation and driving

| ID | State | Evidence / remaining work |
| --- | --- | --- |
| S00 | Partial | Headless real Rapier lock/query/contact/restore fixture passes. Gameplay uses bounded planar contacts and Rapier projectile queries; browser parity/contact acceptance remain. |
| S01 | Implemented | Fixed-step seeded simulation, versioned checkpoints, map/config validation and disposal have headless evidence. |
| S02 | Partial | Acceleration/braking/reverse/drift/surfaces/walls/recovery are tested. Human slalom/controller feel and recorded 30/60/144 Hz comparison remain. |
| S03 | Implemented | Controller/timer/identity restore/replay equality is tested; pure prediction avoids stale solver-contact state. Online contact acceptance remains S04/N03. |
| S04 | Partial | Time-aligned proxies and bounded contact tests exist. Correction traces, accepted bounds and human contact review remain. |
| S05 | Partial | Authored lane following, caps and jam relocation participate in sim/load scenarios. Sustained district route/jam acceptance remains. |
| S06 | Partial | One-room 8-player/16-traffic benchmark and disposal test exist. Transport/render cost and many-room density remain separate gates. |

### Networking

| ID | State | Evidence / remaining work |
| --- | --- | --- |
| N00 | Implemented | Pinned Colyseus SDK/server real sockets work; custom session/prediction facade is used. |
| N01 | Implemented | Real clients exercise authoritative rooms, admission/version checks, identity, lifecycle and disposal. |
| N02 | Implemented | Bounded admission/queues/acks, stale/neutral/disconnect braking and compact snapshots pass authority/safety tests. Sustained rate/bandwidth remains Q05. |
| N03 | Partial | Prediction/replay/correction/interpolation and targeted real-facade tests pass. Contact divergence and correction histograms remain unaccepted. |
| N04 | Partial | Real reconnect identity/epoch change and stale-input rejection pass. Complete stall/expired-reservation/hidden-tab/room-expiry matrix remains. |
| N05 | Partial | Eight-client admission, short load, late join, creator departure and rematch pass. Sustained live five-minute eight-player network matrix remains. |

### Rendering and audio

| ID | State | Evidence / remaining work |
| --- | --- | --- |
| R01 | Partial | Babylon facade, right-handed WebGL, resize, quality and cleanup exist. Art is source-generated; full backend/context failure handling remains. |
| R02 | Partial | Elevated smoothed/look-ahead camera, wheel/body presentation and local marker exist. Human reverse/turn/occlusion review remains. |
| R03 | Partial | Authored city/car surfaces, glass, lightbar, shadows and repeatable captures exist. Approved reference and controlled production frame/load budget remain. |
| R04 | Partial | Bounded tracer/effect/skid pools, audio and event dedup exist; renderer smoke checks duplicate presentation. Human audio/visual approval and profiling remain. |
| R05 | Partial | District, presets and bounded effects are integrated. LOD/occlusion expectations, eight-player frame budgets and ten-rematch GPU/memory proof remain. |
| R06 | Open | WebGPU is not enabled. Full WebGL2 browser/context-loss recovery matrix remains; WebGL2 is the current path. |

### Art and content

| ID | State | Evidence / remaining work |
| --- | --- | --- |
| A01 | Partial | Original geometry/materials/synthesized audio replace archive sourcing; provenance exists. Dependency/distribution-license audit remains. |
| A02 | Partial | Shared district colliders/spawns/surfaces/lanes and visual layout exist with validation tools. Full collision overlay/alignment acceptance remains. |
| A03 | Partial | Procedural car/intersection detail and six body designs exist. No GLB/Blender pipeline is claimed; approved render/asset-budget evidence remains. |
| A04 | Partial | District/loop/dirt shortcuts/traffic bodies/original audio exist. Optimized low variants and full performance/provenance audit remain. |

### Input and interface

| ID | State | Evidence / remaining work |
| --- | --- | --- |
| U01 | Partial | Keyboard/standard-pad normalization, edges, focus/device status and disconnect safety pass unit/browser emulation. Actual hardware is untested. |
| U02 | Partial | Persisted keyboard remap/sensitivity/dead zones, ramp, pad menus and recovery hold work. Real hotplug/focus/device matrix remains. |
| U03 | Implemented | Callsign/practice/create/join, loading/errors and invite links are integrated; safe rendering/browser flows and real missing-room actionable-error regression pass. |
| U04 | Implemented | Confirmed-state HUD projects health/speed/timer/standings/prompts/connection/recovery without owning gameplay truth. |
| U05 | Partial | Online neutralization/local pause/reconnect/results/rematch and volume/reduced-effects settings exist. Human accessibility/onboarding/hardware remain; no soundtrack/haptics acceptance is claimed. |

### Gameplay and combat

| ID | State | Evidence / remaining work |
| --- | --- | --- |
| G01 | Implemented | Authoritative cadence/sweeps/wall blocking/owner immunity/single-hit removal have headless/socket evidence. Full rotating-target continuous collision is outside this implementation. |
| G02 | Implemented | Health/credit/wreck/respawn/protection/blocked-spawn retry/recovery eligibility have deterministic and real-socket tests. |
| G03 | Implemented | Lobby/countdown/playing/results/rematch/ties/creator reassignment/late join have sim/socket evidence. |
| G04 | Partial | Practice interception/arrest/award and suspect respawn are tested and integrated. Human keyboard/controller completion remains. |
| G05 | Open | Formal human handling/combat/spawn fairness playtest and recorded balance decisions remain. Ram damage stays disabled. |

### Quality and operations

| ID | State | Evidence / remaining work |
| --- | --- | --- |
| Q01 | Partial | Vitest/Playwright, docs/task/import checks, published passing CI and machine details exist. Full release-environment metadata remains. |
| Q02 | Partial | Browser input, captures and alignment tools exist. Human visual/handling approval, hardware controller, cold-load/input-to-present traces remain. |
| Q03 | Partial | Ordered TCP delay/jitter/550 ms stall and adversarial authority checks pass. OS loss/full profiles/contact-correction reports remain. |
| Q04 | Partial | Live combat/wreck/respawn/score and one reliable-stream impairment profile pass. Human remote playability/correction-bound acceptance remain. |
| Q05 | Partial | Short eight-player load and sim benchmark exist. Sustained profiles/ten-rematch memory/wire bandwidth/multi-room capacity remain. |
| Q06 | Partial | Free Render preview and Docker runtime validated with production HTML, readiness, exact-origin admission, two secure WebSocket players and a live round. Automatic deploy is configured after CI checks. Full rolling drain, sustained hosted capacity and rollback remain unaccepted. |
| Q07 | Partial | Original asset record, no remote fonts, safe text, settings/input checks and dev-only debug guard exist. Full license/accessibility audit remains. |
| Q08 | Open | Full Windows/macOS/browser/controller matrix and linked P01–P10 release sign-off remain. |

## TDD record and outstanding gates

[AGENTS.md](../AGENTS.md) requires strict test-first red–green–refactor for new behavior and fixes. Earlier implementation is not represented as historical TDD. Observed later cycles include server safety braking (three socket speed failures, then green), UI self-contained resources (Google Fonts request failed before import removal), system-font containment (38 px overflow failed before fallback fix), and actionable session errors (the real missing-room browser test first displayed a raw SDK error, then passed after the app preserved the typed reason). Other lanes retain focused regression evidence. Final aggregate counts must come from the final integrated run; do not sum speculative tests.

Release still requires physical-controller hotplug/remap/focus checks, named Windows/macOS/browser coverage, human driving/visual/combat review, collision-correction histograms under defined network profiles, OS packet impairment, production browser frame/cold-load/input-latency/memory reports, sustained eight-player/multi-room capacity, full license review and compatible release/rollback validation.

The public preview runs on the connected Free Render service in Frankfurt. The hosted smoke verified production HTML/readiness, two secure WebSocket players and a shared live round, then exited cleanly. A real browser created a hosted room and rendered the district. Exact-origin admission was checked remotely (own origin 200; unrelated origin 403). The smoke cleanup regression first observed SDK retries after a proxy-style 1001 close, then passed after reconnect was disabled before intentional leave. Initial deployment was a Blueprint-triggered build; subsequent automatic deployments are configured to wait for CI. Staging rollback remains unverified. See [operations](../infra/README.md).
