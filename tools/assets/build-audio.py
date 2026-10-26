"""Rebuild the patrol bank from hash-pinned CC0 archives and original DSP.

Requires Python 3.12, numpy 2.4, scipy 1.18, and FFmpeg 7.0.2 on PATH.
Source archives are cached in ignored work/audio; only the small finished bank ships.
Run: python tools/assets/build-audio.py
"""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import urllib.request
import wave
import zipfile

import numpy as np
from scipy.signal import butter, sosfilt, resample_poly

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "work/audio"
OUT = ROOT / "packages/content/audio/patrol"
RATE = 24000
RNG = np.random.default_rng(71026)
SOURCES = {
    "muted": {
        "url": "https://mutedio.s3.us-east-2.amazonaws.com/sounds/sample-packs/performance-cars-free-sample-pack-mutedio.zip",
        "page": "https://muted.io/performance-cars/", "creator": "muted.io",
        "sha256": "bde1241416274464c170d59dde84327d53868210a7af7d73e63fc35576593d10", "file": "performance-cars.zip",
    },
    "kenney": {
        "url": "https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip",
        "page": "https://kenney.nl/assets/impact-sounds", "creator": "Kenney",
        "sha256": "029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8", "file": "kenney-impact.zip",
    },
}
CACHE.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)
archives = {}
for key, record in SOURCES.items():
    path = CACHE / record["file"]
    if not path.exists():
        print(f'Downloading {record["creator"]} source archive...', flush=True)
        urllib.request.urlretrieve(record["url"], path)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == record["sha256"], f"Source hash mismatch: {path}"
    archives[key] = zipfile.ZipFile(path)


def decode(source, member):
    result = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", str(RATE), "-f", "f32le", "pipe:1"],
                            input=archives[source].read(member), capture_output=True, check=True)
    return np.frombuffer(result.stdout, dtype="<f4").astype(np.float64)


def filt(a, frequency, kind="lowpass"):
    return sosfilt(butter(2, frequency, btype=kind, fs=RATE, output="sos"), a)


def norm(a, peak=.82):
    a = a - np.mean(a)
    return a * (peak / max(np.max(np.abs(a)), 1e-9))


def fade(a, attack=.003, release=.04):
    a = a.copy()
    n, m = min(len(a), int(attack * RATE)), min(len(a), int(release * RATE))
    if n: a[:n] *= np.linspace(0, 1, n)
    if m: a[-m:] *= np.linspace(1, 0, m)
    return a


def loop(a, overlap=.12):
    # The end crossfades into the pre-roll; the next sample is its exact continuation.
    n = int(overlap * RATE)
    blend = np.linspace(0, 1, n)
    return np.concatenate((a[n:-n], a[-n:] * (1 - blend) + a[:n] * blend))


def layer(duration, *items):
    out = np.zeros(round(duration * RATE))
    for a, at, gain in items:
        start = round(at * RATE); count = min(len(a), len(out) - start)
        out[start:start + count] += a[:count] * gain
    return out


def pitch(a, factor):
    return np.interp(np.arange(0, len(a), factor), np.arange(len(a)), a)


def metal(weight, i):
    return norm(decode("kenney", f"Audio/impactMetal_{weight}_{i:03}.ogg"))


def body(i):
    return norm(decode("kenney", f"Audio/impactPunch_heavy_{i:03}.ogg"))


def glass(i):
    return norm(decode("kenney", f"Audio/impactGlass_heavy_{i:03}.ogg"))


def boom(duration, variant=0):
    t = np.arange(round(duration * RATE)) / RATE
    bass = np.sin(2 * np.pi * (47 * t + 4.2 * (1 - np.exp(-t * 22)))) * np.exp(-t * 7)
    roar = filt(RNG.uniform(-1, 1, len(t)), 1000 + variant * 180) * np.exp(-t * 5)
    crack = filt(RNG.uniform(-1, 1, len(t)), 1600, "highpass") * np.exp(-t * 75)
    return fade(bass * .7 + roar * 1.8 + crack * .55)


records = []


def write(name, a, sources, is_loop=False):
    a = norm(a)
    if not is_loop:
        a = fade(a)
        if name.startswith(("heavy-", "wreck-", "blast-")):
            a = np.tanh(a * 3.2)
        a *= .82 / max(np.max(np.abs(a)), 1e-9)
    path = OUT / (name + ".wav")
    with wave.open(str(path), "wb") as w:
        w.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        w.writeframes(np.round(a * 32767).astype("<i2").tobytes())
    records.append({"file": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "bytes": path.stat().st_size,
                    "duration": round(len(a) / RATE, 5), "loop": is_loop, "sources": sources})


prefix = "performance-cars-free-sample-pack-mutedio/"
idle_source = prefix + "002-performance-cars-mutedio.wav"
drive_source = prefix + "006-performance-cars-mutedio.wav"
idle = decode("muted", idle_source)[int(.3 * RATE):int(2.9 * RATE)]
drive = decode("muted", drive_source)[int(4 * RATE):int(6.6 * RATE)]
write("idle", loop(filt(filt(idle, 45, "highpass"), 2300)), [f"muted:{idle_source} [0.3,2.9s]"], True)
write("drive", loop(filt(filt(drive, 50, "highpass"), 5700)), [f"muted:{drive_source} [4.0,6.6s]"], True)

# Original friction textures: irregular, filtered friction with several rubbing resonances.
t = np.arange(round(2.8 * RATE)) / RATE
grain = filt(RNG.uniform(-1, 1, len(t)), [500, 5800], "bandpass")
rub = sum(np.sin(2 * np.pi * f * t + .9 * np.sin(2 * np.pi * wobble * t)) * gain
          for f, wobble, gain in [(780, 7, .13), (1240, 11, .1), (1980, 5, .05)])
write("tires", loop(grain * .65 + rub), ["original: seeded friction noise and rubbing resonances"], True)
gravel = norm(decode("kenney", "Audio/footstep_snow_000.ogg"))
bed = filt(RNG.uniform(-1, 1, len(t)), 3100) * .15
for at in np.arange(0, 2.3, .09):
    start = int(at * RATE); n = min(len(gravel), len(bed) - start)
    bed[start:start+n] += gravel[:n] * RNG.uniform(.1, .3)
write("road", loop(bed), ["kenney:Audio/footstep_snow_000.ogg", "original: seeded rolling noise"], True)

# Original two-voice mechanical wail: a four-second, phase-continuous loop, band limited.
t = np.arange(4 * RATE) / RATE
frequency = 660 - 220 * np.cos(2 * np.pi * t / 4)
phase = 2 * np.pi * np.cumsum(frequency) / RATE
siren = np.sin(phase) + .24 * np.sin(3 * phase) + .08 * np.sin(5 * phase)
siren += .28 * np.sin(phase * 1.5)
# Warm the filter with one complete period instead of resetting its state at every wrap.
periodic_siren = filt(np.tile(siren, 2), 4400)[len(siren):]
write("siren", periodic_siren, ["original: harmonic two-voice wail"], True)

for i in range(3):
    write(f"light-{i}", layer(.38, (metal('light', i), 0, .7), (body(i), 0, .6)),
          [f"kenney:Audio/impactMetal_light_{i:03}.ogg", f"kenney:Audio/impactPunch_heavy_{i:03}.ogg"])
    write(f"medium-{i}", layer(.75, (pitch(metal('medium', i), .86), 0, .9), (body(i), 0, .8), (metal('light', i), .1, .25)),
          [f"kenney:Audio/impactMetal_medium_{i:03}.ogg", f"kenney:Audio/impactPunch_heavy_{i:03}.ogg", f"kenney:Audio/impactMetal_light_{i:03}.ogg"])
    write(f"heavy-{i}", layer(1.25, (pitch(metal('heavy', i), .74), 0, 1), (boom(.7, i), 0, .65), (glass(i), .045, .4), (metal('light', i), .3, .2)),
          [f"kenney:Audio/impactMetal_heavy_{i:03}.ogg", f"kenney:Audio/impactGlass_heavy_{i:03}.ogg", f"kenney:Audio/impactMetal_light_{i:03}.ogg", "original: low body and broadband impact"])
    write(f"shot-{i}", layer(.24, (boom(.2, i), 0, .7), (pitch(metal('light', i), 1.8), .006, .3), (body(i), 0, .65)),
          [f"kenney:Audio/impactMetal_light_{i:03}.ogg", f"kenney:Audio/impactPunch_heavy_{i:03}.ogg", "original: short blast"])
    write(f"hit-{i}", layer(.4, (pitch(metal('medium', i), 1.35), 0, .8), (glass(i), .015, .25)),
          [f"kenney:Audio/impactMetal_medium_{i:03}.ogg", f"kenney:Audio/impactGlass_heavy_{i:03}.ogg"])
for i in range(2):
    # Actual metal/glass carry the comedy; no descending electronic alarm on every wreck.
    write(f"wreck-{i}", layer(2.0, (boom(1.2, i), 0, 1), (pitch(metal('heavy', i), .65), .015, .85),
          (glass(i), .08, .65), (metal('medium', i), .36, .35), (metal('light', i + 1), .72, .2), (metal('light', i), 1.1, .1)),
          [f"kenney:Audio/impactMetal_heavy_{i:03}.ogg", f"kenney:Audio/impactGlass_heavy_{i:03}.ogg", f"kenney:Audio/impactMetal_medium_{i:03}.ogg",
           f"kenney:Audio/impactMetal_light_{i:03}.ogg", f"kenney:Audio/impactMetal_light_{i+1:03}.ogg", "original: bass blast and debris arrangement"])

# The remaining action vocabulary uses physical transients and irregular textures.
# Long impact tails are baked together, so one action always spends one runtime voice.
for i in range(2):
    t = np.arange(round(.55 * RATE)) / RATE
    air = filt(RNG.normal(0, 1, len(t)), [650, 4200], "bandpass") * np.sin(np.pi * t / .55) ** 2
    write(f"lob-{i}", layer(.6, (pitch(metal('light', i + 2), 1.7), 0, .55), (air, .025, .24)),
          [f"kenney:Audio/impactMetal_light_{i+2:03}.ogg", "original: air displacement"])
    write(f"land-{i}", layer(.46, (body(i + 2), 0, .8), (pitch(metal('light', i + 2), .75), .012, .55),
          (pitch(metal('light', i + 2), 1.2), .17, .2)),
          [f"kenney:Audio/impactPunch_heavy_{i+2:03}.ogg", f"kenney:Audio/impactMetal_light_{i+2:03}.ogg"])
    t = np.arange(round(.19 * RATE)) / RATE
    burn = filt(RNG.normal(0, 1, len(t)), [1800, 7500], "bandpass") * np.exp(-t * 12)
    for at in [.018, .047, .092, .133]:
        start = int(at * RATE); n = min(int(.006 * RATE), len(t) - start)
        burn[start:start+n] += RNG.normal(0, .9, n) * np.exp(-np.arange(n) / 25)
    write(f"fuse-{i}", burn, ["original: burning fuse with irregular sparks"])
    write(f"blast-{i}", layer(1.65, (boom(1.4, i), 0, 1.5), (pitch(metal('heavy', i + 2), .8), .025, .7),
          (glass(i + 2), .07, .4), (metal('light', i + 2), .24, .24), (body(i + 2), .43, .2)),
          [f"kenney:Audio/impactMetal_heavy_{i+2:03}.ogg", f"kenney:Audio/impactGlass_heavy_{i+2:03}.ogg",
           f"kenney:Audio/impactMetal_light_{i+2:03}.ogg", f"kenney:Audio/impactPunch_heavy_{i+2:03}.ogg", "original: pressure wave and debris arrangement"])
    t = np.arange(round(.43 * RATE)) / RATE
    # Damped spring modes with inharmonic overtones and a small chassis knock.
    phase = 2 * np.pi * ((94 + i * 9) * t + 8 * (1 - np.exp(-t * 12)))
    spring = sum(np.sin(phase * ratio + np.sin(t * 34) * .55) * np.exp(-t * decay) * gain
                 for ratio, decay, gain in [(1, 10, .6), (2.73, 16, .22), (4.19, 25, .1)])
    write(f"boing-{i}", layer(.43, (spring, 0, 1), (pitch(body(i + 2), 1.2), 0, .3)),
          [f"kenney:Audio/impactPunch_heavy_{i+2:03}.ogg", "original: damped suspension spring modes"])
    t = np.arange(round(.24 * RATE)) / RATE
    friction = filt(RNG.normal(0, 1, len(t)), [900, 3600], "bandpass") * .18
    phase = 2 * np.pi * ((840 + i * 90) * t - 700 * t * t + .9 * np.sin(t * 21))
    rubber = (np.sin(phase) + .25 * np.sin(phase * 2.21)) * .3 + friction
    write(f"squeak-{i}", rubber * np.sin(np.pi * t / .24) ** 2, ["original: rubber friction with moving resonances"])
    t = np.arange(round(.57 * RATE)) / RATE
    liquid = filt(RNG.normal(0, 1, len(t)), [180, 2200], "bandpass") * np.exp(-t * 5) * .15
    for at in [.02, .065, .14, .24, .36]:
        start = int(at * RATE); bt = t[:len(t)-start]
        liquid[start:] += np.sin(2 * np.pi * (RNG.uniform(350, 800) * bt + 1500 * bt * bt)) * np.exp(-bt * 65) * .4
    write(f"oil-{i}", layer(.6, (liquid, .015, 1), (pitch(metal('light', i + 3), 1.5), 0, .2)),
          [f"kenney:Audio/impactMetal_light_{i+3:03}.ogg", "original: liquid discharge and bubbles"])
    t = np.arange(round(.42 * RATE)) / RATE
    scrape = filt(RNG.normal(0, 1, len(t)), [1600, 6200], "bandpass") * np.sin(np.pi * t / .42) ** 2 * .2
    write(f"blades-{i}", layer(.62, (scrape, 0, 1), (pitch(metal('light', i + 3), 1.3), .02, .35),
          (pitch(metal('medium', i + 3), 1.4), .14, .5), (metal('light', i + 2), .3, .3)),
          [f"kenney:Audio/impactMetal_light_{i+3:03}.ogg", f"kenney:Audio/impactMetal_medium_{i+3:03}.ogg",
           f"kenney:Audio/impactMetal_light_{i+2:03}.ogg", "original: blade extension scrape"])

for i in range(3):
    t = np.arange(round(.65 * RATE)) / RATE
    # Broad tire fan, low water displacement and many small droplets, with no pitched coda.
    spray = filt(RNG.normal(0, 1, len(t)), [700, 7000], "bandpass") * np.exp(-t * 12) * .6
    wash = filt(RNG.normal(0, 1, len(t)), [100, 1100], "bandpass") * np.exp(-t * 9) * .8
    droplets = np.zeros(len(t))
    for at in RNG.uniform(.06, .5, 30):
        start = int(at * RATE); bt = t[:len(t)-start]
        droplets[start:] += np.sin(2 * np.pi * (RNG.uniform(650, 2400) * bt + 1800 * bt * bt)) * np.exp(-bt * 220) * RNG.uniform(.1, .3)
    write(f"splash-{i}", spray + wash + droplets, ["original: tire water displacement, spray and scattered droplets"])

manifest = {"revision": "patrol-audio-3", "date": "2026-10-26", "sampleRate": RATE, "channels": 1, "bits": 16,
            "sourceLicense": "CC0-1.0", "originalCodeAndArrangements": "GPL-3.0-or-later", "sourceArchives": SOURCES, "assets": records}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f'Built {len(records)} clips: {sum(r["bytes"] for r in records):,} bytes. No source archive enters the browser build.')
