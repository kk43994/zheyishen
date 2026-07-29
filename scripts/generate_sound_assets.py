#!/usr/bin/env python3
"""Build the small, deterministic sound pack shipped with the game."""

from __future__ import annotations

import json
import math
import random
import struct
import sys
import wave
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "public" / "assets" / "audio"
SAMPLE_RATE = 22_050
TAU = math.tau


def clamp(value: float, low: float = -1.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def fade(samples: list[float], attack: float = 0.008, release: float = 0.06) -> list[float]:
    attack_samples = max(1, int(SAMPLE_RATE * attack))
    release_samples = max(1, int(SAMPLE_RATE * release))
    size = len(samples)
    return [
        value
        * min(1.0, index / attack_samples)
        * min(1.0, (size - index - 1) / release_samples)
        for index, value in enumerate(samples)
    ]


def normalize(samples: list[float], peak: float) -> list[float]:
    current = max((abs(value) for value in samples), default=1.0)
    scale = peak / max(current, 1e-8)
    return [clamp(value * scale) for value in samples]


def write_wav(path: Path, samples: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = b"".join(struct.pack("<h", round(clamp(value) * 32767)) for value in samples)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm)


def shaped_noise(rng: random.Random, count: int, smoothing: float) -> list[float]:
    value = 0.0
    result: list[float] = []
    for _ in range(count):
        value = value * smoothing + rng.uniform(-1.0, 1.0) * (1.0 - smoothing)
        result.append(value)
    return result


def sound_page() -> list[float]:
    size = int(SAMPLE_RATE * 0.34)
    rng = random.Random(101)
    noise = shaped_noise(rng, size, 0.64)
    return fade([
        noise[index] * (0.85 - 0.55 * index / size)
        + math.sin(TAU * (108 + 52 * index / size) * index / SAMPLE_RATE) * 0.12
        for index in range(size)
    ], 0.006, 0.1)


def sound_breath(exhale: bool = False) -> list[float]:
    duration = 0.7 if exhale else 0.42
    size = int(SAMPLE_RATE * duration)
    rng = random.Random(202 if exhale else 201)
    noise = shaped_noise(rng, size, 0.82)
    samples = []
    for index in range(size):
        progress = index / size
        envelope = math.sin(math.pi * progress) ** (0.7 if exhale else 1.2)
        tone = math.sin(TAU * (82 if exhale else 96) * index / SAMPLE_RATE) * 0.08
        samples.append((noise[index] * 1.25 + tone) * envelope)
    return fade(samples, 0.025, 0.1)


def sound_hit(hurt: bool = False) -> list[float]:
    size = int(SAMPLE_RATE * (0.3 if hurt else 0.2))
    rng = random.Random(302 if hurt else 301)
    noise = shaped_noise(rng, size, 0.25)
    samples = []
    for index in range(size):
        time = index / SAMPLE_RATE
        envelope = math.exp(-time * (13 if hurt else 22))
        frequency = (155 if hurt else 92) * math.exp(-time * (2.2 if hurt else 5.5))
        body = math.sin(TAU * frequency * time) * (0.62 if hurt else 0.8)
        grit = noise[index] * (0.24 if hurt else 0.16)
        samples.append((body + grit) * envelope)
    return fade(samples, 0.002, 0.035)


def sound_coin() -> list[float]:
    size = int(SAMPLE_RATE * 0.46)
    samples = []
    for index in range(size):
        time = index / SAMPLE_RATE
        first = math.sin(TAU * 890 * time) * math.exp(-time * 14)
        second_time = max(0.0, time - 0.075)
        second = math.sin(TAU * 1320 * second_time) * math.exp(-second_time * 17) if time >= 0.075 else 0
        shimmer = math.sin(TAU * 1780 * time) * math.exp(-time * 24) * 0.24
        samples.append(first * 0.56 + second * 0.44 + shimmer)
    return fade(samples, 0.002, 0.08)


def sound_wear() -> list[float]:
    size = int(SAMPLE_RATE * 0.52)
    rng = random.Random(401)
    noise = shaped_noise(rng, size, 0.76)
    samples = []
    for index in range(size):
        time = index / SAMPLE_RATE
        cloth = noise[index] * math.sin(math.pi * min(1, time / 0.4)) * 0.72
        clasp_time = max(0.0, time - 0.31)
        clasp = math.sin(TAU * 310 * clasp_time) * math.exp(-clasp_time * 25) if time >= 0.31 else 0
        samples.append(cloth + clasp * 0.35)
    return fade(samples, 0.01, 0.08)


def sound_swallow() -> list[float]:
    size = int(SAMPLE_RATE * 0.5)
    rng = random.Random(501)
    noise = shaped_noise(rng, size, 0.92)
    samples = []
    for index in range(size):
        time = index / SAMPLE_RATE
        frequency = 135 - 82 * min(1, time / 0.42)
        body = math.sin(TAU * frequency * time) * math.sin(math.pi * time / 0.5)
        samples.append(body * 0.58 + noise[index] * 0.28)
    return fade(samples, 0.02, 0.1)


def sound_boss() -> list[float]:
    size = int(SAMPLE_RATE * 1.15)
    rng = random.Random(601)
    noise = shaped_noise(rng, size, 0.985)
    samples = []
    for index in range(size):
        time = index / SAMPLE_RATE
        pulse = math.sin(TAU * (43 + 7 * math.sin(TAU * 0.7 * time)) * time)
        overtone = math.sin(TAU * 67 * time + math.sin(TAU * 2.1 * time))
        envelope = math.sin(math.pi * min(1, time / 1.15)) ** 0.65
        samples.append((pulse * 0.72 + overtone * 0.28 + noise[index] * 0.25) * envelope)
    return fade(samples, 0.025, 0.15)


def sound_deny() -> list[float]:
    size = int(SAMPLE_RATE * 0.31)
    samples = []
    for index in range(size):
        time = index / SAMPLE_RATE
        first = math.sin(TAU * 146 * time) * math.exp(-time * 19)
        offset = max(0.0, time - 0.105)
        second = math.sin(TAU * 103 * offset) * math.exp(-offset * 20) if time >= 0.105 else 0
        samples.append(first * 0.58 + second * 0.58)
    return fade(samples, 0.002, 0.045)


def sound_phone() -> list[float]:
    duration = 1.75
    size = int(SAMPLE_RATE * duration)
    samples = []
    for index in range(size):
        time = index / SAMPLE_RATE
        gate = 1.0 if (time % 0.54) < 0.34 else 0.0
        carrier = math.sin(TAU * 880 * time) * 0.62 + math.sin(TAU * 660 * time) * 0.38
        samples.append(carrier * gate)
    return fade(samples, 0.006, 0.06)


def sound_train() -> list[float]:
    duration = 3.2
    size = int(SAMPLE_RATE * duration)
    rng = random.Random(701)
    rumble = shaped_noise(rng, size, 0.988)
    samples = []
    for index in range(size):
        time = index / SAMPLE_RATE
        approach = min(1.0, time / 2.4)
        wheel = math.sin(TAU * (52 + time * 5) * time) * 0.34
        samples.append((rumble[index] * 1.15 + wheel) * (0.2 + approach * 0.8))
    return fade(samples, 0.04, 0.22)


def sound_monitor() -> list[float]:
    duration = 3.15
    size = int(SAMPLE_RATE * duration)
    samples = []
    for index in range(size):
        time = index / SAMPLE_RATE
        pulse_time = time % 1.05
        envelope = math.exp(-pulse_time * 36)
        samples.append(math.sin(TAU * 1040 * time) * envelope)
    return fade(samples, 0.002, 0.04)


def loop_crossfade(samples: list[float], seconds: float = 0.65) -> list[float]:
    count = min(int(SAMPLE_RATE * seconds), len(samples) // 4)
    result = samples[:]
    for index in range(count):
        mix = (index + 1) / count
        curve = mix * mix * (3 - 2 * mix)
        result[-count + index] = samples[-count + index] * (1 - curve) + samples[index] * curve
    return result


def ambience(stage: int, duration: float = 8.0) -> list[float]:
    size = int(SAMPLE_RATE * duration)
    rng = random.Random(900 + stage)
    low = shaped_noise(rng, size, 0.992)
    high = shaped_noise(rng, size, 0.4)
    samples: list[float] = []
    event_times = {
        0: [1.35, 3.82, 6.4],
        1: [2.1, 5.65],
        2: [1.05, 4.25, 6.8],
        3: [2.8, 6.15],
        4: [1.5, 3.35, 6.3],
        5: [2.25, 5.0, 7.1],
    }[stage]
    for index in range(size):
        time = index / SAMPLE_RATE
        if stage == 0:
            room = math.sin(TAU * 49.5 * time) * 0.08 + low[index] * 0.52
            rain = high[index] * (0.18 + 0.06 * math.sin(TAU * 0.11 * time))
            events = sum(math.sin(TAU * 760 * max(0, time - event)) * math.exp(-max(0, time - event) * 28)
                         for event in event_times if time >= event) * 0.12
            value = room + rain + events
        elif stage == 1:
            lamp = math.sin(TAU * 100 * time) * 0.055 + math.sin(TAU * 200 * time) * 0.025
            pencil = sum(high[index] * math.exp(-abs(time - event) * 22) for event in event_times) * 0.42
            value = low[index] * 0.48 + lamp + pencil
        elif stage == 2:
            airflow = low[index] * 0.68 + high[index] * 0.1
            rail = math.sin(TAU * (36 + 3 * math.sin(TAU * 0.09 * time)) * time) * 0.11
            chime = sum(math.sin(TAU * 660 * max(0, time - event)) * math.exp(-max(0, time - event) * 10)
                        for event in event_times if time >= event) * 0.055
            value = airflow + rail + chime
        elif stage == 3:
            fridge = math.sin(TAU * 58 * time) * 0.07 + low[index] * 0.56
            tick = sum(math.sin(TAU * 980 * max(0, time - event)) * math.exp(-max(0, time - event) * 70)
                       for event in event_times if time >= event) * 0.16
            value = fridge + tick
        elif stage == 4:
            fluorescent = math.sin(TAU * 100 * time) * 0.06 + math.sin(TAU * 300 * time) * 0.018
            key = sum(high[index] * math.exp(-abs(time - event) * 34) for event in event_times) * 0.5
            value = low[index] * 0.52 + fluorescent + key
        else:
            ward = low[index] * 0.56 + math.sin(TAU * 61 * time) * 0.045
            beep = sum(math.sin(TAU * 880 * max(0, time - event)) * math.exp(-max(0, time - event) * 18)
                       for event in event_times if time >= event) * 0.08
            value = ward + beep
        samples.append(value)
    return normalize(loop_crossfade(samples), 0.20)


def midi_frequency(note: float) -> float:
    return 440.0 * 2 ** ((note - 69.0) / 12.0)


def soft_clip(value: float) -> float:
    return math.tanh(value * 1.35) / math.tanh(1.35)


def music_box_voice(frequency: float, time: float, age: float, decay: float = 2.8) -> float:
    if age < 0:
        return 0.0
    envelope = math.exp(-age * decay) * min(1.0, age / 0.018)
    shimmer = (
        math.sin(TAU * frequency * time)
        + math.sin(TAU * frequency * 2.01 * time + 0.2) * 0.34
        + math.sin(TAU * frequency * 3.98 * time + 0.6) * 0.12
    )
    return shimmer * envelope


def felt_voice(frequency: float, time: float, age: float, decay: float = 1.65) -> float:
    if age < 0:
        return 0.0
    envelope = math.exp(-age * decay) * min(1.0, age / 0.035)
    body = (
        math.sin(TAU * frequency * time)
        + math.sin(TAU * frequency * 2.002 * time + 0.35) * 0.22
        + math.sin(TAU * frequency * 0.501 * time + 0.8) * 0.16
    )
    return body * envelope


def pad_voice(frequency: float, time: float, phase: float = 0.0) -> float:
    slow = math.sin(TAU * frequency * time + phase)
    detuned = math.sin(TAU * frequency * 1.0038 * time + phase + 0.9)
    octave = math.sin(TAU * frequency * 2 * time + phase * 0.5) * 0.16
    return slow * 0.54 + detuned * 0.34 + octave


MUSIC_SPECS = [
    {
        "name": "first-breath",
        "root": 50,
        "progression": [(0, 3, 7), (0, 5, 9), (-2, 3, 7), (0, 3, 7)],
        "motif": [0, 7, 3, 5],
        "pulse": 0.00,
        "bell": 0.34,
        "felt": 0.12,
        "pad": 0.72,
        "air": 0.16,
        "seed": 1200,
    },
    {
        "name": "under-bed",
        "root": 45,
        "progression": [(0, 3, 7), (-2, 3, 7), (-4, 0, 5), (-2, 3, 7)],
        "motif": [0, 3, 7, 2],
        "pulse": 0.12,
        "bell": 0.56,
        "felt": 0.08,
        "pad": 0.48,
        "air": 0.22,
        "seed": 1201,
    },
    {
        "name": "red-marks",
        "root": 50,
        "progression": [(0, 3, 7), (-2, 2, 7), (-5, 0, 3), (-2, 2, 7)],
        "motif": [0, 7, 2, 3],
        "pulse": 0.24,
        "bell": 0.18,
        "felt": 0.50,
        "pad": 0.40,
        "air": 0.10,
        "seed": 1202,
    },
    {
        "name": "missed-train",
        "root": 52,
        "progression": [(0, 3, 7), (-2, 3, 7), (-5, 0, 3), (-2, 3, 7)],
        "motif": [0, 7, 3, 10],
        "pulse": 0.44,
        "bell": 0.16,
        "felt": 0.32,
        "pad": 0.42,
        "air": 0.14,
        "seed": 1203,
    },
    {
        "name": "lukewarm-home",
        "root": 48,
        "progression": [(0, 4, 7), (-3, 0, 4), (-5, 0, 4), (-2, 2, 7)],
        "motif": [0, 7, 4, 2],
        "pulse": 0.08,
        "bell": 0.12,
        "felt": 0.50,
        "pad": 0.54,
        "air": 0.10,
        "seed": 1204,
    },
    {
        "name": "fluorescent-name",
        "root": 42,
        "progression": [(0, 3, 7), (-2, 3, 7), (-5, 0, 3), (-2, 3, 7)],
        "motif": [0, 3, 7, 10],
        "pulse": 0.34,
        "bell": 0.08,
        "felt": 0.38,
        "pad": 0.48,
        "air": 0.16,
        "seed": 1205,
    },
    {
        "name": "last-lamp",
        "root": 38,
        "progression": [(0, 3, 7), (-5, 0, 3), (-2, 3, 7), (0, 2, 7)],
        "motif": [0, 7, 3, 2],
        "pulse": 0.03,
        "bell": 0.24,
        "felt": 0.22,
        "pad": 0.76,
        "air": 0.24,
        "seed": 1206,
    },
    {
        "name": "after-breath",
        "root": 48,
        "progression": [(0, 4, 7), (-5, 0, 4), (-3, 0, 4), (0, 2, 7)],
        "motif": [0, 7, 4, 2],
        "pulse": 0.00,
        "bell": 0.26,
        "felt": 0.34,
        "pad": 0.66,
        "air": 0.18,
        "seed": 1207,
    },
]


def music_track(spec: dict[str, object], duration: float = 18.0) -> list[float]:
    size = int(SAMPLE_RATE * duration)
    rng = random.Random(int(spec["seed"]))
    air = shaped_noise(rng, size, 0.965)
    dust = shaped_noise(rng, size, 0.58)
    root = int(spec["root"])
    progression = spec["progression"]
    motif = spec["motif"]
    bar_duration = duration / len(progression)
    beat_duration = bar_duration / 4
    samples: list[float] = []
    for index in range(size):
        time = index / SAMPLE_RATE
        bar = min(len(progression) - 1, int(time / bar_duration))
        bar_time = time - bar * bar_duration
        chord = progression[bar]
        pad = 0.0
        for chord_index, interval in enumerate(chord):
            frequency = midi_frequency(root + int(interval))
            pad += pad_voice(frequency, time, chord_index * 0.63) / len(chord)
        bass = math.sin(TAU * midi_frequency(root - 12 + int(chord[0])) * time + 0.4) * 0.38

        beat = int(bar_time / beat_duration)
        beat_age = bar_time - beat * beat_duration
        motif_interval = int(motif[(bar * 2 + beat) % len(motif)])
        melody_frequency = midi_frequency(root + 12 + motif_interval)
        bell = music_box_voice(melody_frequency, time, beat_age)
        felt = felt_voice(melody_frequency / 2, time, beat_age, 1.3)

        half_beat = beat_duration / 2
        pulse_age = (bar_time % half_beat)
        pulse_envelope = math.exp(-pulse_age * 10) * min(1.0, pulse_age / 0.012)
        pulse = (
            math.sin(TAU * midi_frequency(root - 12) * time) * 0.72
            + dust[index] * 0.42
        ) * pulse_envelope

        breath = air[index] * (0.72 + math.sin(TAU * 0.07 * time) * 0.18)
        value = (
            (pad + bass) * float(spec["pad"])
            + bell * float(spec["bell"])
            + felt * float(spec["felt"])
            + pulse * float(spec["pulse"])
            + breath * float(spec["air"])
        )
        # Slow swells leave clear holes for dialogue even before runtime ducking.
        phrase = 0.68 + 0.22 * math.sin(TAU * time / duration - math.pi / 2) ** 2
        samples.append(soft_clip(value * phrase))
    return normalize(loop_crossfade(samples, 1.4), 0.46)


def pressure_track(duration: float = 18.0) -> list[float]:
    size = int(SAMPLE_RATE * duration)
    rng = random.Random(1299)
    low_noise = shaped_noise(rng, size, 0.992)
    grit = shaped_noise(rng, size, 0.46)
    samples: list[float] = []
    beat = 0.75
    for index in range(size):
        time = index / SAMPLE_RATE
        pulse_age = time % beat
        pulse_envelope = math.exp(-pulse_age * 8.5) * min(1.0, pulse_age / 0.014)
        sub = math.sin(TAU * 43.5 * time) * pulse_envelope
        knock_age = (time + beat * 0.5) % beat
        knock = grit[index] * math.exp(-knock_age * 28)
        rise = math.sin(TAU * (71 + 8 * math.sin(TAU * time / duration)) * time) * 0.10
        samples.append(soft_clip(sub * 0.66 + knock * 0.28 + low_noise[index] * 0.38 + rise))
    return normalize(loop_crossfade(samples, 1.2), 0.42)


def main() -> None:
    force = "--force" in sys.argv
    sound_builders = {
        "page": sound_page,
        "breath": sound_breath,
        "hit": sound_hit,
        "hurt": lambda: sound_hit(True),
        "coin": sound_coin,
        "wear": sound_wear,
        "swallow": sound_swallow,
        "exhale": lambda: sound_breath(True),
        "boss": sound_boss,
        "deny": sound_deny,
        "phone": sound_phone,
        "train": sound_train,
        "monitor": sound_monitor,
    }
    manifest_path = OUTPUT / "sound-manifest.json"
    if manifest_path.exists():
        manifest: dict[str, object] = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        manifest = {
            "sampleRate": SAMPLE_RATE,
            "license": "Project-authored procedural audio; deterministic source in scripts/generate_sound_assets.py",
            "sfx": {},
            "ambience": {},
            "music": {},
        }
    manifest.setdefault("music", {})
    generated = 0
    for name, builder in sound_builders.items():
        relative = Path("sfx") / f"{name}.wav"
        if (OUTPUT / relative).exists() and not force:
            continue
        samples = normalize(builder(), 0.72 if name in {"hit", "hurt", "boss"} else 0.58)
        write_wav(OUTPUT / relative, samples)
        manifest["sfx"][name] = {
            "file": str(relative), "seconds": round(len(samples) / SAMPLE_RATE, 3),
            "origin": "project-authored-procedural",
        }
        generated += 1
    ambience_names = ["childhood-room", "classroom", "station", "apartment", "office", "hospital"]
    for stage, name in enumerate(ambience_names):
        relative = Path("ambience") / f"{name}.wav"
        if (OUTPUT / relative).exists() and not force:
            continue
        samples = ambience(stage)
        write_wav(OUTPUT / relative, samples)
        manifest["ambience"][str(stage)] = {
            "file": str(relative), "seconds": round(len(samples) / SAMPLE_RATE, 3),
            "origin": "project-authored-procedural",
        }
        generated += 1
    for spec in MUSIC_SPECS:
        name = str(spec["name"])
        relative = Path("music") / f"{name}.wav"
        if not (OUTPUT / relative).exists() or force:
            samples = music_track(spec)
            write_wav(OUTPUT / relative, samples)
            generated += 1
        manifest["music"][name] = {
            "file": str(relative), "seconds": 18.0,
            "origin": "project-authored-procedural",
            "role": "narrative-bgm",
        }
    pressure_relative = Path("music") / "pressure.wav"
    if not (OUTPUT / pressure_relative).exists() or force:
        samples = pressure_track()
        write_wav(OUTPUT / pressure_relative, samples)
        generated += 1
    manifest["music"]["pressure"] = {
        "file": str(pressure_relative), "seconds": 18.0,
        "origin": "project-authored-procedural",
        "role": "adaptive-boss-layer",
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[sound] built {generated} missing fallback assets in {OUTPUT}; use --force to replace curated files")


if __name__ == "__main__":
    main()
