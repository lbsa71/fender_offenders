# Patrol audio provenance

Verified: 2026-10-26. Revision: `patrol-audio-2`.

*The motor pool has borrowed some metal. The paperwork came with it.*

| Source | Creator | Source license | Use / evidence |
| --- | --- | --- | --- |
| [Performance Cars](https://muted.io/performance-cars/) | muted.io | CC0-1.0 | Two engine recordings. [Publisher-page evidence](MUTED-IO.txt). |
| [Impact Sounds 1.0](https://kenney.nl/assets/impact-sounds) | Kenney | CC0-1.0 | Metal, glass, punch and snow-footstep layers. [Archive license](KENNEY.txt). |
| [Build recipe](../../../../../tools/assets/build-audio.py) | Fender Offenders project, with OpenAI Codex assistance | GPL-3.0-or-later | Original friction textures, siren, pressure waves, spring/rubber modes, fuse sparks, liquid discharge, editing and arrangements. |

The [full CC0 text](CC0-1.0.txt) accompanies the recordings. CC0 source recordings retain that dedication; acknowledgments do not impose attribution conditions. Project-authored code and arrangements follow the repository's GPL-3.0-or-later license. No Epidemic Sound assets or subscription rights are used.

The [inventory](../../../audio/patrol/manifest.json) names each output's sources, source archive URLs/SHA256 values, runtime hashes, format and size. The client receives only 38 derived mono PCM16 WAV clips, totaling 1,775,752 bytes. Source archives remain at their publisher-hosted URLs as the external source-art store and are cached in ignored `work/audio`; the small runtime bank is tracked in ordinary Git. The builder refuses changed archives. Release/source-package preparation should mirror the pinned archives to durable project storage; publisher URL availability is not guaranteed.

Rebuild with `python tools/assets/build-audio.py` using Python 3.12, NumPy 2.4.4, SciPy 1.18.1 and FFmpeg 7.0.2. The first rebuild downloads approximately 266 MB for the car archive plus the smaller Kenney archive. Ordinary builds/tests use committed runtime files and need no external audio service, Python or FFmpeg. `pnpm assets:check` verifies output hashes and enforces a 2 MB bank budget.

The project does not claim authorship of the source recordings. See [contributors](../../../../../CONTRIBUTORS.md) and [audio acceptance](../../../../../spec/AUDIO.md).
