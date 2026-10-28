# Helicopter asset trial

Updated: **2026-10-28**. Owner: **FENDER Handle Blender work**, art lane A. Status: **prepared for graphics integration review; not shipping**. The rotor shop has filed its ten-piece incident report.

Base: `ef7a739c29a2da6fbacbf04bf38a0d223081144a` from fresh `origin/main`. Branch: `codex/helicopter-asset`. Initial ownership declaration: `346425e`. No merge or deployment is authorized by this trial. The broader graphics-polish goal remains paused.

## Scope, ownership and source decision

Prepared one black/dark charcoal stylized helicopter from **KumaSousa's** artist-made [animated helicopter](https://kumasousa.itch.io/low-poly-helicopter-with-animations). Inspected the actual FBX, palette, armature, three source clips and an offline source render. Its shaped cockpit, tapered fuselage and readable tail were suitable; only this one candidate was inspected. No download/account wall was encountered.

Owned paths: `asset-source/helicopter/`, `packages/content/runtime/models/helicopter/`, `packages/content/manifests/licenses/helicopter/`, `tools/assets/helicopter/`, this note and one contributor credit. **FENDER Graphics owns renderer integration, gameplay-camera tests and local breakup physics.** No production renderer/gameplay/network files, root dependencies, shared manifests or contracts were changed.

The source page states CC0 but supplies no version number or license file in the ZIP. The [provenance record](../../packages/content/manifests/licenses/helicopter/README.md) preserves that distinction, exact archive/file hashes, creator credit, acquisition date and a separately acquired canonical CC0 1.0 text. Source authorship and AI-assisted modifications are credited separately.

## Deliverables and inventory

| Path | Contents |
| --- | --- |
| [Runtime GLB](../../packages/content/runtime/models/helicopter/helicopter.glb) | Ten meshes, intact alignment, named rotor clips, four PBR materials, no textures |
| [Component metadata](../../packages/content/runtime/models/helicopter/components.json) | Root/orientation/bounds, exact local pivots, suggested box centers/extents, axes and limitations |
| [Editable Blender source](../../asset-source/helicopter/helicopter.blend) | Small compressed Blender 5.2.2 scene containing the prepared asset |
| [Pinned source ZIP](../../asset-source/helicopter/KumaSousa-Helicopter.zip) | Original artist FBX and 32 x 1024 palette; 63,941 bytes |
| [Reproduction instructions](../../asset-source/helicopter/README.md) | Exact Blender, validation and GIF commands |
| [Preparation recipe](../../tools/assets/helicopter/prepare.py) | Source import, material conversion, capped cuts, skids, centered parts and export |
| [Preview recipe](../../tools/assets/helicopter/render.py) | Reimports the output GLB; fixed camera/lighting, intact/exploded/motion captures |
| [Validator](../../tools/assets/helicopter/validate.mjs) | Named independently animated rotors, scale and triangle-budget checks |
| [Validator tests](../../tools/assets/helicopter/validate.test.mjs) / [export tests](../../tools/assets/helicopter/export.test.mjs) | Six focused tests, including real GLB bounds/pivots and sampled animation |
| [Provenance and metrics](../../packages/content/manifests/licenses/helicopter/inventory.json) | Exact runtime/source hashes, sizes, counts and license qualification |
| [License text](../../packages/content/manifests/licenses/helicopter/CC0-1.0.txt) | Canonical reference, acquired separately from Creative Commons |
| [Capture settings](../../asset-source/helicopter/previews/capture.json) | Blender version, camera, resolution, seed, lighting and offline-stage limits |
| [Noon](../../asset-source/helicopter/previews/noon.png), [dusk](../../asset-source/helicopter/previews/dusk.png), [night](../../asset-source/helicopter/previews/night.png) | Same elevated camera, 960 x 720 |
| [Exploded](../../asset-source/helicopter/previews/exploded.png), [rotor motion](../../asset-source/helicopter/previews/rotors.gif) | Ten aligned source components separated for review; deliberately slowed pivot demonstration |

The small source `.gitignore` excludes Blender backups and reproducible intermediate rotor PNGs. `CONTRIBUTORS.md` adds the artist and AI-assistance credit. There are no other delivery files; ignored `work/helicopter/` contains local exploration and transient build evidence.

## Model and renderer handoff

Exported coordinates are **meters, right-handed, Y-up, nose +Z**. Blender authoring uses Z-up and nose -Y. The exporter performs the proper rotation `(x,y,z) -> (x,z,-y)`; no mirrored scales or per-component compensating flips are required. Root node **`helicopter`** is identity, centered at the source cabin point `(0,-0.5,1.3)` before uniform scale `0.72`; it is not a ground-contact origin.

At rest, exported bounds are approximately **min (-4.396822, -1.184400, -5.552041), max (4.396822, 1.588963, 4.395624)**: 8.794 m wide, 2.773 m high and 9.948 m long including rotors. The airframe itself is approximately 3.741 m wide and 8.068 m long. These are model dimensions, not gameplay hit dimensions. The existing altitude 18 m and authoritative hit rules are unchanged.

The root directly owns these ten mesh nodes:

- `cockpit`, `cabin`
- `tail_boom`, `tail_fin`
- `wing_left`, `wing_right`
- `skid_left`, `skid_right`
- `rotor_main`, `rotor_tail`

Each body's origin is its local bounding-box center. Main-rotor origin uses the shaft axis; its box center is consequently offset. All world positions remain intact through centering. Body cuts have hard, capped interior surfaces. Small fuselage trim islands stay attached to the cabin instead of floating with detached wings.

`rotor_main` rotates about local **+Y**, at approximately `(0,0.856800,-0.001198)`. `rotor_tail` rotates about local **+X**, at approximately `(0.112560,0.734289,-5.144867)`. Both clips have exactly the mesh name and run from **0 to 1 second**, one positive full revolution with linear angular velocity. Start both looping or drive each node independently at chosen runtime angular rates. Do not play the clips and manually rotate the same node simultaneously. The GIF demonstrates one main and two tail turns, slowed for inspection; it is not an operational-speed prescription.

For breakup, preserve each component's world transform before reparenting, then use the local center and half-extents in `components.json` as **suggested cosmetic debris boxes**. Stop rotor animation ownership on released parts. The skids and rotors have substantial empty space inside their AABBs; use compounds or selected box pieces if realistic settling requires them. Caps are coplanar while assembled. The ten-piece decomposition is bounded; no Blender physics simulation is included or proposed as gameplay authority.

## Budgets and acceptance

Final GLB: **105,416 bytes**, **28,867 bytes gzip**, **1,800 triangles**, **10 meshes**, **20 glTF primitives**, **4 materials**, **0 runtime textures**, **2 clips**. Editable `.blend`: about **142 KB**. Original palette: 32 x 1024, removed from the runtime. Runtime SHA-256: `c1c7de73e1606c7903bde0caa967837f4ab19c79073ace7861b684762e1cab12`.

The triangle count is below the repository's starting vehicle range; there are three main materials plus the small ochre rotor-tip accent. Twenty primitives can mean twenty draws before instancing/batching/shadows. This is a disclosed cost, not a measured performance approval. No LOD or compressed mesh extension is used.

Visual acceptance applied: coherent charcoal silhouette, blue-gray shaped glazing, recognizable tail/skids/rotors at the elevated view, aligned intact seams, no unrelated floating pieces in the exploded view, and readable noon/dusk/night separation. Inspected all lighting views, the exploded render and rotor phases. Corrected smooth-normal artifacts on cut caps and removed unrelated trim from wing fragments. The friendly proportions remain, with a more deliberate military-helicopter shape than the procedural box assembly.

The preview recipe uses Cycles/AgX, a fixed orthographic camera `(12,-17,13)` looking at `(0,1,0)`, 14.5 m span, and a review asphalt plane at -2.5 m. These are **offline reimported-GLB art checks**, not actual altitude-18 gameplay captures. Human appearance approval remains open.

## Observed checks and TDD evidence

- **RED, validator:** `node --test tools/assets/helicopter/validate.test.mjs` initially ran successfully as a test harness, with 1 passing case and 3 intended assertion failures. The scaffold accepted a missing main-rotor mesh, mirrored/over-budget export, and a tail channel that moved the cabin. Implemented validation; all 4 tests passed.
- **RED, real export:** `node --test tools/assets/helicopter/export.test.mjs` passed the ten-part pivot/bounds check but failed because the actual rotor clip began at **0.0416666679 s**, not 0. Fixed the authoring frame range to 0..24 at 24 fps and set linear key interpolation. Both actual-GLB tests then passed, including the sampled angular-rate checks on both axes.
- **GREEN:** all **6** focused validator/export tests; standalone export validator; `pnpm check` (types, documentation links, 49 task dependencies and simulation boundaries); `pnpm assets:check` (existing authored content/audio audit). The latter is not represented as a GLB validator.
- **Reproduction:** reran the pinned-source preparation and obtained the identical runtime GLB SHA-256. `.blend` container bytes can change between saves; runtime bytes reproduced exactly.
- **Visual:** Blender 5.2.2 LTS rendered the final GLB at noon/dusk/night, exploded, and twelve rotor phases; FFmpeg assembled the GIF. No behavioral RED is claimed for subjective modeling/material choices or documentation.
- **Initial handoff publication:** the unmodified pre-push hook passed build, **84 browser tests / 1 opt-in GPU test skipped**, UI fixtures, water, audio, helicopter, snow and tire checks before publishing `346425e`. These verify the baseline game; the new model is not wired into it. Each subsequent push remains subject to that same full hook, without bypass.

## Requested integration work and remaining limits

FENDER Graphics should register/use the project's chosen glTF loader, import the asset through the renderer's normal lifetime, and review root orientation/scale at the actual driving camera. Any loader dependency addition remains F-owned; this branch makes no package request implicitly. Confirm intact display and both rotor axes, then wire ten local fragments on authoritative downing while retaining the existing terminal state, gameplay hit shape and cleanup/reduced-motion rules.

Required before acceptance: actual noon/dusk/night game captures, small-screen readability, active rotor clearance, physically plausible fragment colliders/launches, no fragment leaks on retry/disposal, draw/frame/memory measurement and human appearance approval. The sparse collider suggestions have not been exercised in Rapier. No gameplay, deployment, release or broader graphics-polish gate is closed by this delivery.
