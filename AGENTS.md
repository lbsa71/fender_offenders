# Repository working agreements

## Strict test-driven development

All new behavior and bug fixes must follow the red–green–refactor cycle:

1. Write a focused test for the intended observable behavior before changing production code.
2. Run that test and confirm it fails for the intended reason. A broken test setup, import failure, or unrelated failure does not count as red.
3. Make the smallest production change that makes the test pass.
4. Refactor only while the relevant tests remain green, then run the affected integration checks.

For regressions, reproduce the bug in a test first. For refactoring, establish passing behavior coverage before changing the implementation. Do not write implementation first and add tests afterward, or weaken a test merely to make a change pass.

Choose the narrowest test that proves the behavior: unit tests for simulation and input rules, real client/server integration tests for multiplayer authority and reconnect behavior, and browser tests for player-visible interactions. Assert outcomes rather than duplicating implementation details. Keep tests deterministic by controlling time, randomness, and external dependencies where appropriate.

Every implementation handoff must state which test failed before the change, why it failed, and which checks passed afterward. Apply the same rule to every parallel implementation lane and subagent. Existing code is not evidence of a historical TDD cycle; report only cycles actually observed.

Documentation-only changes do not require artificial tests. Visual assets and subjective polish require a stated acceptance criterion and a reproducible render or browser check; pair them with automated behavioral tests wherever behavior changes.

## Parallel work

Use the lane ownership and shared contracts in `IMPLEMENTATION_PLAN.md` and `spec/CONTRACTS.md`. Coordinate changes to shared contracts and manifests before editing them. Keep each task independently reviewable and integrate against the real adapters before marking it complete.
