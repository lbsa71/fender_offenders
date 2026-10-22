# Dispatch interface

`mountGameUi(root, callbacks)` mounts the responsive game shell, menus, settings, HUD, room invites, and results. The UI consumes `UiModel`; its snapshot and scores are read-only projections. Nicknames, errors, room codes, and score rows are written as text, never HTML.

The app supplies semantic callbacks for practice/create/join, start round, resume, leave, rematch, and settings. `onMenuVisibility` must disable gameplay input; local practice can pause its simulation, while online simulation continues. UI copy makes this distinction explicit. Session failures appear in the current menu without requiring developer tools.

Online leaderboards and results show every player's authoritative `pingMs`, including the local player's, with a visible `PING / ms` heading and accessible per-name readouts. Unknown values appear as `—`; solo practice omits the latency column. Results continue following new measurements rather than freezing the first reading.

The persistent header shows a Wi-Fi icon and text for connecting, connected, reconnecting, and connection loss. Reconnecting is amber; disconnected/error states use a slashed icon and `Connection lost`. Accessible names and text convey the state without relying on color. Returning to a connected state clears the slash; local practice uses its neutral local-dispatch label.

Call `update(model)` at HUD cadence. `navigate(action)` accepts keyboard/controller menu actions. `showMenu`, `isMenuVisible`, `getSettings`, `setSettings`, and `dispose` complete the facade. Imported CSS has scoped `fo-` classes, reduced-motion support, and system font fallbacks. No external font stylesheet or font download is requested.

Independent browser smoke: `node packages/ui/dev/smoke.mjs`. This starts a private Vite fixture on port 5181 and closes it afterward. It checks known/unknown player latency and updating results at 1440×900 and 960×640, practice-column absence, persistent Wi-Fi states/recovery, keyboard practice, input neutralization, settings/remap, invite parsing, safe nickname rendering/results/rematch, and 740×580 bounds. Set `CAPTURE_UI=1` to save a menu preview plus latency/connectivity captures in `work/`. The integrated Playwright suite is `pnpm test:e2e`; two real browser contexts assert that both clients see both players' numeric latency. Synthetic gamepad tests are not a physical-device certification.
