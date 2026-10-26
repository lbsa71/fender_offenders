# Rookie patrol: learn the job, keep the keys

Status: implemented in `arcade-v12`, protocol 3, map `sunset-borough-2`. Reviewed: 2026-10-26. Human difficulty, physical-controller and sustained performance acceptance remain open. [Execution status](EXECUTION_STATUS.md) records observed checks.

*Dispatch supplies the lesson. Procurement supplies the noisy accessories one case later.*

| Dispatch | Equipment and road lesson | Completion |
| --- | --- | --- |
| 1 · A Small Withdrawal | All officers and Nico are unarmed; driving, siren and recovery controls remain available | Arrest only |
| 2 · Clamp Down | **UNLOCKED: GUNS!** Forward fire and recoil; short bursts preserve control | Arrest or credited target wreck |
| 3 · Duplicate Trouble | Suspect bombs: leave the fixed landing circle before detonation; introductory fuse 150 ticks / 2.5 seconds | Arrest or credited target wreck |
| 4 · Express Distress | Road puddles activate; ease off and steer gently | Arrest or credited target wreck |
| 5–10 | Existing tactics combine the learned mechanics; guns and puddles remain available | Arrest or credited target wreck |

The shared `getDispatchFeatures(dispatchIndex)` catalog derives equipment, accepted outcomes, road activation and lesson copy from authoritative campaign progress. Unlocks belong to the room, including late joins and reconnects. Retry keeps the dispatch; campaign restart returns to the unarmed opener. No account, player tutorial save or extra lobby is added. The three-second countdown and five-minute dispatch timer remain.

## Clear instructions while driving

The floating control card follows the local car, stays within the viewport and chooses a side clear of the suspect marker for the first **eight seconds of active keyboard/controller play per mounted page**. Menus, countdown, results, hidden tabs, touch mode, interrupted connections and authoritative pause suspend its remaining time. Later dispatches and HUD/device updates do not restart it. The card uses raised keyboard keycaps and controller stick, trigger, bumper and face-button graphics for the selected device, including actual remapped keys. Gun prompts and the fire-remapping row are hidden in dispatch 1. A short current-lesson reminder appears below the controls in dispatches 1–4, including for newly joined backup.

**CONTROLS HELP** remains available in home, pause, results and briefing menus after the card disappears. It shows both full layouts and the current lesson, respects the unarmed opener and gun unlock, and stays open until closed. Keyboard and controller menu navigation reach the same guide. Opening it neutralizes driving through the existing menu callback; Escape/controller Back returns to the previous menu.

For touch driving, the labeled drive pad and action buttons replace that floating card. Fire and Drift + Fire remain hidden in dispatch 1 and appear with the room's dispatch-2 gun unlock. Settings choose Automatic, Touch, Controller or Keyboard; explicit choices keep the driving source and overlay fixed. Touch hints use gestures/button names, while keyboard/controller cards retain their device-specific icons and remapped keys.

The objective names the suspect: **APPREHEND NICO**. Arresting is automatic: catch up, match speed, and stay close for three seconds. The server's existing eligibility checks publish `get-closer`, `match-speed`, `clear-obstruction`, `hold-steady` or `unavailable` for each contender. The suspect marker displays the local officer's guidance and progress; another officer's progress cannot fill it. Existing strict distance below 8 m, relative speed below 5 m/s, line-of-sight and progress decay remain authoritative.

The small entry screen asks for a callsign; vehicle selection happens once, in the combined briefing. **YOUR UNIT** and **SUSPECT CAR** share one chase view with the actual procedural bodies, colors and gun fittings. Both cards show armor, speed, acceleration and handling, including on narrow screens. Reassignment changes only the player's preview. The suspect portrait appears before the lesson so it stays recognizable without scrolling. Quick panel/reveal animations finish within 220 ms and respect reduced motion. The first arrest earns **ARREST CERTIFIED**, then dispatch 2 presents its unlock without an extra confirmation screen. Lesson changes use a polite status announcement; progress is not continuously announced. Text labels supplement glyphs, and reduced-motion/flash settings remain available.

## Authority and wet roads

The unarmed opener rejects fire at authority and prediction/replay; rejected fire produces no projectile, recoil, muzzle flash or gun audio. The suspect's first tactics profile has weapon `none`. A stale lethal projectile cannot resolve the opener as a wreck. Existing collision impacts remain physical feedback without ram health damage. From dispatch 2, arrest earns three points and credited target destruction earns one.

The four road puddles share polygon vertices between rendering and `CollisionMap.wetSurfaces`. From dispatch 4, vehicles inside them use **75% of their normal lateral grip**, including officers, suspects and traffic. Dry handling returns on exit. Footprints occupy one lane, leave a dry route, and avoid spawn clearance, buildings, pedestrian routes and dirt shortcuts. Ponds and pools remain decorative. Every graphics preset retains visible wet footprints; low quality may freeze decorative ripples. The final dispatch-driving context is passed to `predictVehicle` so replay and authority use the same road state.

## Verification

Use `pnpm test:unit` and `pnpm test:integration` for contracts, hints, authority, exact water geometry, prediction and real sockets. `tests/e2e/tutorial.spec.ts` covers the real opener, actual arrest-to-unlock transition, later lessons and responsive previews. Combat browser fixtures select dispatch 2 through the **test-only** server entrypoint `tests/e2e/server.ts`; its loopback controller is absent from production imports/builds. The default local E2E servers use ports 5473/2867, with fixture control on 3867; environment overrides remain supported.

`tests/e2e/solo-driving.spec.ts` also slows rendering to five frames per second while checking independent input delivery, movement and bounded corrections. Protection blinking uses room ticks rather than browser lifetime. These checks do not certify physical controllers, blocked-main-thread recovery or the full named-hardware performance matrix. Run browser E2E locally before every push; CI remains headless.
