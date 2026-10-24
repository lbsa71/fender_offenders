# Product specification

Status: product baseline for the implemented `arcade-v8` alpha and remaining release acceptance. Updated: 2026-10-24. [Execution status](EXECUTION_STATUS.md) records dated evidence; requirements below do not imply completed acceptance.

*Ten dispatches. Six cars. One district with a very relaxed attitude toward insurance premiums.*

## 1. Intent and confirmed requirements

Build an original browser game carrying the fast, comic police-driving spirit of the 1987 arcade APB into 3D. The user selected Babylon.js and requested keyboard controls, game controllers, simple multiplayer, and the ability for players to shoot one another. Visual finish matters: cars, roads, buildings, and dirt should feel like a cohesive world.

The project is Fender Offenders. The working name has not received trademark clearance.

The confirmed progression epic is [a ten-dispatch campaign](CAMPAIGN.md), with four connected ringleaders and six crew encounters. Every target has an assigned car and original mugshot, presented in the dispatch briefing beside the player's motor-pool choices. Arrests and wrecks both advance the campaign; only arrests earn green tracker checks. Successes gradually reveal the connecting story in a shared casefile. This supersedes the original single-round/rematch loop for production games.

Targets now [fight back with distinct driving and weapon tactics](BOSS_COMBAT.md), including grenades, with difficulty increasing across the campaign. Attacks must remain readable and avoidable, preserve arrest opportunities and use server-owned damage. Players receive a random comic callsign, can reroll or type one, and retain their choice between runs.

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
| M3 feature-complete alpha | 2–8 players, complete district, six vehicle profiles, traffic/props/crowds, ten-dispatch solo/competitive campaign, armed targets and saved callsigns | Accept the integrated repeatable game; human/device gates remain open |
| M4 release candidate | Performance budgets, compatibility, onboarding, resilience, license audit, staging run | Prove the build is usable and shippable |

## 5. Core loop

1. Open the game and activate audio/input with an intentional start action.
2. Keep, reroll or type a callsign; choose Hit the streets, Create room or Join room. Callsigns and the assigned garage car persist in this browser.
3. Read the target dossier, tactics, assigned car and earned casefile. Reassign the player's car if desired, then start the dispatch; online needs two connected players and the creator's request.
4. Drive, drift, dodge traffic and marked grenades, and arrest or wreck the shared target. Multiplayer rivals can also shoot one another; the first target resolution wins the dispatch.
5. Respawn quickly after an officer's wreck and rejoin the action. Arrests earn three points and green checks; credited target wrecks earn one point and amber marks. Both advance the story.
6. Read results and the earned clue. The creator opens the next briefing in the same game/room; timeouts retry, and the tenth success offers a fresh campaign.

First release has no account gate, persistent economy, paid items, skill matchmaking, or unlock grind.

## 6. Camera and movement

- Elevated perspective camera looking ahead of the controlled car; 3D models, shadows, and terrain dressing.
- Initial camera uses fixed world heading, smoothed translation, and speed-dependent look-ahead. Vehicle-relative steering remains stable as the car rotates.
- Expose camera distance, look-ahead, shake, and smoothing as tuning settings. Keep steering unaffected by camera smoothing.
- Keep the road collision surface planar for the first release. Decorative height changes must not imply driveable ramps or bridges.
- Use forgiving grip, controlled drift, strong braking, bounded collision impulses, and quick recovery from a spin.
- Avoid uncontrolled rollovers or long sequences where the player cannot act. A reset action recovers a stuck car through a server-authorized safe placement.
- Body lean, wheel spin, suspension bounce, and small visual hops are cosmetic and do not alter authoritative hit shapes.

Current defaults: patrol top speed 28 m/s, paired forward projectiles at 70 m/s with a 0.65-second lifetime, and a shared 4.3 m by 1.9 m collision footprint. Six shared profiles scale speed, acceleration, steering, grip and armor. The bicycle tyre model keeps ordinary cornering grippy and uses handbrake/power/flick entry with stick-controlled drift; counter-steering trims the drift and lifting exits it. See [measured balance and its limits](../packages/sim/BALANCE.md). Human handling and visibility acceptance remain required.

Practice advances fixed 60 Hz ticks with up to fifteen catch-up steps per rendered frame; online samples at most four input ticks per frame. Pausing practice discards accumulated time. These bounds keep slow-frame recovery finite; they do not promise real-time play under arbitrary sustained overload.

## 7. Input behavior

All devices produce the same action structure. Gameplay never reads raw DOM events or gamepad objects.

| Action | Keyboard default | Standard gamepad default |
| --- | --- | --- |
| Accelerate | W / Up | Left stick forward or right trigger |
| Brake / reverse | S / Down | Left stick backward or left trigger |
| Steer | A/D or Left/Right | Left stick X |
| Handbrake | Left Shift | South face button |
| Fire | Space | Right shoulder |
| Siren | E | West face button |
| Recover stuck car | R, hold 1 second | North face button, hold 1 second |
| Pause/settings | Escape | Menu/Start |
| Confirm / back | Enter / Escape | South / East face buttons |

- Steering is vehicle-relative. Keyboard steering uses a bounded response ramp; analog steering preserves useful precision. Left-stick Y also provides analog acceleration and brake/reverse through the configured stick dead zone. Trigger alternatives remain available; take the strongest request for each action rather than summing them. Pulling backward uses the same brake-to-reverse behavior as the left trigger.
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
- Three-second countdown, up to five minutes of pursuit, then results on arrest, credited target wreck or timeout. Next briefing advances after success, retries after timeout, and resets after the completed campaign.
- Mid-round joins enter as a spawned participant if capacity permits. Late joins receive a full authoritative state and current round timer.
- Creator departure does not kill the match. The server assigns lobby control to the longest-connected remaining player.
- Drivers compete to resolve one shared armed AI target first while retaining player-versus-player shooting. The room shares the ten-step tracker and earned clues; scores carry between dispatches. Teams and cooperative missions are deferred.

### Weapon and damage

- Two forward-facing barrels fire one paired volley. Holding Fire repeats at a server-controlled cadence.
- Current baseline: profile-dependent health, two 5-damage rounds per volley, 5 volleys/second, projectile speed 70 m/s, lifetime 0.65 seconds. These values belong in a versioned gameplay configuration.
- Infinite ammunition for the initial mode. Heat/reload systems require a later playtest decision.
- The server creates authoritative projectiles, sweeps their paths against collision geometry, applies hits once, and emits events.
- Buildings and solid obstacles block shots. Dirt, lane paint, and cosmetic debris do not.
- Shots cannot damage their owner. Other drivers remain damageable during the pursuit.
- M2 must prove one hit leads to exactly one health deduction even when messages or visual effects are repeated.
- Predicted muzzle flashes/audio may play instantly. Health loss, wrecks, kill credit, and score always follow server outcomes.
- Start with non-damaging vehicle collisions; M3 may add bounded ram damage after network collision acceptance passes. Ramming is optional for first release, not a gate.

### Wrecks, scoring, and recovery

- A combat wreck awards one point to the last valid damaging attacker within a configurable five-second credit window. Self/reset events award no point.
- Respawn after three seconds at a server-selected spawn with clearance from vehicles and walls.
- Give two seconds of visible spawn protection; firing ends it early. Protected cars cannot deal damage until protection ends.
- Wreck visuals are short-lived cosmetic effects. Disable the wrecked car's weapon and dynamic collision immediately; do not create permanent roadblocks.
- Stuck-car recovery has a cooldown and cannot be used while taking damage or to teleport across the map. Server rules own eligibility and location.
- The first completed arrest or credited destruction of the campaign target wins the dispatch. Arrest awards three points; target destruction retains one-point wreck credit. Combat standings do not override the resolving officer. Timeout has no winner or new clue. Results distinguish arrest/wreck outcomes and show standings, wrecks suffered and connection state.

## 9. District, traffic, and pursuit challenge

- Starting district target: roughly 250 m by 250 m; adjust after speed/camera playtesting.
- Include at least one loop, multiple intersections, a commercial block, a residential edge, an industrial space, and two dirt shortcuts.
- Roads must allow two cars to pass and must avoid repeated camera occlusion from tall buildings.
- Buildings near the camera may fade visually; their physical blockers remain unchanged and readable.
- Traffic follows a small authored lane graph. No general-purpose city pathfinding is required.
- Start with 8 AI vehicles, with a performance cap of 16 for the first district. The server owns traffic in online rooms.
- Traffic can collide but does not shoot. It must recover from jams without blocking a route indefinitely.
- Practice and online campaign dispatches identify one armed AI suspect. An active connected officer must stay strictly within 8 m, below 5 m/s relative speed, with clear world line of sight for three seconds. Each officer owns progress, which decays when ineligible. Arrest or credited target destruction completes the campaign dispatch; the legacy noncampaign fixture retains arrest-only completion.
- The suspect has a persistent world marker and labeled camera-relative screen-edge guidance. Markers clear for menus, disconnected sessions and completed dispatches. Existing replicated vehicle poses drive presentation; no cosmetic marker transforms are transmitted.
- Server-owned loose props and toppled lamps/signs/trees use separate 3D physics without feeding impulses or damage back to cars. Twenty-four local cosmetic pedestrians avoid rendered vehicles and cannot be injured. See [world reactions](WORLD_REACTIONS.md); enterable buildings and a larger open world remain deferred.

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

MMO infrastructure, realistic vehicle simulation, destructible buildings, humanoid combat, real vehicle branding, cross-session campaign saves, voice chat, public user-generated content, split screen, mobile controls, and a custom rendering engine are outside scope. Browser-local callsigns, garage and settings are implemented; campaign progress remains in memory. Changes to these assumptions require a product/architecture decision and updated task dependencies. The city council has declined to fund an MMO this quarter.
