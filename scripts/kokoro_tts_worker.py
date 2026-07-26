#!/usr/bin/env python3
"""Generate missing fixed voice assets with Kokoro's Chinese-specialized model."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from kokoro import KModel, KPipeline

SAMPLE_RATE = 24_000
TOKEN_RE = re.compile(r"(<#[0-9.]+#>|\([a-z-]+\))")

VOICE_BY_ROLE = {
    "narrator": "zm_010",
    "father": "zm_009",
    "caregiver": "zf_006",
    "teacher": "zf_002",
    "classmate": "zm_011",
    "announcer": "zf_001",
    "recruiter": "zf_008",
    "landlord": "zf_006",
    "family": "zf_006",
    "wife": "zf_006",
    "mother": "zf_002",
    "nurse": "zf_007",
    "office": "zf_001",
    "manager": "zm_025",
    "bank": "zf_001",
    "doctor": "zf_007",
    "coworker": "zm_025",
    "security": "zm_025",
    "pharmacist": "zf_007",
    "neighbor": "zf_006",
    "room-keeper": "zm_025",
    "lamp-keeper": "zm_010",
}

VOICE_BY_CUE = {
    "father-childhood-walk": "zm_025",
    "father-for-your-good": "zm_025",
    "hero-became-him": "zm_029",
    "self-stand-straight": "zm_029",
    "self-for-your-good": "zm_029",
    "phone-coworker-group": "zm_020",
    "hero-not-busy": "zm_025",
}

TEXT_BY_CUE = {
    "lamp-pockets-empty": "口袋空了……再看看手里。",
}

SPLIT_TEXT_BY_CUE = {
    # Continuous synthesis adds an audible 了 after 不忙. Rendering both clauses
    # with the same voice separately preserves the canonical words and exact pause.
    "hero-not-busy": [("没事。", 0.42), ("不忙。", 0.0)],
}


def voice_for(cue: dict) -> str:
    if cue["id"] in VOICE_BY_CUE:
        return VOICE_BY_CUE[cue["id"]]
    if cue["role"] == "hero":
        return "zm_011" if cue["stage"] == 0 else "zm_020"
    return VOICE_BY_ROLE[cue["role"]]


def silence(seconds: float) -> np.ndarray:
    return np.zeros(max(1, round(seconds * SAMPLE_RATE)), dtype=np.float32)


def render_text(cue: dict) -> str:
    # Punctuation already sits beside each pause marker. Keeping the line intact gives
    # more natural phrase-level prosody than stitching several short synthesized clips.
    text = TEXT_BY_CUE.get(cue["id"], cue["text"])
    return TOKEN_RE.sub("", text).strip()


def synthesize(pipeline: KPipeline, cue: dict, voice_id: str) -> np.ndarray:
    segments = SPLIT_TEXT_BY_CUE.get(cue["id"])
    if segments:
        pieces: list[np.ndarray] = [silence(0.08)]
        for text, pause_after in segments:
            generated = pipeline(text, voice=voice_id, speed=cue["delivery"]["speed"])
            outputs = [result.audio.detach().cpu().numpy().astype(np.float32) for result in generated]
            if not outputs:
                raise RuntimeError(f"Kokoro returned no audio for {cue['id']}: {text}")
            pieces.append(np.concatenate(outputs))
            if pause_after > 0:
                pieces.append(silence(pause_after))
        pieces.append(silence(0.12))
    else:
        generated = pipeline(render_text(cue), voice=voice_id, speed=cue["delivery"]["speed"])
        outputs = [result.audio.detach().cpu().numpy().astype(np.float32) for result in generated]
        if not outputs:
            raise RuntimeError(f"Kokoro returned no audio for {cue['id']}")
        pieces = [silence(0.08), np.concatenate(outputs), silence(0.12)]
    audio = np.concatenate(pieces)
    fade = min(round(0.02 * SAMPLE_RATE), len(audio) // 4)
    if fade:
        audio[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)
        audio[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    return audio


def encode_mp3(audio: np.ndarray, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="zys-voice-") as temp_dir:
        wav_path = Path(temp_dir) / "source.wav"
        sf.write(wav_path, audio, SAMPLE_RATE, subtype="PCM_16")
        subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path),
                "-af", "highpass=f=65,lowpass=f=14500,loudnorm=I=-19:TP=-2:LRA=7",
                "-ar", "32000", "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "64k", str(destination),
            ],
            check=True,
        )


def write_manifest(path: Path, cue_order: list[str], entries: dict[str, dict]) -> None:
    ordered = [entries[cue_id] for cue_id in cue_order if cue_id in entries]
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main() -> None:
    contract = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    root = Path(contract["root"])
    manifest_path = root / "public/assets/audio/voice/manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    previous = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else []
    entries = {entry["id"]: entry for entry in previous}
    pending = []
    for cue in contract["cues"]:
        destination = root / "public" / cue["file"]
        existing = destination.exists() and destination.stat().st_size >= 512
        previous_provider = entries.get(cue["id"], {}).get("provider")
        should_force = contract["force"] or (contract.get("forceLocal", False) and previous_provider == "Kokoro")
        if existing and not should_force:
            entry = entries.get(cue["id"], {"id": cue["id"], "file": cue["file"], "role": cue["role"]})
            entry["provider"] = entry.get("provider") or ("MiniMax" if str(entry.get("model", "")).startswith("speech-") else "existing")
            entry["delivery"] = cue["delivery"]
            entry["bytes"] = destination.stat().st_size
            entries[cue["id"]] = entry
            continue
        pending.append(cue)

    if not pending:
        write_manifest(manifest_path, contract["cueOrder"], entries)
        print("[voice-local] all requested assets already exist", flush=True)
        return

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"[voice-local] loading {contract['repoId']} on {device}", flush=True)
    model = KModel(repo_id=contract["repoId"]).to(device).eval()
    pipeline = KPipeline(lang_code="z", repo_id=contract["repoId"], model=model)

    for index, cue in enumerate(pending, start=1):
        voice_id = voice_for(cue)
        print(f"[voice-local] {index:02}/{len(pending):02} {cue['id']} ({voice_id}, {cue['delivery']['speed']:.2f}x, {cue['delivery']['emotion']})", flush=True)
        audio = synthesize(pipeline, cue, voice_id)
        destination = root / "public" / cue["file"]
        encode_mp3(audio, destination)
        payload = destination.read_bytes()
        entries[cue["id"]] = {
            "id": cue["id"],
            "file": cue["file"],
            "role": cue["role"],
            "provider": "Kokoro",
            "model": "Kokoro-82M-v1.1-zh",
            "voiceId": voice_id,
            "durationMs": round(len(audio) / SAMPLE_RATE * 1000),
            "bytes": len(payload),
            "sha256": hashlib.sha256(payload).hexdigest(),
            "license": "Apache-2.0",
            "source": "https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh",
            "renderMode": "continuous-prosody",
            "delivery": cue["delivery"],
        }
        write_manifest(manifest_path, contract["cueOrder"], entries)

    print(f"[voice-local] completed {len(pending)} assets", flush=True)


if __name__ == "__main__":
    main()
