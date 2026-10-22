# Product specification

Status: proposed implementation baseline. Updated: 2026-10-22.

## 1. Intent and confirmed requirements

Build an original browser game carrying the fast, comic police-driving spirit of the 1987 arcade APB into 3D. The user selected Babylon.js and requested keyboard controls, game controllers, simple multiplayer, and the ability for players to shoot one another. Visual finish matters: cars, roads, buildings, and dirt should feel like a cohesive world.

The project is Fender Offenders. The working name has not received trademark clearance.

## 2. Product pillars

1. **Driving feels good immediately.** Steering, braking, drifting, impacts, and recovery matter more than realistic suspension.
2. **Action stays readable.** Players can see upcoming turns, incoming attacks, damaged cars, and escape routes from the elevated camera.
3. **Joining friends is easy.** A room link and nickname lead quickly to a match.
4. **The city looks deliberately made.** Consistent scale, materials, lighting, silhouettes, and sound take priority over raw asset count.
5. **Comedy comes from the situation.** Sirens, traffic violations, bureaucratic score messages, and spectacular vehicle mishaps provide the tone.

## 3. Intended audience and platform

- Desktop/laptop browsers with keyboard and optional mouse, or a standard-mapped gamepad.
- Windows and macOS are the first OS test targets. Linux is a compatibility check when hardware is available.
- Chrome/Edge, Firefox, and Safari are release test targets subject to the explicit matrix in QUALITY_AND_OPERATIONS.md.
- WebGL2 is the baseline. WebGPU is optional and must not be necessary to play.
- First release assumes one local player per browser session. Online multiplayer is not local split screen.
- Mobile/touch controls and native packages are deferred.

## 4. Scope by release slice

| Slice | Included | Purpose |
| --- | --- | --- |
| M1 visual/driving slice | One finished intersection, one car, keyboard/gamepad, collisions, camera, placeholder-to-finished comparison | Prove handling and achievable visual quality |
| M2 network/combat slice | Two players, one weapon, damage, respawn, reconciliation, room join | Prove fast action over a real network |
| M3 feature-complete alpha | 2–8 players, complete district, round loop, traffic, three car skins/bodies, local practice and pursuit challenge | Establish a complete repeatable game |
| M4 release candidate | Performance budgets, compatibility, onboarding, resilience, license audit, staging run | Prove the build is usable and shippable |

## 5. Core loop

1. Open the game and activate audio/input with an intentional start action.
2. Enter a nickname; choose Practice, Create room, or Join room.
3. Drive, drift, dodge traffic, and use shortcuts.
4. In multiplayer, shoot rivals, survive, and score wrecks.
5. Respawn quickly after a wreck and rejoin the action.
6. See round results and rematch without recreating the room.

First release has no account gate, persistent economy, paid items, skill matchmaking, or unlock grind.

## 6. Camera and movement

- Elevated perspective camera looking ahead of the controlled car; 3D models, shadows, and terrain dressing.
- Initial camera uses fixed world heading, smoothed translation, and speed-dependent look-ahead. Vehicle-relative steering remains stable as the car rotates.
- Expose camera distance, look-ahead, shake, and smoothing as tuning settings. Keep steering unaffected by camera smoothing.
- Keep the road collision surface planar for the first release. Decorative height changes must not imply driveable ramps or bridges.
- Use forgiving grip, controlled drift, strong braking, bounded collision impulses, and quick recovery from a spin.
- Avoid uncontrolled rollovers or long sequences where the player cannot act. A reset action recovers a stuck car through a server-authorized safe placement.
- Body lean, wheel spin, suspension bounce, and small visual hops are cosmetic and do not alter authoritative hit shapes.

Initial tuning hypotheses, not promised outcomes: city driving top speed around 24 m/s, forward weapon range around 45 m, and a starting car footprint around 4.3 m by 1.9 m. Tune speed against visibility and street width before tuning pursuit difficulty.

## 7. Input behavior

All devices produce the same action structure. Gameplay never reads raw DOM events or gamepad objects.

| Action | Keyboard default | Standard gamepad default |
| --- | --- | --- |
| Accelerate | W / Up | Right trigger |
| Brake / reverse | S / Down | Left trigger |
| Steer | A/D or Left/Right | Left stick X |
| Handbrake | Left Shift | South face button |
| Fire | Space | Right shoulder |
| Siren | E | West face button |
| Recover stuck car | R, hold 1 second | North face button, hold 1 second |
| Pause/settings | Escape | Menu/Start |
| Confirm / back | Enter / Escape | South / East face buttons |

- Steering is vehicle-relative. Keyboard steering uses a bounded response ramp; analog steering preserves useful precision.
- Brake/reverse uses speed-aware behavior: brake while moving forward; reverse only near rest after a short deliberate hold. Do not instantly reverse velocity.
- Trigger and stick dead zones, sensitivity, remapping, and keyboard-only menu navigation are required by M3.
- Detect device activity and switch prompts without interrupting play. Do not assume that every gamepad uses the standard mapping.
- For nonstandard mappings, expose mapping/calibration or show a clear unsupported-device message with keyboard fallback. Do not silently use wrong buttons.
- On controller disconnect, window blur, or hidden tab, clear held actions and send neutral input. Returning focus must not fire or accelerate until fresh input is observed.
- A menu may pause local practice. An online room continues; opening a menu neutralizes the local driver's controls and communicates that the match remains live.
- Controller vibration is optional enhancement, with a setting and capability detection.

## 8. Multiplayer combat defaults

### Room and round lifecycle

- Private, invite-link rooms; 2–8 players. A lone player may wait or practice while the room is in the lobby.
- The room creator can request a start when two players are connected. The server owns the transition and validates the request.
- Three-second countdown, five-minute active round, results screen, then rematch/lobby.
- Mid-round joins enter as a spawned participant if capacity permits. Late joins receive a full authoritative state and current round timer.
- Creator departure does not kill the match. The server assigns lobby control to the longest-connected remaining player.
- Friendly free-for-all is the initial mode. Teams, pursuits between player factions, and cooperative missions are deferred.

### Weapon and damage

- One forward-facing automatic weapon. Holding Fire repeats at a server-controlled cadence.
- Initial baseline: 100 health, 10 damage per projectile, 5 shots/second, projectile speed 70 m/s, lifetime 0.65 seconds. These values belong in a versioned gameplay configuration.
- Infinite ammunition for the initial mode. Heat/reload systems require a later playtest decision.
- The server creates authoritative projectiles, sweeps their paths against collision geometry, applies hits once, and emits events.
- Buildings and solid obstacles block shots. Dirt, lane paint, and cosmetic debris do not.
- Shots cannot damage their owner. There is no friendly-fire setting in free-for-all.
- M2 must prove one hit leads to exactly one health deduction even when messages or visual effects are repeated.
- Predicted muzzle flashes/audio may play instantly. Health loss, wrecks, kill credit, and score always follow server outcomes.
- Start with non-damaging vehicle collisions; M3 may add bounded ram damage after network collision acceptance passes. Ramming is optional for first release, not a gate.

### Wrecks, scoring, and recovery

- A combat wreck awards one point to the last valid damaging attacker within a configurable five-second credit window. Self/reset events award no point.
- Respawn after three seconds at a server-selected spawn with clearance from vehicles and walls.
- Give two seconds of visible spawn protection; firing ends it early. Protected cars cannot deal damage until protection ends.
- Wreck visuals are short-lived cosmetic effects. Disable the wrecked car's weapon and dynamic collision immediately; do not create permanent roadblocks.
- Stuck-car recovery has a cooldown and cannot be used while taking damage or to teleport across the map. Server rules own eligibility and location.
- At round end, higher score wins; equal scores remain a draw. Results show score, wrecks suffered, and connection state.

## 9. District, traffic, and pursuit challenge

- Starting district target: roughly 250 m by 250 m; adjust after speed/camera playtesting.
- Include at least one loop, multiple intersections, a commercial block, a residential edge, an industrial space, and two dirt shortcuts.
- Roads must allow two cars to pass and must avoid repeated camera occlusion from tall buildings.
- Buildings near the camera may fade visually; their physical blockers remain unchanged and readable.
- Traffic follows a small authored lane graph. No general-purpose city pathfinding is required.
- Start with 8 AI vehicles, with a performance cap of 16 for the first district. The server owns traffic in online rooms.
- Traffic can collide but does not shoot. It must recover from jams without blocking a route indefinitely.
- Practice includes a short pursuit challenge: intercept an AI suspect, remain close and at low relative speed for a short arrest timer, then receive a comic citation/score result. It is single-player content for the first release.
- Online pursuit missions, pedestrians, enterable buildings, and an explorable open world are deferred.

## 10. Presentation and feedback

- Stylized but credible miniature city: deliberate proportions, coherent palette, attractive car paint, restrained roughness detail, readable surface transitions.
- Vehicle health and team/player identification must be readable without relying on color alone.
- Emphasize steering response, tire noise, skid marks, sirens, muzzle flashes, tracer motion, impacts, and brief wreck effects.
- Do not obscure roads with heavy bloom, depth of field, excessive smoke, or constant camera shake.
- Provide independent master/music/effects volume, reduced shake, and reduced flash settings.
- Keyboard/gamepad prompt changes, mute state, reconnect state, and round status must be understandable without opening developer tools.

## 11. Acceptance criteria

| ID | Criterion | Required evidence |
| --- | --- | --- |
| P01 | A new player can enter practice and drive/fire using keyboard only or a standard gamepad | Recorded manual scenarios on both inputs |
| P02 | Local steering responds within one simulation tick and is shown on the next render opportunity, without waiting for network acknowledgment | Input/tick/render trace |
| P03 | Two remote players can join, damage each other, wreck, respawn, and rematch | Integration test plus human playtest |
| P04 | Eight players complete a five-minute round with consistent scores and no duplicate damage | Bot load scenario and multi-client validation |
| P05 | The first district stays within the agreed rendering/network/simulation budgets | Performance report on named reference hardware |
| P06 | Controller disconnect, browser blur, and reconnect do not leave stuck controls | Automated device-state tests plus manual controller test |
| P07 | The game remains playable under the defined normal and stressed network profiles | Network report, correction traces, and playtest notes |
| P08 | Every shipped asset has provenance and a recorded distribution license | Asset manifest audit |
| P09 | The visual slice matches an approved in-engine reference at gameplay distance | Captures with settings and device recorded |
| P10 | All supported browser paths can start, render, receive input, and complete a room flow | Browser matrix |

## 12. Non-goals for this plan

MMO infrastructure, real car simulation, destructible buildings, humanoid combat, real vehicle branding, persistent progression, voice chat, public user-generated content, split screen, mobile controls, and a custom rendering engine are outside scope. Changes to these assumptions require a product/architecture decision and updated task dependencies.
