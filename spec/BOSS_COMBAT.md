# Armed campaign targets and player callsigns

Status: implemented locally; human difficulty and audiovisual approval remain open. Reviewed: 2026-10-26. Gameplay revision: `arcade-v12`, protocol 3. This extends the [ten-dispatch campaign](CAMPAIGN.md).

*The suspects have read the equipment budget. Regrettably, they found the grenade column.*

Nico is unarmed for the first arrest lesson. Targets from dispatch 2 can fight back. Ordinary civilian traffic remains unarmed. The four ringleaders have different driving and attack signatures; crew encounters introduce the same ideas more gently. The briefing names the tactic, shows its difficulty out of ten, and explains the opening a player can exploit.

| Ringleader | Driving | Attack and counterplay |
| --- | --- | --- |
| Mabel / The Clamp, dispatch 2 | Hard brake checks against a closing officer behind | Short forward bursts; avoid the bumper, flank, then close during recovery |
| Hector / Hot Stamp, dispatch 5 | Broad swerves against a closing officer nearby | Lobbed grenades; leave the marked landing area before the fuse expires |
| Iris / Siren Song, dispatch 8 | Sharper, faster swerves against a closing officer nearby | Four-volley drive-by bursts; stay off the nose and match speed during recovery |
| Aldo / The Chairman, dispatch 10 | Interception | Five-volley bursts alternating with grenades; break the firing line and exploit recovery |

## Difficulty and authority

The [ten authored profiles](../packages/contracts/src/boss-tactics.ts) use difficulty 1–10, shorter attack windups and recovery periods, quicker escape lines, larger grenade zones and more demanding bursts. The opening target has weapon `none`; Mabel introduces forward bursts in dispatch 2. The finale combines previously introduced attacks. Player vehicle profiles, collision shapes, weapon cadence and arrest conditions retain their existing rules; progression does not secretly weaken a player's car.

Evasive steering and brake checks require a visible, eligible officer less than 22 m away whose relative velocity is reducing the gap by more than 0.5 m/s. Matching speed, falling behind or remaining distant does not trigger either tactic; normal route steering/braking continues. Brake checks also require the officer more than 2 m behind and within 6 m laterally. Every eligible officer is considered independently of the nearest weapon target. An officer in front cannot hide a second officer gaining from behind.

Entering a closing pursuit starts the maneuver immediately. Losing the closing condition cancels it. Weavers use twice their authored steering amplitude, clamped to the normal steering range, preserving each profile's period. Brake checks combine full service braking with the existing handbrake, cancel throttle, and stop applying brake-to-reverse input below 0.5 m/s forward speed. Their existing 90-tick check window and profile period remain bounded. The suspect has finally noticed the patrol car in the mirror.

AI selects active, connected officers using authoritative positions and visibility. It observes range, line of sight, protection, weapon alignment, windup, burst cadence and recovery. AI bullets are real projectiles emitted from the forward gun tips, with authoritative damage and the existing world/car sweep tests. AI can wreck an officer but cannot earn player points or resolve its own dispatch. Only a player arrest or credited player destruction resolves the target.

Grenades publish a fixed origin and landing point, launch/landing/detonation ticks, radius and damage. A throw cannot home onto a player after its landing warning appears. The introductory dispatch-3 fuse lasts 150 ticks (2.5 seconds); later authored fuses last 90 ticks (1.5 seconds); blast radii stay at or below 6 m and maximum center damage at or below 34 health. Damage falls off with distance, respects world obstruction and protected cars, and is applied once by the authority. Multiple readable, avoidable attacks create the ramp instead of an unavoidable single hit.

Lobby, countdown, results, wrecked/respawning targets and absent eligible officers do not initiate attacks. Dispatch completion, timeout, retry and campaign reset clear outstanding hazards. Checkpoints retain AI runtime and active grenade state so replay reproduces attacks and outcomes. Late joiners and reconnects reconstruct a warning from the current snapshot, without needing its original throw event.

## Presentation and networking

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
