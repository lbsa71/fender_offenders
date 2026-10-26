# Repository working agreements

*Test first. Swerve second. File the paperwork while the evidence is still warm.*

## Current repository map

Updated: 2026-10-26. The integrated baseline is the `arcade-v17` / protocol 5 playable alpha: six vehicle profiles, ten campaign dispatches, armed targets, and one shared 1–8-player room model. Read [the implementation plan](IMPLEMENTATION_PLAN.md) for the next acceptance work and [the execution ledger](spec/EXECUTION_STATUS.md) for dated evidence. Release gates remain open; an impressive siren does not count as a sign-off.

## Strict test-driven development

All new behavior and bug fixes must follow the red–green–refactor cycle:

1. Write a focused test for the intended observable behavior before changing production code.
2. Run that test and confirm it fails for the intended reason. A broken test setup, import failure, or unrelated failure does not count as red.
3. Make the smallest production change that makes the test pass.
4. Refactor only while the relevant tests remain green, then run the affected integration checks.

For regressions, reproduce the bug in a test first. For refactoring, establish passing behavior coverage before changing the implementation. Do not write implementation first and add tests afterward, or weaken a test merely to make a change pass.

Choose the narrowest test that proves the behavior: unit tests for simulation and input rules, real client/server integration tests for multiplayer authority and reconnect behavior, and browser tests for player-visible interactions. Assert outcomes rather than duplicating implementation details. Keep tests deterministic by controlling time, randomness, and external dependencies where appropriate.

Use `pnpm test:unit` for isolated logic, `pnpm test:integration` for real physics/renderer/network adapters, and `pnpm test:e2e` for local browser flows and UI fixtures. `pnpm test` runs both headless suites. Browsers run locally before pushes through `.githooks/pre-push`, never in CI. Install hooks with `pnpm hooks:install` in existing checkouts; local dependency installation also sets them up. Preserve custom hook paths and integrate the E2E command there. CI keeps unit/integration, types/docs, assets, build and production smoke. Do not remove a flaky browser assertion from the local suite to obtain a green push.

Every implementation handoff must state which test failed before the change, why it failed, and which checks passed afterward. Apply the same rule to every parallel implementation lane and subagent. Existing code is not evidence of a historical TDD cycle; report only cycles actually observed.

Documentation-only changes do not require artificial tests. Visual assets and subjective polish require a stated acceptance criterion and a reproducible render or browser check; pair them with automated behavioral tests wherever behavior changes.

## Parallel work

Use the lane ownership and shared contracts in `IMPLEMENTATION_PLAN.md` and `spec/CONTRACTS.md`. Coordinate changes to shared contracts and manifests before editing them. Keep each task independently reviewable and integrate against the real adapters before marking it complete.

## Documentation and credits

Keep current behavior, planned acceptance, and historical measurements distinct. Update affected Markdown when behavior changes; preserve dated evidence and never promote a recorded result to a fresh test run. Documentation-only handoffs report documentation checks and explicitly state that no behavioral red phase was required.

Use light-hearted traffic, garage, and dispatch humor in prose. Keep commands, API names, error reasons, accessibility instructions, acceptance criteria, and licensing statements literal and unambiguous. Credit people and AI assistance in [CONTRIBUTORS.md](CONTRIBUTORS.md).
