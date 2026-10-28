# Helicopter asset trial

Updated: 2026-10-28. Owner: FENDER Handle Blender work (art lane A). Status: source evaluation; no asset accepted yet.

Base: `ef7a739c29a2da6fbacbf04bf38a0d223081144a` from fresh `origin/main`. Branch: `codex/helicopter-asset`. Deliver through reviewable commits and pushes; no merge or deployment. The rotor shop has its own parking bay.

## Scope and ownership

Prepare one black/dark charcoal stylized helicopter with shaped glazing, readable silhouette, separate main/tail rotor pivots and meaningful detachable components. Own `asset-source/helicopter/`, `packages/content/runtime/models/helicopter/`, `packages/content/manifests/licenses/helicopter/`, `tools/assets/helicopter/`, this handoff and a narrowly scoped contributor credit. FENDER Graphics owns renderer integration, gameplay-camera tests and physics. No production renderer/gameplay/network files or shared manifests/contracts are assigned here.

Evaluate at most two promising sources. First: [KumaSousa animated helicopter](https://kumasousa.itch.io/low-poly-helicopter-with-animations), creator-labelled CC0 and Blender-authored FBX. Actual archive, hierarchy and visual quality pending. A second source is only needed if this fails suitability. Do not fight account/download walls.

## Acceptance and handoff

- Export GLB in meters, Y-up, nose +Z; document root, bounds, hierarchy, rotor axes, handedness and detachable origins/collider suggestions.
- Keep intact parts exactly aligned. Preserve editable source or a reproducible acquisition/preparation route.
- Record creator, source, exact license evidence, hashes, acquisition date and modifications.
- Render intact, rotor-motion and exploded views, plus elevated noon/dusk/night readability previews.
- Record triangle/mesh/material/texture counts and bytes. Runtime silhouette, breakup behavior, actual camera/performance and human approval remain integration acceptance.
- Strict observed RED/GREEN for new tooling behavior; visual-only changes use explicit criteria and reproducible renders.

## File inventory and evidence

Initial inventory: `spec/handoffs/HELICOPTER_ASSET.md` only. This is a documentation-only ownership declaration; no behavioral red phase is required. Documentation and pre-push checks will be recorded after execution. No source or runtime acceptance is claimed.

## Shared requests / blockers

None yet. The existing helicopter's approximate rotor diameter 9 m, width 3 m, length 10 m and altitude 18 m are integration reference values, not a request to alter hit rules. Source storage policy remains bounded to this trial.
