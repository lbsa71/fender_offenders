# 002: Screen-direction touch and controller driving

Date: 2026-10-27. Status: accepted by owner request.

## Context and decision

The owner requested “pull the way you want to go” in place of forward/back/rotation controls for touch and controllers. Both use a right/down-positive screen vector. The actual camera projection maps it to world heading; the current predicted car yaw resolves the shortest turn on every input tick. Radial magnitude controls acceleration without diagonal boost, power eases through tight turns, and release coasts. Existing car physics turns the vehicle without teleporting its heading. Keyboard controls and optional controller triggers retain direct driving actions.

Keeping tank controls was rejected because a rightward pull must not keep turning a car already facing right. Teleporting heading was rejected because it would bypass the shared handling, drift and collision model. Using delayed authority yaw or sampling render frames from input ticks was rejected because it would reintroduce delayed steering or mutate presentation timing.

## Contracts, ownership and migration

U owns raw touch vectors, radial normalization and help; R owns numeric camera projection; N exposes current predicted yaw; F composes the callbacks and updates the local `TouchControls` shape; Q verifies outcomes. These lanes run sequentially in the attached worktree. `DriverActions`, wire DTOs, protocol 5, `arcade-v20` and simulation rules remain compatible. Persisted device selection, bindings and settings require no migration. No dependency is added.

## Validation

Observed RED input tests reproduce right-facing right-pull steering and downward reverse; the browser initially cannot hold a fixed rightward heading on either device. Green acceptance requires both devices to turn toward and keep a held direction, analog precision, radial dead-zone activation/recovery, safe release/cancellation, actual camera projection at phone/desktop aspect ratios, and convergence through real car physics. The full local browser gate remains mandatory before push. Physical iPhone/iPad/controller feel, Safari and sustained performance remain open.
