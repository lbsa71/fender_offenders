# Input adapter

`createInputSource(options)` implements the shared `InputSource` contract. It starts disabled. The app enables it after a session starts and disables it while menus are visible. Call `pollMenus()` once per animation frame, including while gameplay is paused, and call `sample()` once per simulation tick. Sampling also polls devices, so contract-only consumers still receive gamepad input.

Pass `onNeutralize` to send immediate session neutralization on blur, hidden tab, controller loss, menu entry, or settings changes. Returning focus, reconnecting a controller, or closing menus does not replay held controls. Keyboard input needs a new press; a controller must return to neutral. The adapter removes all listeners on `dispose()`.

`onMenuAction` emits `up`, `down`, `left`, `right`, `confirm`, `back`, or `pause`. Standard-mapped controllers are supported. Unknown mappings are reported through `getStatus().unsupportedPad`, with keyboard fallback. `getStatus()` also reports the active device, focus, and recovery hold progress. `setSettings` validates and persists dead zones, sensitivity, steering ramp, and keyboard mappings. Persistence is optional when browser storage is blocked.

The left stick steers horizontally and drives longitudinally: forward requests throttle; backward requests brake/reverse. Stick Y uses the configured stick dead zone. Right/left triggers remain throttle/brake alternatives. Concurrent inputs combine by their maximum strength, so using a stick and trigger together cannot boost an action beyond its normalized range. The simulation still owns the deliberate brake-to-reverse transition.

`InputController` is the pure device state machine used by the browser adapter and unit tests. Run `pnpm test -- packages/input/src/input.test.ts` for the 13 safety/normalization scenarios, including stick-Y throttle/reverse, dead zones, trigger coexistence and held-stick focus/disconnect safety. Browser-level controller testing uses injected standard-mapped gamepads; no physical controller has been tested by this implementation session.
