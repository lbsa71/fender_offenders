# Wrecks, physical scenery and pedestrians

Reactive scenery and a cosmetic crowd were introduced in `arcade-v4`. The current `arcade-v6` build retains this world behavior alongside the drift controller, paired gunfire and competitive pursuit; scenery adds no vehicle damage and does not change the default three-second respawn.

## Authority and physics

`districtProps` derives stable object IDs and placement from the same authored city layout: 56 trees, 30 lamps, 30 benches, 30 bins, eight barrels, four crates and four signs. Barrels, crates, bins and park benches start as dynamic Rapier rigid bodies. Lamp posts, signs and whole trees start fixed; swept car contact or a sufficiently hard real debris impact releases them into gravity, tumbling and ordinary ground/building/prop contacts. Gentle resting/floor contacts do not release anchored objects. Trees fall as composite rigid bodies with a trunk and crown collider.

The authority steps this separate 3D world at 60 Hz. Kinematic vehicle proxies push the props. Forces do not feed back into the planar arcade vehicle controller, so scenery cannot cause additional local prediction corrections or change a car's handling. Prop collisions cause no damage, oil hazards or weapon bonuses. Pedestrians never participate in this physics world.

The hard limits are 192 props and 24 active vehicle proxies per simulation. Speeds, spin and out-of-bounds recovery are bounded. Full Rapier snapshots and handle mappings belong to trusted simulation checkpoints; clients cannot supply checkpoint state, transforms or impulses. Round restart resets scenery; joining an existing round receives its current state. A server restart creates fresh scenery along with the fresh match.

Snapshots include kind, scale, 3D body position, quaternion, fixed/dynamic mode, sleeping state and discontinuity. Online presentation interpolates position and normalized shortest-arc rotation on the shared buffered clock. It freezes when snapshots stop rather than inventing continuing physics. Reset/discontinuity cancels interpolation. Babylon reflects the shared X axis exactly once at its adapter boundary.

## Network updates

Joining, reconnecting and explicit client resync requests send a full prop baseline. Subsequent snapshots send only changed props. Quiet snapshots omit the prop position array, so fixed trees/lamps and sleeping debris do not repeatedly consume position-update bandwidth. Comparison uses the last transmitted state so slow movement eventually crosses the update threshold (2 cm translation or .002 in a quaternion component, treating opposite-sign quaternions as equivalent); changes of mode, scale, sleep or discontinuity are sent immediately. A changed roster requires a new baseline. Input-backlog and server catch-up clock corrections preserve the reliable prop baseline and do not resend the district.

The compact wire marker `propsPatch: true` identifies partial updates. Clients merge them into the same match's previous prop state before storing/interpolating a coherent snapshot. A full baseline replaces the previous set, including an empty baseline. Legacy snapshots without props decode as empty. Reliable ordered WebSocket delivery carries the patches; reconnect/resync replaces any prior baseline. Pedestrians, flying wreck parts, smoke and explosions are local presentation and send no transform updates.

The synthetic benchmark `node node_modules/tsx/dist/cli.mjs packages/sim/props-bench.ts` measures 192 props, eight scripted players and eight traffic cars over 1,200 ticks after 120 ticks of warmup. Its initial sparse-publication run measured approximately 2.51–2.52 KB per encoded snapshot versus 11.44–11.88 KB with repeated full prop state: 78–79% less total encoded payload, averaging about two changed prop tuples per packet. This is Colyseus MessagePack payload, excluding WebSocket/TLS framing and reconnect baselines; it is not a remote wire capture or a capacity claim. At 20 Hz the sample still uses roughly 50 KB/s per client, so the broader bandwidth gate remains open.

## Wreck presentation

Confirmed wreck metadata carries the final pose, car body and vehicle discontinuity. It can arrive before the corresponding snapshot. It cannot wreck a newer respawned life. Legacy events without metadata require an already wrecked snapshot. Duplicate events and repeated notifications for the same life do not replay the explosion.

Wheels and body panels are cosmetic; they cannot damage cars or pedestrians. The renderer uses fixed pools, cancels them on respawn, entity removal, garage entry, match change and disposal, and restores the intact model only for its next active life. Late joiners see the current charred wreck without replaying an old explosion. Reduced motion suppresses flying/tumbling and reduced flashes suppress the bright burst; audio follows the existing unlock, mute, volume and distance rules.

## Pedestrian safety

The bounded crowd follows authored pavement and zebra-crossing loops. People wait for a predicted safe gap, flee approaching vehicles, and retreat if a crossing becomes unsafe. Avoidance considers every rendered car, including traffic, reversing/turning motion and the sweep from the last rendered position. It runs before the scene is drawn, including zero-delta snapshots and teleports.

Safe refuges must lie on pavement outside building footprints. A final safety check relocates a cosmetic figure to a validated refuge in an emergency; if none exists it temporarily hides that figure. This fallback guarantees visual separation under late or discontinuous state delivery. The normal animation is walking, waiting or running. People have no health, projectile target, hit event or vehicle collider, and cannot be injured. The crowd is local presentation rather than synchronized gameplay state.

## Reproducible checks

Run the normal checks from the repository root:

```sh
pnpm check
pnpm test
pnpm assets:check
pnpm build
pnpm test:e2e
```

Native renderer scenarios use the real Babylon engine and real Rapier simulation, independently of the public application. Start their private Vite server, then run the scenario checks in a second terminal:

```sh
node node_modules/tsx/dist/cli.mjs packages/renderer/scenarios/server.ts
node node_modules/tsx/dist/cli.mjs packages/renderer/scenarios/world-check.ts
```

The physical street fixture intentionally places all prop kinds in the car's path to make contact and toppling reproducible. Its layout is a test scene, not the shipping district. Screenshots prove rendering and scripted behavior; they do not establish human visual approval, production frame budgets or hosted capacity. Existing release gates remain in [execution status](EXECUTION_STATUS.md).
