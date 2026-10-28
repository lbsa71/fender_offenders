# DB5 asset trial

Updated: 2026-10-28. Owner: FENDER Handle Blender work (art lane A). Status: prepared branch-local trial with reproducible exports and offline previews; game integration and appearance acceptance pending. The classic GT has completed its garage inspection, with road approval still outstanding.

Branch `codex/db5-asset`, based on fresh `origin/main` at `ef7a739c29a2da6fbacbf04bf38a0d223081144a`. The completed helicopter branch and commit `c569eb2` remain separate and unchanged. No merge or deployment is part of this task.

## Source and license boundary

User-supplied `Aston Martin DB5.zip`, 3,223,420 bytes; verified SHA-256 `24cafbc2a778132a3d7645a0362bf39ebf075ddefe47157e984c506155327238`. Contents: `db5 BS.blend`, 8,736,732 bytes, and `BLENDSWAP_LICENSE.txt`, 3,286 bytes. Creator **natman**; [current source page](https://blendswap.com/blend/8754); archive source URL `http://www.blendswap.com/blends/view/67582`.

The supplied license declares Creative Commons Attribution 3.0 and **also explicitly prohibits commercial use because the model is fan art**. Preserve the exact original license and natman attribution. Preparation is for the user's stated **noncommercial hobby use**. The third-party model is not relabeled GPL, CC0, unrestricted or cleared for commercial use. GPL repository code does not remove this asset restriction, including if badges are removed. Any additional conflicting source terms or source problems will be recorded before further work.

Open the third-party `.blend` with automatic script execution disabled. Inspect source geometry, constraints, material dependencies and embedded texts before conversion.

## Owned paths and intended contract

Own `asset-source/db5/`, `packages/content/runtime/models/db5/`, `packages/content/manifests/licenses/db5/`, `tools/assets/db5/`, this handoff and a narrow contributor credit. FENDER Graphics owns renderer/gameplay/selection/weapon progression and physics. Do not change production game code, shared contracts, package manifests or dependencies here.

Prepare one silver classic GT: detailed briefing exterior, driving LOD and distant LOD where viable; preserve curved body silhouette, separate wheels, detachable panel groups and optional twin grille guns on the same car assembly. Planned GLB contract: meters, right-handed, Y up, nose +Z; root `car`; axle-center `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`; `gun_left`, `gun_right`, `muzzle_left`, `muzzle_right`; exact body groups/pivots to be finalized after source inspection. Guns are cosmetic equipment and cannot expand the chassis hit footprint or bypass normal unlock rules.

## Acceptance and evidence

Record source hashes, exact license, modifications, per-LOD triangles/primitives/materials/textures/bytes, actual bounds, axes and component colliders. Keep detailed editable source outside runtime. Render neutral/elevated and close briefing views, noon/dusk/night, armed/unarmed, steering and exploded parts. Report repeated export evidence. Shader conversion must use glTF-exportable PBR or documented baked maps; no claim that old Cycles nodes survive export.

New tooling behavior requires observed focused RED/GREEN. Modeling/material work requires reproducible visual criteria. Actual in-game camera/performance/physics tests and human appearance approval stay pending with FENDER Graphics. No broader fleet conversion is assigned.

## Delivered files and measured export

The initial ownership declaration was committed as `0480b78`; it was documentation-only and needed no behavioral red phase. The completed package adds:

- [Editable source and reproduction instructions](../../asset-source/db5/README.md), the untouched original ZIP, a prepared exterior `.blend`, and eighteen JPEG previews with capture settings.
- [Runtime component contract](../../packages/content/runtime/models/db5/components.json) and `db5-briefing.glb`, `db5-driving.glb`, `db5-distant.glb` in the same directory.
- [Exact source license and provenance](../../packages/content/manifests/licenses/db5/README.md) and [hashed inventory](../../packages/content/manifests/licenses/db5/inventory.json). `.gitattributes` preserves the original license bytes.
- `tools/assets/db5/prepare.py`, `render.py`, `validate.mjs`, `validate.test.mjs` and `export.test.mjs`; narrowly scoped artist/AI credit in `CONTRIBUTORS.md`.

| LOD | Triangles | GLB bytes | Gzip bytes | Meshes | Material primitives |
| --- | ---: | ---: | ---: | ---: | ---: |
| Briefing | 59,316 | 1,356,168 | 898,421 | 16 | 37 |
| Driving | 14,879 | 390,572 | 247,310 | 16 | 37 |
| Distant | 3,983 | 145,616 | 76,127 | 16 | 37 |

Each export has six PBR materials and no images or external texture dependencies. Paint uses `KHR_materials_clearcoat`; importer support must be checked. Glazing is opaque and tinted. Hidden engine/interior, studio scene, badge/plate/tyre images and original Cycles networks are excluded; the original archive preserves them. Retained detail uses geometry and PBR factors, so no texture bake was required. Material primitives are inventory counts, not measured draw-call or performance results.

## Integration contract

The root `car` is identity, in meters, right-handed Y-up, nose +Z. Original Blender coordinates are scaled by 0.168 around source `(0, -1.225, -1.815)` then converted through the exporter. The root represents the mid-axle chassis plane, not ground contact: tyres extend roughly 0.313 m below it. Detailed unarmed bounds are approximately X `[-0.820, 0.818]`, Y `[-0.311, 0.999]`, Z `[-2.484, 2.049]`; exact per-LOD bounds are in the component contract. Preserve the renderer's existing shared-coordinate conversion.

Sixteen independent mesh groups are `body`, `bonnet`, `boot`, `door_left`, `door_right`, `bumper_front`, `bumper_rear`, `grille`, `lights_front`, `lights_rear`, `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`, `gun_left`, `gun_right`. Roof, fenders, glazing, mirrors and undertray belong to `body`. Panels have centered fragment pivots rather than opening-door hinges. Separate wheels have axle-center origins that are identical across LODs; steering is local +Y and rolling is local +X. Left nodes use negative X.

`muzzle_left` and `muzzle_right` are children of their corresponding guns, translated 0.23 m along local +Z with no rotation. Gun pivots and muzzle positions match across LODs. Both barrels remain inside the unarmed assembly's bounds. Gun meshes carry `optionalEquipment: true`; **hide both on import until ordinary equipment rules permit them**. Generic GLB viewers show them by default. These nodes do not grant weapons or alter progression, fire authority or chassis collision.

The component JSON supplies local box centers/half-extents for panels and suggested X-axis cylindrical tyre colliders (radius 0.311 m, half-width 0.095 m). These are cosmetic breakup suggestions for integration, not tested physics bodies. Keep gameplay chassis collision under the existing vehicle profile. No renderer, gameplay, shared contracts, dependency manifests or production physics code changed.

## Observed checks, 2026-10-28

The tooling red phases were observed before their corresponding implementation fixes:

1. Semantic validator: three focused tests failed because the initial validator did not reject a missing separate wheel, mandatory/backwards guns, or missing rights/over-budget geometry. Implementing the checks made all four validator tests pass.
2. Actual GLB surface winding: all three LOD checks found inward shading normals (including a dot product near -0.619). Transforming source normals correctly, triangulating, orienting transferred normals outward and removing unstable slivers made these checks pass.
3. Actual GLB component bounds: driving/distant grille metadata differed from exported bounds by about 0.000057 m because loose vertices were included in metadata but excluded by export. Removing vertices with no faces made the geometry/metadata checks pass. A separate exact-float muzzle assertion was corrected to a 1e-6 tolerance for float32 representation; that test correction is not a behavioral red phase.

Final focused run: **14/14 tests passed** across finite unit normals, winding, node transforms, optional gun containment, component metadata, stable axle positions and validator rejection cases. The CLI validator also passed the 60,000/15,000/4,000 triangle budgets. A complete repeated Blender export produced identical SHA-256 hashes for all three GLBs; inventory records those hashes. Prepared `.blend` container bytes may vary on save.

All eighteen previews were generated by reimporting the GLBs in Blender 5.2.2 LTS: Cycles CPU, 40 samples, seed 17, AgX, 1000×700. Neutral, rear, briefing/elevated noon/dusk/night, armed/unarmed, 28-degree front steering and exploded states are reproducible from `render.py`. Visual inspection confirms the recognizable outline, silver/chrome/rubber/glazing separation and independent parts. Driving geometry still shows faceting in close reflective views; use the briefing LOD for close-ups. Distant geometry is deliberately coarse and needs small-screen-coverage review. LOD switch distances remain an integration decision.

The initial declaration push passed the required local E2E gate: 84 browser tests passed, one opt-in GPU test skipped, and UI/water/audio/helicopter/snow/tyre fixtures passed. This is dated baseline evidence, not a claim that offline assets have passed game integration. The final delivery push runs the unchanged hook again; publication result is recorded in the session handoff.

## Remaining acceptance

FENDER Graphics owns importer/material verification, actual briefing/driving cameras, equipment visibility/unlock wiring, debris physics, LOD transitions and sustained performance. Human appearance approval remains pending. There is no main merge, deployed change, broader fleet conversion, commercial clearance or release sign-off in this art trial.
