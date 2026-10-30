# Pocket Rocket bubble-car handoff

Updated 2026-10-30. Blender/art lane A. Branch `codex/bubble-asset`, based on fresh `origin/main` at `43f2b529ee4fcd623da47b0efc7de2fbd95185a5`. Status: original asset prepared for integration review. No game-code, shared contract, vehicle-profile, package-manifest, main-branch or deployment changes. The motor pool has acquired a very small car with a very large equipment invoice.

## Delivery and rights

Pocket Rocket is a tiny mint-and-cream bubble car with curved blue glazing, small wheels and optional oversized dark twin guns. The model, source recipe and previews are original project work under GPL-3.0-or-later, with no external asset downloads. [Provenance](../../packages/content/manifests/licenses/bubble/README.md) records human direction and AI assistance; the complete license and editable source accompany it.

Owned paths: `asset-source/bubble/`, `packages/content/runtime/models/bubble/`, `packages/content/manifests/licenses/bubble/`, `tools/assets/bubble/`, this handoff and a narrow contributor credit. FENDER Graphics owns selection/profile registration, renderer integration, ordinary equipment gating, gameplay and physics. Existing vehicle deliveries remain unchanged.

## Integration contract

All three GLBs use meters, right-handed Y-up, nose +Z, identity root `car`. Blender authoring is Z-up/nose -Y; export converts orientation. Root Y=0 is the mid-axle plane, with tyre bottoms at Y=-0.265 m. Suggested renderer road lift is 0.266 m. Preserve the existing shared-coordinate conversion.

Nineteen semantic mesh groups: `body`, `bonnet`, `boot`, `door_left`, `door_right`, `canopy`, `roof`, `fender_left`, `fender_right`, `bumper_front`, `bumper_rear`, `lights_front`, `lights_rear`, `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`, `gun_left`, `gun_right`. Each fender group contains that side's front/rear arches. Canopy includes glazing, lower skirt and pillars; the cream roof cap detaches independently. Body includes the lower shell and undertray. Panels have fragment-center origins, not opening hinges. Expected fragment counts are seventeen unarmed and nineteen armed.

Wheel centers are X=±0.67, Y=0, Z=±0.74 m, identical across LODs. Positive Z is front; negative X is left. Steering rotates local +Y; rolling rotates local +X. Wheel radius is 0.265 m. Suggested cosmetic tyre colliders are X-axis cylinders with radius 0.265 m and half-width 0.09 m.

Gun pivots are X=±0.49, Y=0.68, Z=0.20 m. `muzzle_left`/`muzzle_right` are children of their gun, translated 1.10 m along local +Z with no rotation: world muzzle Z=1.30 m. These deliberately large barrels retain at least 0.8 m length and 0.18 m width in the validator. Both complete guns remain inside the unarmed vehicle's outer bounds.

**Hide `gun_left` and `gun_right` on import until normal equipment rules permit them.** They carry `optionalEquipment: true`; generic GLB viewers show them by default. Cosmetic gun nodes and muzzle points do not change hitboxes, projectile authority, damage or unlock progression.

[Components](../../packages/content/runtime/models/bubble/components.json) records exact bounds, fragment pivots and local box collider centers/extents. These are cosmetic breakup suggestions, not proven physics bodies. Tiny visual dimensions do not authorize changing the game's shared chassis collision rules.

Seven PBR materials: mint enamel, warm cream, nickel, rubber/gunmetal, opaque blue-smoke glass, warm headlamps and ruby tail lamps. No images or external binary dependencies. The clearcoat extension is verified through the real Babylon loader; final appearance in the game lighting remains pending.

## Observed evidence

New validator RED: two focused tests failed because inherited checks accepted ordinary short guns and a stretched sedan. Added length/width limits for oversized equipment and a 1.9 m width/3.0 m length envelope for the tiny car; all seven validator tests now pass. The five inherited checks passed initially; no historical RED is claimed for them.

Actual-export budget RED: initial briefing/driving/distant exports had 20,960/10,440/4,116 triangles, exceeding 20,000/8,000/3,000. Briefing/driving also had 41 material primitives against a cap of 40. Reduced small trim, cooling rings, bevel/cylinder sampling, far details and extra material splits brought the exports within those unchanged limits.

Panel-gap RED: visual review exposed cracks where upper body panels met the lower shell. Three new actual-GLB seam tests failed because angular offsets and the far-LOD sampling produced mismatched edge vertices. Removing those offsets and aligning angular samples made all three pass, without weakening tolerance.

Final focused suite: **26/26 pass**: seven validator tests, sixteen GLB geometry/contract checks and three real Babylon import tests. Import checks use the repository's loader dependency and verify seven assigned PBR materials, clearcoat, all nineteen semantic pivots, forward muzzle positions and complete container disposal. An initial module-resolution failure was test setup, corrected by resolving the renderer's existing dependency; it is not a behavioral RED.

Eighteen offline previews reimport the GLBs in Blender 5.2.2 LTS, Cycles CPU, 40 samples, seed 17, AgX, 1000×700. They cover neutral/rear, briefing/elevated noon/dusk/night armed/unarmed, steering and exploded parts. [Visual criteria and reproduction](../../asset-source/bubble/README.md) remain separate from human approval. Material-primitive counts are structural limits, not measured whole-game draw calls.

Remaining acceptance: actual game-camera views, profile registration, weapon gating, component breakup physics, LOD transitions, human appearance/handling and sustained performance. The direct Babylon loader test does not claim that this car is selectable or driving in the game.

## Measured delivery

| LOD | Triangles | GLB bytes | Gzip bytes | Meshes | Material primitives |
| --- | ---: | ---: | ---: | ---: | ---: |
| Briefing | 19,008 | 443,044 | 139,158 | 19 | 40 |
| Driving | 7,392 | 188,152 | 49,396 | 19 | 40 |
| Distant | 2,620 | 83,908 | 19,147 | 19 | 36 |

Detailed unarmed outer bounds are approximately X `[-0.81, 0.81]`, Y `[-0.265, 1.17]`, Z `[-1.3865, 1.3865]` m: 1.62 m wide × 1.435 m high × 2.773 m long. Exact per-LOD values and source/export hashes are in the [inventory](../../packages/content/manifests/licenses/bubble/inventory.json).

Complete repeated export checks reproduce all three runtime GLBs byte for byte; `.blend` container bytes can vary on save. Representative armed/unarmed, driving, night, steering, distant and exploded previews were visually inspected. Final trim polish replaces segmented canopy edging with smooth continuous rings and removes the uneven lower-body trim line; the geometry/import suite stays green.

Types/documentation and the asset audit run before publication. The unchanged local pre-push hook runs the complete browser/UI/render gate; the session's publication handoff records its actual result. Neither those repository checks nor the offline previews close the outstanding game integration, human review or sustained performance gates.
