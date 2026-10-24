# Quality, performance, and operations

Status: quality/release gates with partial `arcade-v8` alpha evidence. Updated: 2026-10-24. [Execution status](EXECUTION_STATUS.md) separates historical implementation results from current review checks; unrun gates below remain requirements.

*A green test run is excellent news. It still cannot plug in a controller or sign a release form.*

## 1. Test principles

Test observable behavior, contract boundaries, and failure modes. Do not add tests that merely restate trivial implementation details. Keep simulation tests headless and deterministic where possible. Visual approval needs human review as well as repeatable captures.

[AGENTS.md](../AGENTS.md) requires test-first red–green–refactor for all new behavior and fixes, with the intended red failure and subsequent green checks reported in each handoff. This agreement was adopted during implementation; earlier code is not claimed to have historical red-phase evidence. Documentation-only changes do not need artificial tests.

A fixture passing does not prove a live integration. Milestone gates specify where real browser/server/device evidence is mandatory. Never mark a gate green because the harness exists but has not been run.

## 2. Available commands and gaps

The root scripts below exist in [package.json](../package.json). `test:network` and `test:visual` remain proposed names; run the explicit harness/tools until corresponding scripts are added.

| Command | Expected behavior |
| --- | --- |
| `pnpm dev` | Start local client and game server; print URLs and cleanup processes on exit |
| `pnpm check` | Typecheck, documentation links/task dependency graph, simulation import boundaries; no general lint/schema coverage is implied |
| `pnpm test` | Vitest logic/simulation, real room/network, prediction and hosting suites |
| `pnpm test:integration` | Real room/client lifecycle, prediction/combat state, reconnect |
| `pnpm test:e2e` | Browser keyboard flow, lobby, match, settings, focus loss |
| `pnpm test:integration` with `tests/integration` | Real ordered TCP-delay/jitter/stall harness; full packet-loss/correction profiles remain open |
| `pnpm test:load` | Eight SDK clients in one room, configurable duration and snapshot payload estimate; separate sim benchmarks measure step cost, and multi-room capacity remains open |
| `pnpm test:deploy` | Production HTTP/readiness plus two real multiplayer WebSocket clients at `TEST_SERVER_URL`; does not imply hosted validation |
| `pnpm exec tsx tools/assets/render-smoke.ts` | Renderer fixture capture/resource checks after starting its preview server; approved visual/performance gates remain open |
| `pnpm assets:check` | Current authored map/content invariants; complete distribution-license and asset-budget audit remains open |
| `pnpm build` | Production client/server builds; no dev-only fixture imports |

Vitest and Playwright are installed and versioned in the root manifest/lockfile. An automated WebKit run would not replace Safari on macOS or real gamepad hardware; neither full matrix is currently accepted.

## 3. Behavioral test matrix

| Area | Required scenarios |
| --- | --- |
| Input | Keyboard ramp, analog dead zones, two triggers, remap persistence, edge consumption, unplug/replug, focus loss, hidden tab, menu neutralization |
| Driving | Accel/brake/reverse, 30/60/144 fps render independence, dirt grip, wall/corner collision, glancing car contact, stuck recovery |
| Frame pacing | Fifteen-tick practice catch-up for a 250 ms frame, four-tick online cap, sub-step remainder, pause reset and excessive-backlog drop |
| Checkpoints | Save/restore/replay through a turn, contact, shot, damage timer, respawn, and traffic interaction |
| Authority | Client position/damage spoof ignored; NaN/Infinity/oversize/out-of-range inputs rejected; no speedup from extra commands |
| Combat | Swept hit on fast/moving target, wall occlusion, owner immunity, duplicate event, fire cadence, spawn protection, simultaneous lethal hits |
| Round | Start validation, late join, creator departure, countdown, timer end, draw, results/rematch, empty-room expiry |
| Campaign | Ten dispatches/four ringleaders, independent arrest progress, credited target wreck, arrest/wreck marks, cumulative score, timeout retry, earned-only clues, creator-only progression, late join/reconnect and finale reset |
| Armed targets | Ten authored tactics, protected/connected-officer selection, bounded burst cadence, fixed grenade landing/fuse/radius, cover/falloff, exactly-once damage, hazard cleanup and checkpoint replay |
| Garage/callsigns | Six shared profiles, briefing-only reassignment, saved random/custom identity, malformed/unavailable storage and authoritative selection locks |
| Network | Duplicate/old sequence, input queue overflow, missing snapshots, burst delay, exhausted history, reconnect/epoch change |
| Assets | Missing file, wrong map hash, wrong orientation, blocked spawn, unresolved lane edge, absent license, placeholder leakage |
| Presentation | Event dedup, no replay audio, correction offset decay, discontinuity snap, occlusion fade, reduced effects |
| Reactive world | One-way car/prop interaction, sparse same-match baselines, quiet sleeping objects, wreck lifecycle and safe local pedestrian avoidance |
| Car assembly breakup | Civilian/player/villain gun roles, exact component geometry/materials, independent rigid fragments, road/wall/fragment contacts, bounded pools, immediate reduced motion and zero-body cleanup |
| Physics startup | Simulation and local debris share one WASM initialization; independent worlds remain valid through initialization/disposal; live practice startup remains usable |
| HUD cost | Repeated target-badge positioning must keep style recalculation bounded for a live dispatch; Chromium CDP regression is separate from sustained frame-budget acceptance |
| Operations | Healthy start, port conflict, capacity limit, graceful drain, shutdown message, rollback/content compatibility |

## 4. Reference hardware and browser matrix

The current development-machine details and scoped measurements are in [execution status](EXECUTION_STATUS.md). Formal target/minimum-device approval, exact release-browser builds and power-mode metadata remain incomplete. Figures below remain acceptance targets unless the ledger explicitly records a matching measured scenario.

Initial categories:

- Target: mainstream desktop or laptop GPU, 1920×1080, medium preset, 60 fps target.
- Minimum candidate: an available integrated-GPU laptop, 1280×720 or dynamic render scale, low preset, 30 fps minimum.
- Compatibility: Windows Chrome/Edge and Firefox; macOS Safari and Chrome. Test browser versions available at release and record exact builds.
- Input: one real standard-mapped Xbox-style controller and one additional available controller family. Record whether the browser reports standard mapping. Do not advertise untested controller models.
- Renderer: WebGL2 on each release browser; WebGPU only on supported tested combinations. Simulate capability absence to verify fallback at startup.

If WebGPU initialization fails, reconstruct the renderer using WebGL2 and the same scene data. Runtime device/context loss needs a recovery screen and reconnect/resume flow; do not assume transparent mid-frame backend switching.

## 5. Performance gates

Measure in a production build after warmup, over a five-minute route/combat scenario. Include eight player vehicles, configured traffic, shots, smoke, shadows, and UI. Record percentiles, not just average fps.

| Metric | Initial target / gate |
| --- | --- |
| Target-device frame interval | Median at or below 16.7 ms; p95 at or below 20 ms; investigate repeated >50 ms stalls |
| Minimum-device frame interval | p95 at or below 33.3 ms on low preset |
| Local input response | Applied next sim tick; no network wait; trace input-to-present under representative load |
| Server room step | p95 below 4 ms and p99 below 8 ms for the eight-player scenario on declared server hardware |
| Server catch-up | No sustained backlog; log and fail the scenario if room time remains >250 ms behind for over 1 second |
| Snapshot rate | 20 Hz baseline; report sustained drift or skipped publication under load |
| Client bandwidth | Starting budget: <50 KB/s down and <10 KB/s up per client average after join; report peaks separately |
| Initial transfer | <=15 MB compressed to first playable scene |
| Cold start | Target <=8 seconds to a usable initial scene at 25 Mbps / 50 ms RTT on target hardware; measure download and decode/compile separately |
| Memory stability | No monotonic growth across 10 rematches; compare retained objects/GPU resources after cleanup |

Change a budget through measured evidence and a recorded decision, not by relabeling a failing test. Eight clients in one room is not proof of many-room server capacity. Publish measured room density and keep admission below a documented safety margin.

## 6. Network profiles and acceptance

Use a real transport/network impairment tool where possible. Browser request throttling alone may not model WebSocket behavior. Identify the tool, directionality, and whether packet loss is at the network or application layer.

| Profile | RTT | Jitter | Loss/stall | Expected outcome |
| --- | --- | --- | --- | --- |
| LAN | 0–20 ms | <=5 ms | None | Nearly invisible correction during ordinary driving |
| Normal internet | 100 ms | +/-20 ms | 0.5% network packet loss | Responsive local controls, stable remote interpolation, consistent damage/score |
| Stressed | 180 ms | +/-40 ms | 1% network packet loss | Playable with visible but bounded corrections; no runaway queue or duplicate damage |
| Interrupted | Variable | Burst | 2-second stall, then recovery | Neutralization, clear status, resync without replaying stale fire |
| Lost session | Disconnect beyond 10 seconds | N/A | Expired reservation | Clear return-to-lobby/error; no duplicate player or score restoration promise |

Report correction distance/angle histograms separately for free driving and collisions. Starting normal-profile target: free-driving position correction p95 below 0.25 m, angle p95 below 3 degrees, and no recurring full-car-length jumps. Collision cases require a recorded playability review; do not hide large errors inside averages.

Use identical scripted inputs for client/server replay where appropriate. Keep peer proxy approximation and server contact outcomes visible in debug overlays. Determine whether a problem is simulation divergence, timestamp alignment, queue policy, or presentation smoothing before changing smoothing constants.

## 7. CI and review gates

- Pull requests: install from lockfile, check, fast tests, production build, and relevant integration tests.
- Contract changes: schema/fixture compatibility checks and affected consumer tests.
- Simulation/network changes: replay and authority tests plus relevant impaired-network scenario.
- Content/rendering changes: asset checks, scene capture, and performance delta for affected scene.
- Release candidate: full browser/device/network/load matrix and license audit.
- Avoid GPU-heavy or hardware-gamepad checks masquerading as generic headless CI. Mark required manual evidence explicitly.

Every report records commit/build identity, config/map versions, commands, environment, and observed limitations. Evidence belongs in an agreed artifact store or `reports/` metadata; large videos and binary traces should not bloat normal Git history.

The 2026-10-24 documentation review reran 465 headless tests across 54 files. Playwright discovery lists 15 browser scenarios across six files; discovery is not execution. PR #2 records a failing then passing badge-cost regression, and PR #3 records the intended four-versus-fifteen pacing failure followed by passing affected checks. Those narrow fixes do not establish the five-minute frame/network/memory budgets above. Keep the stopwatch; retire the victory confetti until the measured scenario finishes.

## 8. Deployment design

The [Render blueprint](../render.yaml) configures one Free Docker web service in Frankfurt serving the client and persistent game-server process together, with two rooms and checks-passed auto-deploy from `main`. Prior hosted HTML/readiness, exact-origin and two-client WSS checks are recorded in [execution status](EXECUTION_STATUS.md); this documentation review does not revalidate the live service or latest deployed commit. [GitHub CI](../.github/workflows/ci.yml) is configured to run check/test/assets/build, the full browser suite, pursuit/campaign/callsign UI fixtures and then production-container smoke. Alternate hosting remains possible through endpoint configuration; see [the runbook](../infra/README.md).

Required configuration:

- Server listen port, allowed browser origins, public WSS endpoint, build identity.
- Protocol/map/gameplay versions, room/player admission limits, room expiry/reconnect settings.
- Client public server URL, asset base URL, build identity. No secrets in client config.
- CPU/memory limits, health/readiness endpoints, logs, and process restart policy.

Use HTTPS/WSS. Validate nicknames/room IDs and render user text safely. Treat room codes as join conveniences, not strong authentication. Reconnect tokens are sensitive: avoid logging them or exposing them in public telemetry.

## 9. Admission, health, drain, and rollback

- Liveness indicates process health; readiness indicates ability to accept new rooms/players.
- Current admission enforces `MAX_ROOMS` and counts pending creation. Measured load/memory-aware admission is follow-up work; current readiness is not a capacity report.
- Current shutdown marks readiness false and stops rooms. A finish-current-dispatch drain window and its shutdown communication remain a required operational acceptance step.
- Persist no match state in the initial release. Restarted matches end cleanly rather than attempting an untested recovery.
- Publish client/server/content as a compatible release set. Keep the previous set available for rollback.
- On version mismatch, prompt a reload or reconnect to compatible content; do not enter a room with different collision geometry.
- Test deployment and rollback in staging. Public release is a separate project-owner decision; this documentation task does not authorize deployment.

## 10. Telemetry and debug tools

Capture frame-time distributions, render backend, loading stages, server tick duration/backlog, room count, message rate/bytes, RTT/jitter, input queue resets, correction magnitude, reconnect outcomes, and rejected-message counts.

Use aggregated metrics and short-lived session IDs. Do not collect raw keyboard input, personal identifiers, or full chat logs. There is no player chat requirement in the initial scope.

Dev-only overlay: sim/render ticks, server time estimate, local authoritative/predicted/render poses, proxy poses, collider wireframes, shot sweeps, room state, pending input count, and GPU/CPU timing when available. Disable debug controls in production builds.

## 11. Release checklist

- [ ] P01–P10 product acceptance criteria have linked evidence.
- [ ] M0–M4 gates passed on the integrated build; no placeholder adapter satisfies a gate.
- [ ] Known browser/controller limits are documented in the player-facing support notes.
- [ ] Assets and audio have provenance/license records; original branding is ready for release.
- [x] Original repository distribution terms are GPL-3.0-or-later; the full license and workspace metadata are present, with contributor credits.
- [ ] Dependency compatibility/notices and source/license inclusion in release packages are audited.
- [ ] Capacity and network behavior measured; room admission configured below observed limits.
- [ ] Reconnect, shutdown, content mismatch, and rollback tested in staging.
- [ ] Accessibility settings and neutralization behavior tested.
- [ ] Working title/branding clearance completed for intended markets before public launch.

Use [the ordered acceptance queue](../IMPLEMENTATION_PLAN.md#next-acceptance-work) to claim this work under the existing task IDs. Do not reopen optional GLB/WebGPU work merely to give the checklist more scenery.
