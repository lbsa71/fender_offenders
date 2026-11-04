# Pocket Rocket game integration

Updated: 2026-11-04. Graphics/game lane, branch `codex/pocket-rocket`, based on current main `a582e5e`. Art delivery `7b83b6e` was imported without changing the model source, exports or original license. The motor pool has issued tiny keys and a normal-sized insurance form.

## Current behavior

Pocket Rocket (`bubble`) is the ninth selectable vehicle. Its shared profile has 70 health, 26 m/s top speed, 20 m/s² acceleration, 2.7 rad/s steering and 11.5 grip. It trades armor for tight handling. The original eight profiles, chassis collision dimensions, weapon damage, cooldowns, protection and eight-player room limit remain unchanged. Client/server builds pair at `arcade-v27`; protocol 5 and map `sunset-borough-3` are unchanged.

The normal picker, saved assignment, authority/prediction and unit stats use the profile. Its optional oversized guns are hidden in the opener and appear at the normal police gun unlock in dispatch three. No custom weapon or equipment shortcut is introduced. Shared audio recordings give it a light 1.35-pitch/1.2-brightness engine voice without additional loops.

The briefing uses the 19,008-triangle GLB; nearby driving uses 7,392 triangles. Remote Pocket Rockets switch to the 2,620-triangle distant GLB beyond 90 metres from the view target and return within 70 metres, avoiding boundary flicker. The local car always retains driving geometry. The two other modeled vehicles retain their existing detail selection. Caches are per factory/body/detail, including late-load cleanup. Exact physical breakup always uses driving components, independently of visible LOD.

Wheel radius is 0.265 m and road lift 0.266 m. Four authored axle pivots steer around local +Y and roll around local +X. Cosmetic muzzles are X ±0.49, Y 0.946, Z 1.30 m after lift; projectile authority remains unchanged. Breakup has 17 unarmed / 19 armed components, four physically launched tires and normal bounded expiry/cleanup. The charred visual scales to the small footprint; it does not change the shared chassis collider.

## Observed RED and GREEN

- Registration/import RED: Pocket Rocket was rejected by the catalog and the factory stayed idle instead of loading its model (`work/pocket-core-red.log`). Shared registration and the real GLB loader make the checks pass.
- LOD RED: the existing cache returned driving geometry when distant geometry was requested (`work/pocket-lod-red.log`); the actual renderer also retained 7,392 triangles for the distant car (`work/pocket-native-red.log`). Separate caches and hysteretic remote selection now produce 7,392/2,620 triangles as intended.
- Recorded-audio RED: the accepted new profile had no sampled-engine tuning (`work/pocket-recorded-audio-red.log`). All nine bodies now have distinct tuning with the original five-loop cap. An earlier oscillator-only test targeted the synthesized fallback rather than recorded tuning and is not claimed as a behavioral RED.
- Recoil RED: initial tuning made held fire too cheap: 25.14 m/s mean versus a required upper bound of 23.8 (`work/pocket-headless-first.log`). Retuned only Pocket Rocket to preserve the existing greater-than-15-percent speed penalty and weighted profile balance (`work/pocket-recoil-green.log`); no recoil assertion or common weapon rule changed.
- Charred-visual RED: the common cosmetic chassis exceeded the tiny footprint (`work/pocket-charred-red.log`). Instance-only scaling now keeps it within the authored width/length. No authority/physics chassis shape changed.

Current checks: **1,106 headless tests / 104 files pass** (25.69 s), 26 delivered asset checks pass, type/documentation and asset audits pass. Three real-app browser checks pass in 24.5 seconds: direct selection, actual stats, saved assignment, movement, and correct guns in dispatches 1/3/9, including narrow snow driving. Real prediction-facade selection also preserves `bubble` and 70 health.

The native check records **892 independent body pixels** with shadows excluded, no captured GL warnings/page errors, the two distance-detail budgets, armed/unarmed briefings, 19 physical pieces and four differently launched tires. Expiry leaves zero wreck bodies/wheels, and renderer disposal leaves zero meshes. Evidence is under `work/pocket-native-complete`; UI captures copied there are `app-briefing-unarmed.png`, `app-briefing-armed.png` and `app-snow-driving.png`.

The delivered assets' 26 checks and source provenance are preserved in [the art handoff](BUBBLE_ASSET.md). Blender export reproducibility remains the art lane's dated evidence; this integration did not rerun Blender.

## Reproduce and remaining review

Run `pnpm test:bubble` for the delivered-asset and native render/LOD/breakup checks. Run `pnpm exec playwright test tests/e2e/garage.spec.ts --grep "Pocket Rocket"` for the real client/server cases. The local pre-push E2E command includes both these routes. Browser/server ports can be isolated through the existing `FENDER_E2E_CLIENT_PORT` / `FENDER_E2E_SERVER_PORT` options.

Human appearance/handling review, the full publication gate, CI and hosted verification remain pending at this checkpoint. Optional timing diagnostics do not reinstate the owner-retired target/minimum-device hardware gates. No preview or passing narrow check closes the broad release gates.
