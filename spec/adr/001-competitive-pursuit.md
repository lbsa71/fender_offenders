# Competitive suspect apprehension

Date: 2026-10-23. Gameplay revision: `arcade-v6`.

Superseded for production games by the [`arcade-v7` ten-dispatch campaign](../CAMPAIGN.md): destroying the target also finishes a dispatch, with a wreck result rather than an arrest check. The independent arrest, marker and authoritative winner rules below still apply; noncampaign simulation fixtures preserve the earlier single-pursuit behavior.

The user requested the original arcade APB's clearly identified apprehension target, with multiplayer drivers racing to arrest it. This supersedes the earlier free-for-all winner and practice-only pursuit assumptions.

Every production dispatch uses one server-controlled suspect. Ordinary traffic remains unarmed and player combat remains enabled. The existing arrest tuning is retained: distance below 8 m, relative speed below 5 m/s, and 180 qualifying ticks at 60 Hz. World geometry must not obstruct the officer-to-suspect segment. A wrecked suspect can be apprehended, but a projectile hit or wreck alone never completes the objective.

Each active connected officer owns an integer arrest timer. Eligible ticks add one; ineligible ticks remove two down to zero. A different driver cannot inherit those ticks. Completed timers on the same simulation tick resolve by lexicographic player ID, making the rare tie deterministic and replayable. The winner receives the existing three-point arrest bonus, and the dispatch ends immediately with one completion event. Combat points remain visible but cannot change the winner. A five-minute online timeout ends without a pursuit winner.

The snapshot retains the suspect entity ID, leading progress, current arresting driver, winner and per-driver progress. Checkpoints preserve the independent timers. Rematch/start clears progress and winner state. Reconnect receives current authority; a disconnected driver cannot keep arresting. Practice completes to results and can begin a new dispatch through the existing garage selection.

The renderer tracks the replicated suspect with a persistent world marker. It projects the sampled car through the actual smoothed camera, reflecting the simulation X coordinate once at the renderer boundary. The UI receives normalized canvas positions, clockwise-from-up bearing and distance. A labeled edge arrow follows an offscreen target; an onscreen WANTED badge identifies the car. Menus, garage, completed/missing targets and connection loss hide guidance. Reduced-motion settings suppress bobbing. These markers are local presentation and add no transform messages.

Affected lanes are simulation/rules, contracts, server admission defaults, client presentation, renderer and UI. Optional DTO additions retain source-fixture compatibility; the gameplay revision rejects old clients because dispatch completion and winning rules changed. No dependency or protocol-version change is required. Validation must cover independent progress, deterministic ties, line of sight, disconnect/wreck/reset/checkpoint boundaries, both real WebSocket observers, camera quadrants/behind-camera/resize and native marker lifecycle.
