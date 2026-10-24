# Vehicle balance: current profiles and historical measurements

Reviewed: 2026-10-24. Current gameplay is `arcade-v8`; the numerical report below remains the measured 2026-10-23 `arcade-v5` tyre/volley baseline. Profile anchors and controller defaults still match source, but campaign tactics and grenades were added afterward. These figures were not regenerated during this documentation review.

*The army car brings armor. The roadster brings excuses about why armor was slowing it down.*

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
