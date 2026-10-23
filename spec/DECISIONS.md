# Decision register

Updated: 2026-10-22. This document distinguishes requirements from implementation assumptions. Nothing here implies implementation is already complete.

## Confirmed requirements

| ID | Decision | Source |
| --- | --- | --- |
| D01 | Original 1987 arcade APB is the inspiration | User clarification |
| D02 | Web game with 3D graphics; fast fun action is the priority | User request |
| D03 | Babylon.js is the selected rendering/game engine | User accepted the recommendation |
| D04 | Keyboard and game controller support | User request |
| D05 | Simple multiplayer including shooting other players | User request |
| D06 | Freely licensed asset sources and a convincing finish | User request |
| D07 | Project repository is `C:\Source\lbsa71\fender_offenders` | User supplied path |
| D08 | Documentation must enable parallel lanes, milestones, and tasks | User request |
| D21 | Every dispatch has one clearly marked suspect; in multiplayer, the first driver to apprehend it completes the dispatch | User request, 2026-10-23; supersedes the free-for-all winner and single-player-only pursuit defaults below; [decision](adr/001-competitive-pursuit.md) |

## Chosen defaults, revisable through implementation evidence

| ID | Default | Rationale / revisit trigger |
| --- | --- | --- |
| D09 | Fender Offenders is the working name | Matches the selected repository; trademark clearance remains open |
| D10 | TypeScript/Vite/pnpm, Node.js/Colyseus, shared sim | Keep client/server rules and contracts in one language |
| D11 | Rapier, mostly planar vehicles, custom arcade handling | Use solid collision primitives without committing to realistic vehicle dynamics; validate in M0 |
| D12 | 60 Hz sim, 20 Hz authoritative snapshots, 30 Hz input batches | Initial small-room budget; measure CPU, bandwidth, and prediction before changing |
| D13 | Elevated camera, fixed world heading | Supports readable city driving; revisit if steering/camera playtest fails |
| D14 | 2–8 players; five-minute free-for-all | Bounded first multiplayer scope |
| D15 | Forward projectile weapon | Works with keyboard and gamepad without separate aim controls |
| D16 | Guest nicknames/private room links | Removes account and matchmaking dependencies |
| D17 | One district, three visual car bodies, one handling class | Makes content polish achievable and avoids early balancing complexity |
| D18 | WebGL2 baseline, optional WebGPU | Make browser reach independent of a newer graphics API |
| D19 | Local practice and single-player pursuit; simple online traffic | Preserves the arcade theme while limiting network mission complexity |
| D20 | Shared Rapier version on browser/server; prediction limited to local driving | Reduce divergence; shared version does not eliminate all reconciliation work |

## Experiments and deadlines

| ID | Question | Owner / deadline | Decision evidence and fallback |
| --- | --- | --- | --- |
| X01 | Can local-car collision prediction remain stable with server-owned traffic and opponents? | Simulation + networking, M0 spike; confirm M2 | Replay/correction traces at 100/180 ms RTT. If unstable, simplify car contacts and cap impulses; do not hide faults with long visual smoothing |
| X02 | Do the chosen Colyseus release's prediction helpers fit our physics state? | Networking, M0 | Minimal integration and dependency version record. Use adapter-owned prediction if helpers cannot represent needed state; never stack two reconcilers |
| X03 | Which asset family achieves the intended finish? | Art + rendering, M1 | Same-camera in-engine comparisons, asset license evidence, frame-time/load measurements |
| X04 | Which hardware defines minimum/target? | Quality + integration, select in M0 | Record exact device/OS/browser/resolution. Start with available integrated-GPU laptop and mainstream desktop; release cannot claim unspecified devices |
| X05 | Does the camera need world-heading or vehicle-heading mode? | Input + rendering, M1 | Turning/reversing/occlusion playtest on keyboard and controller |
| X06 | Is ram damage fun and predictable online? | Gameplay + networking, M3 | Optional. Keep collision damage disabled if it creates unfair or unstable outcomes |
| X07 | Is WebGPU worth enabling by default for supported browsers? | Rendering + quality, M4 | Parity and performance results. Ship WebGL2 alone if the alternate backend fails the gate |
| X08 | Is the working title available in launch markets? | Project owner before public branding/release | Appropriate trademark/name clearance; this plan and prior web search are not clearance |

## Change procedure

For a cross-lane change, add an ADR under `spec/adr/` with context, decision, alternatives, affected contracts/tasks, migration, and validation. The integration owner coordinates review by affected lane owners. Small tuning changes only need a configuration diff and playtest evidence.

Do not block routine implementation on optional product choices: use the defaults above, record the result, and revisit at the stated gate. Pause dependent work only when a real external requirement or incompatible contract change prevents progress.

## Deferred features

Separate aiming, teams, player pursuit missions, public matchmaking, account persistence, native/mobile builds, split screen, realistic suspension, airborne vehicle combat, destructible cities, and cosmetic monetization are follow-up decisions after M4. Do not silently prepare large frameworks for them during the initial build.
