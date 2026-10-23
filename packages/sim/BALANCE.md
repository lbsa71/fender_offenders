# Vehicle balance baseline: arcade-v2

The same vehicle stats, damage, cadence and protection rules remain in `arcade-v3`. Its aim assist applies equally to every profile; the measurements below remain the starting vehicle baseline.

Measured 2026-10-23 with the real shared simulation at 60 Hz. Reproduce from the repository root:

```powershell
node node_modules/tsx/dist/cli.mjs packages/sim/balance.ts
node node_modules/vitest/vitest.mjs run packages/sim
```

The initial proposal was tightened after measuring armor quantization: ambulance health changed from 115 to 110; fire-chief health changed from 105 to 100 and steering rate from 2.1 to 2.0. The other four profiles are unchanged. Authority, practice and prediction apply the same profile ratios to room configuration overrides. Traffic retains baseline tuning and health. All cars use the same collision footprint, projectile damage, fire cadence, braking, reverse speed, respawn delay and protection duration.

## Authored stats

| Body | HP | Forward speed m/s | Acceleration | Steering rate | Grip |
|---|---:|---:|---:|---:|---:|
| Patrol | 100 | 24 | 18 | 2.10 | 9.0 |
| Interceptor | 90 | 26 | 20 | 1.90 | 9.0 |
| Roadster | 80 | 28 | 22 | 2.05 | 8.0 |
| Army | 130 | 20 | 14 | 1.80 | 9.5 |
| Ambulance | 110 | 22 | 16 | 2.20 | 9.0 |
| Fire chief | 100 | 23 | 19 | 2.00 | 9.8 |

## Actual driving and combat outcomes

Every scenario runs in the same empty asphalt arena, without traffic or walls. Straight driving starts stationary with full throttle. Turn radius is distance travelled divided by accumulated yaw during seconds 8–10 of full throttle and full steering; each car therefore turns at its own sustained speed. The separate half-second turn starts every car at 12 m/s with no throttle, and isolates the common-speed steering comparison. Lateral recovery starts with identical 6 m/s side velocity and 12 m/s forward velocity and applies neutral input for 0.2 seconds.

| Body | Actual top m/s | Speed at 1 s m/s | Time to travel 20 m | Half-second turn | Sustained turn radius m | Residual side m/s |
|---|---:|---:|---:|---:|---:|---:|
| Patrol | 24 | 14.44 | 1.683 s | 41.80° | 19.27 | 0.992 |
| Interceptor | 26 | 16.05 | 1.583 s | 37.82° | 23.85 | 0.992 |
| Roadster | 28 | 17.65 | 1.500 s | 40.81° | 24.59 | 1.211 |
| Army | 20 | 11.23 | 1.933 s | 35.83° | 17.46 | 0.897 |
| Ambulance | 22 | 12.84 | 1.800 s | 43.79° | 16.29 | 0.992 |
| Fire chief | 23 | 15.24 | 1.633 s | 39.81° | 19.06 | 0.845 |

The combat scenario holds stationary cars 20 m apart, disables initial protection, and fires actual 10-damage projectiles every 12 ticks. The time below runs from first impact to lethal impact, excluding travel to the first impact. Hit counts include quantization: the proposed 115 HP ambulance took 12 hits and the proposed 105 HP fire chief took 11; the revised values avoid those extra whole-hit benefits.

| Target body | Hits to wreck | Effective damage threshold | First-hit-to-wreck | Weighted budget |
|---|---:|---:|---:|---:|
| Patrol | 10 | 100 | 1.80 s | 1.0000 |
| Interceptor | 9 | 90 | 1.60 s | 0.9985 |
| Roadster | 8 | 80 | 1.40 s | 1.0026 |
| Army | 13 | 130 | 2.40 s | 1.0102 |
| Ambulance | 11 | 110 | 2.00 s | 0.9967 |
| Fire chief | 10 | 100 | 1.80 s | 1.0048 |

These outcomes expose the intended compensation:

- Patrol retains higher top speed than the three heavier utility cars, with baseline armor and predictable steering.
- Interceptor reaches 20 m sooner and sustains a higher speed than patrol, while losing one hit of armor and common-speed turning response.
- Roadster is fastest out of the gate and at top speed, while taking the fewest hits and retaining the most sideways velocity after an impact. Its faster sustained turn also needs the largest radius.
- Army survives the most hits and recovers sideways motion better than patrol, while having the slowest acceleration, lowest speed and weakest common-speed steering.
- Ambulance has the best common-speed steering and smallest sustained turning radius, plus one extra hit over patrol, while taking longer to cover 20 m and losing 2 m/s of top speed.
- Fire chief recovers sideways motion best and accelerates slightly faster than patrol, with the same armor. It loses 1 m/s of top speed and common-speed steering response. This corner-exit versus straight-line tradeoff still merits human comparison with patrol.

## Automated constraints and limits

The tests reject any profile that equals or exceeds another in every authored stat while strictly improving at least one. They also constrain a declared heuristic budget to 0.98–1.02 relative to patrol. The measured range is 0.9967–1.0102:

`0.35 × effective armor ratio + 0.25 × top-speed ratio + 0.20 × acceleration ratio + 0.10 × steering-rate ratio + 0.10 × grip ratio`

Effective armor uses `ceil(HP / 10) × 10`, matching the measured weapon hit count. The weights are explicit design assumptions, not an estimate of win probability. The budget cannot express map geometry, aiming, collisions, escape routes, player skill, or interactions between stats. A smaller turning radius at different speeds is also not proof of better common-speed steering.

The suite verifies all six authority/prediction pairs under custom tuning, real shots-to-wreck and respawn, equal weapon/protection rules, checkpoint replay, scaled-health serialization/respawn, lobby selection restrictions, actual speed/acceleration/turning outcomes and lateral recovery. It does not claim automated proof of human fairness, a duel win-rate matrix, or equivalence across all browser runtimes. Human multiplayer driving, aiming and map-specific match comparisons remain necessary before stronger balance claims.

## Observed TDD cycle

Before changing production simulation code, focused tests failed because army spawned with 100 HP and no maximum-health field instead of 130 HP, and army/roadster both reached the old 24 m/s cap. Expanded tests then exposed the missing selection method, stale gameplay revision and baseline-only respawn armor: 11 intended failures, 20 passing tests. Profile scaling, health, revision and selection were implemented afterward. Later scenario and serialization coverage exercised existing behavior without claiming an additional red phase.

For the follow-up tightening, tests first pinned actual hits-to-wreck to ambulance 11 and fire chief 10 and required weaker common-speed fire-chief steering than patrol. The run observed three intended failures: 12 versus 11 hits, 11 versus 10 hits, and equal steering angles. Only then were the three profile numbers changed. The resulting affected run passed 59 tests across the two simulation files and the contracts profile file (58 simulation tests plus one contracts test).
