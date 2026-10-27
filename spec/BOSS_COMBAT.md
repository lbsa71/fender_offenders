# Armed campaign targets and player callsigns

The five ten-dispatch storylines reuse the ten stage-indexed tactics profiles below, with **fifty authored suspects** and their own short briefings/reveals. The names in this table identify the original Green Light cast; matching stages in the other four cases use the same difficulty, readable warnings, equipment and counterplay. This is twenty ringleader characters and thirty crew encounters across five stories, rather than fifty different combat systems. Procurement still buys in bulk.

Status: implemented locally; human difficulty and audiovisual approval remain open. Reviewed: 2026-10-27. Gameplay revision: `arcade-v20`, protocol 5. This extends the [ten-dispatch campaign](CAMPAIGN.md).

*The suspects have read the equipment budget. Regrettably, they found the grenade column.*

Nico is unarmed for the first arrest lesson. Targets from dispatch 2 can fight back. Ordinary civilian traffic remains unarmed. The four ringleaders have different driving and attack signatures; crew encounters introduce the same ideas more gently. The briefing retains a short current equipment tip. Numerical difficulty and full tactics dossiers are omitted from the main screens; complete controls and equipment guidance remain in Controls Help.

| Ringleader | Driving | Attack and counterplay |
| --- | --- | --- |
| Mabel / The Clamp, dispatch 2 | Brief hard brake check, then a short full-throttle breakaway | Short forward bursts; anticipate the check, cut in front and match speed during the driving cooldown |
| Hector / Hot Stamp, dispatch 5 | Broad swerves against a closing officer nearby | Predictive quick bombs and black chopper passes; change speed/direction and shoot along its amber ground marker |
| Iris / Siren Song, dispatch 8 | Sharper, faster swerves against a closing officer nearby | Four-volley drive-by bursts; stay off the nose and match speed during recovery |
| Aldo / The Chairman, dispatch 10 | Interception | Five-volley bursts alternating with grenades; break the firing line and exploit recovery |

## Difficulty and authority

The [ten authored profiles](../packages/contracts/src/boss-tactics.ts) use difficulty 1–10, shorter attack windups and recovery periods, quicker escape lines, larger grenade zones and more demanding bursts. The opening target has weapon `none`; Mabel introduces forward bursts in dispatch 2. The finale combines previously introduced attacks. Player vehicle profiles, collision shapes, weapon cadence and arrest conditions retain their existing rules; progression does not secretly weaken a player's car.

Evasive steering and brake checks require a visible, eligible officer less than 22 m away whose relative velocity is reducing the gap by more than 0.5 m/s. Matching speed, falling behind or remaining distant does not trigger either tactic; normal route steering/braking continues. Brake checks also require the officer more than 2 m behind and within 6 m laterally. Every eligible officer is considered independently of the nearest weapon target. An officer in front cannot hide a second officer gaining from behind.

Entering a closing pursuit starts evasion immediately. Losing the closing condition cancels swerving. Weavers use twice their authored steering amplitude, clamped to the normal steering range, preserving each profile's period.

Mabel and Tess brake for at most 30 ticks (0.5 seconds), combining full service braking/handbrake with no throttle and suppressing brake-to-reverse below 0.5 m/s forward speed. The check ends early when the officer passes, matches speed or otherwise stops being a closing rear threat. Every completed check leads to a 60-tick (one-second) full-throttle breakaway, then a 360-tick (six-second) brake-check cooldown. Full throttle overrides weapon-recovery throttle reduction but retains normal route braking, acceleration, grip, collision response and the existing cruise/lane speed ceiling. There is no speed bonus or teleport. Protected, wrecked or respawning suspects cancel the maneuver; phase deadlines and cooldown are checkpointed with the authority brain.

Cutting in front remains valid counterplay. Arrest progress continues from any direction when the usual distance, relative-speed and clear-path rules hold, including during a breakaway. The short burst tries to create separation; it does not grant arrest immunity or reset progress. The suspect has finally noticed the patrol car in the mirror, but procurement has not approved a rocket engine.

AI selects active, connected officers using authoritative positions and visibility. It observes range, line of sight, protection, weapon alignment, windup, burst cadence and recovery. AI bullets are real projectiles emitted from the forward gun tips, with authoritative damage and the existing world/car sweep tests. AI can wreck an officer but cannot earn player points or resolve its own dispatch. Only a player arrest or credited player destruction resolves the target.

Enemy grenades predict the officer position at detonation using release-time velocity, then publish a fixed origin and landing point, launch/landing/detonation ticks, radius and damage. Targets are clamped inside map bounds. A throw cannot home onto a player after its landing warning appears. The introductory dispatch-3 fuse lasts 60 ticks (1 second); later enemy fuses last 48 ticks (0.8 seconds), including 18 ticks of flight. Ground bomb cooldowns are 156/148/140/108/100 ticks in dispatches 3/4/5/9/10; mixed targets still alternate with gun bursts. Blast radii stay at or below 6 m and maximum center damage at or below 34 health. Damage falls off with distance, respects world obstruction and protected cars, and is applied once by the authority. Multiple readable, avoidable attacks create the ramp instead of an unavoidable single hit.

Lobby, countdown, results, wrecked/respawning targets and absent eligible officers do not initiate attacks. Dispatch completion, timeout, retry and campaign reset clear outstanding hazards. Checkpoints retain AI runtime and active grenade state so replay reproduces attacks and outcomes. Late joiners and reconnects reconstruct a warning from the current snapshot, without needing its original throw event.

## Black chopper helper

Dispatches 5, 9 and 10 add one black helicopter with 60 health, a green health bar and an amber ground flight marker. It first approaches after four seconds, crosses a bombing path for 2.5 seconds, departs for two seconds, then waits five seconds before another approach. Approach takes two seconds. Each pass can drop three bombs, 54 ticks apart; each bomb has a 24-tick fall from 18 m, a 48-tick fuse, 5 m radius and 28 maximum damage. Drops lead an eligible connected officer's velocity and lock their landing warning at release. Protection, cover and distance falloff still apply. All enemy and police bombs share the existing eight-hazard cap.

Aim ordinary forward guns along the amber ground marker; there is no extra aiming control. The authority sweeps bullets against its 2D footprint, respecting nearer cars/world obstruction, while the renderer raises the corresponding tracers and hit effects toward the aircraft. At zero health it falls, crashes once and never returns during that dispatch attempt. Already released bombs keep their fuses. Destroying the helper does not resolve the suspect, award an arrest or advance the campaign. Peers, late joiners and checkpoints retain the terminal state; retry/new dispatch creates a fresh helper. Completion, timeout, garage entry and disposal clear its presentation. Reduced motion freezes decorative rotor/spin movement; the terminal fall and readable warnings remain.

## Road gadgets

Otis (dispatch 6) drops oil when a visible, eligible officer closes from behind within 22 m and 6 m laterally. The patch stays four metres behind the suspect's deployment position, with a 45-tick (0.75-second) amber warning followed by 300 active ticks (five seconds). Its marked radius is 2.75 m; drops defer near curbs and off asphalt so the warning remains visible. Armed oil uses 45% ordinary grip while a car is inside; leaving restores normal grip immediately. It does no damage, stacks no additional wet-road penalty and ignores its owner and protected cars. Steer around it or take a parallel street; the tyres do not need replacing.

Tess (dispatch 7) warns before extending hubcap blades against a nearby closing officer. Four amber wheel rings remain visible for 60 ticks (one second), followed by 90 ticks (1.5 seconds) of short side blades. A connected, active, unprotected officer receives at most eight damage once per deployment, only alongside the suspect (less than 2.1 m longitudinal separation and 1.3–2.65 m lateral separation), with clear world line of sight. Front and rear approaches are outside that side band. Normal front-cutoff arrest progress remains valid while blades are active.

Both gadgets wait 720 ticks (twelve seconds) between deployments and share a maximum of eight active/warning instances. Wrecked/protected owners, dispatch completion, timeout, retry and reset clear them. Trusted checkpoints retain active gadgets, cooldowns and already-hit vehicle IDs; restore/replay cannot apply the same blade hit twice. The opening five dispatches remain free of road gadgets. Briefings describe the equipment, and pause help retains the new avoidance lessons.

The renderer reuses eight slots, 88 meshes and four original materials, without new textures or lights. Oil has an irregular dark footprint and restrained sheen inside its marked perimeter; warning rings and extended steel blades have distinct silhouettes. Reduced motion holds blade orientation steady and adds no flashing. Expiry, stale snapshots, garage entry, match changes and disposal hide or release the same bounded pool.

## Police procurement

Suspects introduce guns/bombs/oil/blades in dispatches 2/3/6/7; officers unlock them in 3/5/8/9 and retain them afterward. The authority rejects locked or invalid deployment requests, protection, non-playing phases and cooldown violations. Police bombs land sixteen metres ahead, with a 90-tick fixed fuse, 4.5 m radius and 24 maximum center damage. World obstruction and bounds block unsafe throws without consuming the cooldown. Bombs and manual gadgets share a checkpointed 720-tick officer cooldown. Police bombs/blades damage only the marked suspect and retain normal attacker credit and wreck progression. Existing suspect attacks and gadget warnings/durations are unchanged. Shared oil is still slippery for other unprotected cars. All unlocked weapon controls/reminders persist through later briefings and pause help; [tutorial controls](TUTORIAL.md) records the bindings. Procurement studies the suspect equipment before signing the purchase order.

## Grenade presentation and networking

`GrenadeState` is engine-independent. Compact wire tuples carry the fixed trajectory/timing; they do not send cosmetic flight transforms. Local practice supplies the exact simulation tick. Online presentation advances a monotonic authority clock and retires expired warnings, preserving the frozen campaign phases.

The renderer draws the lob, fuse and blast-area warning from authority. Explosion events produce a bounded soft particle burst: outward fire that cools and fades, rising translucent smoke, ballistic embers and original synthesized sound. Eight reusable blast slots share one procedural alpha texture, with at most 640 particles; solid blast spheres and decorative shock rings are removed. The gameplay warning perimeter retains the actual damage radius. Event deduplication and retired grenade IDs prevent repeated blasts or stale warning resurrection. Reduced flashes and motion, volume limits, match changes, garage entry and disposal follow the existing presentation lifecycle.

## Callsigns

[Original callsign generation](../packages/contracts/src/callsigns.ts) combines twelve first words and twelve second words into 144 clean names of at most twenty characters, such as `Captain Waffle` or `Squeaky Hubcap`. A fresh browser gets a random name. **Reroll callsign** selects another; typing a custom name overrides the generated choice.

The browser saves `{ nickname }` under `fender-callsign-v1`. Generated, rerolled and custom choices survive reload and leaving a dispatch. Missing, malformed or unavailable storage still permits an in-memory name. The existing authoritative nickname validation remains in force. Changing the home field affects the next join; it does not add an in-match rename command.

## Parallel implementation and evidence

- Simulation owns authored tactics, AI decisions, real bullets/grenades, damage and checkpoint lifecycle.
- Rendering owns pooled trajectory/warning/blast visuals, original sound and native scenario checks.
- UI owns saved random callsigns, reroll, briefing tactics and their fixtures.
- Foundation owns shared DTOs, compact wire, app/online clocks, real multiplayer tests, compatibility revision, documentation and publishing.

Every behavior lane follows observed RED–GREEN–refactor. Focused wire/clock tests verify hazard reconstruction, monotonic timing, expiry and frozen phases. Simulation tests verify attacks, protection, cover, connected-officer selection, cadence, all four driving signatures, progression and deterministic replay. Real SDK checks verify shared boss shots/damage and the same grenade warning/explosion for peers and a late joiner. Native rendering checks distinguish authored fixtures from hosted gameplay. The callsign browser scenario exercises generated/rerolled/custom identity through a real solo dispatch.

See [the dated evidence ledger](EXECUTION_STATUS.md) for the implementation runs and 2026-10-24 verification. Remaining work is human difficulty/counterplay review across all six cars, physical-controller completion, effects accessibility/audio review and sustained browser/network budgets. Native capture tools currently require Edge and some retain original-machine output/import paths; [renderer notes](../packages/renderer/README.md) record those portability limits. A six-metre warning circle is a gameplay promise; a screenshot directory is not a performance certificate.

The [tutorial progression](TUTORIAL.md) also gates player guns, their modeled fittings and control hints. Unlocks belong to the room and survive late joins and retries.
