# Five storylines, ten dispatches each

Status: implemented; human difficulty/controller acceptance remains open. Reviewed: 2026-10-26. Gameplay revision: `arcade-v19` (protocol 5). Campaign catalog: five versioned storylines; 50 authored dispatches.

*The Green Light Society promised faster traffic. Apparently they meant faster getaway cars.*

After the unarmed opening arrest lesson, campaign targets use [distinct armed tactics](BOSS_COMBAT.md), including grenade attacks and a ten-step difficulty ramp. Briefings give a short equipment tip; full current controls and equipment guidance remain available on demand. This extends the progression lifecycle below.

Dispatch lighting follows the authored noon/dusk/night [graphics schedule](GRAPHICS_POLISH.md#authored-dispatch-schedule). Practice and online select it from the existing shared campaign index during briefing, play and results. Atmosphere changes presentation only; target rules and progression stay unchanged. Shallow water and restrained light detail are implemented. Road puddles become slippery from dispatch 4; see [tutorial progression](TUTORIAL.md). Dispatch has finally learned to book the night shift.

Each 1–8-player server room runs one automatically selected ten-dispatch case. Every case links four ringleaders and six crew members, with an original target, mugshot, assigned vehicle, short briefing and earned reveal for each dispatch. Ringleaders appear at dispatches 2, 5, 8 and 10. Across the catalog there are fifty distinct suspects, twenty ringleaders and thirty crew encounters; mechanics reuse the existing ten-stage progression.

| Storyline | ID | Case hook | Dispatches |
| --- | --- | --- | --- |
| The Green Light Racket | `green-light-racket-v1` | Stolen meter money leads to a city-wide permit racket | 10 |
| The Midnight Munch Run | `midnight-munch-run-v1` | Missing breakfasts expose a fraudulent supper society | 10 |
| The Grand Detour | `grand-detour-v1` | Fake signs and moved landmarks sell invented rescue fares | 10 |
| The Clockwork Caper | `clockwork-caper-v1` | Fast clocks turn stolen city time into fraudulent fees | 10 |
| The Great Duck-Out | `great-duck-out-v1` | Weighted rubber ducks reveal a rigged festival | 10 |

The room selects its case with server-side cryptographic randomness at creation. No extra picker interrupts entry. A completed case offers **ANOTHER CASE**, selecting a different case and preserving the room link, officers and garage assignments. Retention and reconnect preserve the existing case ID; an expired room starts afresh. The precinct has range, if questionable catering.

## Player flow

1. Open a room URL (assigned randomly when absent), enter a callsign and choose Hit the streets. The saved motor-pool assignment remains intact.
2. See the target’s mugshot, the current story paragraph and car identification. Reassign the player's own car here; the rotating 3D previews show both YOUR UNIT and WANTED with their current weapon fittings.
3. Start the dispatch. Any connected officer can start, including the room’s sole player. A three-second countdown locks the motor pool.
4. Race to arrest the marked target. Dispatch 1 requires an arrest and disables guns for everyone; police guns unlock in dispatch 3 after suspect guns appear in dispatch 2. Credited target destruction is allowed after the opener. The first authoritative resolution wins this dispatch, independent of cumulative combat-point ranking.
5. Read the outcome and newly revealed clue. An arrest earns three internal points; a wreck earns the existing one-point credit. The concise result distinguishes arrest/wreck and shows only the current earned reveal. Both advance the story. Results identify the resolving officer.
6. Any connected officer opens the next briefing. All players can change their car again before the next dispatch starts. Scores, outcomes and casefile carry forward. A timeout instead retries the same dispatch and reveals no new clue.
7. The tenth success finishes the campaign and reveals the ending. Another case resets outcomes and scores while retaining players, room link and vehicle assignments.

Outcomes remain shared by the room and retain the resolving officer’s callsign after departure. Late joiners and reconnecting players receive the same complete authority state, but the interface shows the current assignment/result rather than a tracker, score table or accumulated casefile. Campaign progress belongs to the room. Empty rooms pause for up to 15 minutes, with earlier reclamation at capacity. Returning resumes that campaign; expiry or a server restart recreates the invite with a fresh campaign. See [room sessions](ROOM_SESSIONS.md).

## Authority and lifecycle

`WorldSnapshot.campaign` contains only campaign ID, zero-based current dispatch index, active/complete status and ordered resolutions. A resolution stores dispatch index, `arrested` or `wrecked`, officer ID, immutable credited callsign and elapsed ticks. Attribution remains after the officer leaves. Authored names, portraits and prose are static shared content, never networked transforms or client-owned mission state.

The simulation enables campaign mode explicitly with `campaign: true, pursuit: true` and an authored lane graph. Production rooms start in a briefing (the existing internal `lobby` phase). `startRound(playerId)` begins its countdown; `rematch(playerId)` returns results to the next briefing or retries a timeout. On a completed case, the room supplies a different validated case ID to `rematch(playerId, nextCampaignId)`; direct deterministic fixtures without that ID restart their selected case. These operations require a connected member and admit one valid phase transition; no creator privilege or two-player minimum applies. Generic noncampaign simulation fixtures retain their earlier single-pursuit behavior.

The marked suspect retains one entity ID across dispatches. Each new stage resets its body, profile-scaled health, traffic runtime, arrest timers, projectiles and winner. Players heal/respawn at dispatch start; changing bodies is allowed only in the briefing. Campaign worlds freeze outside live play, including the completed target's wreck, preventing a result from racing a respawn or a second arrest.

Arrest eligibility remains active/connected officer, distance below 8 m, relative speed below 5 m/s and unobstructed static-world line of sight for 180 ticks. Ineligible progress decays by two ticks. Simultaneous arrest finishes use stable player-ID ordering. Projectiles resolve before arrest progress on each tick; a lethal shot on the would-be arrest tick records a wreck once. The target uses its assigned vehicle's armor, while retaining AI lane driving and the existing chase speed limits.

Only completed outcomes unlock story text. The UI shows only the current assignment and, after success, its earned reveal; future success revelations remain sealed. A timeout has no outcome entry. Checkpoints preserve the campaign and independent arrest timers for deterministic replay. Compact snapshots carry the casefile baseline to existing peers, late joins and reconnects.

## Authored arc (engineering spoilers)

| Dispatch | Target | Assigned car | Connection |
| --- | --- | --- | --- |
| 1 | Nico Nickel / Loose Change | Roadster | Stolen meter coins lead to the impound yard |
| 2 | Mabel Clench / The Clamp | Army 4×4 | First ringleader; towing receipts expose fake permits |
| 3 | Pip Quill / Carbon Copy | Patrol | Duplicated permits lead to paid-lane sales |
| 4 | Rosa Reel / Red Tape | Interceptor | Express-lane passes expose the permit chief |
| 5 | Hector Hush / Hot Stamp | Fire Chief | Second ringleader; closures conceal a fake emergency convoy |
| 6 | Otis Bell / Spare Siren | Fire Chief | Smuggled sirens reveal staged roadblocks |
| 7 | Tess Cone / No Vacancy | Army 4×4 | Roadblock orders point to the premium ambulance service |
| 8 | Dr Iris Vale / Siren Song | Ambulance | Third ringleader; the clinic fronts the Green Light Society |
| 9 | Juno Slip / Last Receipt | Roadster | The original accounts identify the chairman |
| 10 | Aldo Ledger / The Chairman | Patrol | Fourth ringleader; the refund key closes the racket |

The original case remains in [campaign content](../packages/contracts/src/campaign.ts); four further casts and clue chains live in [extra storylines](../packages/contracts/src/extra-storylines.ts). `STORYLINES` exposes all five, while original `CAMPAIGN_*` aliases retain the Green Light case for compatibility. The fifty self-contained [SVG portraits](../packages/contracts/src/campaign-mugshots.ts) use original paths and varied palettes/accessories. They share the six established vehicle designs and add no runtime asset requests.

## Parallel ownership and acceptance

| Lane | Owned work | Required evidence |
| --- | --- | --- |
| Shared foundation | Campaign DTOs/exports, wire adapter, revision | Ordered mixed outcomes survive roundtrip; legacy snapshots remain readable |
| Simulation | Stage lifecycle, target stats, credit and reset | Observed RED before implementation; ten alternating arrest/wreck completions, timeout, permissions, replay |
| Authored content/art | Five cases, fifty suspects, twenty ringleaders, story and SVG mugshots | Valid references, six vehicle bodies, distinct portraits; native small-size inspection |
| Interface | Concise briefing/garage, current earned reveal, outcome credit and menu input | Fixture RED/GREEN, no future reveals, no wreck checks, responsive layout and controller navigation |
| Integration/operations | App/server composition, real clients, browser flows, CI and deployment | Both peers/late join share progress; real shooting, car changes, actual solo start and live hosted briefing |

Run focused checks with `pnpm exec vitest run packages/contracts/src/campaign.test.ts packages/contracts/src/wire.test.ts packages/sim/src/core/campaign.test.ts tests/integration/campaign.test.ts`, the UI fixture with `node packages/ui/dev/campaign-smoke.mjs`, and the integrated browser suite with `pnpm test:e2e`. Fixture captures are labeled as fixtures; hosted captures establish only the live state actually shown.

The armed build's implementation evidence is dated in [execution status](EXECUTION_STATUS.md). The 2026-10-24 pacing follow-up allows fifteen local fixed ticks per slow practice frame, with a separate four-input-tick online stall cap; online sampling now uses an independent timer rather than rendered frames; menus and nonplaying campaign presentation retain their freeze rules. The badge update also avoids a per-frame position transition. Next acceptance is a complete human campaign run on keyboard and physical controllers, late-join/reconnect review and measured five-minute performance—not another round of story scaffolding. The casefile is ready; the clipboard still needs signatures.

Campaign fixture captures use `work/quick-patrol`. Consult [UI fixture notes](../packages/ui/README.md) for other capture tools; older absolute output paths remain historical evidence.
