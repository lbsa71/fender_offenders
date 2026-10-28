# Gameplay sound effects

Status: complete gameplay cue pass, 2026-10-26. Listening approval and the wider device/browser matrix remain open.

*Dispatch has replaced the doorbell orchestra with an actual motor pool.*

## Scope and ownership

This extends R04/R05 and A01/A04/Q07. One contributor owns R playback/scenarios, A sourcing/build recipe, F app input/scripts and Q acceptance sequentially. No network, physics, gameplay or dependency version changes are required. Every existing gameplay cue uses the authored bank once loaded. Oil and blade deployments now have cues. Seven engine tunings share two source recordings; these are not seven separately recorded vehicles. Remote engine loops, music and additional UI cues remain outside this pass.

The 41-clip, 1,869,484-byte bank combines CC0 engine/foley recordings with original layers. [Provenance and storage policy](../packages/content/manifests/licenses/audio/README.md) distinguish sources, derivatives and project code. Vite emits the runtime URLs from `audio-bank.ts`; production serves the assets from the game itself. Source archives never enter the client build.

## Adaptive soundtrack and volume control

The owner supplied `titles.mp3`, `slow.mp3` and `fast.mp3` in `bbe885c`. They are integrated from `apps/client/public` into the streaming player and production build. [The soundtrack inventory](../packages/content/manifests/licenses/music/README.md) records filenames, embedded credits, sizes and hashes. Automated decoding/playback checks are separate from listening approval and physical-device acceptance.

Keep supplied MP3s in `apps/client/public` and retain their names. At dev-server startup and production build, Vite discovers MP3 filenames containing `title`/`titles`, `slow` or `fast`, case-insensitively. Title files play in natural filename order and cycle; dispatch files loop. Names and URLs are encoded safely. Unrelated recordings are not substituted, and an empty manifest remains silent without 404 retries. Restart the dev server after adding files. The three current tracks total 13,858,740 bytes and stream without full-track decoded buffers. The existing CC0 effects-bank credits do not describe these MP3s.

- Title music starts after an intentional page interaction and stays at its authored tempo. Briefing/results are silent; leaving a patrol returns to title music.
- Dispatch music follows the rendered local car, using its shared top speed. It switches to Fast at 60% of top speed and back to Slow at 45%, avoiding repeated switching near one threshold. Both the level crossfade and tempo response ease over roughly a quarter second. Playback rate rises continuously from 1.00 to at most 1.15; pitch preservation is requested. Music does not change the simulation or engine effects.
- MP3s stream through media elements and individual Web Audio gain nodes, avoiding decoded full-track buffers in phone memory. Gain nodes provide application volume without relying on per-element volume support on iOS; see [WebKit's volume constraint](https://commits.webkit.org/251625@main). Master/music levels multiply, while master/effects continue to control the existing effects bank.
- The 44-pixel toolbar knob toggles mute on click/tap/Space/Enter. Drag up/down, use the mouse wheel, arrow keys or Home/End to adjust master volume. The settings slider remains available. Volume and mute persist; muting retains the selected level, and unmuting restores it. The accessible button label reports the action and percentage.
- Pausing, hidden tabs and connection interruptions stop music and retain its position. Late play promises cannot revive disposed/suspended media. Disposal removes listeners/media, disconnects sources/gains and closes the music context. Browser playback rejection can retry on the next intentional activation.

`music.test.ts` exercises a deterministic media/graph adapter, including read-only native volume. `tests/e2e/music.spec.ts` checks both existing WAV test signals and the actual supplied MP3s in native Chromium: decoded duration and advancing playback, title/dispatch crossfades, bounded speed-dependent rate, gain/mute and pause/resume. The fixture uses explicit public URLs; a separate real-app check verifies discovery of all three URLs and title/dispatch/leave state. `volume-knob.spec.ts` covers mouse, keyboard, persistence, captured touch dragging and small-screen bounds; captures regenerate as `work/volume-title-375x667.png` and `work/volume-driving-667x290.png`. Physical iPhone SE 2020/2022, iPad Safari and listening acceptance remain open.

## Current effects playback

- Intentional activation creates one AudioContext and loads/decodes the bank once. Five loops stay alive at zero gain when inactive: idle engine, loaded engine, tire friction, road texture and siren. Updates change gain/rate/filter values without restarting recordings. Original synthesis covers loading/failure; late downloads never replay old events or revive a disposed context.
- Local input is reused from the existing tick without sampling twice or consuming edge actions. Throttle/reverse load changes engine blend and brightness; speed changes pitch. Fixture callers without input use bounded acceleration, reset at vehicle/life changes. This is an arcade engine model, not simulated RPM/gears.
- Rear lateral slip derives from rendered velocity, yaw and yaw rate. Moving slip controls tire friction; straight driving and stationary steering are silent. Dirt/grass increase rolling texture and reduce paved tire squeal. Audio changes no tire forces or surface authority.
- Collisions have three intensities with three variants each; shots/hits have three each, wrecks two. Immediate repeats are avoided with bounded pitch variation. Metal/glass and bass/body layers replace electronic crash/wreck tails. Grenade throws combine pin/metal and air; landings double-bounce; fuse warnings sizzle and crackle; blasts combine a pressure wave with debris. Suspension uses damped spring modes and rubber friction. Those six families have two variants each.
- Oil discharge uses liquid/valve layers; blades extend with a scrape and locking clatter, each with two variants. Snapshot-derived cues play once at oil release or blade activation, within six presentation ticks; late reconstructions, expired gadgets and distant deployments are silent. Match/garage reset clears the bounded history.
- Tire water crossings use three original spray/wash/droplet variants. Speed changes strength; nearby peers use camera-relative pan and distance attenuation. The incoming water tracker retains its crossing, life, teleport and repeated-pose guards.
- Each body tunes engine pitch and brightness: patrol is balanced, interceptor/roadster rev higher, army is deeper, ambulance/fire-chief sit between, and the DB5 uses a slightly higher classic-GT tuning. Body changes reuse the same loops.
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

`all-effects.wav` auditions throw, landing, fuse, blast, spring, rubber, oil, blades and tire splashes at 1.5-second intervals. `vehicles.wav` holds the same speed/load for two seconds each of patrol, interceptor, roadster, army, ambulance and fire-chief. Isolated renders verify every cue is audible; a second pressure scene combines eight grenade blasts, eight wrecks, gunfire and gadgets while enforcing the twelve-voice ceiling.

Automated acceptance covers decoding, non-restarted loops, throttle/slip wiring, variants, voice limits, distance/pan, mute/suspension, owner cancellation, failed/late load cleanup, provenance hashes and finite output with headroom under eight-driver-equivalent audio pressure. A heavy collision must carry more integrated energy than a single shot. These measurements establish limits, not subjective sound quality or sustained game performance.

Listening acceptance: recognize a vehicle engine; hear throttle release at unchanged speed; hear drift onset without constant squealing; distinguish collision intensities; hear the local shot/siren through action; perceive metal/debris in wrecks; hear no loop clicks, clipping or tiring repetition. Also distinguish throw, landing, fuse, blast, oil discharge and blade extension; suspension should sit behind weapons. Review on headphones and laptop speakers before calling this production approved. Mix adjustments follow that review.
