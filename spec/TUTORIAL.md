# Rookie patrol: learn the job, keep the keys

Status: implemented locally in `arcade-v18`, protocol 5, map `sunset-borough-3`. Reviewed: 2026-10-26. Human difficulty, physical-controller and sustained performance acceptance remain open. [Execution status](EXECUTION_STATUS.md) records observed checks.

*Dispatch supplies the lesson. Procurement supplies the noisy accessories one case later.*

| Dispatch | Equipment and road lesson | Completion |
| --- | --- | --- |
| 1 · A Small Withdrawal | All officers and Nico are unarmed; driving, siren and recovery controls remain available | Arrest only |
| 2 · Clamp Down | Suspect guns arrive first; officers use rear/flank approaches and arrests | Arrest or credited target wreck |
| 3 · Duplicate Trouble | **UNLOCKED: GUNS!** Forward fire/recoil; suspect bombs predict motion, then lock marked blast circles for one second | Arrest or credited target wreck |
| 4 · Express Distress | Puddles become slippery; ease off and steer gently | Arrest or credited target wreck |
| 5 · Stamp Duty | **UNLOCKED: BOMBS!** Throw ahead; dodge fast enemy bombs and down the black chopper with ordinary guns along its amber ground marker | Arrest or credited target wreck |
| 6 · False Alarm | Suspect oil briefly reduces grip; steer around it | Arrest or credited target wreck |
| 7 · Cone of Silence | Amber hubcaps warn before suspect side blades; leave side clearance and use a front cutoff | Arrest or credited target wreck |
| 8 · Premium Care | **UNLOCKED: OIL!** Drop behind after a cutoff | Arrest or credited target wreck |
| 9 · The Paper Chase | **UNLOCKED: HUBCAP BLADES!** Warn, extend briefly and keep control; black chopper bombing passes return | Arrest or credited target wreck |
| 10 | All police weapons remain available, with their controls and reminders | Arrest or credited target wreck |

The shared `getDispatchFeatures(dispatchIndex)` catalog derives equipment, accepted outcomes, road activation and lesson copy from authoritative campaign progress. Unlocks belong to the room, including late joins and reconnects. Retry keeps the dispatch; campaign restart returns to the unarmed opener. No account, player tutorial save or extra lobby is added. The three-second countdown and five-minute dispatch timer remain.

## Clear instructions while driving

The floating control card follows the local car, stays within the viewport and chooses a side clear of the suspect marker for the first **eight seconds of active keyboard/controller play per mounted page**. Menus, countdown, results, hidden tabs, touch mode, interrupted connections and authoritative pause suspend its remaining time. Later dispatches and HUD/device updates do not restart it. The card uses raised keyboard keycaps and controller stick, trigger, bumper and face-button graphics for the selected device, including actual remapped keys. Gun prompts and the fire-remapping row are hidden in dispatches 1–2. Every unlocked weapon keeps its controls and a current reminder in all later dispatches; the lesson appears below the controls, including for newly joined backup, and remains available through pause help after the card dismisses.

**CONTROLS HELP** remains available in home, pause, results and briefing menus after the card disappears. It shows both full layouts and the current lesson, respects the unarmed opener and gun unlock, and stays open until closed. Keyboard and controller menu navigation reach the same guide. Opening it neutralizes driving through the existing menu callback; Escape/controller Back returns to the previous menu.

For touch driving, the labeled drive pad and action buttons replace that floating card. Fire and Drift + Fire remain hidden in dispatches 1–2 and appear with the room's dispatch-3 gun unlock. Labeled BOMB, OIL and BLADES buttons appear with their later room unlocks. Settings choose Automatic, Touch, Controller or Keyboard; explicit choices keep the driving source and overlay fixed. Touch hints use gestures/button names, while keyboard/controller cards retain their device-specific icons and remapped keys.

Police deployment controls are **B / left bumper / BOMB** for bombs, **Q / left-stick press / OIL** for oil, and **C / right-stick press / BLADES** for hubcaps. Keyboard remapping appears in both help layouts and the floating card. Quick touch taps survive until one simulation tick consumes them; menus/focus loss clear pending deployment. Bombs and road gadgets share a twelve-second officer cooldown, shown in the HUD. Failed/locked deployments do not consume it. Police bombs land sixteen metres ahead with a fixed 1.5-second fuse, 4.5 m radius and at most 24 damage. Police bombs and blades damage the marked suspect and spare backup officers; oil remains a physical road hazard for every non-owner, unprotected car.

The objective names the suspect: **APPREHEND NICO**. Arresting is automatic: catch up, match speed, and stay close for three seconds. The server's existing eligibility checks publish `get-closer`, `match-speed`, `clear-obstruction`, `hold-steady` or `unavailable` for each contender. The suspect marker displays the local officer's guidance and progress; another officer's progress cannot fill it. Existing strict distance below 8 m, relative speed below 5 m/s, line-of-sight and progress decay remain authoritative.

The small entry screen asks for a callsign; vehicle selection happens once, in the combined briefing. **YOUR UNIT** and **SUSPECT CAR** share one chase view with the actual procedural bodies, colors and gun fittings. Cards identify the cars by name and short role; vehicle stat grids and meters are omitted, including on narrow screens. Reassignment changes only the player's preview. The suspect portrait appears before the lesson so it stays recognizable without scrolling. Quick panel/reveal animations finish within 220 ms and respect reduced motion. The first arrest earns **ARREST CERTIFIED**, then dispatch 2 introduces suspect guns and dispatch 3 presents the police gun unlock without an extra confirmation screen. Lesson changes use a polite status announcement; progress is not continuously announced. Text labels supplement glyphs, and reduced-motion/flash settings remain available.

## Authority and wet roads

The unarmed opener rejects fire at authority and prediction/replay; rejected fire produces no projectile, recoil, muzzle flash or gun audio. The suspect's first tactics profile has weapon `none`. A stale lethal projectile cannot resolve the opener as a wreck. Existing collision impacts remain physical feedback without ram health damage. From dispatch 2, arrest earns three points and credited target destruction earns one; officer gunfire remains locked until dispatch 3.

The pond, pool and four road puddles are visible from dispatch 1 on every graphics preset. The first three dispatches keep dry handling. The four road puddles share polygon vertices between rendering and `CollisionMap.wetSurfaces`. From dispatch 4, vehicles inside them use **75% of their normal lateral grip**, including officers, suspects and traffic. Dry handling returns on exit. Footprints occupy one lane, leave a dry route, and avoid spawn clearance, buildings, pedestrian routes and dirt shortcuts. Ponds and pools remain decorative. Every graphics preset retains visible wet footprints; low quality may freeze decorative ripples. The final dispatch-driving context is passed to `predictVehicle` so replay and authority use the same road state.

## Verification

Use `pnpm test:unit` and `pnpm test:integration` for contracts, hints, authority, exact water geometry, prediction and real sockets. `tests/e2e/tutorial.spec.ts` covers the real opener, actual arrest-to-unlock transition, later lessons and responsive previews. Combat browser fixtures select dispatch 3 through the **test-only** server entrypoint `tests/e2e/server.ts`; its loopback controller is absent from production imports/builds. The default local E2E servers use ports 5473/2867, with fixture control on 3867; environment overrides remain supported.

`tests/e2e/solo-driving.spec.ts` also slows rendering to five frames per second while checking independent input delivery, movement and bounded corrections. Protection blinking uses room ticks rather than browser lifetime. These checks do not certify physical controllers, blocked-main-thread recovery or the full named-hardware performance matrix. Run browser E2E locally before every push; CI remains headless.

Briefings show one short current lesson rather than the accumulated equipment prose. Full unlocked controls/reminders remain in Controls Help. The chase keeps health, time, the objective and local arrest progress, omitting leaderboards, speed readouts, campaign trackers and a duplicate numeric arrest percentage.
