# Owner-supplied soundtrack inventory

Recorded: 2026-10-26. Stefan supplied these unmodified files in commit `bbe885c`, under `apps/client/public`. The dispatch desk now has a brass section.

| File | Use | Embedded title | Duration | Bytes | SHA256 |
| --- | --- | --- | --- | --- | --- |
| `titles.mp3` | Title screen | Pursuit in the City | 168.120 s | 3,826,676 | `371f76912159656fbdeaa5fce22177ca1fff2831f4b39de47ae7af9357ff06d5` |
| `slow.mp3` | Lower-speed dispatch loop | Brassy Hook (0.47x) | 356.136 s | 6,196,027 | `e8bb598cd80ba6cbdb01caea5e5861376d0aed9e9ca77429aa9ab8c9985a3c08` |
| `fast.mp3` | Higher-speed dispatch loop | Brassy Hook | 168.096 s | 3,836,037 | `59f37b73a4ed4fd4ceed8f991d31ac7c8b5b6f3461a74a2ed21ee2523a83f971` |

FFprobe identifies stereo MP3 audio at 48 kHz and embedded cover images. Each file's artist field is `fastsongwriting397`; its comment says `made with suno`. Those are recorded file metadata, not independently verified authorship or license grants. No separate soundtrack license or account-generation terms accompanied this commit. The effects bank's CC0 dedication does not apply to these files, and this inventory assigns no new license.

Vite copies the files into the production public directory and supplies their URLs to the streaming player. The three tracks total 13,858,740 bytes. [Audio acceptance](../../../../../spec/AUDIO.md#adaptive-soundtrack-and-volume-control) describes playback, speed response and the reproducible actual-MP3 browser checks. Source recordings remain unchanged; subjective listening and physical mobile Safari acceptance are separate.
