# Pocket Rocket provenance

Recorded 2026-10-30. **Original project asset, GPL-3.0-or-later.** [Full license](LICENSE.txt). Preserve the license, editable source and canonical recipe when redistributing under these terms. No third-party asset archive or external media was used.

Stefan Andersson: project direction and request for a tiny bubble car with oversized optional twin guns and detachable parts. OpenAI Codex: AI-assisted original Blender geometry, mint/cream paint and PBR materials, curved canopy, panel segmentation, small wheels, oversized cosmetic guns, LOD preparation, regression/import checks, offline renders and documentation. Existing GPL project geometry helpers and preview/validation scaffolding were adapted; no DB5 or gangster-car model mesh was copied or modified.

Editable source: `asset-source/bubble/bubble-prepared.blend`. Canonical source: `tools/assets/bubble/prepare.py`. The generic design is unbranded and was constructed from mathematical surfaces and Blender primitives. All retained detail uses geometry and PBR factors, including `KHR_materials_clearcoat`; no textures, remote dependencies or procedural shader networks require baking. Glazing is opaque, and no interior or engine is modeled.

[Inventory](inventory.json) records source/export hashes, sizes, LOD counts and limitations. Runtime repeatability is checked independently of Blender container bytes, which can change on save. [Asset README](../../../../../asset-source/bubble/README.md) contains reproduction commands, previews and the visual criteria.
