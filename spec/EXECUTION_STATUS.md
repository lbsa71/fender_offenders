# Execution status and evidence

Updated: 2026-10-22. This ledger covers the 49 tasks in [the plan](../IMPLEMENTATION_PLAN.md). The playable alpha is deployed at [fender-offenders.onrender.com](https://fender-offenders.onrender.com). Release-candidate acceptance remains incomplete.

`Implemented` means the principal code path exists with the evidence cited here; it does not waive outstanding release gates. `Partial` means code exists but a named deliverable or acceptance check remains. `Open` means the deciding gate has not been demonstrated. The plan retains its original acceptance definitions.

## Observed baseline

| Evidence | Observed scope | Reproduce / source |
| --- | --- | --- |
| Simulation | 23 headless tests: driving, real Rapier feasibility, checkpoints, combat, rounds, pursuit, disposal | `pnpm test -- packages/sim/src/core/simulation.test.ts`; [simulation notes](../packages/sim/README.md) |
| Input | 8 tests: ramp/dead zones/remap, edges/hold, focus/menu/device-loss safety, controller navigation | `pnpm test -- packages/input/src/input.test.ts`; [input notes](../packages/input/README.md) |
| Real room/network | 12 integration tests, including 3 safety-braking regressions; real authority/combat/reconnect/lifecycle and ordered delay/jitter/stall | `pnpm test:integration`; [integration evidence](../tests/integration/README.md) |
| Browser | 7 scenarios passed together in 1.8 minutes; local practice, synthetic pad, blur, two-context online play, no external resources, typography, actionable session failures | `pnpm test:e2e`; [scenarios](../tests/e2e/game.spec.ts) |
| Actionable session error | A separate real missing-room browser regression passed in 16.8 seconds after the intended raw-message failure was observed | [browser regression](../tests/e2e/session-errors.spec.ts) |
| UI fixture | Keyboard menus, settings/remap, invite parsing, safe nickname/results/rematch, 740×580 panel bounds | `node packages/ui/dev/smoke.mjs`; [UI notes](../packages/ui/README.md) |
| Hosting origins | 3 tests: local production origin, explicit allowlist, platform-provided public origin | `pnpm test -- tests/hosting`; [tests](../tests/hosting/origin.test.ts) |
| Prediction facade | 10 targeted real-session/interpolation tests passed, including invalid-name error handling; final aggregate run is separate | [prediction tests](../tests/prediction/online-session.test.ts), [interpolation tests](../packages/net-client/src/index.test.ts) |
| Static/build | Local typecheck/docs/boundary checks passed; production build scripts exist | `pnpm check`, `pnpm assets:check`, `pnpm build` |
| Linux production container | Docker build on Node 22 passed all 56 headless tests and built the client/server. Running image passed readiness, production HTML, two actual WebSocket players and round start | `docker build --load -f infra/Dockerfile -t fender-offenders:preview .`; `pnpm test:deploy` with the container endpoint |
| One-room sim benchmark | 8 scripted players + 16 traffic, 18,600 ticks; mean 0.230 ms, p95 0.450 ms, p99 0.680 ms after warmup | `pnpm exec tsx packages/sim/bench.ts`; [methodology](../packages/sim/README.md) |
| Short live load | 8 real localhost clients, 30 seconds, all remained connected; about 18.7 snapshot publications/s during concurrent GPU testing | `pnpm test:load`; local `reports/load-latest.json` is regenerated, not a retained release report |

The live-load JSON snapshot payload estimate was about **67.5 KB/s per client**, exceeding the starting <50 KB/s download budget. This is not captured WebSocket/TCP wire bandwidth or upstream traffic. The bandwidth budget is **not verified**. The 20 Hz publication target also needs an isolated sustained run. One room does not establish production server density.

Development environment: Intel Core i7-1355U, Intel Iris Xe, Windows 11 Pro 10.0.26300, graphics driver 32.0.101.7085, Node.js 25.8.1. Browser behavior tests use the shipped low graphics preset at 960×640; typography retains 1440×900 and render tools record their own settings. Trace screencasts are disabled to avoid repeated WebGL readbacks on software-rendered CI; DOM/action/network traces and failure screenshots remain. Physical-device performance acceptance is separate. Exact release-browser versions, power mode, production build identity, and formal approved target/minimum-device reports remain outstanding. Dependency versions are in [package.json](../package.json) and [the lockfile](../pnpm-lock.yaml).

## Task ledger

### Foundation and integration

| ID | State | Evidence / remaining work |
| --- | --- | --- |
| F00 | Implemented | Workspace, TypeScript/Vite, app roots, environment sample, test/check/build scripts exist. Remote CI execution remains an operations gate. |
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
| A03 | Partial | Procedural car/intersection detail and three body designs exist. No GLB/Blender pipeline is claimed; approved render/asset-budget evidence remains. |
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
| Q01 | Partial | Vitest/Playwright, docs/task/import checks, CI definitions and machine details exist. Published CI results and full environment metadata remain. |
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
