# Gangster sedan provenance

Recorded 2026-10-28. **Original project asset, GPL-3.0-or-later.** [License text](LICENSE.txt). Public repository redistribution is permitted under that license's terms; preserve the license and corresponding editable source/recipe. No third-party vehicle asset or media is included in this delivery.

## Source decision

The suggested primary source was [Ford Model A by lovelyfish75](https://blendswap.com/blend/19487), found through [BlendSwap's car listing](https://blendswap.com/3d/car/10). The model page displayed CC-BY and Fan Art. Its [download page](https://blendswap.com/blend/19487/download) required sign-in. No archive was obtained, so its exact archive license could not be verified. No mirrors, guessed download endpoints or access bypasses were used. No claim is made that this uninspected archive satisfies the requested redistribution scope.

Following the authorized bounded fallback, this delivery uses newly authored, generic period-car geometry. The source listing is recorded only to explain the rejected download route. It supplies no geometry, texture, blueprint or copied image in the model. This is not a Ford replica or an adaptation of lovelyfish75's model; lovelyfish75 is credited for the researched listing, not as creator of the delivered asset.

## Creation and modifications

Stefan Andersson: project direction and requested gangster-car theme. OpenAI Codex: AI-assisted original Blender construction, black/nickel/rubber/glazing/lamp PBR materials, swept fender geometry, spoked wheels, detachable panel assembly, optional cosmetic grille guns, LOD recipes, semantic/export tests, offline renders and this documentation. Existing project GPL preview and GLB-inspection helpers were adapted; no DB5 or helicopter model geometry was copied or changed.

The editable source is `asset-source/gangster/gangster-prepared.blend`. The canonical generator is `tools/assets/gangster/prepare.py`. All retained detail is geometry plus standard metallic/roughness factors and `KHR_materials_clearcoat`; there are no texture images, external image dependencies, unsupported procedural shader networks or texture-bake claims. Source scripts are run with Blender automatic script execution disabled.

[Inventory](inventory.json) records measured sizes, hashes, triangle/material-primitive counts and toolchain. Blender container bytes may change on save; repeated runtime GLB hashes are checked separately. [Asset README](../../../../../asset-source/gangster/README.md) provides reproduction commands. Preserve this attribution and license with redistributed source and exports.
