# Small blocks, excellent lighting

Status: atmosphere foundation implemented with native captures and app checks; water/light-detail/surface finish and integrated acceptance remain open. Updated: 2026-10-24. [The execution ledger](EXECUTION_STATUS.md#dispatch-atmosphere-foundation) records observed RED/GREEN evidence.

Keep the Minecraft/Lego-like miniature city: chunky silhouettes, simple forms, friendly colors and cars that come apart into their actual pieces. Add richness through light, atmosphere and surfaces. The traffic bureau has approved a better lighting budget. It has not approved photorealistic potholes.

This expands existing R03/R05, A02–A04 and Q02/Q05 work in [the implementation plan](../IMPLEMENTATION_PLAN.md); it does not add a new gameplay milestone or close release gates. R owns rendering and native fixtures, A owns dressing/provenance, F owns app/contract composition, and Q owns integration/performance evidence. Work sequentially unless separate owners explicitly coordinate shared paths.

## Sequence and completion criteria

| Step | Scope and dependencies | Completion evidence |
| --- | --- | --- |
| Atmosphere foundation | First: authored noon/dusk/night profiles; directional sun/moon, colored ambient fill, distance fog, existing filtered sun shadows, bounded street spotlights from actual upright lamp props. F wires the same authoritative dispatch selection in practice and online. | Native gameplay-distance captures of all three profiles; deterministic theme/nearest-lamp/cap/lifecycle tests; actual practice/online app check. Nearby road edges, targets and projectiles remain readable. No clock-driven day/night cycle or new wire fields. |
| Water and wet surfaces | After atmosphere: small curb puddles, a park pond and one decorative pool. Use authored locations outside spawns, building footprints, pedestrian routes and shortcut lanes. Shallow puddles remain drive-through cosmetics with unchanged grip; deep-looking water requires an agreed collision/route treatment before placement. | Dry/wet captures at noon/dusk/night and moving-camera shimmer check; map overlay proves clear routes/spawns; cheap low fallback. Begin with shared PBR water, Fresnel edge response and slow broad ripples. Evaluate one bounded shared reflection pass on high only after measuring it. No per-puddle render targets. |
| Light detail and flares | After atmosphere: warm lamp/window emission, selective car headlight cones, restrained source-attached glints and bloom. Flares must be occluded by buildings and disappear when the source leaves view; avoid full-screen streaks and repeated sparkle. | Moving-camera/occlusion captures, source/camera edge tests, light/effect pool caps, garage/respawn/leave cleanup, reduced-flash and reduced-motion checks. Keep at most one shadow-casting directional light. Extra headlights must fit the local-light budget or replace existing slots. |
| Surface and shadow finish | After the first themed slice: selective paint/glass response, subtle roughness differences between road, dirt, curb and water; contact shading and stable directional shadows. Evaluate bevels/AO only where visible at gameplay distance. | Same-angle before/after captures; no halos, crushed night blacks, detached shadows, acne or noisy road texture; actual caster/collision alignment. AO/reflections remain optional if their measured cost is excessive. |
| Integrated acceptance | After the previous steps: eight-player-equivalent action with traffic, all themes, water, gunfire, grenades and full component wrecks; actual online dispatch changes and reconnect. | Five-minute named-device traces, frame interval/CPU/GPU/draw calls/transfer and ten-rematch memory evidence; browser/backend/accessibility checks; owner visual review. Preserve [quality gates](QUALITY_AND_OPERATIONS.md), including minimum-device low and target-device p95. |

Each code step starts with an observed behavioral RED and ends with affected integrations green. Subjective changes also state the intended visual result before rendering. A pretty screenshot cannot sign its own acceptance form.

## Authored dispatch schedule

Themes describe separate operations, not ten consecutive minutes on one evening. Apply the theme from the current shared dispatch during briefing, countdown, play and results. Reconnect and late join select the same profile without replaying lighting transitions; leaving/rematching resets to the appropriate opening theme. Never derive time of day from a client's wall clock.

| Dispatch | Theme | Treatment |
| --- | --- | --- |
| 01 · A Small Withdrawal | Noon | Clear mint sky, warm cream sun, short readable shadows |
| 02 · Clamp Down | Noon | Same clear baseline for the first armored target |
| 03 · Duplicate Trouble | Dusk | Peach haze, warm low key light, cool shaded faces |
| 04 · Express Distress | Dusk | Golden streets with lamps beginning to glow |
| 05 · Stamp Duty | Night | Blue moon fill and warm pools of street light |
| 06 · A Very False Alarm | Noon | A fresh daylight operation; sirens supply the drama |
| 07 · Cone of Silence | Dusk | Warm/cool contrast keeps the olive target readable |
| 08 · Premium Care | Night | Warm street lights against the white ambulance |
| 09 · The Paper Chase | Dusk | Sunset colors for the last courier |
| 10 · Everybody Gets Green | Night | Final operation under blue moonlight; no dark-road difficulty modifier |

Noncampaign/unknown dispatches use the noon baseline. Lighting is presentation only: visibility rules, collision, grip, health, targeting, damage and scoring stay authoritative and unchanged.

## Quality and accessibility contract

| Feature | Low | Medium | High |
| --- | --- | --- | --- |
| Theme, sky, ambient and distance fog | Full authored palette; readable roads | Same | Same |
| Directional shadows | Disabled | Existing filtered directional map | Existing filtered directional map; refine only with evidence |
| Local street spotlights, first slice | 0; retain ambient visibility and emissive bulbs | At most 1 nearby upright lamp | At most 2 nearby upright lamps |
| Wet surfaces, planned | Simple opaque/specular surface | Shared ripples/specular; no reflection pass initially | Evaluate one capped reflection pass |
| Flares/bloom, planned | Disabled | Restrained optional source glints | Restrained optional glints/bloom, with occlusion |

Reduced flash suppresses flares/glints and bloom pulses; fixed ambient light and steady lamp illumination stay available. Reduced motion freezes decorative water animation and removes unnecessary lighting transitions. No strobing street lights, exposure pumping, compulsory lens dirt, depth-of-field blur or motion blur. The garage retains its separate studio lighting.

The first slice reuses two spotlight objects across dispatches. A fallen/removed lamp cannot leave a light floating in place. Night must remain playable with zero local spotlights. Dynamic shadow maps, full-screen effects and reflections must be measured together with the new 40–58-piece wrecks, rather than receiving independent imaginary frame budgets.

## Reproduce and record

Start `pnpm exec tsx packages/renderer/scenarios/server.ts`, then run `pnpm exec tsx packages/renderer/scenarios/environment-check.ts work/dispatch-environments`. The native fixture writes same-camera noon/dusk/night captures and JSON evidence including browser version, quality and scene statistics. Use installed Playwright Chromium, or `CHROME_PATH` for a system Chromium executable. Inspect actual gameplay distance before any optional close-up.

Acceptance for the first slice: retain chunky car/building silhouettes; noon is fresh, dusk is warm with cool fill, night is blue with visible roads and localized warm lamp pools. Distant haze adds depth without hiding nearby intersections. Confirm zero page errors, bounded resource counts after repeated dispatch/quality changes, no lights for absent/fallen lamps, and full disposal. Fixture captures establish that controlled scene only; human visual approval and sustained hardware performance remain open.
