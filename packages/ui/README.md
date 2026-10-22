# Dispatch interface

`mountGameUi(root, callbacks)` mounts the responsive game shell, menus, settings, HUD, room invites, and results. The UI consumes `UiModel`; its snapshot and scores are read-only projections. Nicknames, errors, room codes, and score rows are written as text, never HTML.

The app supplies semantic callbacks for practice/create/join, start round, resume, leave, rematch, and settings. `onMenuVisibility` must disable gameplay input; local practice can pause its simulation, while online simulation continues. UI copy makes this distinction explicit. Session failures appear in the current menu without requiring developer tools.

Call `update(model)` at HUD cadence. `navigate(action)` accepts keyboard/controller menu actions. `showMenu`, `isMenuVisible`, `getSettings`, `setSettings`, and `dispose` complete the facade. Imported CSS has scoped `fo-` classes, reduced-motion support, and system font fallbacks. No external font stylesheet or font download is requested.

Independent browser smoke: `node packages/ui/dev/smoke.mjs`. This starts a private Vite fixture on port 5181 and closes it afterward. It checks keyboard practice, input neutralization, settings and keyboard remap, invite URL parsing, safe nickname rendering in results, rematch, and 740×580 layout bounds. Set `CAPTURE_UI=1` to save a menu preview. The integrated Playwright suite is `pnpm test:e2e`; it covers the actual app and two browser contexts against the game server. Synthetic gamepad tests are not a physical-device certification.
