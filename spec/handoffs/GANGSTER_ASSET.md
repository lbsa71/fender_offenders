# Gangster sedan art handoff

## Game integration follow-up · 2026-10-28

Publication regression: all 90 browser tests passed before the mocked garage fixture rejected a repaired valid assignment using its obsolete six-car list. Replacing that duplicate list with the actual shared catalog made all five UI fixtures pass, with existing assertions preserved and explicit DB5/Night Courier coverage. The full push gate is rerun; the production car implementation required no change.

The graphics worktree integrates the pushed art package `1ec7229` as **Night Courier**, shared body ID `gangster`, the eighth selectable car in `arcade-v25` / protocol 5. This current integration supersedes the branch-local preparation status below; historical Blender evidence remains intact. The existing **Your vehicle** picker persists and broadcasts the selection, and countdown locks remain unchanged.

The briefing lazily loads the 22,808-triangle GLB; driving lazily loads the 9,904-triangle GLB. The DB5 importer is now a shared modeled-car adapter with independent per-body caches, source-local node lookup and model-specific wheel radius/road lift. Both cars can load concurrently without sharing their identically named axle or muzzle nodes. Source geometry batches by body/material, gun and individual wheel, with at most twenty visible batches and shared instances across officers. Night Courier's tires and wire hubs share their authored axle, roll using radius 0.425 m and steer at the front. Geometry lifts 0.426 m above the road. The distant LOD remains reserved.

Original black clearcoat, nickel, rubber, glazing and lamp materials survive intact and physical breakup. Eighteen unarmed or twenty armed source components feed the existing wreck pool, including four round physical tires and material submesh regions. Normal progression controls the optional guns; cosmetic muzzle height is 0.786 m and local forward Z is 1.96 m. Shared damage, chassis dimensions, fire cadence and projectile rules remain unchanged. The 120-health profile trades its 21 m/s cruise and slower acceleration/steering against durability; existing no-dominance and weighted-balance tests pass. A deeper tuning reuses the shared engine recordings.

Observed integration RED: four tests failed before production changes because `gangster` was absent from the shared catalog and no model loader existed for the new car. The same command passed 31 existing tests, including the actual DB5 coverage, before its importer was generalized. The new Night Courier tests now cover black paint, curved component groups, gated guns, source ground clearance, four shared axle pivots, radius-correct rolling, bounded instancing and simultaneous DB5/Night Courier imports with independent muzzles. Real Rapier checks preserve all material regions, launch exactly four tires and observe a rebound; a real client/server join admits the selected car with 120 health.

Current evidence: **1,058 headless tests / 103 files passed** (25.44 s), plus **18 asset validator/export tests**, type/documentation checks and the asset audit. Two focused native-browser cases pass: rookie dispatch one at 1440×900 and armed snowy dispatch nine at 390×844. Each switches from an imported DB5 to Night Courier before dispatch, verifies authority/model loading and captures the actual briefing/driving view in ignored `work/gangster-*.png`. Visual inspection confirms the black enclosed silhouette, running boards, fenders, clear phone picker/start controls and readable snowy driving view. Full publication checks are recorded in the execution ledger; human appearance/handling and sustained minimum-device performance remain open. This bounded integration leaves the broad graphics goal paused.

Updated 2026-10-28. Blender/art lane A. Branch `codex/gangster-asset` starts from fresh `origin/main` at `d53e43edf3c73f39416861b1a9c60ab758cb451f`. The DB5 delivery at `4c4e11f` remains unchanged on its separate branch. Status: original model prepared for integration review; no production renderer replacement, main merge or deployment. The sedan has its garage paperwork; road approval remains open.

## Asset and provenance

Night Courier is an original, unbranded black 1920s-style enclosed sedan with tall grille, running boards, sweeping fenders and narrow spoked wheels. The suggested BlendSwap Ford Model A was listed as CC-BY/Fan Art but required sign-in to download. Its archive terms could not be verified through that public route; no source archive or mirror was used. The authorized original-model fallback is documented in [provenance](../../packages/content/manifests/licenses/gangster/README.md).

Original model, recipe and previews are GPL-3.0-or-later, with the license preserved in the asset's license folder. Artist/AI roles and source-selection evidence are explicit. The supplied original Blender scene and generation recipe are corresponding editable source. The car has no downloaded textures, badges, brand logos or source-photo dependencies.

Owned delivery: `asset-source/gangster/`, `packages/content/runtime/models/gangster/`, `packages/content/manifests/licenses/gangster/`, `tools/assets/gangster/`, this handoff and the narrow contributor credit. FENDER Graphics owns renderer, vehicle profiles, weapon progression, gameplay and physics. No game code, shared contracts or package/dependency manifests change here.

## Contract

GLBs use meters, right-handed Y-up and nose +Z, with identity root `car`. Authoring uses Blender Z-up and nose -Y; export converts orientation. The root is the mid-axle plane, and tyres extend to Y=-0.425 m. Left components use negative X. Preserve the renderer's existing coordinate conversion.

Twenty detachable mesh groups: `body`, `bonnet`, `boot`, `door_left`, `door_right`, `fender_left`, `fender_right`, `running_board_left`, `running_board_right`, `grille`, `bumper_front`, `bumper_rear`, `lights_front`, `lights_rear`, `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`, `gun_left`, `gun_right`. Each side's front/rear fenders share one debris group. Roof, chassis, windshield and rear glazing belong to `body`. Door groups include side glazing and trim; panel origins are fragment centers, not opening hinges.

Wheel centers are X=±0.80, Y=0, Z=±1.32 m in every LOD. Positive Z identifies front. Steer around local +Y and roll around local +X. Gun pivots are X=±0.43, Y=0.36, Z=1.72 m. `muzzle_left`/`muzzle_right` are children of the corresponding guns, translated 0.24 m along local +Z without rotation. All gun geometry remains inside the unarmed vehicle bounds.

**Hide both gun meshes on import until normal equipment rules permit them.** The nodes carry `optionalEquipment: true`; GLB has no portable default visibility guarantee. These are cosmetic attachments and do not grant weapons or change damage, muzzle authority, unlock progression or the chassis hit footprint.

[Component metadata](../../packages/content/runtime/models/gangster/components.json) records exact per-LOD bounds, fragment pivots, and local box collider centers/extents. Wheel collider suggestions are X-axis cylinders, radius 0.425 m and half-width 0.105 m. These are cosmetic breakup suggestions; game physics behavior is untested here.

Six PBR materials distinguish black clearcoat paint, nickel, rubber/recesses, opaque blue-smoke glazing, warm headlamps and ruby tail lamps. `KHR_materials_clearcoat` support needs importer review. No image or external binary dependencies. No shader baking was needed because all retained detail is geometry and PBR factors.

## Acceptance and evidence

Visual criteria and reproduction commands are in the [asset README](../../asset-source/gangster/README.md). Offline previews reimport actual GLBs in Blender 5.2.2 LTS, Cycles CPU, 40 samples, seed 17, AgX, 1000×700. They cover neutral/rear, briefing and elevated noon/dusk/night armed/unarmed, 28-degree steering and exploded components. Actual game cameras, importer appearance, LOD switch distances, debris physics, sustained performance and human approval remain pending.

Observed tooling RED: four validator tests failed because the initial no-op validator did not reject missing/misplaced wheel nodes, transformed root, absent rights/budget violations and external dependencies. Implemented validation made all five tests green. Existing art inspection checks for finite unit normals, winding, fragment bounds, optional gun containment and stable axle locations passed on their first run; no historical RED is claimed for them.

Observed export budget RED: all three actual GLBs exceeded their 25,000/10,000/4,000 triangle limits at 26,840/12,736/4,424. Reducing small vent/running-board bevels and per-LOD wheel/fender sampling fixed briefing and distant; driving initially remained at 10,064, then reducing its spoke count brought it under budget. The final combined validator/export suite passes **18/18 tests**, including all three triangle limits and the 40-material-primitive cap. No assertion was weakened to accept the initial exports.

Measured inventory, repeated-export results and final publication checks are recorded with the completed package below. A material-primitive count is a bound on asset structure, not a measured whole-game draw-call result. No release or runtime-performance sign-off is implied.

## Measured delivery

| LOD | Triangles | GLB bytes | Gzip bytes | Meshes | Material primitives |
| --- | ---: | ---: | ---: | ---: | ---: |
| Briefing | 22,808 | 512,692 | 159,627 | 20 | 37 |
| Driving | 9,904 | 240,196 | 61,622 | 20 | 37 |
| Distant | 3,976 | 106,508 | 24,067 | 20 | 36 |

All three have the same outer bounds: X `[-0.99, 0.99]`, Y `[-0.425, 1.57]`, Z `[-2.40, 2.22]` m (1.98 m wide × 1.995 m high × 4.62 m long). Exact float values and SHA-256 hashes are in the [inventory](../../packages/content/manifests/licenses/gangster/inventory.json). A complete repeated export reproduced all three GLBs byte for byte. Eighteen previews were generated; representative neutral, night, driving, steering and exploded views were inspected against the stated criteria. Distant geometry remains visibly coarse when enlarged.

Final local types/documentation, asset audit and focused asset checks run before publication. The unchanged pre-push hook runs the full browser/UI/render gate; the session handoff records its actual result. Those repository checks do not substitute for integrating this model with the real renderer and physics adapters.

## Concurrent-main integration

The second local push completed all 90 browser cases and UI/water/audio/helicopter/snow/tire fixtures, then Git rejected publication because main had advanced to `fdc3882` with the independently published helicopter intercept work. The graphics worktree merges that work unchanged, preserving its height metadata, route behavior, native opportunity check and dated evidence. Only documentation conflicts required manual combination. Both isolated lanes used `arcade-v24`; a new real-room regression observed acceptance of that now-incomplete revision. The combined build uses `arcade-v25` and rejects `arcade-v24` peers. Fresh combined validation is recorded in the execution ledger.
