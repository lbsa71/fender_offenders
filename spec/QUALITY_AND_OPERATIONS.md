# Quality, performance, and operations

Status: quality/release gates with partial `arcade-v10` / protocol 2 alpha evidence. Updated: 2026-10-25. [Execution status](EXECUTION_STATUS.md) separates historical implementation results from current review checks; unrun gates below remain requirements.

*A green test run is excellent news. It still cannot plug in a controller or sign a release form.*

## 1. Test principles

Test observable behavior, contract boundaries, and failure modes. Do not add tests that merely restate trivial implementation details. Keep simulation tests headless and deterministic where possible. Visual approval needs human review as well as repeatable captures.

[AGENTS.md](../AGENTS.md) requires test-first red–green–refactor for all new behavior and fixes, with the intended red failure and subsequent green checks reported in each handoff. This agreement was adopted during implementation; earlier code is not claimed to have historical red-phase evidence. Documentation-only changes do not need artificial tests.

A fixture passing does not prove a live integration. Milestone gates specify where real browser/server/device evidence is mandatory. Never mark a gate green because the harness exists but has not been run.

Driving-continuity browser traces use the delivered frame's `sampleTimeSeconds`, not the later completion time of observer work. The straight-line scenario fixes the vehicle and traffic-free road, captures at least 90 useful intervals over at least two seconds with a bounded collection timeout, and retains its original displacement, pending-input, stall, variation and velocity-jump limits. Contact checks wait eight acknowledged commands after fixture placement, reset only arrest progress, then retain two real three-second arrests; the combined sample floor is coverage, not an implicit FPS requirement. Each arrest independently checks health, life, controller resets, sustained contact and unexpected backward movement. Raw backsteps without a new contact revision remain bounded to 0.2 m. Across revisions, the 0.2 m unexpected-jump tolerance excludes measured physical reverse movement and the authoritative separation applied once; per-revision separation is also bounded to 0.2 m. Controlled unit cases must still reject teleports and duplicate contact displacement. Raw and adjusted traces remain attached. Client frame-rate measurements are diagnostic only; hardware qualification is retired.

## 2. Available commands and gaps

The root scripts below exist in [package.json](../package.json). `test:network` and `test:visual` remain proposed names; run the explicit harness/tools until corresponding scripts are added.

| Command | Expected behavior |
| --- | --- |
| `pnpm dev` | Start local client and game server; print URLs and cleanup processes on exit |
| `pnpm check` | Typecheck, documentation links/task dependency graph, simulation import boundaries; no general lint/schema coverage is implied |
| `pnpm test` | Both headless Vitest projects; no browser processes |
| `pnpm test:unit` | Isolated contracts/input/math/HUD/presentation logic, controlled dependencies |
| `pnpm test:integration` | Real physics, renderer adapters, HTTP/rooms/client lifecycle, prediction, hosting and tooling |
| `pnpm test:ui` | Five UI fixtures with mocked snapshots; real DOM/CSS without physics, WebGL or server sockets |
| `pnpm test:e2e` | Local game browser scenarios, `pnpm test:ui`, then native `pnpm test:water` |
| `pnpm hooks:install` | Install the local E2E pre-push gate, automatically installed by local `pnpm install` too |
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
| Round | Start validation, late join, participant departure, countdown, timer end, draw, results/rematch, empty-room expiry |
| Campaign | Ten dispatches/four ringleaders, independent arrest progress, credited target wreck, arrest/wreck marks, cumulative score, timeout retry, earned-only clues, connected-member progression, late join/reconnect and finale reset |
| Armed targets | Ten authored tactics, protected/connected-officer selection, bounded burst cadence, fixed grenade landing/fuse/radius, cover/falloff, exactly-once damage, hazard cleanup and checkpoint replay |
| Garage/callsigns | Six shared profiles, briefing-only reassignment, saved random/custom identity, malformed/unavailable storage and authoritative selection locks |
| Network | Direct local steering/release parity through stale snapshots and ordered jitter; motion bounds/life rejection; sustained contact through delayed acknowledgments without resets or repeated separation; completed arrests; contact history expiry; duplicate sequence, overflow, pause/reconnect and epoch change |
| Assets | Missing file, wrong map hash, wrong orientation, blocked spawn, unresolved lane edge, absent license, placeholder leakage |
| Presentation | Event dedup, no replay audio, correction offset decay, discontinuity snap, occlusion fade, reduced effects |
| Reactive world | One-way car/prop interaction, sparse same-match baselines, quiet sleeping objects, wreck lifecycle and safe local pedestrian avoidance |
| Car assembly breakup | Civilian/player/villain gun roles, exact component geometry/materials, independent rigid fragments, road/wall/fragment contacts, bounded pools, immediate reduced motion and zero-body cleanup |
| Physics startup | Simulation and local debris share one WASM initialization; independent worlds remain valid through initialization/disposal; live practice startup remains usable |
| HUD cost | Repeated target-badge positioning must keep style recalculation bounded for a live dispatch; Chromium CDP regression is separate from sustained frame-budget acceptance |
| Operations | Healthy start, port conflict, capacity limit, graceful drain, shutdown message, rollback/content compatibility |

## 4. Browser and input compatibility

Owner scope change, 2026-10-29: target/minimum-client-device qualification and hardware-specific FPS/frame-time gates are removed. There is no required mainstream-GPU target, integrated-GPU laptop minimum or named phone performance candidate. Record browser/backend/settings with diagnostic evidence when useful; approval of a hardware list is not a release dependency. Existing dated device measurements remain history, not current acceptance thresholds.

Functional compatibility remains:

- Compatibility: Windows Chrome/Edge and Firefox; macOS Safari and Chrome. Test browser versions available at release and record exact builds.
- Small-screen touch layouts: Chromium DPR-2 checks cover 375×667, 667×375 and reduced visible height at 667×290, including entry, briefing, live HUD, pause and settings. Require driving targets to remain at least 44 CSS pixels and clear of visible HUD panels; keep health visible and HUD panels separated. These are functional layout requirements, not qualification of a named phone or its sustained performance.
- Compact HUD: at widths up to 740 CSS pixels or heights up to 420, retain health, timer, audio knob, pause and one suspect marker with distance/guidance/local progress. At the tested 375×667, 667×290 and 844×390 viewports, their combined rectangular bounds, including the audio knob, must occupy no more than 10% of the screen, excluding touch controls. Verify touch/controller/keyboard parity, paused dispatch details/standings/help/sharing, restoration of desktop objective/branding/sharing, directional edge placement and connection-trouble visibility. This is a functional layout criterion; it does not impose a hardware performance requirement.
- Input: one real standard-mapped Xbox-style controller and one additional available controller family. Record whether the browser reports standard mapping. Do not advertise untested controller models.
- Renderer: WebGL2 on each release browser; WebGPU only on supported tested combinations. Simulate capability absence to verify fallback at startup.

If WebGPU initialization fails, reconstruct the renderer using WebGL2 and the same scene data. Runtime device/context loss needs a recovery screen and reconnect/resume flow; do not assume transparent mid-frame backend switching.

## 5. Performance gates

Optional graphics diagnostics use a production build after warmup, normally a five-minute route/combat trace with eight player vehicles, traffic, shots, smoke, shadows and UI where applicable. Record percentiles and scenario scope. Client frame timings are measurements, not hardware-specific pass/fail criteria. Server, network, transfer and memory checks below remain required.

The [graphics polish plan](GRAPHICS_POLISH.md) adds all three dispatch atmospheres and continuous illumination from every upright street lamp on all presets. One cached 512×512 field avoids per-lamp shader light limits and camera proximity cutoffs. Its native `environment-check.ts` fixture records same-camera captures, actual visible-road pixel brightening, camera/preset stability, browser/device/source metadata, resource reuse and low-night readability. The `codex/graphics-polish` worktree's `polish-check.ts` adds shallow-water pixels/captures, source occlusion, reduced effects and ten garage/leave resource cycles; `polish-app-check.ts` checks all ten shared dispatch themes and actual reconnect. `polish-performance.ts` combines the production-bundled renderer, water, light detail, gunfire, grenades and eight full assembly wrecks. Its renderer trace does not establish server/network/full-HUD correctness or ten-rematch memory stability. Isolated attractive stills cannot establish Q05; owner visual acceptance and functional browser/input compatibility remain required. There is no target/minimum-device timing gate.

| Metric | Initial target / gate |
| --- | --- |
| Local input response | Applied next sim tick; no network wait; trace input-to-present under representative load |
| Server room step | p95 below 4 ms and p99 below 8 ms for the eight-player scenario on declared server hardware |
| Server catch-up | No sustained backlog; log and fail the scenario if room time remains >250 ms behind for over 1 second |
| Snapshot rate | 20 Hz baseline; report sustained drift or skipped publication under load |
| Client bandwidth | Starting budget: <50 KB/s down and <10 KB/s up per client average after join; report peaks separately |
| Initial transfer | <=15 MB compressed to first playable scene |
| Cold start diagnostics | Record time to usable scene, download and decode/compile under stated network conditions when investigating loading; no client-device elapsed-time gate |
| Memory stability | No monotonic growth across 10 rematches; compare retained objects/GPU resources after cleanup |

The owner explicitly retired client hardware timing gates on 2026-10-29; this does not assert that former failures passed. Change remaining budgets through a recorded decision, not by relabeling a failing test. Eight clients in one room is not proof of many-room server capacity. Publish measured room density and keep admission below a documented safety margin.

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

- CI on pull requests/main: install from lockfile, types/docs, separate unit and integration suites, assets, production build and production-container smoke. No browser checks run in CI.
- Local pre-push: run game browser smoke/integration scenarios and the five mocked-state UI fixtures through `.githooks/pre-push`; failure blocks the push. Install with `pnpm hooks:install` for an existing checkout. Custom hook paths are preserved and must include `pnpm test:e2e`.
- Contract changes: schema/fixture compatibility checks and affected consumer tests.
- Simulation/network changes: replay and authority tests plus relevant impaired-network scenario.
- Content/rendering changes: asset checks, scene capture, and performance delta for affected scene.
- Release candidate: full browser/device/network/load matrix and license audit.
- Avoid GPU-heavy or hardware-gamepad checks masquerading as generic headless CI. Mark required manual evidence explicitly.

Every report records commit/build identity, config/map versions, commands, environment, and observed limitations. Evidence belongs in an agreed artifact store or `reports/` metadata; large videos and binary traces should not bloat normal Git history.

The 2026-10-24 documentation review reran 465 headless tests across 54 files. Playwright discovery lists 15 browser scenarios across six files; discovery is not execution. PR #2 records a failing then passing badge-cost regression, and PR #3 records the intended four-versus-fifteen pacing failure followed by passing affected checks. Those narrow fixes do not establish the five-minute frame/network/memory budgets above. Keep the stopwatch; retire the victory confetti until the measured scenario finishes.

## 8. Deployment design

The [Render blueprint](../render.yaml) configures one Free Docker web service in Frankfurt serving the client and persistent game-server process together, with two rooms and checks-passed auto-deploy from `main`. Prior hosted HTML/readiness, exact-origin and two-client WSS checks are recorded in [execution status](EXECUTION_STATUS.md); this documentation review does not revalidate the live service or latest deployed commit. [GitHub CI](../.github/workflows/ci.yml) runs check/unit/integration/assets/build and production-container smoke; all browser checks run locally before pushes. Alternate hosting remains possible through endpoint configuration; see [the runbook](../infra/README.md).

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

## Unified room acceptance

Protocol 2 / `arcade-v10` uses the same authoritative room for 1–8 players. Verify solo start followed by live backup joining; menus pause only a lone connected officer. Controlled wall-clock tests cover the 14-minute idle warning, 15-minute intentional disconnect and empty-room expiry. Capacity eviction must spare connected players, reconnect reservations and unconsumed seats. Retained worlds count toward the existing provisional room cap; no new measured-capacity claim follows from cleanup correctness. Test teardown explicitly disposes owned rooms. [Lifecycle and storage](ROOM_SESSIONS.md) records defaults and the future persistence boundary.
