# Vehicle balance: current profiles and historical measurements

Reviewed: 2026-10-25. The current worktree adds gun recoil as `arcade-v9`. The new recoil measurements below are fresh; the later numerical driving/combat report remains the measured 2026-10-23 `arcade-v5` tyre/volley baseline. Campaign tactics, grenades and recoil were added afterward. Historical figures were not silently regenerated or promoted.

*The army car brings armor. The roadster brings excuses about why armor was slowing it down.*

## Gun recoil: 2026-10-25

An accepted paired volley now removes up to 3.4 m/s of forward speed on the default patrol. The kick scales with the car's configured acceleration relative to 26 m/s², so the faster profiles also pay a useful firing cost. It applies once per volley, preserves the current muzzle poses, and cannot propel a stationary or reversing car. Cooldown, projectile-cap and phase rejection do not apply a kick.

Each accepted volley adds 0.32 to a bounded 0–1 handling load. It decays by 0.8 per second: full recovery takes at most 1.25 seconds after the last shot. At full load, steering lock is reduced by 40% and front/rear grip limits by 15%. Steering direction remains under player control; there is no random yaw kick. Respawn and car reassignment clear the load. Authority and local prediction share the same rules and cadence state; checkpoints and local snapshot baselines retain the load and prediction tick. Client/server builds must both use `arcade-v9`.

Measured at 60 Hz in an empty asphalt arena, using three seconds of full-throttle warmup followed by seven seconds of held fire. Speeds are the mean over the final two seconds. Reproduce with `pnpm exec tsx packages/sim/recoil-balance.ts`.

| Body | Clean cruise m/s | Held-fire cruise m/s | Speed lost |
| --- | ---: | ---: | ---: |
| Patrol | 28.00 | 20.10 | 28.2% |
| Interceptor | 30.33 | 22.28 | 26.6% |
| Roadster | 32.67 | 24.46 | 25.1% |
| Army | 23.33 | 15.74 | 32.5% |
| Ambulance | 25.67 | 17.92 | 30.2% |
| Fire chief | 26.83 | 21.02 | 21.6% |

The patrol's common-speed steering check starts at 12 m/s, applies half steering for 0.3 seconds, and compares a rested car against one that fired for two seconds. Turn angle falls from 13.66° to 9.68° (29.1% less); after recovery the response matches the rested car again. These controlled results establish the intended cost, not human balance approval. Dispatch recommends short bursts; the accelerator has submitted a formal complaint about continuous fire.

Observed RED before implementation: the first volley lost 0 m/s, all six held-fire cars retained their clean speeds, and hot/rested steering angles were identical. A real room's client prediction also showed only ordinary coasting instead of an immediate kick. Shared accepted-volley recoil, recoverable steering/grip load and prediction cadence made those focused checks pass. A subsequent six-body constraint exposed insufficient fire-chief speed cost with the initial 3.2 coefficient; increasing it to 3.4 met the same unchanged bound. Additional checks cover inactive phases, exhausted projectile capacity, no reverse propulsion, legacy snapshot clocks, serialization, respawn and exact checkpoint replay.

## Historical baseline below

These measurements were regenerated after merging the tyre-force and drift model from PR #1 (working tree based on `3f6227c`). The default patrol configuration now uses a 28 m/s forward cap, acceleration 26, speed-sensitive steering lock and front/rear tyre forces. The shared profile ratios, paired weapons and narrow aim assist remain part of the `arcade-v5` baseline.

Measured 2026-10-23 with the real shared simulation at 60 Hz. Reproduce from the repository root:

```powershell
node node_modules/tsx/dist/cli.mjs packages/sim/balance.ts
node node_modules/vitest/vitest.mjs run packages/sim
```

The initial proposal was tightened after measuring armor quantization: ambulance health changed from 115 to 110 and fire-chief health from 105 to 100. Fire-chief's steering anchor is now 1.9 following the drift merge. Authority, practice and prediction apply the same profile ratios to room configuration overrides. Traffic retains baseline tuning and health. All cars use the same collision footprint, projectile damage, fire cadence, braking, reverse speed, respawn delay and protection duration.

## Authored stats

| Body | HP | Speed anchor | Acceleration anchor | Steering anchor | Grip anchor |
|---|---:|---:|---:|---:|---:|
| Patrol | 100 | 24 | 18 | 2.10 | 9.0 |
| Interceptor | 90 | 26 | 20 | 1.90 | 9.0 |
| Roadster | 80 | 28 | 22 | 2.05 | 8.0 |
| Army | 130 | 20 | 14 | 1.80 | 9.5 |
| Ambulance | 110 | 22 | 16 | 2.20 | 9.0 |
| Fire chief | 100 | 23 | 19 | 1.90 | 9.8 |

These are the values in `VEHICLE_PROFILES`, used as ratios against patrol. They are not the current room's absolute handling settings: patrol's speed/acceleration anchors remain 24/18 while the default room supplies 28/26. For example, army receives a speed cap of `28 × 20 / 24 = 23.33 m/s` and acceleration `26 × 14 / 18 = 20.22`. Steering anchors scale the default 0.6-radian steering lock; grip anchors scale tyre stiffness and front/rear grip limits. The actual resulting speeds appear below.

## Actual driving and combat outcomes

Every scenario runs in the same empty asphalt arena, without traffic or walls. Straight driving starts stationary with full throttle. Turn-path radius is distance travelled divided by accumulated yaw during seconds 8–10 of full throttle and full steering. This includes the model's drift state and each car's resulting speed; it does not establish a constant-speed circular turning radius. The separate half-second turn starts every car at 12 m/s with no throttle, and provides the common-starting-speed steering comparison. Lateral recovery starts with identical 6 m/s side velocity and 12 m/s forward velocity and applies neutral input for 0.2 seconds.

| Body | Actual top m/s | Speed at 1 s m/s | Time to travel 20 m | Half-second turn | Full-throttle turn-path radius m | Residual side m/s |
|---|---:|---:|---:|---:|---:|---:|
| Patrol | 28.00 | 20.86 | 1.367 s | 45.64° | 21.52 | 0.230 |
| Interceptor | 30.33 | 23.18 | 1.300 s | 41.92° | 28.76 | 0.230 |
| Roadster | 32.67 | 25.49 | 1.233 s | 42.78° | 35.17 | 0.475 |
| Army | 23.33 | 16.22 | 1.583 s | 40.63° | 6.47 | 0.132 |
| Ambulance | 25.67 | 18.54 | 1.467 s | 47.35° | 13.91 | 0.230 |
| Fire chief | 26.83 | 22.02 | 1.333 s | 43.15° | 20.12 | 0.077 |

The combat scenario holds stationary cars 20 m apart, disables initial protection, and fires paired projectiles every 12 ticks. Each barrel deals 5 damage, retaining 10 total damage per volley and 50 maximum damage per second when both land. The time below runs from first impact to lethal impact, excluding travel to the first impact. Volleys include quantization: the proposed 115 HP ambulance required 12 volleys and the proposed 105 HP fire chief required 11; the revised values avoid those extra whole-volley benefits.

| Target body | Volleys to wreck | Projectile hits | Effective damage threshold | First-hit-to-wreck | Weighted budget |
|---|---:|---:|---:|---:|---:|
| Patrol | 10 | 20 | 100 | 1.80 s | 1.0000 |
| Interceptor | 9 | 18 | 90 | 1.60 s | 0.9985 |
| Roadster | 8 | 16 | 80 | 1.40 s | 1.0026 |
| Army | 13 | 26 | 130 | 2.40 s | 1.0102 |
| Ambulance | 11 | 22 | 110 | 2.00 s | 0.9967 |
| Fire chief | 10 | 20 | 100 | 1.80 s | 1.0001 |

Both shots now originate from real muzzle tips 2.45 m forward and 0.63 m left/right of the car center. Each independently uses the same narrow aim-assist limits from its own muzzle and follows a fixed trajectory. A close wall or vehicle between the car center and a muzzle is swept before normal flight. One blocked or missed barrel deals only 5 damage; the balance table assumes both land. Correcting the spawn position shortens first-impact travel from the old center spawn without changing the interval between damaging volleys. Projectile lifetime remains 0.65 seconds (39 ticks).

These outcomes expose the intended compensation:

- Patrol retains higher top speed than the three heavier utility cars, with baseline armor and predictable steering.
- Interceptor reaches 20 m sooner and sustains a higher speed than patrol, while losing one full volley of armor and common-starting-speed turning response.
- Roadster is fastest out of the gate and at top speed, while taking the fewest hits and retaining the most sideways velocity after an impact. It has the largest measured full-throttle turn-path radius.
- Army survives the most hits and recovers sideways motion better than patrol, while having the slowest acceleration, lowest speed and weakest common-starting-speed steering. It now produces the smallest turn-path radius in the full-throttle drift scenario, so that result must be assessed separately from its initial steering response.
- Ambulance has the strongest common-starting-speed steering and a smaller full-throttle turn-path radius than patrol, plus one extra full volley of armor, while taking longer to cover 20 m and losing 2.33 m/s of top speed.
- Fire chief recovers sideways motion best and accelerates slightly faster than patrol, with the same armor. It loses 1.17 m/s of top speed and common-starting-speed steering response. This corner-exit versus straight-line tradeoff still merits human comparison with patrol.

## Automated constraints and limits

The tests reject any profile that equals or exceeds another in every authored stat while strictly improving at least one. They also constrain a declared heuristic budget to 0.98–1.02 relative to patrol. The measured range is 0.9967–1.0102:

`0.35 × effective armor ratio + 0.25 × top-speed ratio + 0.20 × acceleration ratio + 0.10 × steering-rate ratio + 0.10 × grip ratio`

Effective armor uses `ceil(HP / 10) × 10`, matching the measured full-volley budget when both barrels land. The weights use authored profile ratios and are explicit design assumptions, not an estimate of win probability. They do not quantify the nonlinear drift response or the new absolute room defaults. The budget cannot express map geometry, aiming, collisions, escape routes, player skill, or interactions between stats. A smaller turn-path radius in different drift states is also not proof of better common-speed steering.

The suite verifies all six authority/prediction pairs under custom tuning, real shots-to-wreck and respawn, equal weapon/protection rules, checkpoint replay, scaled-health serialization/respawn, lobby selection restrictions, actual speed/acceleration/turning outcomes and lateral recovery. It does not claim automated proof of human fairness, a duel win-rate matrix, or equivalence across all browser runtimes. Human multiplayer driving, aiming and map-specific match comparisons remain necessary before stronger balance claims.

Current campaign targets use assigned body armor plus separate authored driving/attack profiles. The empty-arena player-volley table is not a boss difficulty curve: it excludes AI bursts, cover, grenades and arrest windows. Next acceptance compares all six player cars through the ten dispatches on keyboard and physical controllers, then in multiplayer. Record any tuning change with a fresh measured report and relevant RED/GREEN evidence; do not give the spreadsheet a medal for winning a duel it never entered.

## Observed TDD cycle

Before changing production simulation code, focused tests failed because army spawned with 100 HP and no maximum-health field instead of 130 HP, and army/roadster both reached the old 24 m/s cap. Expanded tests then exposed the missing selection method, stale gameplay revision and baseline-only respawn armor: 11 intended failures, 20 passing tests. Profile scaling, health, revision and selection were implemented afterward. Later scenario and serialization coverage exercised existing behavior without claiming an additional red phase.

For the follow-up tightening, tests first pinned actual hits-to-wreck to ambulance 11 and fire chief 10 and required weaker common-speed fire-chief steering than patrol. The run observed three intended failures: 12 versus 11 hits, 11 versus 10 hits, and equal steering angles. Only then were the three profile numbers changed. The resulting affected run passed 59 tests across the two simulation files and the contracts profile file (58 simulation tests plus one contracts test).
