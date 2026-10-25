# Every campaign has a room

Status: implemented for `arcade-v10`, protocol 2. Updated: 2026-10-25. Evidence is recorded in [execution status](EXECUTION_STATUS.md#unified-room-sessions). Named-hardware capacity and public deployment acceptance remain separate gates.

*One officer is a task force. Two officers are a task force with witnesses.*

## Entering and sharing

The bare game URL receives a cryptographically random `?room=<code>` using browser history replacement, retaining other query parameters and the fragment without reloading. Loading the title screen allocates no server room. **Hit the streets** enters that URL's room through `POST /dispatch/:invite`, creating it lazily if necessary. Paste another invite into the browser address bar to join it; visit the bare URL for a fresh room. Malformed codes produce an actionable error without allocation.

One **Invite URL** button is available before entry, during play, and in pause/settings/results menus, including keyboard/controller navigation. It copies the exact current browser address. If clipboard access is unavailable, a status message directs the player to copy the address bar. No separate create/join controls, room-code field or displayed room ID are needed.

An ongoing one-officer patrol becomes multiplayer when a friend follows its current invite and enters. Joining preserves the campaign's earned leads and outcomes, personal scores, existing cars and the current dispatch deadline. The original officer keeps playing in the same room; backup receives a safely spawned car in its current phase. One officer can call for backup halfway through the paperwork.

Every playable campaign is server-authoritative and accepts 1–8 officers. The browser's local simulation is a menu preview/development facility. A lone officer has the same campaign, target rules and progression as a larger group. Callsigns, selected vehicles and preferences remain browser settings; there is no account gate.

The briefing retains the dossier, motor pool and explicit **Start dispatch** action. Any connected member can proceed. The first valid request starts a three-second countdown for everyone; duplicate starts are ignored. Late arrivals join the current briefing, countdown, dispatch or results with a full casefile and existing spawn protection. Nobody waits for a second officer.

Any connected officer can open the next briefing, retry a timeout or start a new campaign after the finale. Phase guards admit one transition. Completed outcomes retain dispatch index, method, resolving player ID, credited callsign and elapsed ticks. Callsigns remain readable after participants leave. Personal scores belong to the current session; joining another room follows that room's campaign.

## Pause and reconnect

With exactly one connected officer, an open menu or hidden tab pauses simulation. With multiple connected officers, those conditions neutralize only the affected driver's controls. Arrival/reconnection resumes a paused shared game and notifies the officer whose menu remains open. The session retains sequenced notices across snapshots and hidden-tab delays; the backup notice remains visible while the menu is open, until acknowledged or the room pauses again. Neutral controls stay in force until that officer returns.

Zero connected officers freezes the world immediately, including countdowns, dispatch deadlines, projectiles and scenery. Existing unexpected-drop reservations remain protected for ten seconds; reconnect restores identity with a fresh input epoch and full baseline. Expired reservations and intentional departures remove that session, while retaining campaign outcomes.

`WorldSnapshot.paused` is authoritative and passes through compact snapshots. Pause transitions discard accumulated simulation time, queued commands and held actions, and publish full resync baselines. Prediction, interpolation, projectile presentation and HUD hazard clocks honor the pause. Connection maintenance and paused snapshots continue; resuming does not simulate elapsed wall time.

## Bounded room lifetime

The in-memory registry counts creating, occupied and retained empty rooms toward `MAX_ROOMS`. Admission reserves capacity before physics initialization. Invite creation is serialized per code; failed/never-joined rooms retain SDK disposal. The first successful join enables empty-room retention.

An empty room survives for 15 minutes from its last connected officer's departure. Returning before expiry resumes its frozen world and casefile. At capacity, admission reclaims the oldest eligible empty room first. Connected members, reconnect reservations and pending seat reservations are protected. Reclamation blocks new reservations before rechecking public matchmaking occupancy. If nothing is reclaimable, admission returns the distinct server-capacity error. The Render preview retains its provisional two-room cap.

Abandoned connected tabs also have a 15-minute inactivity limit. At 14 minutes, an accessible warning offers **Stay on patrol**. Gameplay actions and deliberate UI interactions renew activity; neutral packets, snapshots and heartbeat traffic do not. Client and server activity notices are rate-limited, and controller dead zones suppress drift. Timeout closes intentionally with `idle-timeout`, suppressing automatic reconnect and releasing that participant. Room retention then applies normally.

Cleanup uses server wall-clock time independently of paused simulation ticks. Expiration, eviction and shutdown dispose simulations, clocks and registry entries. Health metrics include connected/reconnecting players, paused/empty rooms, expiry/eviction counts and idle disconnects, without names or invite codes.

## Storage and hosting

State is process memory. A restart, deployment or free-service shutdown ends retained campaigns. Expired, reclaimed or restarted room URLs remain reusable but start a fresh campaign; they are not save files. A fresh briefing is labeled **New campaign**. Browser settings remain independent of room lifetime.

No paid hosting or database is added. Render Free cannot attach persistent disks; free Key Value loses data on restart and free Postgres expires after 30 days. Durable campaign checkpoints can later use a storage adapter backed by managed Postgres. Saving live Rapier worlds or adding a distributed room service is outside this delivery. [Render Free limits](https://render.com/docs/free), [managed Postgres](https://render.com/docs/postgresql).

## Verification and remaining acceptance

Focused simulation tests cover single-member starts, membership permissions, duplicate transitions and immutable credited names. Real-room tests exercise pause/arrival, countdown retention, reserved-seat protection, capacity reclamation and controlled-clock inactivity/expiry. Browser scenarios cover room URL assignment, entry/navigation, sharing and solo pause/resume with backup. Production smoke starts alone and admits a second real WebSocket player into live play.

Follow the repository's observed red–green–refactor requirement for subsequent changes. Test teardown explicitly disposes owned retained rooms. These checks do not certify five-minute eight-player capacity, Internet latency, physical controllers or hosted rollback. The paperwork gets its own speed limit.
