# Decision register

Updated: 2026-10-24 against `c817f97`. Requirements, current defaults and unresolved acceptance are distinguished below. [Execution status](EXECUTION_STATUS.md) owns observed evidence.

*Decisions belong here so the next shift need not interrogate the glove compartment.*

## Confirmed requirements

| ID | Decision | Source |
| --- | --- | --- |
| D01 | Original 1987 arcade APB is the inspiration | User clarification |
| D02 | Web game with 3D graphics; fast fun action is the priority | User request |
| D03 | Babylon.js is the selected rendering/game engine | User accepted the recommendation |
| D04 | Keyboard and game controller support | User request |
| D05 | Simple multiplayer including shooting other players | User request |
| D06 | Freely licensed asset sources and a convincing finish | User request |
| D07 | Repository is `lbsa71/fender_offenders`; current checkout is `C:\Users\lbsa7\Documents\Source\lbsa71\fender_offenders` | Current workspace; replaces the original machine-specific path |
| D08 | Documentation must enable parallel lanes, milestones, and tasks | User request |
| D21 | Every dispatch has one clearly marked suspect; in multiplayer, the first driver to apprehend it completes the dispatch | User request, 2026-10-23; supersedes the free-for-all winner and single-player-only pursuit defaults below; [decision](adr/001-competitive-pursuit.md) |
| D22 | Production games use The Green Light Racket, ten dispatches with four ringleaders, shared casefile, arrest/wreck progression and timeout retry | Confirmed progression requirement, implemented in `b23617a`; [campaign](CAMPAIGN.md) extends D21 with credited target-wreck completion |
| D23 | Campaign targets use authored driving, bursts and fixed-landing grenades; players receive saved random/custom callsigns | Armed-target extension implemented in `597bab6`; [combat and callsigns](BOSS_COMBAT.md) |
| D24 | Contributor acknowledgments use Claude Code and OpenAI Codex as AI tool names, alongside all recorded human authors | Project-owner instruction, 2026-10-24; [credits](../CONTRIBUTORS.md) |

## Chosen defaults, revisable through implementation evidence

| ID | Default | Rationale / revisit trigger |
| --- | --- | --- |
| D09 | Fender Offenders is the working name | Matches the selected repository; trademark clearance remains open |
| D10 | TypeScript/Vite/pnpm, Node.js/Colyseus, shared sim | Keep client/server rules and contracts in one language |
| D11 | Bounded planar vehicle contacts, bicycle tyre/drift controller, Rapier projectile queries and a separate 3D scenery world | Shared replayable vehicle rules avoid stale solver history; scenery has one-way car interaction. Browser/contact acceptance remains open |
| D12 | 60 Hz sim, 20 Hz authoritative snapshots, 30 Hz input batches | Initial small-room budget; measure CPU, bandwidth, and prediction before changing |
| D13 | Elevated camera, fixed world heading | Supports readable city driving; revisit if steering/camera playtest fails |
| D14 | Private 2–8-player rooms; up to five minutes per campaign dispatch, first arrest or credited target wreck wins | D21/D22 replace the original free-for-all winner; PvP and cumulative combat standings remain |
| D15 | Forward projectile weapon | Works with keyboard and gamepad without separate aim controls |
| D16 | Guest nicknames/private room links | Removes account and matchmaking dependencies |
| D17 | One district, six selectable car bodies with distinct shared handling/armor profiles | Motor-pool work supersedes the original three cosmetic bodies/one-class default; [balance evidence](../packages/sim/BALANCE.md) remains subject to human review |
| D18 | WebGL2 baseline, optional WebGPU | Make browser reach independent of a newer graphics API |
| D19 | Solo and online run the same ten-dispatch armed campaign; ordinary traffic is unarmed | Current production composition; noncampaign simulation fixtures preserve the earlier single-pursuit lifecycle |
| D20 | Shared Rapier version on browser/server; prediction limited to local driving | Reduce divergence; shared version does not eliminate all reconciliation work |
| D25 | Original source-generated art/audio and inline SVG mugshots; WebGL2 delivery | No imported asset family or GLB pipeline is required for the current baseline; dependency compatibility/notices and distribution packaging remain audit gates |
| D26 | Practice permits fifteen fixed catch-up ticks per frame; online permits four; WANTED positioning applies without CSS transitions | PRs #2/#3, merged 2026-10-24, fix growing style cost and slow practice time without increasing the online input burst |
| D27 | Original repository work is distributed under GNU GPL v3 or later (`GPL-3.0-or-later`); dependencies retain their own terms | Project-owner GPL instruction, 2026-10-24; [license](../LICENSE) and all workspace package manifests |

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

X01 uses the bounded planar fallback already; contact-correction acceptance remains open. X02 selected the custom `net-client` reconciler. X03 selected original procedural art instead of an imported pack. X04 has a recorded development laptop but no approved minimum/target matrix. X05 retains the fixed-heading camera pending human review. X06 remains disabled. X07/X08 are open. The next shift should collect the missing evidence, not repeat every feasibility interview.

## Change procedure

For a cross-lane change, add an ADR under `spec/adr/` with context, decision, alternatives, affected contracts/tasks, migration, and validation. The integration owner coordinates review by affected lane owners. Small tuning changes only need a configuration diff and playtest evidence.

Do not block routine implementation on optional product choices: use the defaults above, record the result, and revisit at the stated gate. Pause dependent work only when a real external requirement or incompatible contract change prevents progress.

## Deferred features

Separate aiming, teams, public matchmaking, account/campaign persistence, native/mobile builds, split screen, realistic suspension, airborne vehicle combat, destructible buildings, and cosmetic monetization are follow-up decisions after M4. Shared pursuit, cosmetic suspension and reactive street furniture are already implemented within the current scope. Do not silently prepare large frameworks for deferred work; [the acceptance queue](../IMPLEMENTATION_PLAN.md#next-acceptance-work) comes first.
