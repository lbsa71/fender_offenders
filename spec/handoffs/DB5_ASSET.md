# DB5 asset trial

Updated: 2026-10-28. Owner: FENDER Handle Blender work (art lane A). Status: source inspection; no runtime asset accepted. The classic GT has arrived for its inspection.

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

Initial file inventory: this handoff only. This declaration is documentation-only; no behavioral red phase was required. Source inspection and delivery checks will be recorded as they occur.
