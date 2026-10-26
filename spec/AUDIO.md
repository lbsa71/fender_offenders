# Gameplay sound effects

Status: complete gameplay cue pass, 2026-10-26. Listening approval and the wider device/browser matrix remain open.

*Dispatch has replaced the doorbell orchestra with an actual motor pool.*

## Scope and ownership

This extends R04/R05 and A01/A04/Q07. One contributor owns R playback/scenarios, A sourcing/build recipe, F app input/scripts and Q acceptance sequentially. No network, physics, gameplay or dependency version changes are required. Every existing gameplay cue uses the authored bank once loaded. Oil and blade deployments now have cues. Six engine tunings share two source recordings; these are not six separately recorded vehicles. Remote engine loops, music and additional UI cues remain outside this pass.

The 38-clip, 1,775,752-byte bank combines CC0 engine/foley recordings with original layers. [Provenance and storage policy](../packages/content/manifests/licenses/audio/README.md) distinguish sources, derivatives and project code. Vite emits the runtime URLs from `audio-bank.ts`; production serves the assets from the game itself. Source archives never enter the client build.

## Current playback

- Intentional activation creates one AudioContext and loads/decodes the bank once. Five loops stay alive at zero gain when inactive: idle engine, loaded engine, tire friction, road texture and siren. Updates change gain/rate/filter values without restarting recordings. Original synthesis covers loading/failure; late downloads never replay old events or revive a disposed context.
- Local input is reused from the existing tick without sampling twice or consuming edge actions. Throttle/reverse load changes engine blend and brightness; speed changes pitch. Fixture callers without input use bounded acceleration, reset at vehicle/life changes. This is an arcade engine model, not simulated RPM/gears.
- Rear lateral slip derives from rendered velocity, yaw and yaw rate. Moving slip controls tire friction; straight driving and stationary steering are silent. Dirt/grass increase rolling texture and reduce paved tire squeal. Audio changes no tire forces or surface authority.
- Collisions have three intensities with three variants each; shots/hits have three each, wrecks two. Immediate repeats are avoided with bounded pitch variation. Metal/glass and bass/body layers replace electronic crash/wreck tails. Grenade throws combine pin/metal and air; landings double-bounce; fuse warnings sizzle and crackle; blasts combine a pressure wave with debris. Suspension uses damped spring modes and rubber friction. Those six families have two variants each.
- Oil discharge uses liquid/valve layers; blades extend with a scrape and locking clatter, each with two variants. Snapshot-derived cues play once at oil release or blade activation, within six presentation ticks; late reconstructions, expired gadgets and distant deployments are silent. Match/garage reset clears the bounded history.
- Each body tunes engine pitch and brightness: patrol is balanced, interceptor/roadster rev higher, army is deeper, ambulance/fire-chief sit between. Body changes reuse the same loops.
- Existing event/volley deduplication and owner-scoped cancellation remain. Stereo placement follows the camera's horizontal axis; distance changes level and filtering. Own shots stay centered. Twelve transient sources share a priority budget: a nearby important cue can replace a distant minor cue. Five loops and two silent fallback oscillators sit outside that budget.
- A master compressor controls overlaps. Existing master/effects volume and mute remain effective. Menus, paused play and hidden tabs silence the mix; missing/inactive local vehicles silence continuous sounds. No positional sounds are networked.

## Acceptance and reproduction

Run `pnpm test:audio`. It starts local servers and checks native Chromium decoding, renderer wiring and offline stereo mixing. It is included in local `pnpm test:e2e` and pre-push, not CI. Headless tests, types, assets and build remain in CI.

Outputs: `work/audio/before.wav`, `after.wav`, `listen.html`, `all-effects.wav`, `vehicles.wav`, isolated check clips and `report.json`. The frozen source at `packages/renderer/dev/fixtures/audio-before.ts` records pre-change audio from `a8dd660` solely for this harness; no Git history fetch is needed. Both versions run the same 15-second scene. Average audition levels are matched; reports preserve raw measurements and applied gain.

| Time | Cue |
| --- | --- |
| 0 s | Idle |
| 1–5 s | Acceleration |
| 5–6 s | Throttle release / coast |
| 6–7 s | Dirt |
| 7–9 s | Tire slip and siren |
| 9–10 s | Repeated firing |
| 10.2 / 10.8 / 11.5 s | Light / medium / heavy crash |
| 12–15 s | Wreck and settling debris |

`all-effects.wav` auditions throw, landing, fuse, blast, spring, rubber, oil and blades at 1.5-second intervals. `vehicles.wav` holds the same speed/load for two seconds each of patrol, interceptor, roadster, army, ambulance and fire-chief. Isolated renders verify every cue is audible; a second pressure scene combines eight grenade blasts, eight wrecks, gunfire and gadgets while enforcing the twelve-voice ceiling.

Automated acceptance covers decoding, non-restarted loops, throttle/slip wiring, variants, voice limits, distance/pan, mute/suspension, owner cancellation, failed/late load cleanup, provenance hashes and finite output with headroom under eight-driver-equivalent audio pressure. A heavy collision must carry more integrated energy than a single shot. These measurements establish limits, not subjective sound quality or sustained game performance.

Listening acceptance: recognize a vehicle engine; hear throttle release at unchanged speed; hear drift onset without constant squealing; distinguish collision intensities; hear the local shot/siren through action; perceive metal/debris in wrecks; hear no loop clicks, clipping or tiring repetition. Also distinguish throw, landing, fuse, blast, oil discharge and blade extension; suspension should sit behind weapons. Review on headphones and laptop speakers before calling this production approved. Mix adjustments follow that review.
